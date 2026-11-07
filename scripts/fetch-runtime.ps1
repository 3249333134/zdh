$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$upstream = Join-Path $root 'upstream/deepseek-harness-master'
$cache = Join-Path $upstream 'apps/desktop/.desktop-build/downloads'
New-Item -ItemType Directory -Path $cache -Force | Out-Null
$lock = Get-Content (Join-Path $upstream 'scripts/primary-runtime/lock.json') -Raw | ConvertFrom-Json
function Fetch-Locked($url, $hash, $destination) {
  if ((Test-Path -LiteralPath $destination) -and ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLower() -eq $hash)) { return }
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile ($destination + '.download') -TimeoutSec 60
  if ((Get-FileHash -LiteralPath ($destination + '.download') -Algorithm SHA256).Hash.ToLower() -ne $hash) { throw 'Runtime checksum mismatch' }
  Move-Item -LiteralPath ($destination + '.download') -Destination $destination -Force
  Write-Output ('Verified runtime asset: ' + (Split-Path $destination -Leaf))
}
$target = $lock.targets.'win-x64'
$pythonName = 'cpython-' + $lock.pythonVersion + '+' + $lock.pythonRelease + '-' + $target.pythonTarget + '-install_only_stripped.tar.gz'
Fetch-Locked ('https://github.com/astral-sh/python-build-standalone/releases/download/' + $lock.pythonRelease + '/' + [Uri]::EscapeDataString($pythonName)) $target.pythonSha256 (Join-Path $cache $target.pythonSha256)
foreach ($wheel in @($target.wheels) + @($lock.wheels)) { Fetch-Locked $wheel.url $wheel.sha256 (Join-Path $cache $wheel.sha256) }
$version = (Get-Content (Join-Path $upstream 'apps/desktop/node_modules/electron/package.json') -Raw | ConvertFrom-Json).version
$filename = 'electron-v' + $version + '-win32-x64.zip'
$base = 'https://github.com/electron/electron/releases/download/v' + $version + '/'
$sums = (Invoke-WebRequest -UseBasicParsing -Uri ($base + 'SHASUMS256.txt') -TimeoutSec 30).Content
if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }
$hash = (($sums -split "`n" | Where-Object { $_.Trim().EndsWith($filename) }) -split '\s+')[0].Trim().ToLower()
if ($hash -notmatch '^[a-f0-9]{64}$') { throw 'Electron checksum not found' }
Fetch-Locked ($base + $filename) $hash (Join-Path $cache 'enterprise-electron.zip')
Set-Content -LiteralPath (Join-Path $cache 'enterprise-electron.sha256') -Value $hash -Encoding ascii
$tools = Join-Path $root '.installer-tools'
New-Item -ItemType Directory -Path $tools -Force | Out-Null
Fetch-Locked 'https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis@1.2.1/nsis-bundle-3.12.tar.gz' '56997fdefe25e7928a1a68b4583d08b240b66cf660234053b20131a74cc082f4' (Join-Path $tools 'nsis.tar.gz')
tar -xzf (Join-Path $tools 'nsis.tar.gz') -C $tools
if ($LASTEXITCODE) { throw 'NSIS extraction failed' }

