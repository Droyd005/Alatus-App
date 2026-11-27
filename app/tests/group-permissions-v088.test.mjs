import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const home=mkdtempSync(path.join(os.tmpdir(),'alatus-permission-'));
process.env.ALATUS_HOME=home;
const {setupDirs}=await import('../src/core.mjs');
setupDirs();
const {groupPostingPermission,WhatsAppBridge}=await import('../src/wa.mjs');
const {processPublicationQueue}=await import('../src/queue.mjs');
test.after(()=>rmSync(home,{recursive:true,force:true}));
const self=['5511999999999:4@s.whatsapp.net'];
const group=(admin,announce=true)=>({announce,participants:[{id:'5511999999999@s.whatsapp.net',admin}]});

test('restrito e participante comum: sem permissao; admin pode publicar',()=>{
 assert.equal(groupPostingPermission(group(null),self).status,'sem_permissao');
 assert.equal(groupPostingPermission(group('admin'),self).status,'permitido');
 assert.equal(groupPostingPermission(group('superadmin'),self).status,'permitido');
 assert.equal(groupPostingPermission(group(null,false),self).status,'permitido');
});
test('identidade LID ambigua nao causa falso bloqueio de grupo',()=>{
 assert.equal(groupPostingPermission({announce:true,participants:[{id:'1234567890@lid',admin:null}]},self).status,'desconhecido');
 assert.equal(groupPostingPermission({announce:true,participants:[{id:'1234567890@lid',admin:null}]},['1234567890@lid']).status,'sem_permissao');
});
test('grupo restrito e rejeitado antes do sendMessage; outro grupo funciona',async()=>{
 const b=new WhatsAppBridge('real');b.status='conectado';
 let sent=[];b.socket={user:{id:self[0]},sendMessage:async(id)=>{sent.push(id);return {key:{id:'msg-'+id}};}};
 b.lastGroups=[{id:'bloqueado@g.us'},{id:'livre@g.us'}];
 b.groupMetadata.set('bloqueado@g.us',{metadata:group(null),time:Date.now()});
 b.groupMetadata.set('livre@g.us',{metadata:group(null,false),time:Date.now()});
 await assert.rejects(b.send('bloqueado@g.us',Buffer.from('img'),'Texto'),e=>e.notSubmitted===true&&e.skipGroup===true);
 const ok=await b.send('livre@g.us',Buffer.from('img'),'Texto');
 assert.equal(ok.messageId,'msg-livre@g.us');assert.deepEqual(sent,['livre@g.us']);
});
test('fila automatica com bloqueado no meio continua sem repetir grupo proibido',async()=>{
 const ids=Array.from({length:60},(_,i)=>`g-${i}@g.us`);
 let called=[];
 const bridge={send:async id=>{
  if(id==='g-7@g.us'||id==='g-23@g.us')throw Object.assign(new Error('Somente administradores'),{notSubmitted:true,skipGroup:true});
  called.push(id);return {messageId:'ok-'+id};
 }};
 const job={mode:'real',results:[],status:'em_andamento'};
 const record={imagePath:'test.png',groupIds:ids,caption:'TESTE'};
 const result=await processPublicationQueue({job,record,bridge,groupNames:new Map(ids.map(id=>[id,id])),concurrency:1,continueOnKnownGroupRejection:true});
 assert.equal(job.results.length,60);assert.equal(called.length,58);
 assert.deepEqual(result.blockedGroupIds,['g-7@g.us','g-23@g.us']);
 assert.equal(result.canContinue,true);assert.equal(result.uncertain,false);
 assert.equal(new Set(called).size,58);
 assert.equal(job.results.filter(x=>x.status==='sem_permissao').length,2);
});
test('not-acceptable isolado e restante do envio automatico continua sem duplicar',async()=>{
 const ids=Array.from({length:120},(_,i)=>`grupo-${i}@g.us`);let sent=[];
 const bridge={send:async id=>{
  if(id==='grupo-15@g.us')throw new Error('not-acceptable');
  sent.push(id);return {messageId:id};
 }};
 const job={mode:'real',results:[]};
 const result=await processPublicationQueue({job,record:{imagePath:'x.png',groupIds:ids,caption:''},bridge,groupNames:new Map(),concurrency:1,continueOnKnownGroupRejection:true});
 assert.equal(result.uncertain,true);assert.equal(result.canContinue,true);
 assert.deepEqual(result.isolatedGroupIds,['grupo-15@g.us']);
 assert.equal(job.results.length,120);assert.equal(sent.length,119);
 assert.equal(new Set(sent).size,119);
 assert.equal(job.results.find(x=>x.groupId==='grupo-15@g.us').status,'incerto');
});
test('falha incerta generica ou timeout continua bloqueando para evitar duplicacao',async()=>{
 for(const message of ['Erro de rede', 'not-acceptable']){
  let n=0;
  const bridge={send:async()=>{n++;throw new Error(message)}};
  const job={mode:'real',results:[]};
  const outcome=await processPublicationQueue({job,record:{imagePath:'a',groupIds:['a@g.us','b@g.us'],caption:''},bridge,groupNames:new Map(),concurrency:1,continueOnKnownGroupRejection:message!=='not-acceptable'});
  assert.equal(outcome.canContinue,false);assert.equal(n,1);
 }
});
test('listagem real marca grupos restritos e conserva grupos de administradores',async()=>{
 const b=new WhatsAppBridge('real');b.status='conectado';
 b.socket={user:{id:self[0]},groupFetchAllParticipating:async()=>({
  'restringido@g.us':{subject:'Somente admin',...group(null)},
  'aberto@g.us':{subject:'Todos',...group(null,false)},
  'admin@g.us':{subject:'Sou admin',...group('admin')},
  'sem-match@g.us':{subject:'LID desconhecido',announce:true,participants:[{id:'888777@lid',admin:null}]}
 })};
 const groups=await b.groups();
 assert.equal(groups.find(x=>x.id==='restringido@g.us').permission,'sem_permissao');
 assert.equal(groups.find(x=>x.id==='aberto@g.us').permission,'permitido');
 assert.equal(groups.find(x=>x.id==='admin@g.us').permission,'permitido');
 assert.equal(groups.find(x=>x.id==='sem-match@g.us').permission,'desconhecido');
});
test('stress: 20 rodadas de 250 grupos cada, bloqueados nao interrompem a fila',async()=>{
 const ids=Array.from({length:250},(_,i)=>`g-${i}@g.us`);
 let total=0;
 for(let round=0;round<20;round++){
  const blocked=new Set([ids[0],ids[17],ids[126],ids[249]]);
  const rejected=ids[70];
  const job={mode:'real',results:[]};let sent=0;
  const bridge={send:async id=>{
   if(blocked.has(id))throw Object.assign(new Error('Grupo somente admin'),{notSubmitted:true,skipGroup:true});
   if(id===rejected)throw new Error('not-acceptable');
   sent++;return {messageId:`${round}-${id}`};
  }};
  const outcome=await processPublicationQueue({job,record:{groupIds:ids,imagePath:'fake',caption:'teste'},bridge,
   groupNames:new Map(),concurrency:1,continueOnKnownGroupRejection:true});
  assert.equal(sent,245);
  assert.equal(outcome.blockedGroupIds.length,4);
  assert.deepEqual(outcome.isolatedGroupIds,[rejected]);
  assert.equal(outcome.canContinue,true);
  assert.equal(job.progress.done,250);
  total+=job.results.length;
 }
 assert.equal(total,5000);
});
