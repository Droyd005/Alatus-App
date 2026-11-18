// A fila não tenta contornar limites do WhatsApp e nunca reenvia automaticamente.
// Uma tentativa ambígua interrompe o restante para evitar duplicação.
import {performance} from 'node:perf_hooks';
export async function processPublicationQueue({job,record,bridge,groupNames,afterGroup=()=>{},timeoutMs=45000,isCancelRequested=()=>false}){
 const ids=record.groupIds;
 job.progress={done:0,total:ids.length};
 let uncertain=false, timedOut=false;
 // Pré-carrega a imagem uma só vez (8 MB no máximo); o Baileys ainda gerencia
 // o envio individual. Não há paralelismo nem reenvio automático.
 let media=record.imagePath;
 if(typeof bridge.prepareImage==='function'){
  try {media=await bridge.prepareImage(record.imagePath);}catch(e){
   job.status='revisar_manualmente';job.error='Não foi possível preparar imagem: '+String(e.message||e);
   job.finishedAt=new Date().toISOString();
   return {uncertain:true,timedOut:false};
  }
 }
 for(let i=0;i<ids.length;i++){
  if(isCancelRequested())break;
  // Não aguarda intervalo artificial: só prossegue quando o envio anterior termina.
  const id=ids[i],name=groupNames.get(id)||id;
  let timer,hadTimeout=false;const sentAt=performance.now();
  try{
   // sendMessage não expõe cancelamento confiável. Em timeout, o resultado é incerto.
   const result=await Promise.race([
    bridge.send(id,media,record.caption),
    new Promise((_,reject)=>{timer=setTimeout(()=>{hadTimeout=true;reject(new Error('Tempo limite de envio. Resultado incerto; confira o grupo antes de repetir.'));},timeoutMs);})
   ]);
   job.results.push({groupId:id,groupName:name,status:result.simulated?'simulado':'submetido',messageId:result.messageId,elapsedMs:Math.round(performance.now()-sentAt)});
  }catch(e){
   uncertain=true;timedOut=hadTimeout;
   job.results.push({groupId:id,groupName:name,status:'incerto',error:String(e.message||e).slice(0,350),elapsedMs:Math.round(performance.now()-sentAt)});
  }finally{
   clearTimeout(timer);job.progress.done=job.results.length;
   await afterGroup(job,job.results[job.results.length-1]);
  }
  if(uncertain)break;
 }
 job.status=uncertain?'revisar_manualmente':isCancelRequested()?'interrompido_pelo_usuario':job.mode==='simulacao'?'simulado':'submetido';
 job.finishedAt=new Date().toISOString();
 return {uncertain,timedOut};
}
