. (Join-Path $PSScriptRoot 'runtime-common.ps1')

if (Test-LocalPort $BackendPort) { throw "Port $BackendPort is already in use. Stop the old backend or run stop-local.ps1." }
if (Test-LocalPort $WebPort) { throw "Port $WebPort is already in use. Set MEDIA_DESK_WEB_PORT to another free port, stop the old frontend, or run stop-local.ps1." }

$runner = 'powershell.exe'
$pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
if ($pwsh) { $runner = $pwsh.Source }

$backendArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'start-backend.ps1'))
$frontendArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'start-frontend.ps1'))

Start-Process -FilePath $runner -ArgumentList $backendArgs
Start-Process -FilePath $runner -ArgumentList $frontendArgs

Write-Host 'Opened two local windows:' -ForegroundColor Green
Write-Host "Backend: http://127.0.0.1:$BackendPort"
Write-Host "Frontend: http://localhost:$WebPort"
Write-Host "The dsh-media-desk Yingce tab defaults to http://127.0.0.1:$WebPort; set MEDIA_DESK_WEB_PORT if this port conflicts."
