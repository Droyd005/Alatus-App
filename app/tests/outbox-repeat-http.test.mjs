import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const home=mkdtempSync(path.join(os.tmpdir(),'alatus-repeat-'));
const port=39000+Math.floor(Math.random()*1500);
const base=`http://127.0.0.1:${port}`;
const payload=(url,value)=>fetch(base+url,{method:'POST',headers:{Origin:base,'X-Alatus-Request':'1','Content-Type':'application/json'},body:JSON.stringify(value)});
const read=async url=>{const r=await fetch(base+url);assert.equal(r.status,200);return r.json();};
let server,errors='';
async function start(){
 errors='';server=spawn(process.execPath,[path.resolve('server.mjs')],{cwd:path.resolve('.'),env:{...process.env,ALATUS_HOME:home,ALATUS_PORT:String(port),ALATUS_MODE:'simulacao',ALATUS_TEST_SKIP_OCR:'1'},stdio:['ignore','pipe','pipe']});
 server.stderr.on('data',c=>{errors+=c.toString();});
 const limit=Date.now()+8000;
 while(Date.now()<limit){if(server.exitCode!==null)throw new Error('Servidor saiu: '+errors);try{const r=await fetch(base+'/api/health');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,60));}
 throw new Error('Servidor não iniciou: '+errors);
}
async function stop(){if(!server)return;const old=server;server=null;await new Promise(resolve=>{old.once('exit',resolve);old.kill();setTimeout(resolve,2000).unref();});}
async function complete(expectedCount){
 for(let i=0;i<100;i++){
  const data=await read('/api/outbox');
  if(!data.activeBatchId){assert.equal(data.items.length,expectedCount);return data;}
  await new Promise(r=>setTimeout(r,75));
 }
 throw new Error('Fila excedeu prazo: '+errors);
}

test.before(start);
test.after(async()=>{await stop();rmSync(home,{recursive:true,force:true});});
test('8 artes ficam salvas, podem ser reenviadas com confirmação e sobrevivem à reabertura',async()=>{
 let r=await payload('/api/profile',{company:'ALATUS TESTE',phone:'(43) 92000-5487'});assert.equal(r.status,200);
 const {groups}=await read('/api/groups');assert.equal(groups.length,2);
 const png=Buffer.from('89504e470d0a1a0a0000000d4948445200000040000000400806000000aa6971de0000009649444154789cedd04111c03000c3b075fc39a730f4a885c0e7b36ddfc37e1da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a0374807601553a047c1bcf264d0000000049454e44ae426082','hex');
 const sources=[];
 for(let i=0;i<8;i++){
  r=await payload('/api/upload',{filename:`rota-${i}.png`,data:'data:image/png;base64,'+png.toString('base64')});assert.equal(r.status,201);
  const {image}=await r.json();
  const groupIds=i%2===0?[groups[0].id,groups[1].id]:[groups[1].id];
  const data={imageId:image.id,origin:`Origem ${i} - PR`,destination:`Destino ${i} - SC`,vehicle:'Truck refrigerado',caption:`Legenda exclusiva ${i} | Valores a negociar | (43) 92000-5487`,groupIds,requestId:randomUUID()};
  sources.push(data);r=await payload('/api/outbox/add',data);assert.equal(r.status,201);
 }
 r=await payload('/api/outbox/start',{repeat:true,confirm:'REPETIR FILA'});
 assert.equal(r.status,422,'Fila pendente não pode ser repetida');
 r=await payload('/api/outbox/start',{});assert.equal(r.status,202);
 let outbox=await complete(8);
 assert.ok(outbox.items.every(x=>x.status==='simulado'&&x.sendCount===1));
 assert.equal((await read('/api/jobs')).jobs.length,8);
 const originalIDs=outbox.items.map(x=>x.requestId);
 r=await payload('/api/outbox/start',{});assert.equal(r.status,422,'Não há reenvio implícito');
 r=await payload('/api/outbox/start',{repeat:true,confirm:'INCORRETO'});assert.equal(r.status,422);
 outbox=await read('/api/outbox');assert.deepEqual(outbox.items.map(x=>x.requestId),originalIDs);
 r=await payload('/api/outbox/start',{repeat:true,confirm:'REPETIR FILA'});assert.equal(r.status,202);
 const immediate=await payload('/api/outbox/start',{repeat:true,confirm:'REPETIR FILA'});assert.equal(immediate.status,409,'Duplo clique não inicia nova rodada');
 outbox=await complete(8);
 assert.ok(outbox.items.every(x=>x.status==='simulado'&&x.sendCount===2));
 for(let i=0;i<8;i++){
  assert.equal(outbox.items[i].imageId,sources[i].imageId);
  assert.equal(outbox.items[i].caption,sources[i].caption);
  assert.deepEqual(outbox.items[i].groupIds,sources[i].groupIds);
  assert.notEqual(outbox.items[i].requestId,originalIDs[i]);
 }
 const jobs=(await read('/api/jobs')).jobs;
 assert.equal(jobs.length,16);
 assert.equal(new Set(jobs.map(x=>x.id)).size,16);
 await stop();await start();
 const saved=await read('/api/outbox');
 assert.equal(saved.items.length,8);assert.ok(saved.items.every(x=>x.sendCount===2&&x.status==='simulado'));
 assert.equal((await read('/api/jobs')).jobs.length,16,'Não envia novamente após reiniciar');
 r=await payload('/api/outbox/start',{repeat:true,confirm:'REPETIR FILA'});assert.equal(r.status,202);
 outbox=await complete(8);
 assert.equal(outbox.items.filter(x=>x.sendCount===3).length,8);
 assert.equal((await read('/api/jobs')).jobs.length,24);
});
