# ALATUS 0.8.8 | Limpar todo o histórico

No painel, seção **5. Histórico**:
- **Limpar histórico:** apaga somente tentativas concluídas; mantém as tentativas incertas e em revisão, como antes.
- **Apagar TODO o histórico:** solicita confirmação e a palavra `APAGAR`, e exclui também todas as tentativas sob revisão.

A API exige `POST /api/jobs/wipe` com `{"confirm":"APAGAR TODO O HISTORICO"}`, usa as proteções locais de origem e rejeita a limpeza durante publicações ativas. Uma consulta posterior a `/api/jobs` deve retornar a lista vazia, inclusive após reiniciar o servidor.

A limpeza total remove `data/jobs.json` (reescrito como lista vazia) e não apaga `data/outbox.json`, imagens, perfil, configuração do agendamento, sessão do WhatsApp nem os eventos técnicos locais. Os identificadores de tentativas são preservados em controle de duplicidade mesmo sem aparecer no histórico visual.

**Atenção:** a exclusão do histórico do painel é irreversível. O Git pode recuperar versões do CÓDIGO, mas não restaura históricos pessoais apagados da instalação.
