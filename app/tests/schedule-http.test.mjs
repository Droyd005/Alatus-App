import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
const home=mkdtempSync(path.join(os.tmpdir(),'alatus-auto-http-'));
const port=41000+Math.floor(Math.random()*2000);
const base=`http://127.0.0.1:${port}`;
const post=(path,data)=>fetch(base+path,{method:'POST',headers:{Origin:base,'X-Alatus-Request':'1','Content-Type':'application/json'},body:JSON.stringify(data)});
const read=async path=>{const res=await fetch(base+path);assert.equal(res.status,200);return res.json();};
let processRef;
async function start(){
 processRef=spawn(process.execPath,[path.resolve('server.mjs')],{cwd:path.resolve('.'),env:{...process.env,ALATUS_HOME:home,ALATUS_PORT:String(port),ALATUS_MODE:'simulacao',ALATUS_TEST_SKIP_OCR:'1'},stdio:'ignore'});
 for(let i=0;i<120;i++){
  if(processRef.exitCode!==null)throw new Error('Servidor terminou durante teste');
  try{const r=await fetch(base+'/api/health');if(r.ok)return;}catch{}
  await new Promise(r=>setTimeout(r,35));
 }
 throw new Error('Servidor nao abriu');
}
async function stop(){
 const p=processRef;if(!p)return;processRef=null;
 await new Promise(resolve=>{p.once('exit',resolve);p.kill();setTimeout(resolve,2000).unref();});
}
async function complete(){
 for(let i=0;i<100;i++){
  const x=await read('/api/outbox');if(!x.activeBatchId)return x;
  await new Promise(r=>setTimeout(r,40));
 }
 throw new Error('Fila nao terminou');
}
test.before(start);
test.after(async()=>{await stop();rmSync(home,{recursive:true,force:true});});
test('interface salva liga/desliga e exige autorizacao; atualizacao nao inicia rodadas sozinha',async()=>{
 let s=(await read('/api/schedule')).schedule;
 assert.equal(s.enabled,false);assert.equal(s.nextRunAt,null);
 let r=await post('/api/schedule',{enabled:true,intervalMinutes:20,confirm:'ATIVAR AUTOMATICO'});
 assert.equal(r.status,422,'Nao permite habilitar sem fila');
 const {groups}=await read('/api/groups');
 const png=Buffer.from('89504e470d0a1a0a0000000d4948445200000040000000400806000000aa6971de0000009649444154789cedd04111c03000c3b075fc39a730f4a885c0e7b36ddfc37e1da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a0374807601553a047c1bcf264d0000000049454e44ae426082','hex');
 r=await post('/api/upload',{filename:'frete.png',data:'data:image/png;base64,'+png.toString('base64')});assert.equal(r.status,201);
 const img=(await r.json()).image;
 r=await post('/api/outbox/add',{imageId:img.id,caption:'',groupIds:groups.map(g=>g.id),requestId:randomUUID()});assert.equal(r.status,201);
 r=await post('/api/schedule',{enabled:true,intervalMinutes:20});assert.equal(r.status,422,'Precisa confirmar ativacao');
 r=await post('/api/schedule',{enabled:true,intervalMinutes:0,confirm:'ATIVAR AUTOMATICO'});assert.equal(r.status,422,'Intervalo nulo');
 r=await post('/api/schedule',{enabled:true,intervalMinutes:1,confirm:'ATIVAR AUTOMATICO'});assert.equal(r.status,200,'Um minuto e valido');
 r=await post('/api/schedule',{enabled:true,intervalMinutes:3000,confirm:'ATIVAR AUTOMATICO'});assert.equal(r.status,200,'Intervalo acima de um dia e valido');
 const before=Date.now();r=await post('/api/schedule',{enabled:true,intervalMinutes:20,confirm:'ATIVAR AUTOMATICO'});assert.equal(r.status,200);
 s=(await r.json()).schedule;assert.equal(s.enabled,true);assert.ok(Date.parse(s.nextRunAt)>=before+20*60_000);
 assert.equal((await read('/api/jobs')).jobs.length,0,'Ligar nao dispara imediatamente');
 await stop();await start();
 s=(await read('/api/schedule')).schedule;assert.equal(s.enabled,true);
 assert.ok(Date.parse(s.nextRunAt)>Date.now()+19*60_000,'Reinicio nao recupera horarios antigos');
 assert.equal((await read('/api/jobs')).jobs.length,0,'Reinicio nao reenvia mensagens');
 r=await post('/api/schedule',{enabled:false,intervalMinutes:20});assert.equal(r.status,200);
 assert.equal((await read('/api/schedule')).schedule.enabled,false);
 assert.equal((await read('/api/schedule')).schedule.nextRunAt,null);
 // Confirmacao manual continua independente do agendamento.
 r=await post('/api/outbox/start',{});assert.equal(r.status,202);
 const completed=await complete();assert.equal(completed.items[0].status,'simulado');
 assert.equal((await read('/api/jobs')).jobs.length,1);
 const saved=JSON.parse(readFileSync(path.join(home,'data','automatic-schedule.json'),'utf8'));
 assert.equal(saved.enabled,false);
});
