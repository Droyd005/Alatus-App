# ALATUS 0.8.2 | Fila rapida e agendamento

- Limite de 3 envios concorrentes por imagem; primeiro grupo aquecendo cache de mídia.
- Cada grupo tem resultado independente, identificador e duração.
- Falha/timeout suspende novas tentativas; não há retry automático de resultados incertos.
- Agendamento explícito, inicialmente desligado, configurável de 20 a 1440 minutos.
- Agendamento só funciona com aplicativo aberto e grupos já escolhidos na fila.
- Reinícios não executam rodadas perdidas. Na primeira abertura, o próximo horário é o momento da abertura + intervalo.
- Fila salva, imagens, sessão, OCR e peso não são alterados.
- O operador deve usar somente grupos que autorizaram o envio e respeitar políticas da plataforma.

## Verificações

- `npm --prefix app run check`
- `npm --prefix app test`
- `npm --prefix desktop run check`
- `npm --prefix desktop test`

## Cenários cobertos

- 8 imagens x 12 grupos com 96 IDs únicos; sem duplicações no simulador.
- Limite de 3 envios ativos; aquecimento de cache antes do paralelismo.
- Falha de destino e timeout com restantes não enviados identificados.
- Scheduler desligado por padrão; validação de intervalo; persistência; sem catch-up após reinício.
- Controle de origem e confirmação na API.

Observação: confirmação de submissão pelo Baileys não equivale à confirmação de entrega/leitura pelo WhatsApp. O desempenho real depende da rede/serviço e deverá ser medido na instalação.
