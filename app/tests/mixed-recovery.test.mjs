import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {enqueueItem,prepareRepeat,REPEATABLE_STATUSES} from '../src/outbox.mjs';
import {validateSend} from '../src/core.mjs';
const groups=[{id:'a@g.us',name:'Grupo A'}];
const image={id:randomUUID()};
const record=(caption)=>validateSend({imageId:image.id,caption,groupIds:['a@g.us'],requestId:randomUUID()},[image],groups);
test('legenda manual sem perfil, frases fixas ou contato cadastrado',()=>{
 const manual=record('📦 *Carga especial*\nValor sob consulta.');
 assert.equal(manual.caption,'📦 *Carga especial*\nValor sob consulta.');
 assert.equal(record('').caption,'');
 assert.throws(()=>record('x'.repeat(4097)),/4096/);
});
test('repeticao seleciona somente registros concluídos preservando incertos e pendentes',()=>{
 const items=[enqueueItem(record('A'),[],groups),enqueueItem(record('B'),[],groups),enqueueItem(record('C'),[],groups)];
 items[0].status='submetido';items[1].status='revisar_manualmente';items[1].results=[{status:'incerto',groupId:'a@g.us',error:'not-acceptable'}];
 items[2].status='pendente';
 const snapshots=items.slice(1).map(x=>JSON.stringify(x));
 const selected=items.filter(x=>REPEATABLE_STATUSES.has(x.status));
 assert.deepEqual(prepareRepeat(selected,groups),[items[0].id]);
 assert.equal(items[0].status,'pendente');
 assert.deepEqual(items.slice(1).map(x=>JSON.stringify(x)),snapshots);
});
