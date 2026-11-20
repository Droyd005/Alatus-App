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

test('interface utiliza OCR automático com peso opcional e sem interruptores',()=>{
 assert.doesNotMatch(html,/id="useOcr"/);
 assert.doesNotMatch(html,/id="includeCaption"/);
 assert.match(html,/id="weight"/);
 assert.doesNotMatch(js,/\$\('useOcr'\)/);
 assert.doesNotMatch(js,/\$\('includeCaption'\)/);
 assert.match(js,/void pollOcr\(id\)/);
 assert.match(js,/const complete=customCaption \? true : syncCaption\(true\)/);
 assert.match(js,/\$\('weight'\)\.value=d\.weight\|\|''/);
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

test('OCR incompleto não bloqueia o envio sem legenda',()=>{
 assert.match(js,/\$\('caption'\)\.value=''/);
 assert.match(js,/!origin\|\|!destination\|\|!vehicle/);
 assert.match(js,/caption:\$\('caption'\)\.value\.trim\(\)/);
 assert.ok(!js.includes('Aguarde o OCR e confira origem, destino, veículo e legenda.'));
 assert.ok(!js.includes('Os dados da carga estão incompletos. Corrija antes de enviar.'));
});
