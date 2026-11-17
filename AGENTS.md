# AGENTS.md: ALATUS Publicador de Fretes

## Objetivo
Aplicativo Windows local para importar imagem de frete criada externamente, extrair dados por OCR, preparar legenda e publicar em grupos do WhatsApp selecionados manualmente.

## Regras de desenvolvimento
- NÃO publicar credenciais do WhatsApp, `data/session`, números pessoais, imagens privadas, grupos reais, logs ou backups no Git.
- Configuração de nome e telefone **por instalação** via `data/profile.json` (arquivo ignorado pelo Git). Não fixar número da ALATUS no código novo.
- Não afirmar que `submetido` equivale a mensagem entregue.
- A seleção de grupos não envia nada; apenas o clique em Enviar autoriza a tentativa.
- Nunca enviar mensagens de forma paralela, sem limite ou sem consentimento dos grupos; respeitar restrições do WhatsApp. A fila não tem atraso artificial entre tentativas, mas continua estritamente sequencial.
- Preservar dados existentes em atualização e não apagar sessão na reconexão.
- Servidor em localhost 127.0.0.1, sem abrir portas na rede. Qualquer usuário local pode alcançar o painel, portanto não instalar em PC compartilhado sem isolamento.
- Não reexecutar tentativas com estado incerto; a fila deve parar nesse caso.
- Cada mudança deve incluir teste e documentação Markdown de erros por etapa.

## Checagens
`npm --prefix app run check && npm --prefix app test` e `npm --prefix desktop run check && npm --prefix desktop test`.
Instalador Windows pelo workflow `.github/workflows/windows-preview.yml`; não anunciar que foi validado até testar em Windows.

## Distribuição
Código-fonte no ZIP. O instalador `.exe` será compilado pelo GitHub Actions no Windows após publicar. Electron inclui o runtime Node. Primeiro OCR pode exigir internet para modelo português. Instalador sem assinatura, testar em Windows antes de anunciar release estável.

## Regra da fila multicargas
Cada registro deve preservar uma combinação independente de imagem + origem + destino + veículo + legenda + grupos.
Não enviar ao importar ou enfileirar; somente o usuário pode iniciar o lote explicitamente.
Não enviar em paralelo nem repetir automaticamente tentativas incertas. Persistir registros e preservar estado em reinícios.
