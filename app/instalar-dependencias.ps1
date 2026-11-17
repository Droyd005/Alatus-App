$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$nodeDir = Join-Path $root 'runtime\node'
$npm = Join-Path $nodeDir 'npm.cmd'
if (-not (Test-Path $npm)) { throw '[E02] Node e npm ausentes. Execute ALATUS.exe.' }
$env:Path = "$nodeDir;$env:Path"
$env:npm_config_cache = Join-Path $root 'runtime\npm-cache'
Push-Location $PSScriptRoot
try {
 & $npm install --no-audit --no-fund
 if ($LASTEXITCODE -ne 0) {throw '[E08] Falha ao instalar dependencias.'}
} finally { Pop-Location }
