# 打包“自媒体工作台”为单文件安装包。
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File .\打包安装包.ps1 [-SkipStage] [-OutDir D:\prj\zdh\dsh\dist]
param(
  [string]$OutDir = 'D:\prj\zdh\dsh\dist',
  [switch]$SkipStage
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path          # media-workbench
$parent = Split-Path -Parent $root                                # dsh
$stage = Join-Path $OutDir 'stage'
$appDir = Join-Path $stage '自媒体工作台'

function Robo($src, $dst, $opts) {
  & robocopy $src $dst @opts | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "复制失败：$src" }
}

if (-not $SkipStage) {
  if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
  $mw = Join-Path $appDir 'media-workbench'
  New-Item -ItemType Directory -Force -Path $mw, (Join-Path $appDir 'autoclip\frontend'), (Join-Path $appDir '.local-runtimes') | Out-Null

  # 1) 主程序：根文件 + 完整运行环境
  foreach ($f in @('main.cjs','host.mjs','local-session.cjs','local-assets.cjs','unified-ai.cjs','canvas-web.cjs','autoclip-web.cjs','workflow-native.cjs','package.json','启动自媒体工作台.cmd','使用说明.md','setup.ps1')) {
    Copy-Item (Join-Path $root $f) $mw
  }
  Robo (Join-Path $root 'runtime') (Join-Path $mw 'runtime') @('/E','/NFL','/NDL','/NJH','/NJS')

  # 2) 纯净的用户数据骨架：插件副本 + 空设置，不含账号、密钥、历史内容
  Robo (Join-Path $root 'data\dsh') (Join-Path $mw 'data\dsh') @('/E','/NFL','/NDL','/NJH','/NJS','/XD','files','sessions','storages','/XF','.credentials.yaml','.anonymous-user-id','state.json','settings.json')
  New-Item -ItemType Directory -Force -Path (Join-Path $mw 'data\dsh\media-desk') | Out-Null
  [IO.File]::WriteAllText((Join-Path $mw 'data\dsh\media-desk\settings.json'), '{}', [Text.UTF8Encoding]::new($false))
  New-Item -ItemType Directory -Force -Path (Join-Path $mw 'data\dsh\media-desk\files'), (Join-Path $mw 'data\dsh\sessions'), (Join-Path $mw 'data\dsh\storages') | Out-Null

  # 3) 剪辑助手：只保留运行必需的后端与已构建前端
  Robo (Join-Path $parent 'autoclip\backend') (Join-Path $appDir 'autoclip\backend') @('/E','/NFL','/NDL','/NJH','/NJS')
  Robo (Join-Path $parent 'autoclip\frontend\dist') (Join-Path $appDir 'autoclip\frontend\dist') @('/E','/NFL','/NDL','/NJH','/NJS')
  foreach ($f in @('LICENSE','pyproject.toml','requirements-desktop.txt')) {
    Copy-Item (Join-Path $parent "autoclip\$f") (Join-Path $appDir 'autoclip')
  }

  # 4) 本机运行时：Python 与 FFmpeg（不含重复压缩包）
  Robo (Join-Path $parent '.local-runtimes\autoclip-python') (Join-Path $appDir '.local-runtimes\autoclip-python') @('/E','/NFL','/NDL','/NJH','/NJS')
  Robo (Join-Path $parent '.local-runtimes\ffmpeg\ffmpeg-9.0.2-essentials_build') (Join-Path $appDir '.local-runtimes\ffmpeg\ffmpeg-9.0.2-essentials_build') @('/E','/NFL','/NDL','/NJH','/NJS')

  # 5) 安装后脚本：建立桌面快捷方式并启动
  $installCmd = @'
@echo off
set "TARGET=%~dp0media-workbench\启动自媒体工作台.cmd"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell; $lnk=$ws.CreateShortcut((Join-Path $ws.SpecialFolders.Item('Desktop') '自媒体工作台.lnk')); $lnk.TargetPath='%~dp0media-workbench\启动自媒体工作台.cmd'; $lnk.WorkingDirectory='%~dp0media-workbench'; $lnk.IconLocation='%~dp0media-workbench\runtime\electron\electron.exe'; $lnk.Description='自媒体工作台'; $lnk.Save()"
start "" "%~dp0media-workbench\启动自媒体工作台.cmd"
'@
  [IO.File]::WriteAllText((Join-Path $appDir 'install.cmd'), $installCmd, [Text.Encoding]::Default)
  Write-Host "暂存完成：$appDir"
} else {
  Write-Host '跳过暂存，直接压缩。'
}

# 6) 准备 7-Zip 独立工具（7zr 自解压下载包 + extra 中的 7za/7zSD）
$tools = Join-Path $OutDir 'tools'
New-Item -ItemType Directory -Force -Path $tools | Out-Null
$7zr = Join-Path $tools '7zr.exe'
if (-not (Test-Path $7zr)) {
  Invoke-WebRequest -UseBasicParsing 'https://www.7-zip.org/a/7zr.exe' -OutFile $7zr
}
$7za = Get-ChildItem $tools -Recurse -Filter 7za.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $7za) {
  $extra = Join-Path $tools 'extra.7z'
  if (-not (Test-Path $extra)) {
    $ok = $false
    foreach ($ver in @('2501','2409','2408')) {
      try { Invoke-WebRequest -UseBasicParsing "https://www.7-zip.org/a/7z$ver-extra.7z" -OutFile $extra; $ok = $true; break } catch { Remove-Item $extra -ErrorAction SilentlyContinue }
    }
    if (-not $ok) { throw '下载 7-Zip extra 失败' }
  }
  & $7zr x $extra "-o$tools" -y | Out-Null
  $7za = Get-ChildItem $tools -Recurse -Filter 7za.exe | Select-Object -First 1
}
$sfx = Get-ChildItem $tools -Recurse -Filter 7zSD.sfx -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $sfx) {
  # SFX 模块随 LZMA SDK 发布，不在 extra 包里
  $lzma = Join-Path $tools 'lzma.7z'
  if (-not (Test-Path $lzma)) {
    $ok = $false
    foreach ($ver in @('2501','2409','2408')) {
      try { Invoke-WebRequest -UseBasicParsing "https://www.7-zip.org/a/lzma$ver.7z" -OutFile $lzma; $ok = $true; break } catch { Remove-Item $lzma -ErrorAction SilentlyContinue }
    }
    if (-not $ok) { throw '下载 LZMA SDK 失败' }
  }
  & $7zr x $lzma "-o$(Join-Path $tools 'lzma')" -y | Out-Null
  $sfx = Get-ChildItem $tools -Recurse -Filter 7zSD.sfx | Select-Object -First 1
}
if (-not $7za -or -not $sfx) { throw '7-Zip 工具不完整' }

# 7) 压缩并生成自解压安装包
$archive = Join-Path $OutDir 'workbench.7z'
if (Test-Path $archive) { Remove-Item $archive -Force }
Push-Location $appDir
try {
  & $7za.FullName a $archive '*' '-mx=5' '-ms=on' '-mmt=on' | Out-Host
  if ($LASTEXITCODE -ne 0) { throw '压缩失败' }
} finally { Pop-Location }

$config = @"
;!@Install@!UTF-8!
Title="自媒体工作台"
BeginPrompt="即将安装「自媒体工作台」桌面版（约 3 GB）。"
InstallPath="%LOCALAPPDATA%\\Programs\\自媒体工作台"
RunProgram="cmd /c install.cmd"
;!@InstallEnd@!
"@
$configFile = Join-Path $OutDir 'sfx-config.txt'
[IO.File]::WriteAllText($configFile, $config, [Text.UTF8Encoding]::new($true))

$installer = Join-Path $OutDir '自媒体工作台-安装包.exe'
if (Test-Path $installer) { Remove-Item $installer -Force }
& cmd /c copy /b "`"$($sfx.FullName)`"" + "`"$configFile`"" + "`"$archive`"" "`"$installer`"" | Out-Null
if (-not (Test-Path $installer)) { throw '安装包合成失败' }

# 8) 自校验：安装包本身必须是可读的 7z 包
& $7za.FullName t $installer | Out-Null
if ($LASTEXITCODE -ne 0) { throw '安装包校验失败' }
$size = (Get-Item $installer).Length / 1GB
Write-Host ("完成：{0}（{1:N2} GB）" -f $installer, $size)
