// A fila de publicações guarda um registro independente por arte.
// Não retoma envios automaticamente após falhas/reinício; não repete tentativas ambíguas.
import {randomUUID} from 'node:crypto';

export const MAX_OUTBOX_ITEMS = 100;
export const FINISHED_STATUSES = new Set(['simulado','submetido','interrompido_pelo_usuario']);
export const REPEATABLE_STATUSES = new Set(['simulado','submetido','parcial_revisao']);
// Grupos com tentativa incerta continuam registrados, mas nao entram nas proximas rodadas.
export function activeGroupIds(item){
 const excluded=new Set(item.quarantinedGroupIds||[]);
 return (item.groupIds||[]).filter(id=>!excluded.has(id));
}
export function enqueueItem(record, items, groups, jobs=[]){
 if(items.length>=MAX_OUTBOX_ITEMS)throw Object.assign(new Error('Fila cheia. Remova registros finalizados antes de incluir novas cargas.'),{status:422});
 if(items.some(x=>x.requestId===record.requestId)||jobs.some(x=>x.requestId===record.requestId))throw Object.assign(new Error('Esta carga já foi adicionada ou enviada. Confira a fila antes de repetir.'),{status:409});
 const names=new Map(groups.map(x=>[x.id,x.name]));
 const item={id:randomUUID(),requestId:record.requestId,status:'pendente',createdAt:new Date().toISOString(),
  imageId:record.image.id,origin:record.origin,destination:record.destination,vehicle:record.vehicle,weight:record.weight||'',
  caption:record.caption,groupIds:[...record.groupIds],groupNames:record.groupIds.map(id=>names.get(id)||id),
  progress:{done:0,total:record.groupIds.length},results:[],sendCount:0,lastSentAt:null};
 items.push(item);
 return item;
}
export function recoverOutbox(items){
 let changed=false;
 for(const item of items){
  if(item.status==='em_andamento'){
   item.status='revisar_manualmente';item.error='Aplicativo encerrado durante o envio. Confira o WhatsApp antes de repetir.';
   item.interruptedAt=new Date().toISOString();changed=true;
  }
 }
 return changed;
}
export function batchSnapshot(items){return items.filter(x=>x.status==='pendente').map(x=>x.id);}
export function clearCompleted(items){
 const before=items.length;
 for(let i=items.length-1;i>=0;i--)if(FINISHED_STATUSES.has(items[i].status))items.splice(i,1);
 return before-items.length;
}

// Só prepara novo envio após ação explícita do operador. Jamais repete resultados
// incertos ou cargas pendentes; conserva os cadastros e separa os IDs das tentativas.
export function prepareRepeat(items, groups) {
 if(!items.length || items.some(x=>!REPEATABLE_STATUSES.has(x.status)))
  throw Object.assign(new Error('Conclua ou revise todas as cargas antes de reenviar a fila completa.'),{status:422});
 const names=new Map(groups.map(x=>[x.id,x.name]));
 if(items.some(item=>!activeGroupIds(item).length || activeGroupIds(item).some(id=>!names.has(id))))
  throw Object.assign(new Error('Alguns grupos não estão disponíveis no WhatsApp atual. Revise a seleção antes de reenviar.'),{status:409});
 for(const item of items){
  // Versões anteriores não armazenavam a quantidade de envios.
  if(!Number.isInteger(item.sendCount)||item.sendCount===0)item.sendCount=1;
  if(!item.lastSentAt)item.lastSentAt=item.finishedAt||null;
  item.requestId=randomUUID();
  item.status='pendente';
  item.groupNames=item.groupIds.map((id,i)=>names.get(id)||item.groupNames?.[i]||id);
  item.progress={done:0,total:activeGroupIds(item).length};
  item.results=[];
  delete item.jobId;delete item.startedAt;delete item.finishedAt;
  if(!item.quarantinedGroupIds?.length)delete item.error;
  delete item.interruptedAt;
 }
 return items.map(x=>x.id);
}
