# E02 | Diagnóstico por etapa

Leia os logs locais em `logs/launcher.log`, `logs/server.log` e, para eventos, `logs/events.ndjson`. **Oculte chaves, QR Codes, IDs de grupos, telefone privado e qualquer credencial antes de enviar logs a terceiros.**

| Código | Etapa | Sintoma | Ação segura |
|---|---|---|---|
| B01 | Download Node | Internet indisponível, erro na transferência | Verifique rede e acesso a nodejs.org; não use download de origem desconhecida |
| B02 | SHA256 | Arquivo não confere | Não execute; descarte o ZIP Node e investigue |
| B03 | Node | `npm.cmd` ausente | Verifique extração em `runtime/node`; não apague dados |
| B04 | Bibliotecas | `npm install` falha | Veja terminal e conexão com registry.npmjs.org; preserve `data/session` |
| B05 | Sintaxe | Backend não passa checagem | Restaure os arquivos do pacote íntegro |
| L01 | Launcher | Arquivo `app/server.mjs` não encontrado | Extraia o ZIP inteiro e rode o EXE da raiz |
| L02 | Porta | `3187` ocupada | Pare painel antigo no PowerShell; não inicie duas instâncias |
| L03 | Inicialização | Navegador não abre | Acesse `http://127.0.0.1:3187`, confira `logs/server.log` |
| P01 | Perfil | Empresa/telefone em branco | Salve o perfil no topo do painel |
| O01 | OCR | Arte sem leitura ou leitura parcial | Confira `node_modules/tesseract.js` e rede do primeiro modelo; corrija manualmente |
| W01 | QR | `Logging in` sem concluir | Use reiniciar conexão; 515 exige reconexão; não compartilhe QR |
| W02 | Sessão | Credenciais inválidas | Só redefina sessão pelo painel se a reconexão falhar; credenciais anteriores são preservadas em backup |
| W03 | Grupos | Lista vazia | Confirme conexão e clique Atualizar grupos |
| F01 | Envio | Status incerto/timeout | **Não reenvie** até verificar o grupo. Pare a fila e reinicie se necessário |
| F02 | Seleção | Grupos errados | Use Limpar seleção. Selecionar todos não envia por si só |

## Verificações (PowerShell no diretório extraído)

```powershell
& '.\runtime\node\node.exe' --version
& '.\runtime\node\node.exe' --check '.\app\server.mjs'
Get-Content '.\logs\server.log' -Tail 50
Invoke-RestMethod 'http://127.0.0.1:3187/api/health'
```

Para coleta estruturada do erro, anote: código, data/hora, versão, passos executados, status da conexão e estado da fila. Não envie imagens de documentos pessoais, sessões ou QR Codes.

Para a versão desktop v0.6, veja também [ERROS_DESKTOP.md](ERROS_DESKTOP.md).
