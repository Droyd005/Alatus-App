# D00-D08 | Diagnóstico: aplicativo desktop, encerramento e instalação

**Privacidade:** nunca publique `data/session/`, `creds.json`, QR Codes, `data/profile.json`, IDs reais de grupos nem os logs completos sem remover informações privadas. O repositório Git deve conter apenas código e testes com dados fictícios.

| Código | Etapa | Sintoma | Procedimento |
|---|---|---|---|
| D00 | Inicialização Electron | Janela não inicia | Consulte `%APPDATA%\\ALATUS Publicador de Fretes\\logs\\desktop.log` |
| D01 | Porta local | Porta 3187 ocupada | Encerre a versão antiga da ALATUS no PowerShell antes de abrir a instalação desktop. Não force o processo desconhecido |
| D02 | Arquivos do backend | `server.mjs` ausente | Reinstale pelo instalador inteiro, não mova os arquivos de `resources/backend` |
| D03 | Inicialização do backend | Servidor fecha ou demora | Confira `logs/server.log` no diretório de dados selecionado, verifique antivírus e permissões |
| D04 | Interface | Janela em branco | Atualize o programa; o frontend deve carregar apenas `127.0.0.1:3187` |
| D05 | Fechar corretamente | WhatsApp continua conectado após fechar | Veja `logs/desktop.log` e `logs/events.ndjson` para `whatsapp_desconectado_ao_fechar`; a sessão salva continua disponível |
| D06 | Encerramento lento | Mensagem em andamento não conclui | O programa aguarda até o limite da chamada atual. Resultado incerto exige verificação manual no grupo |
| D07 | Persistência do perfil | Empresa ou telefone não aparecem | Confirme qual pasta de dados foi selecionada na primeira execução. Não exclua a sessão nem o `profile.json` |
| D08 | Segurança da janela | Links externos abrem dentro da interface | Navegação externa deve ser bloqueada; revise `desktop/lifecycle.cjs` |
| CI-D01 | GitHub Actions | Instalador não encontrado | Verifique execução do electron-builder |
| CI-D02 | GitHub Actions | Servidor ausente | Revise `desktop/package.json` → `build.extraResources` |
| CI-D03 | GitHub Actions | Baileys ausente | Verifique `npm install --prefix app` e o diretório `resources/backend/node_modules` |
| CI-D04 | GitHub Actions | OCR ausente | Verifique `tesseract.js` no backend empacotado |

## Teste de aceitação no Windows (não substituído por testes automatizados)

- [ ] A v0.4 antiga foi encerrada no PowerShell.
- [ ] O instalador criou o atalho na Área de Trabalho do usuário instalador.
- [ ] O atalho abriu uma janela própria da ALATUS, **sem nova aba no navegador**.
- [ ] Na primeira abertura, foi oferecido reutilizar `Z:\\ALATUS` quando havia dados anteriores.
- [ ] Perfil, imagens e sessão do WhatsApp aparecem após reabrir.
- [ ] Fechar a janela encerrou o processo servidor, liberando a porta 3187.
- [ ] Abrir novamente restaurou a sessão sem exigir QR, quando as credenciais ainda eram válidas.
- [ ] Uma publicação para **um grupo autorizado** chegou corretamente e não duplicou a mensagem.
- [ ] Publicações não iniciam sem clicar em Enviar.
- [ ] O histórico mostra a tentativa e indica corretamente `submetido`, não `entregue`.

**Observação:** fechar o app encerra a conexão *ativa* do socket, não faz logout do WhatsApp em Dispositivos conectados, de propósito. Ao reabrir, as credenciais locais autenticam novamente. Um logout remoto ou sessão expirada pode exigir novo QR.
