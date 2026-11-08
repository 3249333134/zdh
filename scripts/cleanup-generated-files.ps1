param([switch]$Execute)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($root.TrimEnd('\') -ne 'D:\prj\zdh') { throw 'Unexpected workspace' }
$cutoff = (Get-Date).AddDays(-1)
$uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
$profilePattern = '^(atlas-packaged|canvas-source|desktop|progress-window-desktop|shell-dsh|source-ui|wiki-ui|work-plan-desktop|intake-correction|intake-persist)-' + $uuid + '(-data)?$'
$testRoot = Join-Path $root '.enterprise-test'
$runningTests = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($root) -and ($_.CommandLine -match 'scripts[\\/]test-[^ ]+\.mjs|--test\s+enterprise|enterprise[\\/]tests[\\/]test-service') })
$targets = @()
$logs = @(Get-ChildItem -LiteralPath $root -File -Force | Where-Object { $_.Name -match '^\..+\.log$' -and $_.LastWriteTime -lt $cutoff })
foreach ($file in $logs) { $targets += [pscustomobject]@{ Path=$file.FullName; Kind='旧构建或测试日志'; Bytes=$file.Length; Directory=$false } }
if (!$runningTests.Count -and (Test-Path -LiteralPath $testRoot)) {
 foreach ($dir in (Get-ChildItem -LiteralPath $testRoot -Directory -Force | Where-Object { $_.Name -match $profilePattern -and $_.LastWriteTime -lt $cutoff })) {
  if ($dir.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
  $children = @(Get-ChildItem -LiteralPath $dir.FullName -Recurse -Force -ErrorAction Stop)
  if (@($children | Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $_.LastWriteTime -ge $cutoff }).Count) { continue }
  $bytes = ($children | Where-Object { !$_.PSIsContainer } | Measure-Object Length -Sum).Sum
  $targets += [pscustomobject]@{ Path=$dir.FullName; Kind='自动测试的隔离临时数据'; Bytes=[long]$bytes; Directory=$true }
 }
}
$reportDir = Join-Path $root 'cleanup-reports'
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$manifest = Join-Path $reportDir ($stamp + '-targets.json')
$targets | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifest -Encoding utf8
$deleted = @(); $failed = @()
if ($Execute) {
 foreach ($target in $targets) {
  $resolved = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $target.Path).Path)
  $allowed = if ($target.Directory) { ([IO.Path]::GetDirectoryName($resolved) -eq $testRoot) -and ([IO.Path]::GetFileName($resolved) -match $profilePattern) } else { ([IO.Path]::GetDirectoryName($resolved) -eq $root) -and ([IO.Path]::GetFileName($resolved) -match '^\..+\.log$') }
  if (!$allowed -or !$resolved.StartsWith($root + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Cleanup path outside allowed targets' }
  try { if ($target.Directory) { Remove-Item -LiteralPath $resolved -Recurse -Force } else { Remove-Item -LiteralPath $resolved -Force }; $deleted += $target } catch { $failed += [pscustomobject]@{Path=$resolved;Reason=$_.Exception.Message} }
 }
}
$result = [pscustomobject]@{ Date=(Get-Date -Format 's'); Executed=[bool]$Execute; CandidateCount=$targets.Count; CandidateBytes=($targets | Measure-Object Bytes -Sum).Sum; DeletedCount=$deleted.Count; DeletedBytes=($deleted | Measure-Object Bytes -Sum).Sum; Failures=$failed; SkippedProfilesForActiveTests=[bool]$runningTests.Count; Manifest=$manifest }
$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $reportDir ($stamp + '-result.json')) -Encoding utf8
$result | ConvertTo-Json -Depth 5
