# E05 | Publicação segura no GitHub

Repositório público: https://github.com/Droyd005/Alatus-App

## Publicar a v0.6 com Git para Windows

Baixe o pacote `ALATUS_v061_SEM_PAUSA_CODIGO_PUBLICAR.zip` da conversa, extraia em uma pasta **diferente de `Z:\ALATUS`** e execute:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\PUBLICAR_NO_GITHUB.ps1'
```

O script baixa o estado atual do repositório com `git clone` em uma pasta temporária, copia só código e documentos, verifica os arquivos que serão publicados, solicita que você digite `PUBLICAR` e faz `git push`. A autenticação acontece pelo Git/Git Credential Manager, sem enviar tokens ou senhas ao ChatGPT.

**Não execute o script antigo da v0.5:** ele publica uma versão anterior, cujo inicializador abria o navegador. A v0.6 usa Electron e gera instalador com atalho.

## GitHub Actions

Após o push, abra o repositório → **Actions** → **Windows Desktop - instalador de testes** → execução mais recente → **Artifacts** → `ALATUS-Desktop-Instalador-v0.6.1-TESTE`. O CI roda os testes, baixa dependências e constrói o instalador NSIS 64 bits.

- Não é necessário publicar o `node_modules` no Git.
- Não envie `data`, `session`, `images`, `logs`, números de telefone ou QR Codes.
- Primeiro valide a instalação em um Windows e um grupo autorizado antes de compartilhar com parceiros.
- A versão desktop não possui assinatura de código, e o Windows SmartScreen pode alertar na primeira instalação.

## Erros de publicação

| Código | Significado | Correção |
|---|---|---|
| P01 | Git não instalado | Instale Git para Windows e reabra PowerShell |
| P02 | Detectados dados privados no pacote | Interrompa e remova credenciais e logs, sem enviá-los ao GitHub |
| P03 | Falhou `git clone` | Confira Git Credential Manager, rede e permissões do repositório |
| P04 | Arquivo sensível preparado para commit | Não publique; revise o arquivo listado |
| P05 | Identidade Git ausente | Configure `git config --global user.name` e `git config --global user.email` |
| P06 | Falha `git push` | Revise permissões e possíveis commits concorrentes; não force push |
