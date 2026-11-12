$ErrorActionPreference = 'Stop'
$docker = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
if (-not (Test-Path -LiteralPath $docker)) { throw '请先安装 Docker Desktop。' }
Start-Process -FilePath 'C:\Program Files\Docker\Docker\Docker Desktop.exe' -WindowStyle Hidden
$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  $info = [Diagnostics.ProcessStartInfo]::new($docker, 'info --format "{{.ServerVersion}}"')
  $info.UseShellExecute = $false; $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
  $check = [Diagnostics.Process]::Start($info)
  if ($check.WaitForExit(4000)) { $ready = $check.ExitCode -eq 0 } else { $check.Kill() }
  $check.Dispose()
  if ($ready) { break }
  Write-Host '正在等待 Docker 引擎就绪…'
  Start-Sleep -Seconds 2
}
if (-not $ready) { throw 'Docker 引擎尚未就绪。若刚安装 WSL 或虚拟机平台，请保存工作后重启电脑，再重新运行此文件。' }
& "$PSScriptRoot\部署Twenty.ps1"
Start-Process 'http://127.0.0.1:13580'
