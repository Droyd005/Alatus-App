import test from 'node:test';
import assert from 'node:assert/strict';
import {processPublicationQueue} from '../src/queue.mjs';
const ids=Array.from({length:12},(_,i)=>`group-${i}@g.us`);
function batch(){return {job:{mode:'real',results:[]},record:{groupIds:ids,caption:'Frete',imagePath:'sample.png'},groupNames:new Map(ids.map(id=>[id,id]))};}
test('12 grupos: nenhum recebe mais de uma mensagem; concorrencia maxima 3',async()=>{
 let active=0,peak=0;const attempts=new Map();
 const bridge={prepareImage:async()=> 'image-url',send:async id=>{
  active++;peak=Math.max(peak,active);attempts.set(id,(attempts.get(id)||0)+1);
  await new Promise(r=>setTimeout(r,10));active--;
  return {messageId:`ack-${id}`,simulated:false};
 }};
 const a=batch();const out=await processPublicationQueue({...a,bridge});
 assert.equal(out.uncertain,false);assert.equal(a.job.progress.done,12);
 assert.deepEqual(a.job.results.map(x=>x.groupId),ids);
 assert.equal(attempts.size,12);assert.ok([...attempts.values()].every(x=>x===1));
 assert.ok(peak===3,'Limite de 3 envios deve ser respeitado e utilizado');
 assert.deepEqual(a.job.unsentGroupIds,[]);
});
test('8 imagens x 12 grupos: 96 tentativas unicas e 8 preparacoes de midia',async()=>{
 const delivered=new Set();let preparations=0;
 const bridge={prepareImage:async x=>{preparations++;return x;},send:async(id,media)=>{
  const key=media+'|'+id;assert.ok(!delivered.has(key),'Mensagem duplicada para o mesmo grupo');delivered.add(key);
  return {messageId:key};
 }};
 for(let i=0;i<8;i++){
  const a=batch();a.record.imagePath='arte-'+i+'.png';
  const r=await processPublicationQueue({...a,bridge});assert.equal(r.uncertain,false);assert.equal(a.job.results.length,12);
 }
 assert.equal(preparations,8);assert.equal(delivered.size,96);
});
test('falha em um destino interrompe novas mensagens; grupos restantes aparecem como nao iniciados',async()=>{
 const a=batch();const sent=[];
 const bridge={send:async id=>{sent.push(id);if(id===ids[2])throw new Error('falha de rede');await new Promise(r=>setTimeout(r,2));return {messageId:id};}};
 const r=await processPublicationQueue({...a,bridge});
 assert.equal(r.uncertain,true);assert.equal(a.job.status,'revisar_manualmente');
 assert.equal(new Set(sent).size,sent.length);assert.equal(new Set(a.job.results.map(x=>x.groupId)).size,a.job.results.length);
 assert.equal(a.job.unsentGroupIds.length,12-sent.length);
 assert.ok(a.job.results.some(x=>x.status==='incerto'));
});
test('limite de tempo bloqueia retrys mesmo quando a tentativa original termina tarde',async()=>{
 const a=batch();let count=0;
 const bridge={send:async()=>{count++;await new Promise(r=>setTimeout(r,100));return {messageId:'retorno-tardio'};}};
 const r=await processPublicationQueue({...a,bridge,timeoutMs:12});
 assert.equal(r.timedOut,true);assert.equal(r.uncertain,true);assert.equal(count,1);
 assert.equal(a.job.unsentGroupIds.length,11);
 await new Promise(r=>setTimeout(r,120));assert.equal(count,1);
});
