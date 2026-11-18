import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {enqueueItem,prepareRepeat} from '../src/outbox.mjs';
import {processPublicationQueue} from '../src/queue.mjs';

test('8 imagens x 12 grupos por rodada, com duas rodadas distintas e sem destinatários trocados',async()=>{
 const groups=Array.from({length:12},(_,i)=>({id:`grupo-${i}@g.us`,name:`Grupo ${i}`}));
 const templates=[];
 for(let i=0;i<8;i++){
  const record={requestId:randomUUID(),image:{id:`imagem-${i}`},origin:`Coleta ${i}`,destination:`Entrega ${i}`,vehicle:'Carreta refrigerada',caption:`Legenda ${i}`,groupIds:groups.map(x=>x.id)};
  enqueueItem(record,templates,groups);
 }
 const sent=[];
 const bridge={prepareImage:async p=>p,send:async(gid,path,caption)=>{sent.push({gid,path,caption});return {simulated:true,messageId:`msg-${sent.length}`};}};
 const groupNames=new Map(groups.map(g=>[g.id,g.name]));
 async function run(){
  for(const item of templates){
   const job={mode:'simulacao',progress:{done:0,total:item.groupIds.length},results:[]};
   const outcome=await processPublicationQueue({job,record:{...item,imagePath:item.imageId},bridge,groupNames});
   assert.equal(outcome.uncertain,false);assert.equal(job.status,'simulado');assert.equal(job.results.length,12);
   item.status=job.status;item.sendCount++;item.finishedAt=job.finishedAt;
  }
 }
 await run();assert.equal(sent.length,96);
 prepareRepeat(templates,groups);await run();assert.equal(sent.length,192);
 for(let batch=0;batch<2;batch++)for(let i=0;i<8;i++){
  const slice=sent.slice(batch*96+i*12,batch*96+(i+1)*12);
  assert.deepEqual(slice.map(x=>x.gid),groups.map(g=>g.id));
  assert.ok(slice.every(x=>x.caption===`Legenda ${i}`&&x.path===`imagem-${i}`));
 }
});
