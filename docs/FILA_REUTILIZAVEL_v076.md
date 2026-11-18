# ALATUS v0.7.6 | Fila reutilizável

## Objetivo

Salvar uma vez as artes com origem, destino, legenda e grupos, permitindo novas rodadas de envio durante o dia sem reimportar as imagens, recriar legendas ou selecionar grupos.

## Comportamento

- **Iniciar envio da fila** envia somente itens `pendente`.
- **Reenviar fila salva** aparece quando **todos** os itens estão concluídos (`simulado` ou `submetido`). O operador recebe confirmação com o número de artes e o total de destinatários da nova rodada.
- Cada rodada registra novos `requestId`s e novos jobs; preserva as artes, legendas, grupo e histórico anterior.
- O estado das cargas fica em `data/outbox.json`, preservado pela instalação/update. Ao reabrir o aplicativo, **nunca há envio automático**.
- O aplicativo verifica se os grupos da fila ainda existem na conta conectada antes de permitir repetição. Cargas pendentes, canceladas ou incertas bloqueiam repetição integral até revisão/removal manual.
- O botão anterior **Limpar finalizados** foi renomeado para **Excluir itens finalizados** e exige confirmação explícita. Não é necessário para reenviar a fila.
- O OCR, a sessão de WhatsApp, a lógica de envio sequencial, o tema azul/dourado e o atualizador não foram alterados.

## API (localhost, mesma origem)

`POST /api/outbox/start` com `{}`: envia apenas itens pendentes, como antes.

`POST /api/outbox/start` com `{"repeat":true,"confirm":"REPETIR FILA"}`: prepara e inicia uma nova rodada de todos os itens já concluídos, verificando grupos, imagens e status antes de atualizar os itens. O backend impede pedidos simultâneos.

## Migração

Itens antigos de versões anteriores já finalizados são mantidos e podem ser repetidos. `sendCount` ausente é tratado como uma rodada anterior. Não há alteração nos arquivos de sessão, histórico ou imagens existentes.

## Testes

- 8 imagens x 12 grupos x 2 rodadas simuladas, garantindo que imagem, legenda e destinatário nunca troquem de carga.
- API de 8 imagens com 3 envios explícitos, incluindo reinício real do processo entre rodadas e persistência dos dados.
- Bloqueio de reenvio implícito, confirmação inválida, clique duplo, grupos antigos e mensagens com resultado incerto.
- Testes do ALATUS backend: 48 aprovados em Node 22 (Linux); desktop: 8 aprovados em Node 22. O instalador Windows ainda depende de compilação no GitHub Actions.

## Diagnóstico

- HTTP 422 ao repetir: todos os itens precisam estar concluídos. Revise/remova itens pendentes, interrompidos ou incertos antes de repetir.
- HTTP 409 ao repetir: já existe lote ativo, grupo salvo não existe na conta atual ou houve concorrência.
- Nenhum botão habilitado: verifique a conexão do WhatsApp, estado da fila e histórico. A repetição exige ação humana explícita.
