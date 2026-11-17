# E03 | Plano de validação antes de distribuir

## Testes automatizados

No diretório `app`:

```powershell
& '..\runtime\node\node.exe' --test tests\*.test.mjs
& '..\runtime\node\node.exe' --check server.mjs
```

Os testes abrangem validações de legenda, perfil, OCR de amostras sintéticas, conexão simulada, fila individual, cancelamento e servidor HTTP. **Não** testam um login real do WhatsApp.

## Aceitação Windows (manual)

- [ ] A01: extrair em diretório diferente de `Z:` e abrir `ALATUS.exe` sem PATH global.
- [ ] A02: primeira execução instala Node com hash verificado e dependências, com logs legíveis.
- [ ] A03: segunda execução abre navegador sem duplicar servidor.
- [ ] A04: configurar empresa e telefone próprios; número ALATUS não pode aparecer em perfil novo.
- [ ] A05: upload de arte gera legenda OCR; campos incompletos não são inventados.
- [ ] A06: selecionar todos, limpar e selecionar um só grupo sem enviar mensagens.
- [ ] A07: simulação executa e aparece no histórico.
- [ ] A08: modo REAL conecta WhatsApp por QR.
- [ ] A09: imagem e legenda recebidas em **um único** grupo de teste consentido.
- [ ] A10: reiniciar launcher preserva sessão e histórico.
- [ ] A11: publicar em múltiplos grupos autorizados, conferindo cada resultado e interrompendo na primeira falha.
- [ ] A12: alternar as duas contas Windows **sem logout** e verificar alcance do painel; logout não é garantido até instalar serviço próprio.
- [ ] A13: baixar ZIP de distribuição em PC limpo e repetir A01-A10 antes de anunciar release estável.

Status atual: envio v0.4 validado pelo operador; v0.6 desktop testada em ambiente automatizado, mas ainda não compilada nem validada em Windows.

## D00-D08 | Testes da interface desktop v0.6

Consulte [ERROS_DESKTOP.md](ERROS_DESKTOP.md) para o checklist de aceitação Windows. O código tem testes automatizados para shutdown privado e sessão persistida, mas o instalador e o envio real após reconexão precisam ser validados na máquina do operador.
