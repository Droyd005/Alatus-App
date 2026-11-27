import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const home=mkdtempSync(path.join(os.tmpdir(),'alatus-history-full-'));
const port=43000+Math.floor(Math.random()*1000);
const base=`http://127.0.0.1:${port}`;
const post=(route,data,origin=base)=>fetch(base+route,{method:'POST',headers:{Origin:origin,'X-Alatus-Request':'1','Content-Type':'application/json'},body:JSON.stringify(data)});
const read=async route=>{const res=await fetch(base+route);assert.equal(res.status,200);return res.json();};
let server,log='';
const job=(status)=>({id:randomUUID(),requestId:randomUUID(),createdAt:new Date().toISOString(),status,mode:'real',progress:{done:1,total:1},results:[{groupId:'grupo-de-teste@g.us',status:status==='revisar_manualmente'?'incerto':'submetido',error:'not-acceptable'}]});
const expected=[job('submetido'),job('revisar_manualmente'),job('revisar_manualmente')];
const keepItem={id:randomUUID(),imageId:randomUUID(),status:'submetido',groupIds:['grupo-de-teste@g.us'],caption:'Carga de teste',results:[]};
mkdirSync(path.join(home,'data'),{recursive:true});
writeFileSync(path.join(home,'data','jobs.json'),JSON.stringify(expected));
writeFileSync(path.join(home,'data','outbox.json'),JSON.stringify([keepItem]));
async function start(){
 log='';server=spawn(process.execPath,[path.resolve('server.mjs')],{cwd:path.resolve('.'),env:{...process.env,ALATUS_HOME:home,ALATUS_PORT:String(port),ALATUS_MODE:'simulacao',ALATUS_TEST_SKIP_OCR:'1'},stdio:['ignore','pipe','pipe']});
 server.stderr.on('data',x=>{log+=x.toString();});
 for(let i=0;i<110;i++){
  if(server.exitCode!==null)throw Error('Servidor encerrado: '+log);
  try{const res=await fetch(base+'/api/health');if(res.ok)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,40));
 }
 throw Error('Servidor indisponivel: '+log);
}
async function stop(){if(!server)return;const child=server;server=null;await new Promise(resolve=>{child.once('exit',resolve);child.kill();setTimeout(resolve,1500).unref();});}
test.before(start);
test.after(async()=>{await stop();rmSync(home,{recursive:true,force:true});});

test('limpeza comum preserva registros de revisao (regressao)',async()=>{
 assert.equal((await read('/api/jobs')).jobs.length,3);
 const response=await post('/api/jobs/clear',{});assert.equal(response.status,200);
 const outcome=await response.json();assert.equal(outcome.removed,1);assert.equal(outcome.preserved,2);
 assert.equal((await read('/api/jobs')).jobs.length,2);
});

test('limpeza total exige confirmacao no servidor e origem local valida',async()=>{
 const missing=await post('/api/jobs/wipe',{});assert.equal(missing.status,422);
 const wrong=await post('/api/jobs/wipe',{confirm:'LIMPAR'});assert.equal(wrong.status,422);
 const foreign=await post('/api/jobs/wipe',{confirm:'APAGAR TODO O HISTORICO'},'https://site-externo.example');assert.equal(foreign.status,403);
 assert.equal((await read('/api/jobs')).jobs.length,2);
});

test('full wipe apaga tambem incertos, persiste e preserva a fila',async()=>{
 const response=await post('/api/jobs/wipe',{confirm:'APAGAR TODO O HISTORICO'});assert.equal(response.status,200);
 const outcome=await response.json();assert.deepEqual(outcome,{removed:2,reviewRemoved:2,preserved:0});
 assert.deepEqual((await read('/api/jobs')).jobs,[]);
 assert.equal((await read('/api/outbox')).items.length,1);
 assert.deepEqual(JSON.parse(readFileSync(path.join(home,'data','jobs.json'),'utf8')),[]);
 const ledger=JSON.parse(readFileSync(path.join(home,'data','cleared-request-ids.json'),'utf8'));
 assert.ok(expected.every(job=>ledger.includes(job.requestId)),'IDs antigos devem continuar bloqueados contra duplicacao');
 await stop();await start();
 assert.deepEqual((await read('/api/jobs')).jobs,[]);
 assert.equal((await read('/api/outbox')).items[0].id,keepItem.id);
});

test('limpeza total idempotente com historico vazio',async()=>{
 const response=await post('/api/jobs/wipe',{confirm:'APAGAR TODO O HISTORICO'});assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{removed:0,reviewRemoved:0,preserved:0});
});

test('o painel so usa a rota total apos confirmar duas vezes',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(html,/id="clearAllJobs"/);
 assert.match(js,/prompt\('Confirme a limpeza total digitando APAGAR:/);
 assert.match(js,/post\('\/api\/jobs\/wipe',\{confirm:'APAGAR TODO O HISTORICO'\}\)/);
 assert.match(js,/\$\('clearAllJobs'\)\.disabled=/);
});
