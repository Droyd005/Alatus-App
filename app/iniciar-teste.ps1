$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node\node.exe'
$server = Join-Path $PSScriptRoot 'server.mjs'
if (-not (Test-Path $node)) { throw '[E02] Node nao encontrado. Execute ALATUS.exe para instalar.' }
$env:ALATUS_HOME = $root
$env:ALATUS_MODE = 'simulacao'
& $node $server
