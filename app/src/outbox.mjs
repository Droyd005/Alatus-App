// A fila de publicações guarda um registro independente por arte.
// Não retoma envios automaticamente após falhas/reinício; não repete tentativas ambíguas.
import {randomUUID} from 'node:crypto';

export const MAX_OUTBOX_ITEMS = 100;
export const FINISHED_STATUSES = new Set(['simulado','submetido','interrompido_pelo_usuario']);
export function enqueueItem(record, items, groups, jobs=[]){
 if(items.length>=MAX_OUTBOX_ITEMS)throw Object.assign(new Error('Fila cheia. Remova registros finalizados antes de incluir novas cargas.'),{status:422});
 if(items.some(x=>x.requestId===record.requestId)||jobs.some(x=>x.requestId===record.requestId))throw Object.assign(new Error('Esta carga já foi adicionada ou enviada. Confira a fila antes de repetir.'),{status:409});
 const names=new Map(groups.map(x=>[x.id,x.name]));
 const item={id:randomUUID(),requestId:record.requestId,status:'pendente',createdAt:new Date().toISOString(),
  imageId:record.image.id,origin:record.origin,destination:record.destination,vehicle:record.vehicle,
  caption:record.caption,groupIds:[...record.groupIds],groupNames:record.groupIds.map(id=>names.get(id)||id),
  progress:{done:0,total:record.groupIds.length},results:[]};
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
