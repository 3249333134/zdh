$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$install = 'D:\Users\hongcheng\AppData\Local\Programs\DeepSeek Harness'
$oldHome = Join-Path $install '淋雨同款工作台\.dsh'
$resources = Join-Path $root 'runtime\host\resources'
New-Item -ItemType Directory -Force -Path $resources | Out-Null
Get-ChildItem -LiteralPath $install -File | Where-Object { $_.Name -notlike 'Uninstall*' -and $_.Extension -in @('.exe', '.dll', '.pak', '.bin', '.dat', '.txt') } | ForEach-Object {
  if (-not (Test-Path (Join-Path "$root\runtime\host" $_.Name))) { Copy-Item -LiteralPath $_.FullName -Destination "$root\runtime\host" }
}
if (-not (Test-Path "$root\runtime\electron\electron.exe")) {
  Copy-Item -LiteralPath (Join-Path $install '淋雨同款工作台\node_modules\electron\dist') -Destination "$root\runtime\electron" -Recurse
}
foreach ($entry in @('app.asar', 'app.asar.unpacked', 'runtime')) {
  if (-not (Test-Path (Join-Path $resources $entry))) {
    Copy-Item -LiteralPath (Join-Path $install "resources\$entry") -Destination $resources -Recurse
  }
}
Copy-Item -LiteralPath "$root\..\open-ai-canvas\backend\.local\server.exe" -Destination "$root\runtime\canvas-server.exe"
New-Item -ItemType Directory -Force -Path "$root\runtime\canvas\backend" | Out-Null
foreach ($entry in @('builtin', 'agent-runtime')) {
  if (-not (Test-Path "$root\runtime\canvas\backend\$entry")) {
    Copy-Item -LiteralPath "$root\..\open-ai-canvas\backend\$entry" -Destination "$root\runtime\canvas\backend" -Recurse
  }
}
if (-not (Test-Path "$root\runtime\canvas\plugin-packages")) {
  Copy-Item -LiteralPath "$root\..\open-ai-canvas\plugin-packages" -Destination "$root\runtime\canvas" -Recurse
}
$homeDir = Join-Path $root 'data\dsh'
$profile = Join-Path $homeDir 'profiles\web'
New-Item -ItemType Directory -Force -Path "$profile\node_modules", "$root\data\workspace", "$root\data\canvas" | Out-Null
$plugin = Join-Path $profile 'node_modules\dsh-media-desk'
New-Item -ItemType Directory -Force -Path $plugin | Out-Null
foreach ($entry in @('src', 'dist', 'assets', 'package.json', 'cordis.patch.yml', 'LICENSE')) {
  Copy-Item -LiteralPath "$root\..\media_desk\$entry" -Destination $plugin -Recurse -Force
}
$utf8 = [Text.UTF8Encoding]::new($false)
function Write-Initial([string]$file, [string]$content) {
  if (-not (Test-Path -LiteralPath $file)) { [IO.File]::WriteAllText($file, $content, $utf8) }
}
Write-Initial "$profile\package.json" '{"name":"media-desk-profile","private":true,"dependencies":{"dsh-media-desk":"2.6.2"},"dsh":{"profile":{"bundles":["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app","dsh-media-desk"]}}}'
Write-Initial "$profile\cordis.yml" "[]`n"
Copy-Item -LiteralPath "$oldHome\profiles\web\compatibility.json" -Destination $profile -Force
$credentials = Join-Path $homeDir '.credentials.yaml'
if (-not (Test-Path -LiteralPath $credentials)) {
  Copy-Item -LiteralPath 'C:\Users\hongcheng\.dsh\.credentials.yaml' -Destination $credentials
}
$credentialLiteral = ConvertTo-Json $credentials -Compress
$patch = @"
- id: credentials
  config:
    path: $credentialLiteral
- id: agent-default-model
  config:
    provider: deepseek-account
    model: deepseek-flash
    reasoningEffort: high
- id: ui-settings-account
  config:
    version: 1
    step: done
    purpose: development
    process: detailed
    completion: completed
    usage: detailed
- id: ui-settings-general
  name: '@deepseek-ai/dsh-client-ui-settings-general'
  config:
    welcomeNoticeVersion: 2026-09-28.1
"@
Write-Initial "$profile\cordis.patch.yml" $patch
if (-not (Test-Path "$homeDir\media-desk")) {
  Copy-Item -LiteralPath "$oldHome\media-desk" -Destination $homeDir -Recurse
  $settingsPath = "$homeDir\media-desk\settings.json"
  $settings = @{}
  if (Test-Path $settingsPath) { $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json -AsHashtable }
  $settings.yingce = @{ enabled = $true; backendUrl = 'http://127.0.0.1:18081'; webUrl = 'http://127.0.0.1:13001'; openExternal = $true }
  [IO.File]::WriteAllText($settingsPath, ($settings | ConvertTo-Json -Depth 20), $utf8)
}
Write-Host '独立运行环境和内容副本已准备。'
