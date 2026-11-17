# E01 | Instalação e migração

## Instalação nova

1. Windows 10/11 64 bits, SSD/HD com espaço livre, internet e autorização para executar aplicativos locais.
2. Extraia o pacote ZIP **inteiro** em pasta que permita gravação (por exemplo `C:\Fretes`).
3. Execute `ALATUS.exe` por duplo clique. Ele verifica a porta local 3187 e a presença de `app/server.mjs`.
4. Caso falte Node.js, `scripts/bootstrap.ps1` baixa a distribuição oficial 26.13.1, confere SHA-256 e extrai em `runtime/node`.
5. Caso faltem bibliotecas, o bootstrap executa `npm install` dentro de `app`.
6. Quando iniciar, abra `http://127.0.0.1:3187`, salve **nome da empresa e telefone** e teste a importação de uma arte.
7. O idioma OCR é obtido pela biblioteca Tesseract.js na primeira leitura; precisa de rede nessa etapa.

O launcher não requer PATH global nem letra de unidade fixa e não instala serviços, drivers ou extensões de navegador.

## Atualização de uma v0.4 validada no Z:

> Nunca atualize durante um envio em andamento.

1. No histórico, confirme que nenhuma fila está ativa. Encerre o PowerShell antigo com `Ctrl+C`.
2. Faça uma cópia de segurança LOCAL e protegida de `Z:\ALATUS` (incluindo sessões). **Não suba essa cópia ao GitHub.**
3. Extraia o pacote novo sobre `Z:\ALATUS`, substituindo apenas os arquivos de código incluídos no ZIP. O pacote **não** contém `data`, `images`, `logs`, `runtime`, `backups` ou `Template.jpeg`.
4. Execute `Z:\ALATUS\ALATUS.exe`. Ele reutiliza o Node.js e os módulos existentes.
5. O perfil será carregado da instalação anterior quando houver histórico legado. Confira nome/telefone no novo painel; se estiverem vazios, preencha-os uma vez.
6. Teste primeiro uma **simulação** (com `ALATUS.exe --simulacao` em um atalho ou via PowerShell). Depois teste a conexão e um envio real para um único grupo autorizado.

## Arquivos

- `ALATUS.exe`: lançador; fica na raiz da pasta extraída.
- `app/`: código do servidor e interface.
- `runtime/node/`: Node.js portátil, obtido na primeira inicialização ou reaproveitado.
- `app/node_modules/`: bibliotecas npm, não versionadas.
- `data/profile.json`: perfil particular de empresa e telefone.
- `data/session/`: credenciais e sessão privadas do WhatsApp.
- `images/entrada/`: imagens enviadas ao painel.
- `logs/`: logs e histórico de auditoria.
- `app/docs/`: documentação histórica do painel.

## Dois usuários Windows

A pasta e o Node.js podem ser compartilhados no SSD, desde que ambas as contas possuam permissões compatíveis. **Não compartilhe** a pasta `data/session` com usuários de outras empresas. Como o launcher não instala um serviço do Windows, uma sessão desconectada por logout pode interromper o processo; este requisito exige serviço dedicado posteriormente. Evite instalação no diretório protegido `Program Files` porque o aplicativo grava arquivos locais.
