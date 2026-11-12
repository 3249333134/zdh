param([switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$dockerExe = (Get-Command docker -ErrorAction SilentlyContinue).Source
if (-not $dockerExe -and (Test-Path 'C:\Program Files\Docker\Docker\resources\bin\docker.exe')) { $dockerExe = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe' }
if (-not $dockerExe) { throw '请安装并启动 Docker Desktop。无需 Docker 可直接使用工作台内的客户管理。' }


$configDir = Join-Path $PSScriptRoot 'data\twenty'
New-Item -ItemType Directory -Path $configDir -Force | Out-Null
$envFile = Join-Path $configDir '.env'
if (-not (Test-Path -LiteralPath $envFile)) {
  function New-Secret([bool]$base64 = $false) {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes); if ($base64) { return [Convert]::ToBase64String($bytes) }; return -join ($bytes | ForEach-Object { $_.ToString('x2') }) } finally { $rng.Dispose() }
  }
  $content = "TWENTY_TAG=v2.38.1`nPG_DATABASE_PASSWORD=$(New-Secret)`nENCRYPTION_KEY=$(New-Secret $true)`nAPP_SECRET=$(New-Secret $true)`n"
  [IO.File]::WriteAllText($envFile, $content, [Text.UTF8Encoding]::new($false))
}
& $dockerExe compose --env-file $envFile -f compose.twenty.yml config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Twenty 部署配置校验失败。' }
if ($PrepareOnly) { Write-Host 'Twenty 配置与独立密钥已准备，配置校验通过。'; return }
& $dockerExe info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker 尚未就绪，请在系统重启后启动 Docker Desktop 再试。' }
& $dockerExe compose --env-file $envFile -f compose.twenty.yml up -d --wait --wait-timeout 600
if ($LASTEXITCODE -ne 0) { throw 'Twenty 启动失败，请用相同 --env-file 与 -f 参数运行 docker compose logs --tail=80 检查。' }
Write-Host 'Twenty 已启动：http://127.0.0.1:13580 。在 ERP 工作台选择 Twenty 服务，首次需创建 Twenty 账号。'
