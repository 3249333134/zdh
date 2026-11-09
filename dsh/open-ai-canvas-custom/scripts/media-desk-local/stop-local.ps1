. (Join-Path $PSScriptRoot 'runtime-common.ps1')

# Only stop processes recorded by this local deployment. Never kill an unrelated
# process that happens to listen on a common port.
Stop-SavedPid $BackendPidFile 'backend'
Stop-SavedPid $FrontendPidFile 'frontend'

Write-Host 'Local Yingce processes recorded by this deployment have been stopped.' -ForegroundColor Green
Write-Host 'If a manual console window remains open, close that window directly.'
