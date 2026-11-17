# ALATUS | Atualização automática 0.7.1

- Fonte: GitHub Releases do repositório público `Droyd005/Alatus-App`.
- O app consulta novas versões ao abrir; `electron-updater` usa `app-update.yml` embarcado.
- Usuário confirma download e instalação, sem downloads/install silenciosos.
- Dados salvos no diretório do usuário / diretório legado selecionado são preservados.
- A fila de envios, inclusive multicargas, precisa estar parada para instalar.
- O backend é encerrado por rota privada antes de chamar `quitAndInstall`.
- Nunca remover credenciais ao fechar; a conexão socket é encerrada sem logout.
- CI só publica Release mediante uma tag `vX.Y.Z`, que corresponde ao `desktop/package.json`.
- Release deve conter instalador `ALATUS-Instalador-X.Y.Z-x64.exe` e `latest.yml`.
- Não criar tag de uma compilação ainda não verificada no Windows como "estável" sem aceitar essa limitação. A versão inicial precisa ser instalada manualmente uma vez.

## Diagnóstico

| Código | Significado | Ação |
|---|---|---|
| U01 | Falha ao consultar atualizações | Testar internet e GitHub Releases, verificar logs/desktop.log |
| U02 | Envio ativo | Finalizar fila e reabrir o aplicativo |
| U03 | Falha no download | Conferir conexão e espaço livre |
| U04 | Atualização baixada, instalação adiada | Encerrar envios e reabrir |
| U05 | Erro ao encerrar backend | Consultar logs/desktop.log; não forçar atualização |
| U06 | Backend encerrado para atualização | Comportamento normal |
| REL-01 | Tag diferente da versão | Corrigir versão ou tag |
| REL-02 até REL-06 | Erro no pacote ou no manifesto | Não publicar; conferir workflow |

## Segurança

- Repositório GitHub público; não colocar tokens, logs ou dados do WhatsApp nos commits.
- A integridade SHA-512 do instalador é verificada pelo atualizador conforme manifesto.
- O executável não possui assinatura de código Authenticode nesta fase. Não desabilitar as verificações de segurança para contornar avisos do Windows.
- Se o verificador de assinatura do Electron rejeitar a atualização, conservar a instalação atual, consultar U01 e instalar a versão pela página oficial do GitHub após verificar sua origem.
