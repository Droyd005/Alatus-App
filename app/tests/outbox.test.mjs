import test from 'node:test';
import assert from 'node:assert/strict';
import {enqueueItem, recoverOutbox, batchSnapshot, clearCompleted} from '../src/outbox.mjs';
import {randomUUID} from 'node:crypto';
const groups=[{id:'a@g.us',name:'Grupo A'},{id:'b@g.us',name:'Grupo B'}];
const makeRecord=(i,ids=['a@g.us'])=>({requestId:randomUUID(),image:{id:`arte-${i}`},origin:`Origem ${i}`,destination:`Destino ${i}`,vehicle:'Carreta refrigerada',caption:'Valores a negociar',groupIds:ids});
test('12 imagens distintas mantêm legendas, rotas e destinatários independentes',()=>{
 const items=[];
 for(let i=0;i<12;i++)enqueueItem(makeRecord(i,i%2?['b@g.us']:['a@g.us','b@g.us']),items,groups);
 assert.equal(items.length,12);
 for(let i=0;i<12;i++){
  assert.equal(items[i].origin,`Origem ${i}`);assert.equal(items[i].imageId,`arte-${i}`);
  assert.deepEqual(items[i].groupIds,i%2?['b@g.us']:['a@g.us','b@g.us']);
 }
 assert.deepEqual(batchSnapshot(items),items.map(x=>x.id));
});
test('mesma tentativa não é enfileirada duas vezes',()=>{
 const items=[];const record=makeRecord(1);
 enqueueItem(record,items,groups);
 assert.throws(()=>enqueueItem(record,items,groups),{status:409});
});
test('reinicialização não retoma envio anterior automaticamente',()=>{
 const items=[];enqueueItem(makeRecord(1),items,groups);enqueueItem(makeRecord(2),items,groups);
 items[0].status='em_andamento';assert.equal(recoverOutbox(items),true);
 assert.equal(items[0].status,'revisar_manualmente');
 assert.deepEqual(batchSnapshot(items),[items[1].id]);
});
test('limpar finalizados mantém pendentes e resultados incertos',()=>{
 const items=[];for(let i=0;i<5;i++)enqueueItem(makeRecord(i),items,groups);
 items[0].status='submetido';items[1].status='simulado';items[2].status='revisar_manualmente';
 assert.equal(clearCompleted(items),2);assert.equal(items.length,3);
 assert.deepEqual(items.map(x=>x.status),['revisar_manualmente','pendente','pendente']);
});
