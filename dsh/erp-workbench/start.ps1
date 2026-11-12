$ErrorActionPreference = 'Stop'
& "$PSScriptRoot\setup.ps1"
$electron = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\media-workbench\runtime\electron\electron.exe'))
if (-not (Test-Path -LiteralPath $electron)) { throw '找不到 DSH 桌面运行环境：media-workbench/runtime/electron。' }
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Start-Process -FilePath $electron -ArgumentList ('"' + (Join-Path $PSScriptRoot 'desktop.cjs') + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
