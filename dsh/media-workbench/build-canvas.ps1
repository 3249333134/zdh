$ErrorActionPreference = 'Stop'
$previousAuthMode = $env:VITE_WORKBENCH_AUTH
try {
  $env:VITE_WORKBENCH_AUTH = '1'
  Push-Location -LiteralPath "$PSScriptRoot\..\open-ai-canvas\web"
  try {
    & "$PSScriptRoot\..\.local-runtimes\bun\bun.exe" vite build --outDir "$PSScriptRoot\runtime\canvas-web"
    if ($LASTEXITCODE -ne 0) { throw '影策桌面版构建失败' }
  } finally { Pop-Location }
} finally { $env:VITE_WORKBENCH_AUTH = $previousAuthMode }
