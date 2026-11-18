import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createMediaUploadCache} from '../src/media-cache.mjs';
import {WhatsAppBridge} from '../src/wa.mjs';
import {DIR} from '../src/core.mjs';
import {processPublicationQueue} from '../src/queue.mjs';

test('cache expira, limita entradas e não permite modificar resposta anterior',()=>{
 let clock=1;
 const cache=createMediaUploadCache({maxEntries:2,ttlMs:50,now:()=>clock});
 cache.set('image:A',Buffer.from('a'));
 const a=cache.get('image:A');a[0]=98;
 assert.equal(cache.get('image:A').toString(),'a');
 cache.set('image:B',Buffer.from('b'));
 cache.set('image:C',Buffer.from('c'));
 assert.equal(cache.get('image:A'),undefined);
 assert.equal(cache.snapshot().entries,2);
 clock+=100;
 assert.equal(cache.get('image:B'),undefined);
 cache.clear();assert.equal(cache.snapshot().entries,0);
});

test('96 envios, 8 imagens diferentes: apenas 8 uploads de mídia; sem paralelismo',async()=>{
 const base=mkdtempSync(path.join(os.tmpdir(),'alatus-upload-cache-'));
 const old={...DIR};
 const imageDir=path.join(base,'images','entrada');
 const fs=await import('node:fs');fs.mkdirSync(imageDir,{recursive:true});
 Object.assign(DIR,{data:path.join(base,'data'),session:path.join(base,'data','session'),logs:path.join(base,'logs'),images:imageDir});
 fs.mkdirSync(DIR.logs,{recursive:true});fs.mkdirSync(DIR.session,{recursive:true});
 let uploads=0,transmissions=0,concurrent=0,maxConcurrent=0,config;
 const groups=Array.from({length:12},(_,i)=>`grupo-${i}@g.us`);
 const fakeBaileys={
  default:cfg=>{
   config=cfg;
   return {ev:new EventEmitter(),end:()=>{},groupFetchAllParticipating:async()=>Object.fromEntries(groups.map(x=>[x,{subject:x}])),
    sendMessage:async(jid,content)=>{
     assert.ok(groups.includes(jid));assert.ok(content.image.url);
     concurrent++;maxConcurrent=Math.max(maxConcurrent,concurrent);
     try{
      const key='image:'+content.image.url;
      if(!await config.mediaCache.get(key)){
       uploads++;await config.mediaCache.set(key,Buffer.from('encrypted-metadata'));
      }
      transmissions++;
      return {key:{id:String(transmissions)}};
     }finally{concurrent--;}
    }};
  },useMultiFileAuthState:async()=>({state:{creds:{}},saveCreds:async()=>{}})
 };
 const bridge=new WhatsAppBridge('real',{baileys:fakeBaileys,pino:{default:()=>({})}});
 try{
  await bridge.connect();bridge.status='conectado';await bridge.groups();
  for(let i=0;i<8;i++){
   const imagePath=path.join(imageDir,`carga-${i}.png`);
   writeFileSync(imagePath,Buffer.alloc(128,1));
   const args={job:{mode:'real',status:'em_andamento',results:[]},
    record:{imagePath,caption:'Legenda de teste',groupIds:groups},bridge,
    groupNames:new Map(groups.map(id=>[id,id]))};
   await processPublicationQueue(args);
   assert.equal(args.job.status,'submetido');assert.equal(args.job.results.length,12);
   assert.ok(args.job.results.every(x=>x.elapsedMs>=0));
  }
  assert.equal(transmissions,96);assert.equal(uploads,8);
  assert.equal(maxConcurrent,1);
  assert.ok(config.mediaCache.snapshot().hits>=88);
  assert.ok(config.mediaCache.snapshot().misses>=8);
  await bridge.connect({restart:true});
  assert.equal(config.mediaCache.snapshot().entries,0,'Reiniciar conexão descarta metadados de mídia');
 } finally {await bridge.shutdown();Object.assign(DIR,old);rmSync(base,{recursive:true,force:true});}
});
