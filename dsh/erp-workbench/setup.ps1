$ErrorActionPreference = 'Stop'
$profileDir = Join-Path $PSScriptRoot 'data\dsh\profiles\web'
New-Item -ItemType Directory -Force -Path "$profileDir\node_modules\dsh-erp-workbench", "$PSScriptRoot\data\workspace" | Out-Null
$pluginDir = Join-Path $profileDir 'node_modules\dsh-erp-workbench'
foreach ($entry in @('src', 'dist', 'package.json', 'cordis.patch.yml')) {
  if (-not (Test-Path -LiteralPath "$PSScriptRoot\$entry")) { throw "缺少 $entry，请先运行 npm run build。" }
  Copy-Item -LiteralPath "$PSScriptRoot\$entry" -Destination $pluginDir -Recurse -Force
}
$utf8 = [Text.UTF8Encoding]::new($false)
function Write-Initial($file, $content) { if (-not (Test-Path -LiteralPath $file)) { [IO.File]::WriteAllText($file, $content, $utf8) } }
Write-Initial "$profileDir\package.json" '{"name":"erp-workbench-profile","private":true,"dependencies":{"dsh-erp-workbench":"1.0.0"},"dsh":{"profile":{"bundles":["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app","dsh-erp-workbench"]}}}'
Write-Initial "$profileDir\compatibility.json" '{"dsh-erp-workbench@1.0.0":["0.2.1-rc.3"]}'
Write-Initial "$profileDir\cordis.yml" "[]`n"
Write-Initial "$profileDir\cordis.patch.yml" "- id: ui-settings-general`n  name: '@deepseek-ai/dsh-client-ui-settings-general'`n  config:`n    welcomeNoticeVersion: 2026-09-28.1`n"
Write-Host '独立 DSH 配置已准备；原工作台配置未改动。'
