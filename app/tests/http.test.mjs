import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

const home=mkdtempSync(path.join(os.tmpdir(),'alatus-http-'));
const port=32600+Math.floor(Math.random()*2000);
let service,stderr='';
test.before(async()=>{
 service=spawn(process.execPath,[path.resolve('server.mjs')],{cwd:path.resolve('.'),env:{...process.env,ALATUS_HOME:home,ALATUS_PORT:String(port),ALATUS_MODE:'simulacao'},stdio:['ignore','pipe','pipe']});
 service.stderr.on('data',c=>{stderr+=c.toString()});
 const deadline=Date.now()+7000;
 while(Date.now()<deadline){
  if(service.exitCode!==null)throw new Error('Servidor finalizou antes de iniciar: '+stderr);
  try {let r=await fetch(`http://127.0.0.1:${port}/api/health`);if(r.ok)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw new Error('Servidor não iniciou: '+stderr);
});
test.after(()=>{service?.kill();rmSync(home,{recursive:true,force:true});});

const base=()=>`http://127.0.0.1:${port}`;
const headers=()=>({'Origin':base(),'X-Alatus-Request':'1','Content-Type':'application/json'});
const post=async(p,b,customHeaders={})=>fetch(base()+p,{method:'POST',headers:{...headers(),...customHeaders},body:JSON.stringify(b)});
async function waitForJob(id){
 for(let n=0;n<80;n++){
  const response=await fetch(base()+'/api/jobs'),{jobs}=await response.json(),job=jobs.find(j=>j.id===id);
  if(job?.status!=='em_andamento'&&job)return job;
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 throw new Error('Timeout aguardando fila simulada');
}


let imageId, groupIds;
test('01 painel sem senha e exclusivamente local',async()=>{
 let r=await fetch(base()+'/api/health');assert.equal(r.status,200);const data=await r.json();assert.equal(data.mode,'simulacao');assert.equal(data.authentication,'none_localhost');
 r=await fetch(base()+'/api/groups');assert.equal(r.status,200);
 r=await fetch(base()+'/api/login',{method:'POST',headers:headers(),body:'{}'});assert.equal(r.status,404);
});
test('01b perfil obrigatório para novas instalações e edição local',async()=>{
 let r=await fetch(base()+'/api/profile');assert.equal(r.status,200);
 let p=(await r.json()).profile;assert.equal(p.configured,false);
 r=await post('/api/profile',{company:'TRANSPORTES EXEMPLO',phone:'(11) 91234-5678'});assert.equal(r.status,200);
 p=(await r.json()).profile;assert.equal(p.configured,true);
});
test('02 importar imagem dispara OCR automaticamente (sem autenticação no painel)',async()=>{
 const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
 let r=await post('/api/upload',{filename:'arte.png',data:'data:image/png;base64,'+png.toString('base64')});assert.equal(r.status,201);
 const imported=await r.json();imageId=imported.image.id;assert.equal(imported.ocrStatus,'processing');
 r=await fetch(base()+'/api/images');assert.equal(r.status,200);assert.equal((await r.json()).images.length,1);
 r=await fetch(base()+'/api/image/'+imageId);assert.equal(r.headers.get('content-type'),'image/png');
 r=await fetch(base()+'/api/ocr/'+imageId);assert.equal(r.status,200);assert.ok((await r.json()).ocr.status);
});
test('03 lista grupos de teste',async()=>{
 const r=await fetch(base()+'/api/groups');assert.equal(r.status,200);
 groupIds=(await r.json()).groups.map(g=>g.id);assert.ok(groupIds.length>0);
});
test('04 valida dados e executa sem caixa de autorização nem digitar ENVIAR',async()=>{
 const req={imageId,origin:'Curitiba - PR',destination:'Campinas - SP',vehicle:'Bitruck refrigerado',caption:'Frete de teste\nValores a negociar\n(11) 91234-5678',groupIds:[groupIds[0]],requestId:randomUUID()};
 let r=await post('/api/send',{...req,groupIds:['invalido@g.us']});assert.equal(r.status,422);
 r=await post('/api/send',req);assert.equal(r.status,202);const {job:created}=await r.json();const job=await waitForJob(created.id);assert.equal(job.status,'simulado');assert.equal(job.results[0].status,'simulado');
 r=await post('/api/send',req);assert.equal(r.status,409);
 r=await fetch(base()+'/api/jobs');const js=await r.json();assert.equal(js.jobs.length,1);
});
test('05 bloqueia pedidos com origem externa ou cabeçalho ausente',async()=>{
 let r=await post('/api/connect',{}, {'Origin':'http://example.com'});assert.equal(r.status,403);
 r=await post('/api/connect',{}, {'X-Alatus-Request':'0'});assert.equal(r.status,403);
});
test('06 pedidos paralelos: no máximo um envio aceito de cada vez',async()=>{
 const baseReq={imageId,origin:'Origem',destination:'Destino',vehicle:'Carreta refrigerada',caption:'Valores a negociar (11) 91234-5678',groupIds:[groupIds[0]]};
 const results=await Promise.all([post('/api/send',{...baseReq,requestId:randomUUID()}),post('/api/send',{...baseReq,requestId:randomUUID()})]);
 assert.deepEqual(results.map(x=>x.status).sort(),[202,409]);
});
