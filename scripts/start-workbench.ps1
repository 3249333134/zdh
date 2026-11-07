$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$env:DSH_HOME = Join-Path $root '.local-dsh'
$env:ENTERPRISE_DATA_HOME = Join-Path $root '.local-business'
node (Join-Path $root 'workbench/build.mjs')
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Push-Location (Join-Path $root 'upstream/deepseek-harness-master')
try { node apps/cli/lib/bin.js web --patch ../../workbench/cordis.patch.yml --no-open @args }
finally { Pop-Location }
