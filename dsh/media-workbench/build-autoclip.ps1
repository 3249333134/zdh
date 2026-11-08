$ErrorActionPreference = 'Stop'
$previousWorkbench = $env:VITE_WORKBENCH
try {
  $env:VITE_WORKBENCH = '1'
  Push-Location -LiteralPath "$PSScriptRoot\..\autoclip\frontend"
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw '剪辑助手工作台版本构建失败' }
  } finally { Pop-Location }
} finally { $env:VITE_WORKBENCH = $previousWorkbench }
