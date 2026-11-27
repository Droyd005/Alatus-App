// Uma falha de entrega confirmada pode gerar uma nova tentativa somente para o grupo afetado.
// Eventos antigos, envio incerto e ACK pendente jamais autorizam repeticao automatica.
export function markAttemptAccepted(item,groupId,messageId,deliveryStatus){
 if(!item?.groupIds?.includes(groupId)||typeof messageId!=='string'||!messageId)return false;
 item.latestMessageIds={...(item.latestMessageIds||{}),[groupId]:messageId};
 const pending=new Set(item.retryGroupIds||[]);
 if(deliveryStatus==='falhou')pending.add(groupId);else pending.delete(groupId);
 item.retryGroupIds=[...pending];
 return true;
}
export function markConfirmedFailure(item,groupId,messageId){
 if(!item?.groupIds?.includes(groupId)||item.status==='revisar_manualmente')return false;
 const latest=item.latestMessageIds?.[groupId];
 if(latest&&latest!==messageId)return false;
 const pending=new Set(item.retryGroupIds||[]);
 if(pending.has(groupId))return false;
 pending.add(groupId);item.retryGroupIds=[...pending];return true;
}
export function pendingRecovery(items){
 return items.filter(item=>['submetido','simulado','parcial_revisao'].includes(item.status)&&item.retryGroupIds?.length>0);
}

export function queueDefinitelyUnsent(item,ids){
 if(!item?.groupIds?.length||!Array.isArray(ids))return false;
 const pending=new Set(item.retryGroupIds||[]);
 for(const id of ids)if(item.groupIds.includes(id))pending.add(id);
 if(pending.size===(item.retryGroupIds||[]).length)return false;
 item.retryGroupIds=[...pending];return true;
}
