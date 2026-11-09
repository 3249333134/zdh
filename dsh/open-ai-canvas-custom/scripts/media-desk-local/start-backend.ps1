. (Join-Path $PSScriptRoot 'runtime-common.ps1')
Assert-GoRuntime

Ensure-Directory $DataDir
Ensure-Directory $GoCache
Ensure-Directory $GoModCache
Ensure-Directory (Join-Path $BackendDir '.local')

$env:GOCACHE = $GoCache
$env:GOMODCACHE = $GoModCache
$env:GOPROXY = 'https://goproxy.cn,direct'
$env:GOSUMDB = 'sum.golang.google.cn'
$env:CGO_ENABLED = '0'
$env:CANVAS_BACKEND_ADDR = "127.0.0.1:$BackendPort"
$env:CANVAS_BACKEND_DATA_DIR = $DataDir
$env:CANVAS_DATABASE_DRIVER = 'sqlite'
$env:CANVAS_AUTO_MIGRATE = 'true'
$env:CANVAS_CORS_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001"
$env:CANVAS_REGISTRATION_ENABLED = 'false'
$env:GIN_MODE = 'debug'

Set-Location -LiteralPath $BackendDir
$serverExe = Join-Path $BackendDir '.local\server.exe'
Write-Host 'Building pure-Go SQLite backend (CGO disabled)...' -ForegroundColor Cyan
& $GoExe build -o $serverExe ./cmd/server
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "SQLite data directory: $DataDir" -ForegroundColor Cyan
Write-Host "Starting Go backend: http://127.0.0.1:$BackendPort" -ForegroundColor Green
$proc = Start-Process -FilePath $serverExe -WorkingDirectory $BackendDir -NoNewWindow -PassThru
Save-Pid $BackendPidFile $proc.Id
$proc.WaitForExit()
exit $proc.ExitCode
