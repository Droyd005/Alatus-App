$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$nodeDir = Join-Path $root 'runtime\node'
$node = Join-Path $nodeDir 'node.exe'
if (-not (Test-Path $node)) {throw '[E02] Node nao encontrado. Execute ALATUS.exe.'}
Push-Location $PSScriptRoot
try {
 & $node --check server.mjs
 if ($LASTEXITCODE -ne 0) {throw '[E06] Sintaxe invalida.'}
 & $node --test tests/*.test.mjs
 if ($LASTEXITCODE -ne 0) {throw '[E06] Testes falharam.'}
 Write-Host '[E06] Testes aprovados.' -ForegroundColor Green
} finally { Pop-Location }
