[CmdletBinding()]
param(
  [string]$GoVersion = '1.27.3'
)

. (Join-Path $PSScriptRoot 'runtime-common.ps1')

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Ensure-Directory $RuntimeRoot
Ensure-Directory $DataDir
Ensure-Directory $GoCache
Ensure-Directory $GoModCache

$goZip = Join-Path $RuntimeRoot "go$GoVersion.windows-amd64.zip"
if (-not (Test-Path -LiteralPath $GoExe)) {
  $goUrl = "https://go.dev/dl/go$GoVersion.windows-amd64.zip"
  Write-Host "Downloading Go $GoVersion ..." -ForegroundColor Cyan
  Invoke-WebRequest -Uri $goUrl -OutFile $goZip -UseBasicParsing -TimeoutSec 300
  Write-Host 'Extracting Go ...' -ForegroundColor Cyan
  Expand-Archive -LiteralPath $goZip -DestinationPath $RuntimeRoot -Force
} else {
  Write-Host "Go exists: $GoExe" -ForegroundColor Green
}

$bunZip = Join-Path $RuntimeRoot 'bun-windows-x64.zip'
if (-not (Test-Path -LiteralPath $BunExe)) {
  $bunUrl = 'https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64.zip'
  Write-Host 'Downloading Bun latest Windows x64 ...' -ForegroundColor Cyan
  Invoke-WebRequest -Uri $bunUrl -OutFile $bunZip -UseBasicParsing -TimeoutSec 300
  $bunExtract = Join-Path $RuntimeRoot 'bun-download'
  if (Test-Path -LiteralPath $bunExtract) { Remove-Item -LiteralPath $bunExtract -Recurse -Force }
  Expand-Archive -LiteralPath $bunZip -DestinationPath $bunExtract -Force
  $found = Get-ChildItem -LiteralPath $bunExtract -Recurse -Filter bun.exe | Select-Object -First 1
  if (-not $found) { throw 'bun.exe was not found after extraction' }
  Ensure-Directory (Split-Path -Parent $BunExe)
  Copy-Item -LiteralPath $found.FullName -Destination $BunExe -Force
} else {
  Write-Host "Bun exists: $BunExe" -ForegroundColor Green
}

Write-Host 'Verifying runtime versions:' -ForegroundColor Cyan
& $GoExe version
& $BunExe --version
Write-Host 'Runtime setup completed.' -ForegroundColor Green
