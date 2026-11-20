import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';

const home=mkdtempSync(path.join(os.tmpdir(),'alatus-mixed-'));
const port=47000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`;
let server;
const post=(url,data)=>fetch(base+url,{method:'POST',headers:{Origin:base,'X-Alatus-Request':'1','Content-Type':'application/json'},body:JSON.stringify(data)});
const get=async url=>(await fetch(base+url)).json();
async function start(){
 server=spawn(process.execPath,[path.resolve('server.mjs')],{cwd:path.resolve('.'),env:{...process.env,ALATUS_HOME:home,ALATUS_PORT:String(port),ALATUS_MODE:'simulacao',ALATUS_TEST_SKIP_OCR:'1'},stdio:'ignore'});
 for(let i=0;i<120;i++){
  try{if((await fetch(base+'/api/health')).ok)return;}catch{}
  await new Promise(r=>setTimeout(r,35));
 }
 throw Error('Servidor nao iniciou');
}
async function stop(){const ref=server;if(!ref)return;server=null;await new Promise(resolve=>{ref.once('exit',resolve);ref.kill();setTimeout(resolve,2000).unref();});}
async function finish(){for(let i=0;i<100;i++){const o=await get('/api/outbox');if(!o.activeBatchId)return o;await new Promise(r=>setTimeout(r,40));}throw Error('Lote ativo por muito tempo');}
test.before(start);
test.after(async()=>{await stop();rmSync(home,{recursive:true,force:true});});
test('envio individual, fila mista, reenvio seletivo e agendamento seguem sem duplicar a carga incerta',async()=>{
 const groups=(await get('/api/groups')).groups;
 const png='89504e470d0a1a0a0000000d4948445200000040000000400806000000aa6971de0000009649444154789cedd04111c03000c3b075fc39a730f4a885c0e7b36ddfc37e1da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a0374807601553a047c1bcf264d0000000049454e44ae426082';
 const r=await post('/api/upload',{filename:'frete.png',data:'data:image/png;base64,'+Buffer.from(png,'hex').toString('base64'),skipOcr:true});assert.equal(r.status,201);
 const {image}=await r.json();
 const captions=['Minha legenda especial','Carga incerta','Outra carga pendente'];
 for(const caption of captions){const resp=await post('/api/outbox/add',{imageId:image.id,caption,groupIds:[groups[0].id],requestId:randomUUID()});assert.equal(resp.status,201);}
 await stop();
 const filename=path.join(home,'data','outbox.json');const items=JSON.parse(readFileSync(filename,'utf8'));
 items[0].status='submetido';items[0].sendCount=1;
 items[1].status='revisar_manualmente';items[1].groupIds=[groups[0].id,groups[1].id];
 items[1].unsentGroupIds=[groups[1].id];items[1].results=[{groupId:groups[0].id,status:'incerto',error:'not-acceptable'}];
 writeFileSync(filename,JSON.stringify(items));
 await start();
 await get('/api/groups');
 let resp=await post('/api/schedule',{enabled:true,intervalMinutes:20,confirm:'ATIVAR AUTOMATICO'});
 assert.equal(resp.status,200,'agendamento deve aceitar fila mista');
 resp=await post('/api/outbox/start',{repeat:true,confirm:'REPETIR FILA'});assert.equal(resp.status,202);
 let outbox=await finish();
 assert.equal(outbox.items[0].status,'simulado');assert.equal(outbox.items[0].sendCount,2);
 assert.equal(outbox.items[1].status,'revisar_manualmente');assert.equal(outbox.items[1].results[0].error,'not-acceptable');
 assert.equal(outbox.items[2].status,'pendente');
 resp=await post('/api/outbox/continue-unsent',{id:items[1].id,confirm:'PREPARAR NAO TENTADOS'});
 assert.equal(resp.status,201);const prepared=(await resp.json()).item;
 assert.deepEqual(prepared.groupIds,[groups[1].id]);assert.equal(prepared.caption,'Carga incerta');
 resp=await post('/api/outbox/continue-unsent',{id:items[1].id,confirm:'PREPARAR NAO TENTADOS'});assert.equal(resp.status,409,'Evita preparar duas vezes');
 resp=await post('/api/outbox/start',{});assert.equal(resp.status,202);
 outbox=await finish();assert.equal(outbox.items[2].status,'simulado');
 assert.equal(outbox.items[3].status,'simulado');assert.equal(outbox.items[1].status,'revisar_manualmente');
 resp=await post('/api/send',{imageId:image.id,caption:'Outra mensagem livre',groupIds:[groups[1].id],requestId:randomUUID()});
 assert.equal(resp.status,202,'envio novo deve funcionar apesar de carga incerta');
});
