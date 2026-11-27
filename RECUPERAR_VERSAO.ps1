# ALATUS | Restaurar uma tag estavel como NOVA versao (sem reescrever o Git)
# Exemplo: powershell.exe -NoProfile -ExecutionPolicy Bypass -File "Z:\Alatus\Att\RECUPERAR_VERSAO.ps1" -Origem v0.8.7 -NovaVersao 0.8.9 -Publicar
param(
  [Parameter(Mandatory=$true)][string]$Origem,
  [Parameter(Mandatory=$true)][string]$NovaVersao,
  [switch]$Publicar
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = 'Droyd005/Alatus-App'
$repoUrl = 'https://github.com/Droyd005/Alatus-App.git'
$checkout = Join-Path $env:TEMP ('alatus-rollback-' + [Guid]::NewGuid().ToString('N'))

function Git-Alatus {
  param([Parameter(Mandatory=$true)][string[]]$GitArgs)
  & $script:gitExe -C $checkout @GitArgs
  if ($LASTEXITCODE -ne 0) { throw "Falha no Git (codigo $LASTEXITCODE): $($GitArgs -join ' ')" }
}
function Set-AlatusVersion {
  param([Parameter(Mandatory=$true)][string]$FilePath,[Parameter(Mandatory=$true)][string]$Version)
  $raw = [IO.File]::ReadAllText($FilePath,[Text.Encoding]::UTF8)
  # Atualiza exclusivamente a propriedade version de package.json.
  $pattern = '("version"\s*:\s*")\d+\.\d+\.\d+(")'
  if ([regex]::Matches($raw,$pattern).Count -ne 1) { throw "Versao inesperada no arquivo: $FilePath" }
  $replacement = '${1}' + $Version + '${2}'
  $updated = [regex]::Replace($raw,$pattern,$replacement)
  [IO.File]::WriteAllText($FilePath,$updated,(New-Object Text.UTF8Encoding($false)))
}

try {
  if ($Origem -notmatch '^v\d+\.\d+\.\d+$') { throw 'Informe a origem como v0.8.7, v0.8.6 etc.' }
  if ($NovaVersao -notmatch '^\d+\.\d+\.\d+$') { throw 'Informe nova versao como 0.8.9 ou maior.' }
  $tagNova = 'v' + $NovaVersao
  $backupTag = 'backup-pre-rollback-' + $tagNova
  $script:gitExe = (Get-Command 'git.exe' -CommandType Application -ErrorAction Stop).Source
  Write-Host "--- ALATUS: verificar recuperacao $Origem -> $tagNova ---" -ForegroundColor Cyan
  & $script:gitExe clone --quiet $repoUrl $checkout
  if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel clonar o repositorio. Confira Git e acesso a rede.' }
  Git-Alatus -GitArgs @('fetch','--tags','--quiet','origin')
  $headBefore = (& $script:gitExe -C $checkout rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel identificar o commit atual.' }
  $versionNow = (Get-Content -LiteralPath (Join-Path $checkout 'desktop/package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
  if ([version]$NovaVersao -le [version]$versionNow) {
    throw "A nova versao $NovaVersao deve ser SUPERIOR a versao atual $versionNow para evitar que o updater reinstale o release defeituoso."
  }
  $sourceExists = (& $script:gitExe -C $checkout tag --list $Origem)
  if ($LASTEXITCODE -ne 0 -or $sourceExists -notcontains $Origem) { throw "Tag estavel $Origem nao existe no GitHub." }
  $targetExists = (& $script:gitExe -C $checkout tag --list $tagNova)
  if ($targetExists -contains $tagNova) { throw "Tag $tagNova ja existe; escolha outra versao." }
  $backupExists = (& $script:gitExe -C $checkout tag --list $backupTag)
  if ($backupExists -contains $backupTag) { throw "Tag de backup $backupTag ja existe; escolha outra versao." }
  Write-Host "Repositorio: $repo"
  Write-Host "HEAD atual: $headBefore ($versionNow)"
  Write-Host "Codigo antigo a restaurar: $Origem"
  Write-Host "Nova versao para instalacao/atualizacao: $tagNova"
  Write-Host "Tag de seguranca do HEAD atual: $backupTag"
  if (-not $Publicar) {
    Write-Host 'MODO DE CONFERENCIA: nenhuma alteracao publicada.' -ForegroundColor Green
    Write-Host "Para publicar, adicione -Publicar ao comando. Revise e confirme o plano antes de prosseguir."
    exit 0
  }
  $typed = Read-Host "Para publicar o rollback, digite exatamente: RESTAURAR $Origem COMO $tagNova"
  if ($typed -cne "RESTAURAR $Origem COMO $tagNova") { throw 'Confirmacao diferente do esperado; nada foi publicado.' }

  # Todas as mudancas ocorrem NUM CLONE TEMPORARIO. Sem reset ou push forçado no main.
  Git-Alatus -GitArgs @('tag',$backupTag,$headBefore)
  # Conservar a ferramenta e seu guia para rollbacks futuros, mesmo restaurando codigo antigo.
  $preservedTools = @{}
  foreach ($rel in @('RECUPERAR_VERSAO.ps1','docs/ROLLBACK.md')) {
    $f = Join-Path $checkout ($rel.Replace('/', [IO.Path]::DirectorySeparatorChar))
    if (Test-Path -LiteralPath $f -PathType Leaf) { $preservedTools[$rel] = [IO.File]::ReadAllText($f,[Text.Encoding]::UTF8) }
  }
  Git-Alatus -GitArgs @('restore','--source',"refs/tags/$Origem",'--staged','--worktree','--','.')
  foreach ($rel in $preservedTools.Keys) {
    $f = Join-Path $checkout ($rel.Replace('/', [IO.Path]::DirectorySeparatorChar))
    $parent = Split-Path -Parent $f
    if (-not (Test-Path -LiteralPath $parent)) { [IO.Directory]::CreateDirectory($parent) | Out-Null }
    [IO.File]::WriteAllText($f,$preservedTools[$rel],(New-Object Text.UTF8Encoding($false)))
  }
  Set-AlatusVersion -FilePath (Join-Path $checkout 'app/package.json') -Version $NovaVersao
  Set-AlatusVersion -FilePath (Join-Path $checkout 'desktop/package.json') -Version $NovaVersao
  $workflowPath = Join-Path $checkout '.github/workflows/windows-preview.yml'
  $workflowText = [IO.File]::ReadAllText($workflowPath,[Text.Encoding]::UTF8)
  $workflowNew = [regex]::Replace($workflowText,'ALATUS-Desktop-v\d+\.\d+\.\d+-TESTE',"ALATUS-Desktop-$tagNova-TESTE")
  [IO.File]::WriteAllText($workflowPath,$workflowNew,(New-Object Text.UTF8Encoding($false)))
  $changelogPath = Join-Path $checkout 'CHANGELOG.md'
  $prior = if (Test-Path $changelogPath) { [IO.File]::ReadAllText($changelogPath,[Text.Encoding]::UTF8) } else { '' }
  $intro = "## [$NovaVersao] - $(Get-Date -Format 'yyyy-MM-dd')`n- RESTAURACAO: codigo da tag estavel $Origem recompilado como versao $tagNova para rollback de $versionNow.`n- Historico do Git preservado; o estado anterior pode ser encontrado em $backupTag.`n`n"
  [IO.File]::WriteAllText($changelogPath,($intro+$prior),(New-Object Text.UTF8Encoding($false)))
  Git-Alatus -GitArgs @('add','-A')
  Git-Alatus -GitArgs @('diff','--cached','--check')
  & $script:gitExe -C $checkout diff --cached --quiet
  if ($LASTEXITCODE -ne 1) { throw 'Mudancas nao identificadas ou falha no diff; publicacao cancelada.' }
  $gitName = (& $script:gitExe -C $checkout config --get user.name)
  $gitEmail = (& $script:gitExe -C $checkout config --get user.email)
  if (-not $gitName -or -not $gitEmail) { throw 'Configure sua identidade Git (user.name e user.email) e tente novamente.' }
  Git-Alatus -GitArgs @('commit','-m',"revert: recuperar $Origem como $tagNova")
  Git-Alatus -GitArgs @('tag',$tagNova)
  Write-Host 'Publicando commit e tags com push atomico (sem reescrever a historia)...' -ForegroundColor Cyan
  Git-Alatus -GitArgs @('push','--atomic','origin',"HEAD:refs/heads/main","refs/tags/$tagNova","refs/tags/$backupTag")
  Write-Host "ROLLBACK PUBLICADO: $tagNova (codigo originado em $Origem)." -ForegroundColor Green
  Write-Host 'Aguarde o GitHub Actions ficar verde e a nova Release existir antes de atualizar o Windows.'
  Write-Host 'https://github.com/Droyd005/Alatus-App/actions'
} catch {
  Write-Host "ERRO NO ROLLBACK: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Nao alteramos a instalacao, os dados nem a sessao WhatsApp no seu computador.'
  exit 1
} finally {
  if (Test-Path -LiteralPath $checkout) {
    try { Remove-Item -LiteralPath $checkout -Recurse -Force -ErrorAction Stop } catch {}
  }
}
