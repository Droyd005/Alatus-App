# ALATUS v0.8.8 | Grupos somente administradores e envio automatico

## Diagnostico
- `not-acceptable` nao prova que houve bloqueio por frequencia. Pode ocorrer em grupos restritos ou em falhas de sessoes criptograficas na biblioteca Baileys.
- `announce=true` e a identidade conectada identificada como participante nao administrador permitem uma verificacao PREVIA e objetiva de que a conta nao pode publicar.
- Se a identidade usa LID e nao pode ser correspondida com seguranca, a permissao e marcada como **desconhecida**, nunca como bloqueada por suposicao.
- Uma tentativa que retornou `not-acceptable` e tratada como INCERTA: o grupo e isolado, sem reenvio automatico. Outros grupos seguem no agendamento.

## Comportamento
1. A lista de grupos sinaliza `sem_permissao` e desabilita a selecao de grupos comprovadamente restritos.
2. Grupos que foram escolhidos antes da mudanca e agora sao restritos sao registrados como `sem_permissao`, sem chamar `sendMessage` para eles.
3. O modo automatico envia de forma sequencial, consulta grupos no inicio da rodada e isola apenas os que falham; isso evita que uma falha bloqueie outros grupos.
4. Grupos isolados nao voltam a receber mensagens sem nova selecao ou verificacao pelo operador. Historico e dados sao preservados.
5. As protecoes contra mensagens duplicadas, agendamentos sem autorizacao e contorno das regras de grupos permanecem ativas.

## Diagnostico real
- Conferir os logs locais `logs/events.ndjson` para `grupo_sem_permissao`, `grupo_isolado_por_recusa`, `whatsapp_falha_envio` e `lote_finalizado`.
- Antes de compartilhar logs, remover IDs dos grupos, telefones, chaves e dados privados.
- Nenhum teste offline comprova entrega de mensagens reais. Validar a atualizacao com grupo de teste autorizado em Windows.

## Referencias
- WhatsApp: https://faq.whatsapp.com/526742385997912/
- Baileys issue 1337: https://github.com/WhiskeySockets/Baileys/issues/1337
- Baileys issue 2521: https://github.com/WhiskeySockets/Baileys/issues/2521
