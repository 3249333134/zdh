﻿$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $taskRoot
$nodePath = (Get-Command node.exe).Source
$ready = $false
try { $ready = (Invoke-RestMethod 'http://127.0.0.1:18080/health' -TimeoutSec 2).workbenchVersion -in @('0.4','0.5','0.6','0.7','0.9','0.10','0.11','0.12','0.13','0.14','0.15') } catch {}
if (-not $ready) {
  Start-Process -FilePath $nodePath -ArgumentList 'scripts/local-enterprise.mjs' -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskRoot 'local-service.log') -RedirectStandardError (Join-Path $taskRoot 'local-service-error.log')
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    try { $ready = (Invoke-RestMethod 'http://127.0.0.1:18080/health' -TimeoutSec 2).workbenchVersion -in @('0.4','0.5','0.6','0.7','0.9','0.10','0.11','0.12','0.13','0.14','0.15'); if ($ready) { break } } catch {}
  }
}
if (-not $ready) { throw '本机服务启动失败，请查看 local-service-error.log' }
$workbenchHome = Join-Path $env:APPDATA '企业人机协作工作台'
New-Item -ItemType Directory -Path $workbenchHome -Force | Out-Null
$connectionPath = Join-Path $workbenchHome 'enterprise-server.json'
# Do not replace a subsequently configured enterprise server.
if (-not (Test-Path -LiteralPath $connectionPath)) { [System.IO.File]::WriteAllText($connectionPath, '{"url":"http://127.0.0.1:18080"}', [System.Text.UTF8Encoding]::new($false)) }
$clientPath = Join-Path $taskRoot 'test/@deepseek-aidsh-desktop/企业人机协作工作台.exe'
if (-not (Test-Path -LiteralPath $clientPath)) { $clientPath = Join-Path $taskRoot 'upstream/deepseek-harness-master/apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/win-unpacked/企业人机协作工作台.exe' }
Start-Process -FilePath $clientPath
