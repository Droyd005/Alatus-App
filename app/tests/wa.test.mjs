import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {WhatsAppBridge,connectionPlan} from '../src/wa.mjs';
import {setupDirs} from '../src/core.mjs';
setupDirs();

test('planejador: 515 reconecta; 401 jamais tenta novo QR sozinho',()=>{
 assert.equal(connectionPlan(515,0).reason,'restart_required');
 assert.equal(connectionPlan(515,0).retry,true);
 assert.equal(connectionPlan(401,0).retry,false);
 assert.equal(connectionPlan(515,5).retry,false);
});

test('pareamento: QR, credenciais salvas, 515, novo socket, aberto',async()=>{
 let sockets=[],saved=0;
 const fakeBaileys={
  default:()=>{const s={ev:new EventEmitter(),end:()=>{},groupFetchAllParticipating:async()=>({})};sockets.push(s);return s;},
  useMultiFileAuthState:async()=>({state:{creds:{}},saveCreds:async()=>{saved++;}})
 };
 const bridge=new WhatsAppBridge('real',{baileys:fakeBaileys,pino:{default:()=>({})},qrcode:{default:{toDataURL:async()=>('data:image/png;base64,AA')}}});
 await bridge.connect();assert.equal(sockets.length,1);
 sockets[0].ev.emit('connection.update',{qr:'test-string'});
 await new Promise(r=>setTimeout(r,10));assert.equal(bridge.status,'aguardando_qr');
 sockets[0].ev.emit('creds.update',{});
 sockets[0].ev.emit('connection.update',{isNewLogin:true});
 sockets[0].ev.emit('connection.update',{connection:'close',lastDisconnect:{error:{output:{statusCode:515}}}});
 assert.equal(bridge.status,'finalizando_pareamento');
 await new Promise(r=>setTimeout(r,900));
 assert.equal(sockets.length,2);assert.equal(saved,1);
 sockets[1].ev.emit('connection.update',{connection:'open'});
 assert.equal(bridge.status,'conectado');
 await bridge.connect({restart:true});assert.equal(sockets.length,3);
});
test('D05: encerramento fecha socket sem apagar credenciais e sem reconectar',async()=>{
 let sockets=[],saved=0;
 const fakeBaileys={
  default:cfg=>{const s={config:cfg,ev:new EventEmitter(),end:()=>{s.closed=true;},groupFetchAllParticipating:async()=>({})};sockets.push(s);return s;},
  useMultiFileAuthState:async()=>({state:{creds:{}},saveCreds:async()=>{saved++;}})
 };
 const bridge=new WhatsAppBridge('real',{baileys:fakeBaileys,pino:{default:()=>({})}});
 await bridge.connect();
 sockets[0].ev.emit('creds.update',{});
 sockets[0].ev.emit('connection.update',{connection:'open'});
 await bridge.credentialFlush;
 await bridge.shutdown();
 assert.equal(sockets.length,1);assert.equal(sockets[0].closed,true);assert.equal(saved,1);assert.equal(bridge.status,'desconectado');
 sockets[0].ev.emit('connection.update',{connection:'close',lastDisconnect:{error:{output:{statusCode:515}}}});
 await new Promise(r=>setTimeout(r,800));
 assert.equal(sockets.length,1);
 await assert.rejects(bridge.connect(),/encerrando/);
});
test('otimização: metadata de grupo é consultada do cache recente',async()=>{
 let config;const fakeBaileys={
  default:cfg=>{config=cfg;return {ev:new EventEmitter(),end:()=>{},groupFetchAllParticipating:async()=>({'g1@g.us':{subject:'Grupo 1',participants:[{id:'p@s.whatsapp.net'}]}})}},
  useMultiFileAuthState:async()=>({state:{creds:{}},saveCreds:async()=>{}})
 };
 const bridge=new WhatsAppBridge('real',{baileys:fakeBaileys,pino:{default:()=>({})}});
 await bridge.connect();
 bridge.status='conectado';
 await bridge.groups();
 assert.equal((await config.cachedGroupMetadata('g1@g.us')).subject,'Grupo 1');
 assert.equal(await config.cachedGroupMetadata('missing@g.us'),undefined);
 await bridge.shutdown();
 assert.equal(await config.cachedGroupMetadata('g1@g.us'),undefined);
});


test('trocar número: arquiva credenciais, reinicia com nova sessão e gera novo QR',async()=>{
 const fs=await import('node:fs');
 const os=await import('node:os');
 const path=await import('node:path');
 const {DIR}=await import('../src/core.mjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'alatus-trocar-numero-'));
 const original={...DIR};
 Object.assign(DIR,{data:path.join(root,'data'),session:path.join(root,'data','session'),logs:path.join(root,'logs')});
 try{
  setupDirs();
  const marker=path.join(DIR.session,'creds.json');
  fs.writeFileSync(marker,'{"conta":"antiga"}');
  let sockets=[],initialCreds=[];
  const fakeBaileys={
   default:()=>{const socket={ev:new EventEmitter(),end(){this.closed=true;},user:{id:'5511999999999:1@s.whatsapp.net'}};sockets.push(socket);return socket;},
   useMultiFileAuthState:async folder=>{
    initialCreds.push(fs.existsSync(path.join(folder,'creds.json')));
    return {state:{creds:{}},saveCreds:async()=>{}};
   }
  };
  const bridge=new WhatsAppBridge('real',{baileys:fakeBaileys,pino:{default:()=>({})},qrcode:{default:{toDataURL:async()=>('data:image/png;base64,AA')}}});
  await bridge.connect();
  sockets[0].ev.emit('connection.update',{connection:'open'});
  assert.equal(bridge.publicStatus().connectedNumber,'+5511999999999');
  assert.equal(initialCreds[0],true);
  await bridge.resetSession();
  assert.equal(sockets.length,2);
  assert.equal(sockets[0].closed,true);
  assert.equal(initialCreds[1],false,'A nova conta não pode herdar as credenciais antigas');
  assert.equal(fs.existsSync(marker),false);
  const backups=fs.readdirSync(DIR.data).filter(n=>n.startsWith('session-backup-'));
  assert.equal(backups.length,1);
  assert.equal(fs.readFileSync(path.join(DIR.data,backups[0],'creds.json'),'utf8'),'{"conta":"antiga"}');
  sockets[0].ev.emit('connection.update',{connection:'close',lastDisconnect:{error:{output:{statusCode:515}}}});
  sockets[1].ev.emit('connection.update',{qr:'novo-qr'});
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(bridge.status,'aguardando_qr');
  assert.equal(bridge.publicStatus().qr,'data:image/png;base64,AA');
  await bridge.shutdown();
 }finally{Object.assign(DIR,original);fs.rmSync(root,{recursive:true,force:true});}
});
