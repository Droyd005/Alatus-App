import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {APP_PORT, ROOT, DIR, DATA, setupDirs, loadJson, saveJson, audit, fail, imageUpload,validateSend,getProfile,persistProfile} from './src/core.mjs';
import {recognizeImage} from './src/ocr.mjs';
import {WhatsAppBridge} from './src/wa.mjs';
import {processPublicationQueue} from './src/queue.mjs';
import {enqueueItem, recoverOutbox, batchSnapshot, clearCompleted, prepareRepeat, REPEATABLE_STATUSES} from './src/outbox.mjs';

const appDir=path.dirname(fileURLToPath(import.meta.url));
const mode=process.env.ALATUS_MODE==='real'?'real':'simulacao';
const host='127.0.0.1';const port=Number(process.env.ALATUS_PORT||APP_PORT);
const desktopToken=process.env.ALATUS_DESKTOP_TOKEN||'';
// Sem pausa fixa entre grupos; cada tentativa espera a anterior terminar.
let serverShuttingDown=false;
setupDirs();
const bridge=new WhatsAppBridge(mode);
const images=loadJson(DATA.images,[]), jobs=loadJson(DATA.jobs,[]), outbox=loadJson(DATA.outbox,[]);
const clearedRequestIds=new Set(loadJson(DATA.clearedRequestIds,[]));
if(recoverOutbox(outbox))saveJson(DATA.outbox,outbox);
// Se o Windows desligou durante um envio, não presumir sucesso e nunca reenviar sozinho.
let interruptedJobs=false;
for(const j of jobs) {if(j.status==='em_andamento'){j.status='revisar_manualmente';j.interruptedAt=new Date().toISOString();interruptedJobs=true;audit('envio_interrompido',{jobId:j.id});}}
if(interruptedJobs)saveJson(DATA.jobs,jobs);
let busy=false, startingOutbox=false, lastGroups=[], activeJobId=null, activeBatchId=null, lastBatchError=null, cancelActiveJob=false, uncertainSendBlock=false;
const HEADERS={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"};
function json(res,code,data,more={}){res.writeHead(code,{...HEADERS,'Content-Type':'application/json; charset=utf-8',...more});res.end(JSON.stringify(data));}
function text(res,code,data,mime='text/plain; charset=utf-8'){res.writeHead(code,{...HEADERS,'Content-Type':mime});res.end(data);}
async function body(req,limit=11_800_000){let buffer=[],total=0;for await (const chunk of req){total+=chunk.length;if(total>limit)throw fail(413,'Dados grandes demais. Limite: imagem de 8 MB.');buffer.push(chunk);}try{return JSON.parse(Buffer.concat(buffer).toString('utf8'));}catch{throw fail(400,'JSON inválido.');}}
function isValidWrite(req){const origin=req.headers.origin;const expected=`http://${host}:${port}`;return origin===expected&&req.headers['x-alatus-request']==='1';}
function imageRecord(id){const rec=images.find(im=>im.id===id);if(!rec)throw fail(404,'Imagem não encontrada.');return rec;}
function groupSafelist(list) {return list.map(g=>({id:g.id,name:g.name,demo:g.demo===true}));}
function addJobs(job){jobs.push(job);saveJson(DATA.jobs,jobs);}
function updateJobs(){saveJson(DATA.jobs,jobs);}
function updateOutbox(){saveJson(DATA.outbox,outbox);}
// OCR por imagem. Uma execução por vez para não sobrecarregar o computador.
let ocrQueue=Promise.resolve();
const pendingOcr=new Map();
function queueOcr(id,force=false){
 const image=imageRecord(id);
 // Apenas testes de integração da fila, em simulação: não executar OCR ou baixar modelos.
 if(mode==='simulacao'&&process.env.ALATUS_TEST_SKIP_OCR==='1'){
  image.ocr={status:'skipped_for_test',data:null};saveJson(DATA.images,images);return;
 }
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
  if(req.method==='GET'&&pathname==='/api/health')return json(res,200,{ok:true,app:'ALATUS v0.7',mode,server:'local',authentication:'none_localhost'});
  if(req.method==='GET'&&pathname==='/')return text(res,200,fs.readFileSync(path.join(appDir,'public','index.html')),'text/html; charset=utf-8');
  if(req.method==='GET'&&pathname==='/app.js')return text(res,200,fs.readFileSync(path.join(appDir,'public','app.js')),'application/javascript; charset=utf-8');
  if(req.method==='GET'&&(pathname==='/brand/alatus-emblem.png'||pathname==='/brand/alatus-wallpaper.webp')){
   const file=pathname.endsWith('.png')?'alatus-emblem.png':'alatus-wallpaper.webp';
   const mime=file.endsWith('.png')?'image/png':'image/webp';
   res.writeHead(200,{...HEADERS,'Content-Type':mime});res.end(fs.readFileSync(path.join(appDir,'public','brand',file)));return;
  }
  if(req.method==='POST'){
   if(!isValidWrite(req))throw fail(403,'Origem do pedido não autorizada. Abra http://127.0.0.1:'+port+'.');
   if(!String(req.headers['content-type']||'').startsWith('application/json'))throw fail(415,'Envie Content-Type application/json.');
  }
  if(req.method==='GET'&&pathname==='/api/profile')return json(res,200,{profile:getProfile()});
  if(req.method==='POST'&&pathname==='/api/profile'){if(busy||startingOutbox)throw fail(409,'Não altere o perfil enquanto houver envio em andamento.');const b=await body(req,3000);return json(res,200,{profile:persistProfile(b)});}
  if(req.method==='GET'&&pathname==='/api/status')return json(res,200,{...bridge.publicStatus(),imageCount:images.length,jobCount:jobs.length,activeJobId,activeBatchId,uncertainSendBlock});
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
   if(busy||startingOutbox)throw fail(409,'Não reinicie a conexão durante a fila de envio.');
   const status=await bridge.connect();return json(res,200,status);
  }
  if(req.method==='POST'&&pathname==='/api/reconnect'){
   if(busy||startingOutbox)throw fail(409,'Não reinicie a conexão durante a fila de envio.');
   const status=await bridge.connect({restart:true});lastGroups=[];
   return json(res,200,status);
  }
  if(req.method==='POST'&&pathname==='/api/session/reset'){
   if(busy||startingOutbox)throw fail(409,'Não redefina a sessão durante a fila de envio.');
   const b=await body(req,2000);
   if(b.confirm!=='REDEFINIR SESSAO')throw fail(422,'Confirmação inválida. Sessão preservada.');
   const status=await bridge.resetSession();lastGroups=[];
   // Destinatários da conta anterior não devem ser reutilizados na nova conta.
   let pendingReview=0;
   for(const item of outbox){
    if(item.status!=='pendente')continue;
    item.status='revisar_manualmente';
    item.error='Conta de WhatsApp alterada. Adicione novamente esta carga após selecionar os grupos da nova conta.';
    pendingReview++;
   }
   if(pendingReview){updateOutbox();audit('troca_numero_fila_revisao',{count:pendingReview});}
   return json(res,200,{...status,pendingReview});
  }
  if(req.method==='GET'&&pathname==='/api/groups'){
   const list=await bridge.groups();lastGroups=groupSafelist(list);return json(res,200,{groups:lastGroups,mode});
  }
  if(req.method==='GET'&&pathname==='/api/outbox')return json(res,200,{activeBatchId,activeJobId,uncertainSendBlock,items:outbox});
  if(req.method==='GET'&&pathname==='/api/jobs')return json(res,200,{activeJobId,uncertainSendBlock,jobs:jobs.slice(-30).reverse().map(j=>({id:j.id,createdAt:j.createdAt,mode:j.mode,origin:j.origin,destination:j.destination,status:j.status,progress:j.progress,results:j.results}))});
  if(req.method==='POST'&&pathname==='/api/jobs/clear'){
   if(busy||startingOutbox||activeJobId||activeBatchId)throw fail(409,'Aguarde a conclusão dos envios antes de limpar o histórico.');
   await body(req,2000);
   const completed=new Set(['simulado','submetido','interrompido_pelo_usuario']);
   const finished=jobs.filter(j=>completed.has(j.status));
   const keep=jobs.filter(j=>!completed.has(j.status));
   for(const job of finished)if(job.requestId)clearedRequestIds.add(job.requestId);
   saveJson(DATA.clearedRequestIds,[...clearedRequestIds]);
   jobs.splice(0,jobs.length,...keep);updateJobs();
   audit('historico_limpo',{removed:finished.length,preserved:keep.length});
   return json(res,200,{removed:finished.length,preserved:keep.length});
  }
  if(req.method==='POST'&&pathname==='/api/outbox/add'){
   if(busy||startingOutbox)throw fail(409,'Aguarde o término do envio para adicionar itens.');
   const b=await body(req,24_000);const record=validateSend(b,images,lastGroups);
   if(clearedRequestIds.has(record.requestId))throw fail(409,'Esta tentativa já foi publicada anteriormente.');
   const item=enqueueItem(record,outbox,lastGroups,jobs);updateOutbox();
   audit('carga_enfileirada',{id:item.id,imageId:item.imageId,groupCount:item.groupIds.length});
   return json(res,201,{item});
  }
  if(req.method==='POST'&&pathname==='/api/outbox/remove'){
   if(busy||startingOutbox)throw fail(409,'Não altere a fila enquanto estiver enviando.');
   const b=await body(req,2000);const i=outbox.findIndex(x=>x.id===b.id);
   if(i<0)throw fail(404,'Item da fila não encontrado.');
   const removed=outbox.splice(i,1)[0];updateOutbox();audit('carga_removida_da_fila',{id:removed.id,status:removed.status});
   return json(res,200,{removedId:removed.id});
  }
  if(req.method==='POST'&&pathname==='/api/outbox/clear'){
   if(busy||startingOutbox)throw fail(409,'Não limpe a fila durante envios.');
   const count=clearCompleted(outbox);updateOutbox();return json(res,200,{removed:count});
  }
  if(req.method==='POST'&&pathname==='/api/outbox/cancel'){
   if(!busy||!activeBatchId)throw fail(409,'Não há lote de publicações ativo.');
   const b=await body(req,2000);if(b.batchId!==activeBatchId)throw fail(409,'Identificador do lote divergente.');
   cancelActiveJob=true;audit('lote_cancelamento_solicitado',{batchId:activeBatchId});
   return json(res,202,{ok:true,message:'Interrupção solicitada. O envio em andamento pode ser concluído.'});
  }
  if(req.method==='POST'&&pathname==='/api/outbox/start'){
   if(busy||startingOutbox)throw fail(409,'Já existe um envio ativo.');
   if(uncertainSendBlock)throw fail(409,'Envio anterior com resultado incerto. Confira no WhatsApp e reinicie antes de outro lote.');
   startingOutbox=true;
   let ids, knownGroups, repeat=false;
   try{
    const request=await body(req,2000);
    repeat=request.repeat===true;
    if(request.repeat!==undefined && !repeat)throw fail(422,'Solicitação de repetição inválida.');
    if(repeat && request.confirm!=='REPETIR FILA')throw fail(422,'Confirme o reenvio da fila completa.');
    if(mode==='real'&&!bridge.publicStatus().connected)throw fail(409,'Conecte o WhatsApp antes de enviar.');
    if(repeat){
     if(!outbox.length||outbox.some(item=>!REPEATABLE_STATUSES.has(item.status)))
      throw fail(422,'A fila contém cargas pendentes, interrompidas ou a revisar. Conclua ou revise antes de repetir todas.');
     // Validar toda a rodada antes de alterar o estado de qualquer imagem.
     for(const item of outbox){const image=imageRecord(item.imageId);if(!fs.existsSync(path.join(DIR.images,image.file)))throw fail(409,'Uma imagem salva não está mais disponível. Reimporte antes de reenviar.');}
     knownGroups=await bridge.groups();
     ids=prepareRepeat(outbox,knownGroups);
     updateOutbox();
     audit('lote_reutilizado',{items:ids.length,groups:outbox.reduce((n,x)=>n+x.groupIds.length,0)});
    }else{
     ids=batchSnapshot(outbox);
     if(!ids.length)throw fail(422,'Não há cargas pendentes. Use Reenviar fila salva para uma nova rodada.');
    }
    busy=true;cancelActiveJob=false;lastBatchError=null;activeBatchId=randomUUID();
   }finally{startingOutbox=false;}
   const batchId=activeBatchId;
   audit('lote_iniciado',{batchId,items:ids.length,repeat});
   void (async()=>{
    try{
     knownGroups=knownGroups||await bridge.groups();
     const groupNames=new Map(knownGroups.map(g=>[g.id,g.name]));
     for(const id of ids){
      if(cancelActiveJob||serverShuttingDown)break;
      const item=outbox.find(x=>x.id===id);
      if(!item||item.status!=='pendente')continue;
      if(item.groupIds.some(groupId=>!groupNames.has(groupId))){
       item.status='revisar_manualmente';item.error='Um ou mais grupos não estão disponíveis. Atualize os grupos antes de criar uma nova carga.';
       item.finishedAt=new Date().toISOString();updateOutbox();break;
      }
      const image=imageRecord(item.imageId);
      item.status='em_andamento';item.startedAt=new Date().toISOString();updateOutbox();
      const job={id:randomUUID(),requestId:item.requestId,mode,status:'em_andamento',createdAt:new Date().toISOString(),
       origin:item.origin,destination:item.destination,vehicle:item.vehicle,imageId:image.id,groupIds:item.groupIds,
       progress:{done:0,total:item.groupIds.length},results:[]};
      activeJobId=job.id;item.jobId=job.id;addJobs(job);
      audit('lote_carga_iniciada',{batchId,itemId:item.id,jobId:job.id,groupCount:item.groupIds.length});
      try{
       const outcome=await processPublicationQueue({job,record:{...item,imagePath:path.join(DIR.images,image.file)},bridge,
        groupNames,isCancelRequested:()=>cancelActiveJob||serverShuttingDown,
        afterGroup:async(j,result)=>{item.progress={...j.progress};item.results=[...j.results];updateJobs();updateOutbox();audit('envio_lote_grupo',{batchId,itemId:item.id,groupId:result.groupId,status:result.status});}
       });
       item.status=job.status;item.results=[...job.results];item.progress={...job.progress};item.finishedAt=job.finishedAt;
       if(REPEATABLE_STATUSES.has(job.status)){item.sendCount=(Number.isInteger(item.sendCount)?item.sendCount:0)+1;item.lastSentAt=job.finishedAt;}
       if(outcome.timedOut){uncertainSendBlock=true;audit('lote_timeout_incertissimo',{batchId,itemId:item.id});}
       if(outcome.uncertain||job.status==='revisar_manualmente'){
        updateJobs();updateOutbox();break;
       }
      }catch(e){job.status='revisar_manualmente';item.status='revisar_manualmente';item.error=String(e.message||e).slice(0,300);job.error=item.error;break;}
      finally{updateJobs();updateOutbox();activeJobId=null;}
     }
    }catch(e){lastBatchError=String(e.message||e).slice(0,300);audit('lote_falha_interna',{batchId,error:lastBatchError});}
    finally{audit('lote_finalizado',{batchId,cancelled:cancelActiveJob});busy=false;activeJobId=null;activeBatchId=null;cancelActiveJob=false;updateOutbox();}
   })();
   return json(res,202,{batchId,items:ids.length});
  }
  if(req.method==='POST'&&pathname==='/api/cancel'){
   const b=await body(req,2000);
   if(!busy||!activeJobId||b.jobId!==activeJobId)throw fail(409,'Não há fila ativa com esse identificador.');
   cancelActiveJob=true;audit('envio_cancelamento_solicitado',{jobId:activeJobId});
   return json(res,202,{ok:true,jobId:activeJobId,message:'Cancelamento solicitado. A mensagem em curso pode ainda ser submetida.'});
  }
  if(req.method==='POST'&&pathname==='/api/send'){
   if(busy||startingOutbox)throw fail(409,'Já existe uma fila de envio em andamento.');
   if(uncertainSendBlock)throw fail(409,'Bloqueado após timeout incerto. Verifique no WhatsApp e reinicie o servidor antes de uma nova publicação.');
   const b=await body(req,24_000);
   if(busy||startingOutbox)throw fail(409,'Já existe uma fila de envio em andamento.');
   const record=validateSend(b,images,lastGroups);
   const existing=jobs.find(j=>j.requestId===record.requestId);
   if(clearedRequestIds.has(record.requestId))throw fail(409,'Esta tentativa já foi publicada anteriormente. Confira o WhatsApp antes de repetir.');
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
 console.log(`ALATUS v0.7 - MODO ${mode.toUpperCase()} | http://${host}:${port}`);
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
