# ALATUS 0.8.7 | Legendas livres e recuperacao da fila

## Legenda manual

- Escreva qualquer legenda no campo de texto, com ou sem telefone, empresa e valores.
- O perfil fica necessario apenas para gerar o modelo automatico.
- A leitura OCR tardia nao substitui legenda editada manualmente, inclusive apos salvar o perfil.
- Permanecem limites tecnicos de comprimento e tamanho de imagem para evitar falha de API.

## Falha `incerto (not-acceptable)` / `revisar_manualmente`

- Esse texto indica uma tentativa rejeitada ou sem confirmacao suficiente. O retorno sozinho NAO comprova que a mensagem nao foi entregue.
- Consulte o grupo afetado no WhatsApp antes de decidir se uma mensagem deve ser publicada novamente.
- A carga em revisao permanece na fila e no historico sem reenvio automatico.
- Cargas ja concluidas passam a ficar disponiveis em **Reenviar fila salva**, mesmo com outras em revisao ou pendentes.
- Cargas ainda pendentes podem ser iniciadas separadamente pelo botao **Iniciar envio da fila**.
- Para uma carga interrompida, use **Preparar não tentados** para criar outra carga contendo somente os grupos com comprovacao de que nenhuma tentativa ocorreu; depois clique em **Iniciar envio da fila**. Nenhum grupo incerto e incluido. A preparacao nao reenvia por si so.
- Novas publicacoes independentes deixam de herdar um bloqueio global de tentativa anterior. Em caso de timeout, verifique antes de republicar conteudo semelhante.
- A programacao pode ser ativada com itens mistos, desde que exista ao menos uma carga apta; itens incertos permanecem excluidos.
- O aplicativo continua exigindo selecao de grupos autorizados, confirmacao de repeticao e identificacao independente de tentativas.

## Diagnostico

Se continuar aparecendo `not-acceptable`, verifique no WhatsApp se o grupo permite publicacoes e se a conta esta conectada. O erro pode ter origem no servidor do WhatsApp ou na biblioteca Baileys; sem logs da tentativa nao da para atribuir a causa exata. Nao tente contornar restricoes da plataforma ou duplicar mensagens de status incerto. Registre hora, modo de envio, status do grupo e codigo de erro, sem compartilhar dados de sessao ou IDs privados.

## Verificacao

`npm --prefix app run check`, `npm --prefix app test`, `npm --prefix desktop run check`, `npm --prefix desktop test`. A compilacao Windows e envios reais ainda devem ser validados no instalador.
