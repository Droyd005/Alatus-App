import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('controles de fila utilizados pelo JavaScript existem no painel',()=>{
 for(const id of ['file','recent','addToOutbox','startOutbox','cancelOutbox','clearOutbox','repeatOutbox','outboxItems','outboxStatus','outboxProgress']){
  assert.match(html,new RegExp(`id="${id}"`),`Campo ${id} está ausente na interface`);
  assert.ok(js.includes(`$('${id}')`) || js.includes(`'${id}'`),`Campo ${id} não está ligado ao código`);
 }
 assert.match(html,/id="file"[^>]*multiple/, 'O upload deve aceitar várias imagens');
});

test('a fila reutilizável exige confirmação e não agenda envio automático',()=>{
 assert.match(js,/repeatOutbox\(\)/);
 assert.match(js,/confirm\(`Reenviar/);
 assert.match(js,/repeat:true,confirm:'REPETIR FILA'/);
 assert.match(html,/Reenviar fila salva/);
});

test('OCR e legenda são automáticos, sem interruptores e com campo de peso',()=>{
 assert.match(html,/id="weight"/);
 assert.ok(!html.includes('id="useOcr"'));
 assert.ok(!html.includes('id="includeCaption"'));
 assert.ok(!js.includes("$('useOcr')"));
 assert.ok(!js.includes("$('includeCaption')"));
 assert.match(js,/void pollOcr\(id\)/);
 assert.match(js,/const complete=customCaption \? true : syncCaption\(true\)/);
});
