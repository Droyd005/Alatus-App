# D01-D08 | Instalação desktop da ALATUS v0.6.1 (prévia)

## Objetivo

Aplicativo Windows 10/11 x64 com janela independente de navegador. O instalador NSIS cria atalho na Área de Trabalho e no menu Iniciar. Cada pessoa configura o próprio perfil de empresa, telefone e WhatsApp. Dados e sessão são **locais**, nunca vão para o repositório.

## Antes de instalar

1. Encerre a v0.4 no PowerShell com `Ctrl+C`, depois confirme que a porta 3187 está livre.
2. Faça um backup de `Z:\\ALATUS\\data` e `Z:\\ALATUS\\images` em local seguro, sem publicar arquivos de sessão.
3. Faça o download do instalador gerado pelo GitHub Actions na aba **Actions** → **Windows Desktop - instalador de testes** → **Artifacts**. O instalador ainda **não foi validado no seu Windows**.
4. O instalador não tem assinatura de código nesta prévia; Windows SmartScreen poderá exibir alerta. Não instale arquivos de origem desconhecida.

## Instalar

1. Abra `ALATUS-Instalador-0.6.1-x64.exe` (gerado pelo workflow do GitHub). Escolha a pasta de instalação. A instalação por usuário não requer direitos administrativos normalmente.
2. Confirme o atalho **ALATUS Publicador de Fretes** na sua Área de Trabalho.
3. Na primeira abertura, se existir `Z:\\ALATUS\\data\\profile.json` ou `Z:\\ALATUS\\data\\session\\creds.json`, o programa perguntará se deseja **utilizar essa pasta existente**. Aceite somente se esta for sua sessão e o SSD tiver permissões confiáveis.
4. Caso contrário, o programa usa `%APPDATA%\\ALATUS Publicador de Fretes` para guardar empresa, telefone, imagens, OCR, histórico e credenciais WhatsApp.
5. A conexão WhatsApp será restabelecida ao iniciar quando houver sessão válida; senão, siga o QR na interface.

## Fechar e reabrir

- O botão X encerra o servidor e o socket WhatsApp ativo, preservando `data/session`.
- Se uma fila está em execução, o app pergunta se deseja interromper os **próximos** envios antes de fechar. A mensagem atual pode concluir ou permanecer incerta, então confira o WhatsApp.
- A conexão local é refeita ao abrir o programa. Isso **não remove** o dispositivo pareado no WhatsApp, salvo se você escolher Redefinir sessão.
- A instalação por usuário gera atalho somente para o Windows desse usuário. Para usar em duas contas diferentes, instale o programa em cada uma. Compartilhar `Z:\\ALATUS` requer autorização e controle de acesso a arquivos privados.

## Limitações

- O envio para grupos depende de cliente WhatsApp **não oficial** (Baileys) e pode estar sujeito a bloqueio/restrições. Use apenas grupos que permitam seus anúncios.
- O programa envia **uma mensagem por vez**. Não há pausa fixa entre grupos. Não é uma taxa aprovada pelo WhatsApp, nem garantia de rapidez/segurança.
- O tempo de envio depende da rede, criptografia e confirmação da biblioteca; não há pausa fixa programada na fila.
- O instalador inclui dependências Node via Electron e backend; o primeiro uso do OCR pode precisar de internet para baixar o modelo de português.

## Desenvolvimento

No repositório:

```powershell
npm install --prefix app
npm install --prefix desktop
npm --prefix app test
npm --prefix desktop test
npm --prefix desktop run dev
```

Para gerar instalador em Windows:

```powershell
npm --prefix desktop run dist:win
```

O executável é produzido em `dist\\instalador`. No GitHub Actions, consulte o artefato `ALATUS-Desktop-Instalador-v0.6.1-TESTE`.

## Diagnóstico

Leia [ERROS_DESKTOP.md](ERROS_DESKTOP.md) e registre o código da etapa, a versão e o status da fila, sem compartilhar credenciais. **A aprovação das rotinas automatizadas não substitui o teste de recebimento real.**
