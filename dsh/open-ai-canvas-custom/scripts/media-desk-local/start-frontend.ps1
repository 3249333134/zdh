. (Join-Path $PSScriptRoot 'runtime-common.ps1')
Assert-BunRuntime

if (-not (Test-Path -LiteralPath (Join-Path $WebDir 'node_modules'))) {
  Write-Host 'First run: installing frontend dependencies with bun install ...' -ForegroundColor Cyan
  Set-Location -LiteralPath $WebDir
  & $BunExe install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$env:VITE_API_PROXY_TARGET = "http://127.0.0.1:$BackendPort"
Set-Location -LiteralPath $WebDir
Write-Host "Starting Bun/Vite frontend: http://localhost:$WebPort" -ForegroundColor Green
$proc = Start-Process -FilePath $BunExe -ArgumentList @('vite', '--host', '0.0.0.0', '--port', $WebPort.ToString(), '--strictPort') -WorkingDirectory $WebDir -NoNewWindow -PassThru
Save-Pid $FrontendPidFile $proc.Id
$proc.WaitForExit()
exit $proc.ExitCode
