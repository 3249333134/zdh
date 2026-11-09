$ErrorActionPreference = 'Stop'

$ScriptDir = $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path
$RuntimeRoot = Join-Path (Resolve-Path (Join-Path $RepoRoot '..')).Path '.local-runtimes'
$GoDir = Join-Path $RuntimeRoot 'go'
$GoExe = Join-Path $GoDir 'bin\go.exe'
$BunExe = Join-Path $RuntimeRoot 'bun\bun.exe'
$DataDir = Join-Path $RepoRoot '.local\project-workbench-debug'
$GoCache = Join-Path $RepoRoot '.local\cache\go-build'
$GoModCache = Join-Path $RepoRoot '.local\cache\go-mod'
$RuntimePidDir = Join-Path $RepoRoot '.local\runtime-pids'
$BackendPidFile = Join-Path $RuntimePidDir 'backend.pid'
$FrontendPidFile = Join-Path $RuntimePidDir 'frontend.pid'
$BackendPort = 8080
# 3000 may already be used by another local Node/Vite process on this machine; keep
# the plugin and local deployment aligned on 3001 unless MEDIA_DESK_WEB_PORT overrides it.
$WebPort = 3001
if ($env:MEDIA_DESK_WEB_PORT) { $WebPort = [int]$env:MEDIA_DESK_WEB_PORT }
$BackendDir = Join-Path $RepoRoot 'backend'
$WebDir = Join-Path $RepoRoot 'web'

function Ensure-Directory([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

function Assert-GoRuntime {
  if (-not (Test-Path -LiteralPath $GoExe)) {
    throw "Missing Go at $GoExe. Run setup-runtime.ps1 first."
  }
}

function Assert-BunRuntime {
  if (-not (Test-Path -LiteralPath $BunExe)) {
    throw "Missing Bun at $BunExe. Run setup-runtime.ps1 first."
  }
}

function Test-LocalPort([int]$Port) {
  $client = $null
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(300)) { return $false }
    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    if ($client) { $client.Close() }
  }
}

function Save-Pid([string]$Path, [int]$ProcessId) {
  Ensure-Directory (Split-Path -Parent $Path)
  [IO.File]::WriteAllText($Path, $ProcessId.ToString())
}

function Stop-SavedPid([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $raw = [IO.File]::ReadAllText($Path).Trim()
  if (-not $raw) { return }
  $savedPid = 0
  if (-not [int]::TryParse($raw, [ref]$savedPid) -or $savedPid -le 0) { return }
  try {
    $process = Get-Process -Id $savedPid -ErrorAction Stop
    # Bun can spawn a detached Node/Vite child; /T terminates only this saved
    # deployment's process tree, never a port-matched unrelated process.
    $null = & taskkill.exe /PID $savedPid /T /F 2>$null
    Write-Host "Stopped $Label PID $savedPid and its recorded process tree." -ForegroundColor Green
  } catch {
    Write-Host "$Label PID $savedPid was not running."
  } finally {
    Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  }
}
