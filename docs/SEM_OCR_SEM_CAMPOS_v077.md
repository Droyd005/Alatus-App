# ALATUS v0.7.7 | Imagem sem OCR, rota ou legenda

## Alterações
- Selecionar imagem e grupos é suficiente para enviar uma foto.
- Origem, destino, veículo e legenda não são obrigatórios.
- OCR e legenda desmarcados por padrão, ativáveis individualmente.
- Ao escolher legenda, a validação de contato e "Valores a negociar" continua.
- Não modifica dados locais, imagens, fila salva, histórico nem sessão do WhatsApp.
- A fila reutilizável da v0.7.6 permanece intacta. Cada repetição exige confirmação explícita e conserva o bloqueio de resultados incertos.
- Publicação individual também admite só imagem.

## Testes
- `npm --prefix app run check`
- `npm --prefix app test` (integrações em simulação, sem enviar mensagens reais)
- `npm --prefix desktop test`
- Verificação de testes de API: upload com skipOcr, fila sem campos, repetição e envio individual sem campos.

## Diagnóstico
- Caso não apareçam as caixas "Ler dados da imagem com OCR" e "Enviar legenda junto da imagem", o aplicativo ainda está na versão anterior.
- Confira a Release v0.7.7 no GitHub e abra novamente o aplicativo para acionar o atualizador.
- Antes de publicar em grupos reais, faça primeiro um teste em um grupo autorizado.
