$ErrorActionPreference = 'Stop'
$logDir = Join-Path $PSScriptRoot 'data\logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$result = Join-Path $logDir 'environment-install.json'
try {
  $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw '需要 Windows 管理员权限。' }
  & dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart *> (Join-Path $logDir 'virtual-machine-platform.log')
  $featureExit = $LASTEXITCODE
  if ($featureExit -notin @(0, 3010)) { throw "虚拟机平台启用失败：$featureExit" }
  & winget.exe install --id Microsoft.WSL --exact --source winget --silent --accept-source-agreements --accept-package-agreements --disable-interactivity *> (Join-Path $logDir 'wsl-install.log')
  $wslExit = $LASTEXITCODE
  if ($wslExit -ne 0 -and $wslExit -ne -1978335189) { throw "WSL 安装退出码：$wslExit，请检查 wsl-install.log。" }
  @{ success = $true; featureExit = $featureExit; wslExit = $wslExit; note = '未自动重启。请启动 Docker 检查引擎；若提示重启，请保存工作后重启。' } | ConvertTo-Json | Set-Content -LiteralPath $result -Encoding UTF8
} catch {
  @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json | Set-Content -LiteralPath $result -Encoding UTF8
  throw
}
