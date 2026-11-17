# ALATUS | Publicador de Fretes

Painel **local e gratuito** para Windows: importe uma imagem já pronta, reconheça coleta, entrega e veículo por OCR, gere uma legenda e envie a imagem com o texto para grupos de WhatsApp escolhidos **manualmente**.

> **Estado:** versão 0.7.0-multicarga-preview. O fluxo WhatsApp da **v0.4 foi validado pelo operador** em Windows. A janela e o instalador da v0.6 ainda precisam de aceitação em um computador Windows. Não confundir testes automatizados com validação de entrega real.

## Fila de múltiplas cargas (v0.7.0)

- Importe mais de 10 imagens em uma mesma sessão. Cada imagem tem leitura OCR individual.
- Defina uma legenda diferente e **grupos próprios para cada carga**; depois clique em **Adicionar esta carga à fila**.
- Clique em **Iniciar envio da fila** para processar tudo de forma sequencial, com progresso e histórico por grupo.
- Nenhum item é enviado durante a importação ou inclusão na fila, e uma falha incerta bloqueia o restante.
- A fila é persistida localmente e não volta a enviar automaticamente após reinício.

Veja o [guia de múltiplas cargas](docs/FILA_MULTICARGAS.md).

## Funcionalidades

- Leitura de PNG/JPG/WEBP com OCR em português e edição manual dos campos quando a leitura não for confiável.
- Perfil **individual** de nome da empresa e telefone, salvo somente na instalação local.
- Legenda automática, incluindo “Valores a negociar” e o contato cadastrado.
- QR Code, reconexão de WhatsApp, seleção de grupos, **Selecionar todos**, fila sequencial e histórico.
- Envio somente quando a pessoa clicar no botão; sem reenviar automaticamente resultados incertos.
- Modo simulação, além do modo real. A biblioteca WhatsApp usada é **não oficial**.
- `ALATUS Publicador de Fretes` com janela própria Electron, instalador NSIS e atalho na Área de Trabalho. Os dados são preservados entre aberturas.

## Instalação para parceiros (Windows 10/11 x64)

A versão **0.7** mantém a interface que abria uma aba do navegador por uma **janela de desktop**. Após publicar o código no GitHub, abra **Actions → Windows Desktop - instalador de testes**, faça download do artefato e execute o `ALATUS-Instalador-0.7.0-x64.exe`. O instalador cria atalho na Área de Trabalho da conta Windows atual.

Na primeira abertura, se houver dados da v0.4 em `Z:\ALATUS`, o sistema oferecerá reutilizá-los (perfil, telefone, imagens e sessão WhatsApp) com consentimento. Novas instalações usam `%APPDATA%\ALATUS Publicador de Fretes`.

Ao **fechar** o aplicativo, o socket de WhatsApp é encerrado, mas as credenciais locais são preservadas, permitindo **reconectar na próxima abertura** sem novo QR quando a sessão for válida. Uma publicação em andamento precisa ser interrompida com segurança antes de sair.

### Desempenho e envio

- Sem pausa fixa entre grupos. O próximo envio começa após a conclusão da tentativa anterior; a velocidade depende da resposta do WhatsApp.
- Cache temporário dos metadados de grupos; leitura da imagem apenas uma vez por publicação.
- Um envio por vez, sem tentativas automáticas de contornar limites e sem reenviar resultados incertos.
- As políticas do WhatsApp não oferecem taxa de envio garantida ou aprovada para esse tipo de integração não oficial.

### Código-fonte e testes

- Backend Node.js: `app/`.
- Aplicativo desktop: `desktop/main.cjs`, `desktop/lifecycle.cjs`.
- Instalador: `electron-builder` NSIS, compilado pelo GitHub Actions em Windows.
- Testar: `npm --prefix app test` e `npm --prefix desktop test`.
- Compilar em Windows: `npm install --prefix app`, `npm install --prefix desktop`, `npm --prefix desktop run dist:win`.

Leia o [guia de instalação](docs/DESKTOP_INSTALACAO.md) e o [diagnóstico por etapa](docs/ERROS_DESKTOP.md).

**Estado da v0.7:** os testes automatizados de fila passaram e o instalador permanece pendente de compilação e validação na máquina Windows. A versão anterior permanece como referência de envio real.

## Avisos importantes

O projeto usa [Baileys](https://github.com/WhiskeySockets/Baileys), um cliente **não oficial** do WhatsApp. Conectar ou automatizar envios pode violar políticas do WhatsApp, causar bloqueio e falhar sem aviso. **Não é afiliado à Meta nem ao WhatsApp.** Use apenas em grupos com autorização explícita, sem disparos em massa não solicitados. Retirar a pausa não significa que o WhatsApp permita envios rápidos em massa; o uso permanece sujeito às regras da plataforma.

O painel atende somente a `127.0.0.1` e **não possui senha adicional**, por escolha do operador. Qualquer pessoa com acesso ao computador pode acessá-lo: não exponha a porta na rede, não rode em máquina multiusuário não confiável e proteja o diretório `data/session`.

O aplicativo desktop **encerra** o servidor ao fechar a janela. Não é um serviço persistente do Windows. A instalação padrão é por usuário, e o acesso à pasta compartilhada deve ser autorizado separadamente.

## Documentação

- [Instalação, atualização e migração](docs/INSTALACAO.md)
- [Checklist de validação](docs/TESTES.md)
- [Diagnóstico por etapa](docs/ERROS.md)
- [Dados e privacidade](docs/PRIVACIDADE.md)
- [Publicação no GitHub](docs/PUBLICAR_GITHUB.md)

## Licença

Código-fonte em [MIT](LICENSE). Bibliotecas têm licenças próprias. A marca ALATUS, suas artes e o logotipo **não** estão licenciados sob MIT e não são fornecidos neste repositório.
