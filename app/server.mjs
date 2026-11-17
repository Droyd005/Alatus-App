import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {APP_PORT, ROOT, DIR, DATA, setupDirs, loadJson, saveJson, audit, fail, imageUpload,validateSend,getProfile,persistProfile} from './src/core.mjs';
import {recognizeImage} from './src/ocr.mjs';
import {WhatsAppBridge} from './src/wa.mjs';
import {processPublicationQueue} from './src/queue.mjs';

const appDir=path.dirname(fileURLToPath(import.meta.url));
const mode=process.env.ALATUS_MODE==='real'?'real':'simulacao';
const host='127.0.0.1';const port=Number(process.env.ALATUS_PORT||APP_PORT);
const desktopToken=process.env.ALATUS_DESKTOP_TOKEN||'';
// Sem pausa fixa entre grupos; cada tentativa espera a anterior terminar.
let serverShuttingDown=false;
setupDirs();
const bridge=new WhatsAppBridge(mode);
const images=loadJson(DATA.images,[]), jobs=loadJson(DATA.jobs,[]);
// Se o Windows desligou durante um envio, não presumir sucesso e nunca reenviar sozinho.
let interruptedJobs=false;
for(const j of jobs) {if(j.status==='em_andamento'){j.status='revisar_manualmente';j.interruptedAt=new Date().toISOString();interruptedJobs=true;audit('envio_interrompido',{jobId:j.id});}}
if(interruptedJobs)saveJson(DATA.jobs,jobs);
let busy=false, lastGroups=[], activeJobId=null, cancelActiveJob=false, uncertainSendBlock=false;
const HEADERS={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"};
function json(res,code,data,more={}){res.writeHead(code,{...HEADERS,'Content-Type':'application/json; charset=utf-8',...more});res.end(JSON.stringify(data));}
function text(res,code,data,mime='text/plain; charset=utf-8'){res.writeHead(code,{...HEADERS,'Content-Type':mime});res.end(data);}
async function body(req,limit=11_800_000){let buffer=[],total=0;for await (const chunk of req){total+=chunk.length;if(total>limit)throw fail(413,'Dados grandes demais. Limite: imagem de 8 MB.');buffer.push(chunk);}try{return JSON.parse(Buffer.concat(buffer).toString('utf8'));}catch{throw fail(400,'JSON inválido.');}}
function isValidWrite(req){const origin=req.headers.origin;const expected=`http://${host}:${port}`;return origin===expected&&req.headers['x-alatus-request']==='1';}
function imageRecord(id){const rec=images.find(im=>im.id===id);if(!rec)throw fail(404,'Imagem não encontrada.');return rec;}
function groupSafelist(list) {return list.map(g=>({id:g.id,name:g.name,demo:g.demo===true}));}
function addJobs(job){jobs.push(job);saveJson(DATA.jobs,jobs);}
function updateJobs(){saveJson(DATA.jobs,jobs);}
// OCR por imagem. Uma execução por vez para não sobrecarregar o computador.
let ocrQueue=Promise.resolve();
const pendingOcr=new Map();
function queueOcr(id,force=false){
 const image=imageRecord(id);
 if(pendingOcr.has(id))return;
 if(image.ocr?.status==='ready'&&!force)return;
 image.ocr={status:'processing',data:null,startedAt:new Date().toISOString()};
 saveJson(DATA.images,images);
 const promise=ocrQueue.catch(()=>{}).then(async()=>{
  try{
   const {parsed,confidence}=await recognizeImage(image);
   image.ocr={status:parsed.complete?'ready':'needs_review',confidence,method:parsed.method,
      data:{origin:parsed.origin,destination:parsed.destination,vehicle:parsed.vehicle},
      missing:parsed.missing,rawText:parsed.text.slice(0,3500),updatedAt:new Date().toISOString()};
   audit('ocr_finalizado',{imageId:id,status:image.ocr.status,missing:parsed.missing});
  }catch(err){
   image.ocr={status:'error',error:err.message||'Falha de OCR',updatedAt:new Date().toISOString()};
   audit('ocr_erro',{imageId:id,error:String(err.message).slice(0,250)});
  }finally{saveJson(DATA.images,images);pendingOcr.delete(id);}
 });
 pendingOcr.set(id,promise);ocrQueue=promise;
}
function wrapError(e){return {error:e.message||'Erro desconhecido',code:e.status||500};}

async function request(req,res){
 const pathname=new URL(req.url,`http://${host}:${port}`).pathname;
 try{
  if(pathname==='/api/internal/shutdown'&&req.method==='POST'){
   // Somente o processo principal do desktop conhece o token em memória.
   if(!desktopToken||req.headers['x-alatus-desktop-token']!==desktopToken)throw fail(403,'Operação restrita ao aplicativo de desktop.');
   if(serverShuttingDown)return json(res,202,{closing:true});
   serverShuttingDown=true;
   cancelActiveJob=true;
   audit('encerramento_solicitado',{busy,jobId:activeJobId});
   json(res,202,{closing:true,busy});
   void shutdownGracefully();
   return;
  }
  if(serverShuttingDown)throw fail(503,'Aplicativo encerrando.');
  if(req.headers.host!==`${host}:${port}`)throw fail(403,'Endereço não permitido. Use http://127.0.0.1:'+port+'.');
  if(req.method==='OPTIONS')throw fail(405,'Método não permitido.');
  if(req.method==='GET'&&pathname==='/api/health')return json(res,200,{ok:true,app:'ALATUS v0.6',mode,server:'local',authentication:'none_localhost'});
  if(req.method==='GET'&&pathname==='/')return text(res,200,fs.readFileSync(path.join(appDir,'public','index.html')),'text/html; charset=utf-8');
  if(req.method==='GET'&&pathname==='/app.js')return text(res,200,fs.readFileSync(path.join(appDir,'public','app.js')),'application/javascript; charset=utf-8');
  if(req.method==='POST'){
   if(!isValidWrite(req))throw fail(403,'Origem do pedido não autorizada. Abra http://127.0.0.1:'+port+'.');
   if(!String(req.headers['content-type']||'').startsWith('application/json'))throw fail(415,'Envie Content-Type application/json.');
  }
  if(req.method==='GET'&&pathname==='/api/profile')return json(res,200,{profile:getProfile()});
  if(req.method==='POST'&&pathname==='/api/profile'){if(busy)throw fail(409,'Não altere o perfil enquanto houver envio em andamento.');const b=await body(req,3000);return json(res,200,{profile:persistProfile(b)});}
  if(req.method==='GET'&&pathname==='/api/status')return json(res,200,{...bridge.publicStatus(),imageCount:images.length,jobCount:jobs.length,activeJobId,uncertainSendBlock});
  if(req.method==='GET'&&pathname==='/api/images')return json(res,200,{images:images.slice(-30).reverse().map(({file,...x})=>x)});
  if(req.method==='GET'&&pathname.startsWith('/api/image/')){
   const image=imageRecord(pathname.split('/').pop());
   return text(res,200,fs.readFileSync(path.join(DIR.images,image.file)),image.mime);
  }
  if(req.method==='POST'&&pathname==='/api/upload'){
   const b=await body(req);const record=imageUpload(b.data,b.filename||'arte',images);queueOcr(record.id);return json(res,201,{image:record,ocrStatus:'processing'});
  }
  if(req.method==='GET'&&pathname.startsWith('/api/ocr/')) {
   const image=imageRecord(pathname.split('/').pop());
   return json(res,200,{imageId:image.id,ocr:image.ocr||{status:'not_started'}});
  }
  if(req.method==='POST'&&pathname.startsWith('/api/analyze/')){
   const image=imageRecord(pathname.split('/').pop());
   queueOcr(image.id,true);
   return json(res,202,{imageId:image.id,ocr:image.ocr});
  }
  if(req.method==='POST'&&pathname==='/api/connect'){
   if(busy)throw fail(409,'Não reinicie a conexão durante a fila de envio.');
   const status=await bridge.connect();return json(res,200,status);
  }
  if(req.method==='POST'&&pathname==='/api/reconnect'){
   if(busy)throw fail(409,'Não reinicie a conexão durante a fila de envio.');
   const status=await bridge.connect({restart:true});lastGroups=[];
   return json(res,200,status);
  }
  if(req.method==='POST'&&pathname==='/api/session/reset'){
   if(busy)throw fail(409,'Não redefina a sessão durante a fila de envio.');
   const b=await body(req,2000);
   if(b.confirm!=='REDEFINIR SESSAO')throw fail(422,'Confirmação inválida. Sessão preservada.');
   const status=await bridge.resetSession();lastGroups=[];
   return json(res,200,status);
  }
  if(req.method==='GET'&&pathname==='/api/groups'){
   const list=await bridge.groups();lastGroups=groupSafelist(list);return json(res,200,{groups:lastGroups,mode});
  }
  if(req.method==='GET'&&pathname==='/api/jobs')return json(res,200,{activeJobId,uncertainSendBlock,jobs:jobs.slice(-30).reverse().map(j=>({id:j.id,createdAt:j.createdAt,mode:j.mode,origin:j.origin,destination:j.destination,status:j.status,progress:j.progress,results:j.results}))});
  if(req.method==='POST'&&pathname==='/api/cancel'){
   const b=await body(req,2000);
   if(!busy||!activeJobId||b.jobId!==activeJobId)throw fail(409,'Não há fila ativa com esse identificador.');
   cancelActiveJob=true;audit('envio_cancelamento_solicitado',{jobId:activeJobId});
   return json(res,202,{ok:true,jobId:activeJobId,message:'Cancelamento solicitado. A mensagem em curso pode ainda ser submetida.'});
  }
  if(req.method==='POST'&&pathname==='/api/send'){
   if(busy)throw fail(409,'Já existe uma fila de envio em andamento.');
   if(uncertainSendBlock)throw fail(409,'Bloqueado após timeout incerto. Verifique no WhatsApp e reinicie o servidor antes de uma nova publicação.');
   const b=await body(req,24_000);
   if(busy)throw fail(409,'Já existe uma fila de envio em andamento.');
   const record=validateSend(b,images,lastGroups);
   const existing=jobs.find(j=>j.requestId===record.requestId);
   if(existing)return json(res,409,{error:'Esta tentativa já foi registrada. Confira o histórico antes de repetir.',job:existing});
   if(mode==='real'&&!bridge.publicStatus().connected)throw fail(409,'WhatsApp não está conectado.');
   const job={id:randomUUID(),requestId:record.requestId,mode,status:'em_andamento',createdAt:new Date().toISOString(),origin:record.origin,destination:record.destination,vehicle:record.vehicle,imageId:record.image.id,groupIds:record.groupIds,progress:{done:0,total:record.groupIds.length},results:[]};
   addJobs(job);busy=true;activeJobId=job.id;cancelActiveJob=false;
   audit('envio_iniciado',{id:job.id,mode,groupCount:record.groupIds.length,imageId:record.image.id});
   // Fila executada pelo servidor local; a interface consulta /api/jobs para progresso.
   void (async()=>{
    try{
     const outcome=await processPublicationQueue({job,record:{...record,imagePath:path.join(DIR.images,record.image.file)},bridge,
      groupNames:new Map(lastGroups.map(g=>[g.id,g.name])),
      isCancelRequested:()=>cancelActiveJob,
      afterGroup:async(j,result)=>{updateJobs();audit('envio_grupo',{jobId:j.id,groupId:result.groupId,status:result.status});}
     });
     if(outcome.timedOut){uncertainSendBlock=true;audit('envio_bloqueado_apos_timeout',{jobId:job.id});}
    }catch(e){job.status='revisar_manualmente';job.error=String(e.message||e).slice(0,300);audit('envio_falha_interna',{jobId:job.id,error:job.error});}
    finally{updateJobs();audit('envio_finalizado',{jobId:job.id,status:job.status,completed:job.progress.done,total:job.progress.total});busy=false;activeJobId=null;cancelActiveJob=false;}
   })();
   return json(res,202,{job});
  }
  throw fail(404,'Rota não encontrada.');
 }catch(e){const err=wrapError(e);if(err.code>=500)console.error('[ALATUS]',pathname,err.error);return json(res,err.code,err);}
}
async function shutdownGracefully(){
 // Não interrompe uma chamada sendMessage em andamento; aguarda até o timeout
 // da fila para impedir que o próximo grupo receba a mensagem ao fechar.
 const deadline=Date.now()+57_000;
 while(busy&&Date.now()<deadline)await new Promise(r=>setTimeout(r,250));
 if(busy)audit('encerramento_envio_incertissimo',{jobId:activeJobId});
 try{await bridge.shutdown();}catch(e){audit('encerramento_whatsapp_erro',{error:e.message});}
 server.close(()=>process.exit(0));
 setTimeout(()=>process.exit(0),2500).unref();
}
const server=http.createServer((req,res)=>{request(req,res).catch(e=>{console.error('Unhandled request:',e);if(!res.headersSent)json(res,500,{error:'Falha interna inesperada.'});else res.end();});});
server.requestTimeout=90_000;server.headersTimeout=15_000;server.maxRequestsPerSocket=100;
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'ERRO S001: Porta 3187 já está ocupada. Encerre o painel anterior (Ctrl+C).':e);process.exitCode=1;});
server.listen(port,host,()=>{
 console.log(`ALATUS v0.6 - MODO ${mode.toUpperCase()} | http://${host}:${port}`);
 console.log(`DADOS: ${ROOT}`);
 if(mode==='simulacao')console.log('MODO TESTE: Nenhuma mensagem será enviada ao WhatsApp.');
 if(mode==='real'){
  console.log('MODO REAL: Aguarde aprovação no painel para cada envio. Use número de teste.');
  if(fs.existsSync(path.join(DIR.session,'creds.json'))) {
   console.log('Sessão encontrada: iniciando reconexão sem enviar mensagens.');
   bridge.connect().catch(e=>console.error('Reconexão não concluída:',e.message));
  }
 }
});
