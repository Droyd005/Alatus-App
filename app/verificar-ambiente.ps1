$root = Split-Path -Parent $PSScriptRoot
$node=Join-Path $root 'runtime\node\node.exe'
$server=Join-Path $PSScriptRoot 'server.mjs'
Write-Host 'ALATUS v0.5 - Verificacao de ambiente'
foreach ($f in @($node,$server,(Join-Path $PSScriptRoot 'node_modules\baileys'))) {
 if (Test-Path $f) {Write-Host "OK $f" -ForegroundColor Green} else {Write-Host "PENDENTE $f" -ForegroundColor Yellow}
}
if (Test-Path $node) {& $node --version}
try { $s=Invoke-RestMethod 'http://127.0.0.1:3187/api/health' -TimeoutSec 3;Write-Host "Painel: $($s.app) / $($s.mode)" }
catch { Write-Host 'Painel ainda nao iniciado.' }
