$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw '请先安装并启动 Docker Desktop，然后重新运行此脚本。' }
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker 尚未启动，请启动 Docker Desktop 后重试。' }
if (-not (Test-Path -LiteralPath '.env')) {
  function New-Secret { $bytes = New-Object byte[] 32; $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); try { $rng.GetBytes($bytes); return -join ($bytes | ForEach-Object { $_.ToString('x2') }) } finally { $rng.Dispose() } }
  $content = "KANEO_IMAGE_TAG=2.49.0`nPOSTGRES_PASSWORD=$(New-Secret)`nAUTH_SECRET=$(New-Secret)`n"
  [IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'), $content, [Text.UTF8Encoding]::new($false))
}
docker compose up -d --wait --wait-timeout 240
if ($LASTEXITCODE -ne 0) { throw 'Kaneo 启动失败。请运行 docker compose logs --tail=80 检查原因。' }
Write-Host 'Kaneo 已就绪。打开 ERP 工作台，创建首个账号及工作空间。地址：http://127.0.0.1:13570'
