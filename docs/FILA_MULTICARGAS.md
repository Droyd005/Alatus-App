# ALATUS v0.7.0 - FILA DE MÚLTIPLAS PUBLICAÇÕES

## Objetivo
Enviar várias artes diferentes, com origem, destino, veículo, legenda e grupos exclusivos por publicação. O aplicativo não envia nada ao importar ou enfileirar uma imagem. Um clique em **Iniciar envio da fila** é obrigatório.

## Etapa F01: adicionar imagens
1. Abra o ALATUS Desktop e conecte o WhatsApp, ou use o modo de simulação.
2. Na área **Imagem pronta do ChatGPT**, selecione 1 ou várias imagens (PNG/JPEG/WEBP, cada arquivo até 8 MB).
3. Os arquivos são importados sequencialmente, com OCR processado em segundo plano. Escolha uma imagem em **Imagens já importadas**.
4. Aguarde o OCR da imagem escolhida. Corrija cidades ou veículo se necessário e confira a legenda.

## Etapa F02: selecionar grupos e preparar uma carga
1. Em **WhatsApp e grupos**, clique em **Atualizar grupos** se necessário.
2. Selecione somente os grupos autorizados para **essa** carga, independentemente dos grupos das cargas seguintes.
3. Clique em **+ Adicionar esta carga à fila**. Esse botão salva uma cópia da imagem escolhida, legenda e grupos, mas **não envia mensagens**.
4. Selecione outra imagem, ajuste os dados, escolha outros grupos e repita.
5. O quadro da fila mostra cada carga, quantidade de grupos, estado e progresso. Clique **Remover** para excluir uma carga errada antes de começar.

## Etapa F03: disparar a fila
1. Verifique se os registros pendentes estão corretos.
2. Clique em **Iniciar envio da fila** uma única vez.
3. O ALATUS envia uma carga por vez. Dentro de cada carga, envia um grupo por vez. Não há paralelismo nem reenvio automático.
4. Acompanhe o resultado por publicação e por grupo. Os estados **submetido** e **simulado** não comprovam entrega ou leitura.
5. Clique em **Interromper fila** para não iniciar os próximos envios; o envio em curso pode terminar.

## Etapa F04: reinício e recuperação
- O arquivo local `data/outbox.json` preserva itens pendentes e os resultados existentes.
- Se a aplicação encerrar durante o envio, a carga em andamento passa a `revisar_manualmente` na próxima inicialização e não é enviada outra vez automaticamente.
- Itens ainda `pendente` continuam pendentes, sem retomada automática.
- Verifique diretamente no WhatsApp qualquer mensagem marcada como `incerto` antes de nova tentativa.
- **Limpar finalizados** remove somente itens finalizados normalmente, preservando pendentes e itens de revisão manual.
- Faça backup da pasta `data` da sua instalação antes de atualizar. Não a envie ao GitHub.

## Diagnósticos
| Código | Situação | Ação sugerida |
|---|---|---|
| F01 | Imagem inválida ou acima de 8 MB | Salve a arte como PNG/JPG/WEBP com tamanho menor |
| F02 | OCR incompleto | Corrija origem, destino e veículo antes de enfileirar |
| F03 | Perfil da empresa não preenchido | Configure empresa e telefone |
| F04 | Grupo não encontrado | Atualize os grupos e recrie o item pendente |
| F05 | Tentativa duplicada | Confira a fila, não repita automaticamente |
| F06 | Envio com resultado incerto | Pare, verifique o grupo no WhatsApp e anote o ocorrido |
| F07 | Aplicativo fechado durante envio | Faça conferência manual e não reenvie o item interrompido |
| F08 | Grupos/WhatsApp desconectados | Reconecte antes de iniciar o próximo lote |

## Critérios de aceitação
- [ ] Importar 12 imagens em lote não inicia nenhum envio.
- [ ] O OCR preenche a legenda da imagem selecionada.
- [ ] Cada item da fila guarda imagem, dados e grupos próprios.
- [ ] O lote de 12 imagens é processado em sequência no modo de simulação.
- [ ] Cancelamento não reenvia as mensagens iniciadas.
- [ ] Uma falha interrompe a execução sem repetir envios.
- [ ] Fechar e abrir preserva dados, mas não recomeça um envio automaticamente.
- [ ] Testar primeiro em **um grupo real autorizado** antes de usar múltiplos grupos.

O WhatsApp não garante envio em massa seguro por conectores não oficiais. Não utilize para mensagens não solicitadas ou grupos sem permissão de publicação.
