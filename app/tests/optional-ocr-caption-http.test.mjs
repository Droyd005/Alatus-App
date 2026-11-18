import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

const home=mkdtempSync(path.join(os.tmpdir(),'alatus-imageonly-'));
const port=38000+Math.floor(Math.random()*1500);
const url=`http://127.0.0.1:${port}`;
let child,stderr='';
const post=(endpoint,data)=>fetch(url+endpoint,{method:'POST',headers:{'Origin':url,'X-Alatus-Request':'1','Content-Type':'application/json'},body:JSON.stringify(data)});
const get=async endpoint=>(await fetch(url+endpoint)).json();
const finish=async()=>{for(let i=0;i<130;i++){const d=await get('/api/outbox');if(!d.activeBatchId)return d;await new Promise(r=>setTimeout(r,50));}throw Error('fila ainda ativa');};
test.before(async()=>{
 child=spawn(process.execPath,[path.resolve('server.mjs')],{cwd:path.resolve('.'),env:{...process.env,ALATUS_HOME:home,ALATUS_PORT:String(port),ALATUS_MODE:'simulacao',ALATUS_TEST_SKIP_OCR:'1'},stdio:['ignore','pipe','pipe']});
 child.stderr.on('data',b=>stderr+=b.toString());
 for(let n=0;n<90;n++){try{const r=await fetch(url+'/api/health');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,70));}
 throw Error('Não iniciou: '+stderr);
});
test.after(()=>{child?.kill();rmSync(home,{recursive:true,force:true});});
test('importa sem OCR e envia imagem sem texto em duas rodadas independentes',async()=>{
 const groups=(await get('/api/groups')).groups;
 // Fixture PNG aprovado no teste de 12 artes.
 const png='89504e470d0a1a0a0000000d4948445200000040000000400806000000aa6971de0000009649444154789cedd04111c03000c3b075fc39a730f4a885c0e7b36dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a037480d6001da0354007680dd0015a0374807601553a047c1bcf264d0000000049454e44ae426082';
 let r=await post('/api/upload',{filename:'somente-foto.png',data:'data:image/png;base64,'+Buffer.from(png,'hex').toString('base64'),skipOcr:true});assert.equal(r.status,201);
 const item=await r.json();assert.equal(item.ocrStatus,'skipped');
 const ocr=await get('/api/ocr/'+item.image.id);assert.equal(ocr.ocr.status,'skipped');
 r=await post('/api/outbox/add',{imageId:item.image.id,groupIds:[groups[0].id,groups[1].id],caption:'',requestId:randomUUID()});assert.equal(r.status,201);
 r=await post('/api/outbox/start',{});assert.equal(r.status,202);let state=await finish();assert.equal(state.items[0].status,'simulado');assert.equal(state.items[0].caption,'');
 r=await post('/api/outbox/start',{repeat:true,confirm:'REPETIR FILA'});assert.equal(r.status,202);state=await finish();assert.equal(state.items[0].status,'simulado');assert.equal(state.items[0].sendCount,2);
 const jobs=await get('/api/jobs');assert.equal(jobs.jobs.length,2);assert.notEqual(jobs.jobs[0].id,jobs.jobs[1].id);
});


test('regressão v0.7.7: publica diretamente sem origem, destino, veículo ou legenda',async()=>{
 const groups=(await get('/api/groups')).groups;
 const images=(await get('/api/images')).images;
 const req={imageId:images[0].id,origin:'',destination:'',vehicle:'',caption:'',groupIds:[groups[0].id],requestId:randomUUID()};
 let response=await post('/api/send',req);assert.equal(response.status,202);
 const job=(await response.json()).job;
 let result;
 for(let i=0;i<100;i++){
   result=(await get('/api/jobs')).jobs.find(j=>j.id===job.id);
   if(result&&result.status!=='em_andamento')break;
   await new Promise(r=>setTimeout(r,50));
 }
 assert.equal(result.status,'simulado');
 assert.equal(result.origin,'');assert.equal(result.destination,'');
});
