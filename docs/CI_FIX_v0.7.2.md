# ALATUS v0.7.2 | Correção da build Windows

- Corrigido arquivo PNG de teste que continha checksum inválido no IDAT.
- Teste HTTP de 12 publicações agora isola o módulo OCR: não baixa idiomas nem inicia Tesseract, pois testa a fila, não OCR. A opção só funciona em modo simulação e exige uma variável explícita de teste.
- O fluxo OCR normal do ALATUS não é alterado.
- Atualizados `actions/checkout` e `actions/setup-node` para v5 (Node 24).
- Versão incrementada para 0.7.2 porque a tag 0.7.1 já existe.

## Validação

```powershell
npm --prefix app run check
npm --prefix app test
npm --prefix desktop run check
npm --prefix desktop test
```

Após publicar a tag v0.7.2, GitHub Actions compila NSIS e publica GitHub Release somente após todas as verificações passarem.
