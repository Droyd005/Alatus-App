// Envio concorrente limitado, sem disparo irrestrito ou repeticao apos erro incerto.
// Cada grupo recebe uma unica tentativa por rodada e toda tentativa e registrada.
import {performance} from 'node:perf_hooks';
export const MAX_CONCURRENT_GROUPS = 3;

export async function processPublicationQueue({job,record,bridge,groupNames,afterGroup=()=>{},timeoutMs=45000,isCancelRequested=()=>false,concurrency=3}){
 const ids=record.groupIds;
 job.progress={done:0,total:ids.length};
 let uncertain=false,timedOut=false,notSubmitted=false,next=0;
 let media=record.imagePath;
 if(typeof bridge.prepareImage==='function'){
  try{media=await bridge.prepareImage(record.imagePath);}catch(e){
   job.status='revisar_manualmente';job.error='Nao foi possivel preparar imagem: '+String(e.message||e);
   job.finishedAt=new Date().toISOString();job.unsentGroupIds=[...ids];
   return {uncertain:true,timedOut:false};
  }
 }
 const results=new Array(ids.length);
 const workers=Math.max(1,Math.min(MAX_CONCURRENT_GROUPS,Math.trunc(Number(concurrency)||1),ids.length));
 async function worker(onlyOne=false){
  while(!uncertain&&!notSubmitted&&!isCancelRequested()){
   const i=next++;
   if(i>=ids.length)return;
   const id=ids[i],name=groupNames.get(id)||id;
   const sentAt=performance.now();let timer,hadTimeout=false,result;
   try{
    const sent=await Promise.race([
     bridge.send(id,media,record.caption),
     new Promise((_,reject)=>{timer=setTimeout(()=>{hadTimeout=true;reject(new Error('Tempo limite de envio. Resultado incerto; confira o grupo antes de repetir.'));},timeoutMs);})
    ]);
    if(!sent?.messageId && !sent?.simulated)throw new Error('Nao foi possivel confirmar o identificador da tentativa.');
    result={groupId:id,groupName:name,status:sent.simulated?'simulado':'submetido',messageId:sent.messageId,elapsedMs:Math.round(performance.now()-sentAt),submittedAt:new Date().toISOString(),deliveryStatus:sent.simulated?'simulado':'aguardando_servidor'};
   }catch(e){
    if(e?.notSubmitted===true){
     notSubmitted=true;
     result={groupId:id,groupName:name,status:'nao_enviado',error:String(e.message||e).slice(0,350),elapsedMs:Math.round(performance.now()-sentAt)};
    }else{
     uncertain=true;timedOut=timedOut||hadTimeout;
     result={groupId:id,groupName:name,status:'incerto',error:String(e.message||e).slice(0,350),elapsedMs:Math.round(performance.now()-sentAt)};
    }
   }finally{clearTimeout(timer);}
   results[i]=result;
   job.results=results.filter(Boolean);
   job.progress.done=job.results.length;
   try{await afterGroup(job,result);}catch(e){
    // Falha ao registrar resultado pode significar perda de durabilidade: nao iniciar novos envios.
    uncertain=true;job.error='Erro ao salvar progresso: '+String(e.message||e).slice(0,250);
   }
   if(onlyOne)return;
  }
 }
 // Primeiro envio isolado: aquece o cache da imagem uma vez antes do paralelismo.
 // Isso evita que grupos concorrentes executem uploads duplicados da mesma foto.
 await worker(true);
 if(!uncertain&&!notSubmitted&&!isCancelRequested())await Promise.all(Array.from({length:workers},()=>worker()));
 job.results=results.filter(Boolean);
 job.progress.done=job.results.length;
 job.unsentGroupIds=ids.filter((_,i)=>!results[i]);
 job.status=uncertain?'revisar_manualmente':isCancelRequested()?'interrompido_pelo_usuario':notSubmitted?'submetido_parcial':job.mode==='simulacao'?'simulado':'submetido';
 job.finishedAt=new Date().toISOString();
 return {uncertain,timedOut,notSubmitted};
}
