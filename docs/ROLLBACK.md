# ALATUS | Recuperar uma versão estável com Git (rollback)

## Como as versões são preservadas
O repositório `Droyd005/Alatus-App` usa commits e tags de versão (`v0.8.6`, `v0.8.7`, `v0.8.8` etc.). O GitHub Releases guarda instaladores quando o GitHub Actions termina corretamente. Nunca apague tags de versões funcionais.

**Importante:** o `electron-updater` normalmente só oferece versões MAIS NOVAS. Reinstalar uma versão antiga manualmente não impede que uma versão quebrada volte a ser oferecida. Para um **rollback durável**, a restauração deve ser publicada com um **novo número de versão maior que a versão problemática**, mantendo o conteúdo da versão estável.

## Método rápido: reinstalação manual (sem alterar o Git)
1. Feche o aplicativo e certifique-se de que não há envio ativo.
2. Se estiver com defeito, desative a programação automática; faça backup da pasta de dados local, incluindo `data/`, `images/` e `logs/` (não envie a pasta `data/session/` para terceiros).
3. Em <https://github.com/Droyd005/Alatus-App/releases>, escolha a versão que funcionava e baixe o `ALATUS-Instalador-*-x64.exe` daquela release.
4. Instale e abra. Se aparecer proposta de atualização para a versão problemática, escolha **Agora não**.
5. Considere que arquivos de dados criados por versões posteriores podem não ser compatíveis com versões antigas. Preserve backup antes de instalar.

## Método recomendado: restauração versionada no Git (sem `git push --force`)
O arquivo `RECUPERAR_VERSAO.ps1` recupera o código de uma tag anterior, cria um NOVO commit sobre o `main` atual e publica uma tag com número MAIOR, para que o atualizador do aplicativo reconheça a correção. O script usa autenticação Git for Windows já configurada e trabalha numa pasta temporária.

Exemplo: se a `v0.8.8` quebrar e a `v0.8.7` era estável, escolha a próxima versão, como `0.8.9`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "Z:\Alatus\Att\RECUPERAR_VERSAO.ps1" -Origem v0.8.7 -NovaVersao 0.8.9 -Publicar
```

O publicador confere se a tag existe, exige versão nova maior que a atual, solicita digitar uma confirmação, cria uma tag de backup `backup-pre-rollback-v0.8.9` apontando para o commit que existia ANTES da restauração, cria um commit normal (sem sobrescrever o histórico) e faz um push atômico dos refs. Se não houver erros, o GitHub Actions compila a nova versão. Verifique a Release antes de abrir o aplicativo.

Se só quiser conferir a origem e a versão, execute sem `-Publicar`: faz validações e mostra o plano, sem publicar.

**Não tente** `git reset --hard` ou `git push --force` no `main` para voltar uma release. O histórico de commits e a auditoria das alterações devem permanecer preservados.

## O que o rollback não restaura
- Não remove mensagens enviadas pelo WhatsApp.
- Não recupera registros históricos apagados no computador.
- Não substitui backup dos dados e da sessão do WhatsApp.
- Não promete compatibilidade de arquivos `data/` entre versões. Teste primeiro em ambiente controlado.
- Não garante que uma versão antiga funcione com um protocolo do WhatsApp que tenha mudado.

## Conferir versões e diferenças
```powershell
git ls-remote --tags https://github.com/Droyd005/Alatus-App.git
```

Ou consulte a lista de tags: <https://github.com/Droyd005/Alatus-App/tags>
