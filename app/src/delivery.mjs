// Identificadores do Baileys nao comprovam entrega. Atualizacoes de status sao passivas.
const codes={0:['falhou',100],1:['aguardando_servidor',1],2:['confirmado_servidor',2],3:['entrega_dispositivo',3],4:['lido',4],5:['reproduzido',5]};
export function createDeliveryTracker({onChange=()=>{},maxEntries=5000,now=Date.now}={}){
 const items=new Map();
 const key=(gid,id)=>`${gid}\u0000${id}`;
 function observe(groupId,messageId,status){
  if(typeof groupId!=='string'||!groupId.endsWith('@g.us')||typeof messageId!=='string'||!messageId)return null;
  if(!Number.isInteger(status)||!Object.hasOwn(codes,status))return null;
  const k=key(groupId,messageId),previous=items.get(k),[state,rank]=codes[status];
  if(previous&&previous.rank>=rank)return previous;
  const value={groupId,messageId,deliveryStatus:state,deliveryCode:status,deliveryAt:new Date(now()).toISOString(),rank};
  items.delete(k);items.set(k,value);
  while(items.size>maxEntries)items.delete(items.keys().next().value);
  onChange({...value});
  return value;
 }
 function get(groupId,messageId){return items.get(key(groupId,messageId))||null;}
 function clear(){items.clear();}
 return {observe,get,clear,size:()=>items.size};
}
