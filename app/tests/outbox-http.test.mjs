import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const home=mkdtempSync(path.join(os.tmpdir(),'alatus-outbox-'));
const port=36000+Math.floor(Math.random()*2000);
let service,stderr='',stdout='';
const base=()=>`http://127.0.0.1:${port}`;
const post=(url,payload)=>fetch(base()+url,{method:'POST',headers:{Origin:base(),'X-Alatus-Request':'1','Content-Type':'application/json'},body:JSON.stringify(payload)});
const get=async url=>{const response=await fetch(base()+url);return await response.json();};
test.before(async()=>{
 service=spawn(process.execPath,[path.resolve('server.mjs')],{cwd:path.resolve('.'),env:{...process.env,ALATUS_HOME:home,ALATUS_PORT:String(port),ALATUS_MODE:'simulacao',ALATUS_TEST_SKIP_OCR:'1'},stdio:['ignore','pipe','pipe']});
 service.stderr.on('data',chunk=>{stderr+=chunk.toString();});
 service.stdout.on('data',chunk=>{stdout+=chunk.toString();});
 const until=Date.now()+8000;
 while(Date.now()<until){if(service.exitCode!==null)throw new Error('Servidor encerrou: '+stderr);try{const r=await fetch(base()+'/api/health');if(r.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,80));}
 throw new Error('Servidor não iniciou: '+stderr);
});
test.after(()=>{service?.kill();rmSync(home,{recursive:true,force:true});});
test('API permite preparar e publicar 12 artes independentes, em grupos diferentes, sem duplicar',async()=>{
 let r=await post('/api/profile',{company:'EMPRESA DE TESTE',phone:'(11) 91234-5678'});assert.equal(r.status,200);
 const {groups}=await get('/api/groups');assert.ok(groups.length>=2);
 // PNG RGBA 64x64 válido. OCR é isolado neste teste de fila (coberto separadamente).
 const png=Buffer.from('89504e470d0a1a0a0000000d4948445200000040000000400806000000aa6971de0000009649444154789cedd04111c03000c3b075fc39a730f4a885c0e7b36ddfc37e1da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a0374807601553a047c1bcf264d0000000049454e44ae426082','hex');
 const payloads=[];
 for(let n=0;n<12;n++){
  r=await post('/api/upload',{filename:`carga-${n}.png`,data:'data:image/png;base64,'+png.toString('base64')});assert.equal(r.status,201);
  const {image}=await r.json();const recipients=n%2===0?[groups[0].id]:[groups[1].id];
  const p={imageId:image.id,origin:`Coleta ${n} - PR`,destination:`Destino ${n} - MA`,vehicle:n%2===0?'Truck refrigerado':'Bitruck refrigerado',caption:`Carga ${n}\nValores a negociar\n(11) 91234-5678`,groupIds:recipients,requestId:randomUUID()};
  payloads.push(p);r=await post('/api/outbox/add',p);assert.equal(r.status,201);
 }
 let data=await get('/api/outbox');assert.equal(data.items.length,12);assert.equal(data.items.filter(x=>x.status==='pendente').length,12);
 r=await post('/api/outbox/add',payloads[0]);assert.equal(r.status,409,'Duplicação deve ser rejeitada');
 r=await post('/api/outbox/start',{});assert.equal(r.status,202);assert.equal((await r.json()).items,12);
 let completed=false;
 for(let i=0;i<180;i++){data=await get('/api/outbox');if(!data.activeBatchId){completed=true;break;}await new Promise(resolve=>setTimeout(resolve,70));}
 assert.equal(completed,true,'Fila de 12 imagens deve concluir');
 assert.equal(data.items.length,12);
 assert.equal(data.items.filter(x=>x.status==='simulado').length,12);
 for(let n=0;n<12;n++){
  const item=data.items[n];assert.equal(item.origin,`Coleta ${n} - PR`);assert.equal(item.results.length,1);
  assert.equal(item.results[0].groupId,payloads[n].groupIds[0]);assert.equal(item.progress.done,1);
 }
 const jobs=await get('/api/jobs');assert.equal(jobs.jobs.length,12);
 r=await post('/api/outbox/start',{});assert.equal(r.status,422,'Não pode reenviar itens finalizados automaticamente');
 r=await post('/api/outbox/clear',{});assert.equal(r.status,200);assert.equal((await r.json()).removed,12);
 data=await get('/api/outbox');assert.equal(data.items.length,0);
});
