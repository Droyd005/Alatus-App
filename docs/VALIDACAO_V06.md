# V06 | Relatório de testes e estado de entrega

**Data da revisão:** 17/11/2026

## Confirmado no ambiente de desenvolvimento (Linux, Node 22)

- **28/28 testes automatizados do backend** aprovados: integração HTTP em simulação, OCR textual, validação de perfil, seleção de 25+ grupos, fila sequencial, prevenção de repetição, 515 e reconexão, encerramento sem apagar credenciais, cache de grupos e preparação única da imagem.
- **2/2 testes da camada de desktop** aprovados: navegação restrita ao localhost e persistência do caminho de dados.
- Verificações de sintaxe Node (`node --check`) de backend e desktop aprovadas.
- Novo endpoint privado de shutdown verifica token; sessão e arquivos não são removidos.

## Aguardando a compilação e os testes no Windows

- [ ] `npm --prefix desktop run dist:win` cria instalador NSIS válido.
- [ ] Atalho Área de Trabalho é criado por instalador para usuário atual.
- [ ] Janela Electron abre sem navegador externo.
- [ ] Ao abrir v0.6 pela primeira vez, dados anteriores em `Z:\\ALATUS` são reconhecidos após escolha explícita.
- [ ] WhatsApp conecta com sessão antiga válida.
- [ ] Fechar janela encerra backend, libera porta e deixa credenciais intactas.
- [ ] Reabrir janela reconecta WhatsApp automaticamente.
- [ ] Uma imagem com legenda chega em um grupo de teste autorizado, sem duplicação.
- [ ] Após teste real em 3 a 5 grupos autorizados, verificar que a fila preserva a ordem, sem pausa fixa entre grupos.

**Não confundir:** teste automatizado sem WhatsApp real não demonstra entrega nem compatibilidade completa do instalador. A v0.4 continua sendo a versão de referência validada pelo usuário.

## Alterações de desempenho

- Intervalo fixo removido: o próximo grupo é processado imediatamente após a conclusão da tentativa anterior.
- Uma única leitura do arquivo PNG/JPEG/WEBP por publicação, com Buffer em memória.
- Cache de grupo `cachedGroupMetadata` por até 10 minutos, alimentado por `groupFetchAllParticipating()`.
- Sem paralelismo, sem reenviar tentativas incertas e sem estratégias para contornar limites do WhatsApp.

Documentação de erros: [ERROS_DESKTOP.md](ERROS_DESKTOP.md).
