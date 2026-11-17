# E04 | Segurança e privacidade

## Nunca publicar

- `data/` (perfil, identificadores de trabalhos, credenciais e sessão)
- `images/` (imagens e histórico de cargas)
- `logs/` e `backups/`
- `runtime/` (cache, downloads, dados auxiliares)
- `Template.jpeg` (marca ALATUS, não integrante da licença de código)
- Arquivos `.env`, chaves, QR Codes, IDs privados de grupos

`git status --ignored` ajuda a auditar o que será excluído. O pacote público não inclui esses diretórios. Não envie ZIP de backup ou pasta do seu WhatsApp para seus parceiros.

## Acesso local

O servidor escuta **somente `127.0.0.1`**, exige origem e cabeçalho no POST e não possui senha adicional. Isso não significa isolamento entre usuários do mesmo PC. Se outras pessoas usarem o Windows, proteja a instalação, crie conta do Windows própria e separe o diretório de dados. O aplicativo não deve expor a porta 3187 à rede ou internet.

## Envio e conformidade

A integração com Baileys não é autorizada oficialmente pelo WhatsApp. Não use o aplicativo para spam ou mensagens em massa não solicitadas. Confirme autorização dos administradores dos grupos, revise a legislação aplicável e faça testes com números dedicados. A seleção de todos não garante que todos os grupos aceitem anúncios.
