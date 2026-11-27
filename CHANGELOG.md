# Histórico de alterações | ALATUS Publicador de Fretes

## [0.8.8] - 2026-11-20

### Adicionado
- Identificação de grupos onde somente administradores podem publicar. Grupos comprovadamente restritos ficam indisponíveis para seleção e são ignorados na fila.
- Em rodadas automáticas, um grupo recusado não interrompe os outros destinatários autorizados; resultados incertos continuam isolados sem reenvio automático.
- **Apagar TODO o histórico**: limpa inclusive registros `revisar_manualmente` mediante confirmação dupla, sem apagar fila, perfil, imagens ou sessão WhatsApp.
- Registro dos IDs de tentativas antigas para manter proteção contra duplicidade mesmo após a limpeza total.
- Ferramenta `RECUPERAR_VERSAO.ps1` e `docs/ROLLBACK.md`: recuperação a partir de uma tag estável como um novo release, com versão superior e sem reescrever a história do Git.

### Mantido
- **Versão 0.8.8**: os novos recursos foram incorporados ao pacote ainda não publicado, sem criar v0.8.9.
- A limpeza antiga continua disponível, preservando os registros sob revisão.
- O changelog do projeto é mantido e incrementado a cada release.
- A limpeza total não apaga auditoria técnica em `logs/events.ndjson` nem o controle de tentativas anteriores; os dados continuam locais.

## [0.8.7] - 2026-11-20
- Legendas manuais livres, sem perfil, texto fixo ou telefone obrigatório.
- Reenvio seletivo de cargas concluídas sem bloquear por outras em revisão.
- Preparação de grupos comprovadamente não tentados após envio incerto.

## [0.8.6] - 2026-11-20
- Agendamento contínuo da fila e recuperação seletiva de falhas confirmadas.
- Preservação de tentativas incertas para evitar duplicidade.

---

## Histórico anterior (mantido do repositório)

## 0.7.1
- Updater via GitHub Releases na abertura, com confirmação e proteção da fila de envios.
- Pipeline de tag valida dependências, gerador NSIS e latest.yml antes de publicar.
- Teste HTTP executado sem concorrência entre arquivos para reduzir condição de corrida.

## [0.7.0] - 2026-11-17

### Adicionado
- Fila persistente com imagens, origem, destino, veículo, legenda e grupos exclusivos por carga.
- Importação múltipla de PNG/JPG/WEBP com OCR individual.
- Ações de adicionar/remover carga, iniciar lote, interromper os próximos envios e limpar finalizados.
- Registro de progresso por grupo, rejeição de tentativas repetidas e bloqueio em resultado incerto.
- Recuperação segura após reinício, sem retomada automática de envio.
- Documentação `docs/FILA_MULTICARGAS.md` e testes integrados com 12 cargas distintas.

### Mantido
- Conexão WhatsApp e envio sequencial sem pausa fixa, sem paralelismo.
- Interface desktop, perfil da empresa e histórico de envios.
- Correção CI-D03 com inclusão explícita de dependências do backend no instalador.

# Histórico de versões

## v0.6.1-desktop-preview (2026-11-17)

- Removida completamente a pausa programada entre grupos (`ALATUS_SEND_INTERVAL_MS` e `delayMs` excluídos).
- A fila aguarda apenas a conclusão de cada tentativa antes da próxima, sem paralelismo nem reenvio automático.
- Textos do painel e documentação atualizados; incluído teste de regressão sem pausa artificial.
- A v0.6.1 ainda requer compilação e validação no Windows antes da distribuição estável.

## v0.6.0-desktop-preview (2026-11-17)

- Interface própria usando Electron, sem abrir navegador externo; instalador Windows NSIS com atalho na Área de Trabalho.
- Ao fechar, encerra o socket e o servidor, preservando credenciais e perfil para reconectar ao reabrir.
- Na primeira abertura, opção explícita de usar os dados existentes no SSD `Z:\ALATUS`.
- Fila sequencial sem pausa fixa entre grupos, cache de metadata de grupos e imagem pré-carregada uma vez.
- Novo diagnóstico `D00-D08`, testes de encerramento, cache e segurança local.
- GitHub Actions compila instalador; compilação e uso em Windows ainda pendentes de validação real.

# Histórico

## 0.5.0-preview — 2026-11-17

- Introduz `ALATUS.exe` portátil para Windows x64, compilado em Go sem dependências Go externas.
- Bootstrap inicial gratuito de Node.js 26.13.1 com verificação SHA256 oficial e instalação de dependências npm.
- Introduz perfil individual por instalação, obrigatório em instalações novas, com migração de valores legados da ALATUS quando houver histórico existente.
- Retira rotas e contatos operacionais reais dos testes públicos; adiciona testes de configuração.
- Repositório Git local, documentação Markdown por etapa, licença MIT e workflow GitHub Actions para empacotamento.
- **Ainda não validado** em instalação limpa no Windows; mantém o núcleo de envio validado na v0.4.

## 0.4 — 2026-11-17

- Reconexão ao QR, seleção em massa de grupos, fila sequencial com histórico e interrupção.
- Operador informou que o fluxo real funcionou no Windows.

- Perfil obrigatório após migração quando ausente, sem telefone padrão embutido no código público.
