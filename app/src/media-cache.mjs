// Cache volátil de mídia já criptografada/enviada pelo Baileys.
// Nenhum dado é gravado em disco ou compartilhado entre sessões de WhatsApp.
export function createMediaUploadCache({maxEntries=48, ttlMs=45*60_000, now=Date.now}={}) {
 const entries=new Map();
 const stats={hits:0,misses:0,evictions:0};
 function get(key){
  const record=entries.get(key);
  if(!record){stats.misses++;return undefined;}
  if(record.expiresAt<=now()){
   entries.delete(key);stats.misses++;return undefined;
  }
  entries.delete(key);entries.set(key,record);stats.hits++;
  return Buffer.from(record.value);
 }
 function set(key,value){
  if(typeof key!=='string'||!(value instanceof Uint8Array))return;
  if(entries.has(key))entries.delete(key);
  entries.set(key,{value:Buffer.from(value),expiresAt:now()+ttlMs});
  while(entries.size>maxEntries){
   entries.delete(entries.keys().next().value);stats.evictions++;
  }
 }
 function del(key){entries.delete(key);}
 function clear(){entries.clear();}
 function snapshot(){return {...stats,entries:entries.size};}
 return {get,set,del,clear,snapshot};
}
