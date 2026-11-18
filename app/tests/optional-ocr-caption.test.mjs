import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {validateSend} from '../src/core.mjs';
import {WhatsAppBridge} from '../src/wa.mjs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('imagem pode ser cadastrada sem OCR, rota, veículo e legenda',()=>{
 const image={id:randomUUID()}; const group={id:'test@g.us',name:'Teste'};
 const record=validateSend({imageId:image.id,groupIds:[group.id],requestId:randomUUID(),caption:''},[image],[group]);
 assert.equal(record.caption,'');
 assert.equal(record.origin,'');assert.equal(record.destination,'');assert.equal(record.vehicle,'');
});
test('imagem não permite ausência de grupo nem texto inválido',()=>{
 const image={id:randomUUID()},id=randomUUID(),group={id:'test@g.us'};
 assert.throws(()=>validateSend({imageId:image.id,requestId:id,groupIds:[],caption:''},[image],[group]),/grupo/);
 assert.throws(()=>validateSend({imageId:image.id,requestId:id,groupIds:[group.id],caption:123},[image],[group]),/Legenda/);
});
test('interface permite desativar OCR e enviar só imagem',()=>{
 assert.match(html,/id="useOcr"/);
 assert.match(html,/id="includeCaption"/);
 assert.match(js,/skipOcr:!\$\('useOcr'\)\.checked/);
 assert.match(js,/const caption=\$\('includeCaption'\)\.checked/);
});
test('Baileys omite caption ao enviar imagem sem texto',async()=>{
 let payload;
 const bridge=new WhatsAppBridge('real');
 bridge.status='conectado';bridge.lastGroups=[{id:'grupo@g.us'}];
 bridge.socket={sendMessage:async(_gid,content)=>{payload=content;return {key:{id:'msg-teste'}};}};
 await bridge.send('grupo@g.us',Buffer.from('fake-image'),'');
 assert.equal(Object.hasOwn(payload,'caption'),false);assert.ok(Buffer.isBuffer(payload.image));
 await bridge.send('grupo@g.us',Buffer.from('fake-image'),'Legenda');
 assert.equal(payload.caption,'Legenda');
});


test('regressão v0.7.7: envio sem rota nem legenda é o modo padrão',()=>{
 assert.match(html, /id="useOcr"(?![^>]*checked)/);
 assert.match(html, /id="includeCaption"(?![^>]*checked)/);
 assert.ok(!js.includes('Aguarde o OCR e confira origem, destino, veículo e legenda.'));
 assert.ok(!js.includes('Os dados da carga estão incompletos. Corrija antes de enviar.'));
 assert.match(js, /const caption=\$\('includeCaption'\)\.checked/);
});
