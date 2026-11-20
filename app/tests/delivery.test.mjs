import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createDeliveryTracker} from '../src/delivery.mjs';
import {WhatsAppBridge} from '../src/wa.mjs';

const group='equipe@g.us';
test('ID gerado não equivale a confirmação do servidor, entregue ou lido',()=>{
 const updates=[];const tracker=createDeliveryTracker({onChange:x=>updates.push(x)});
 let x=tracker.observe(group,'msg-001',1);
 assert.equal(x.deliveryStatus,'aguardando_servidor');
 x=tracker.observe(group,'msg-001',2);assert.equal(x.deliveryStatus,'confirmado_servidor');
 x=tracker.observe(group,'msg-001',3);assert.equal(x.deliveryStatus,'entrega_dispositivo');
 x=tracker.observe(group,'msg-001',4);assert.equal(x.deliveryStatus,'lido');
 tracker.observe(group,'msg-001',1);assert.equal(updates.length,4,'Não regride nem duplica estados');
 assert.equal(tracker.get(group,'msg-001').deliveryStatus,'lido');
 assert.equal(tracker.get(group,'msg-inexistente'),null);
});
test('falha tardia vence ACK, mas não inicia nova tentativa',()=>{
 let transitions=0;const tracker=createDeliveryTracker({onChange:()=>transitions++});
 tracker.observe(group,'msg-err',2);
 tracker.observe(group,'msg-err',0);
 tracker.observe(group,'msg-err',3);
 assert.equal(tracker.get(group,'msg-err').deliveryStatus,'falhou');
 assert.equal(transitions,2);
 assert.equal(tracker.observe(group,'msg-err',undefined),null);
 assert.equal(tracker.observe('outro@s.whatsapp.net','msg-err',4),null);
});
test('cache de confirmação é limitado e pode ser limpo sem tocar credenciais',()=>{
 const tracker=createDeliveryTracker({maxEntries:2});
 for(let n=0;n<4;n++)tracker.observe(group,'msg-'+n,2);
 assert.equal(tracker.size(),2);assert.equal(tracker.get(group,'msg-0'),null);
 tracker.clear();assert.equal(tracker.size(),0);
});
test('Baileys: submissão, ACK atrasado, recebimento parcial e reinício',async()=>{
 const sockets=[];
 const fakeBaileys={
  default:()=>{const sock={ev:new EventEmitter(),end:()=>{},groupFetchAllParticipating:async()=>({[group]:{subject:'Equipe'}}),
   sendMessage:async()=>({key:{id:'msg-verify',remoteJid:group},status:1})};sockets.push(sock);return sock;},
  useMultiFileAuthState:async()=>({state:{creds:{}},saveCreds:async()=>{}})
 };
 const events=[];
 const bridge=new WhatsAppBridge('real',{baileys:fakeBaileys,pino:{default:()=>({})}});
 bridge.onDeliveryUpdate=x=>events.push(x);
 try{
  await bridge.connect();bridge.status='conectado';await bridge.groups();
  const r=await bridge.send(group,Buffer.from('mock-media'),'');
  assert.equal(r.deliveryStatus,'aguardando_servidor');
  sockets[0].ev.emit('messages.update',[{key:{id:'msg-verify',remoteJid:group,fromMe:true},update:{status:2}}]);
  assert.equal(bridge.getDeliveryStatus(group,r.messageId).deliveryStatus,'confirmado_servidor');
  sockets[0].ev.emit('message-receipt.update',[{key:{id:'msg-verify',remoteJid:group,fromMe:true},receipt:{receiptTimestamp:456}}]);
  assert.equal(bridge.getDeliveryStatus(group,r.messageId).deliveryStatus,'entrega_dispositivo');
  sockets[0].ev.emit('messages.update',[{key:{id:'msg-verify',remoteJid:group,fromMe:false},update:{status:4}}]);
  assert.equal(bridge.getDeliveryStatus(group,r.messageId).deliveryStatus,'entrega_dispositivo','Ignora status de terceiros');
  assert.deepEqual(events.map(x=>x.deliveryCode),[1,2,3]);
  await bridge.connect({restart:true});assert.equal(bridge.getDeliveryStatus(group,'msg-verify'),null);
  sockets[0].ev.emit('messages.update',[{key:{id:'msg-verify',remoteJid:group,fromMe:true},update:{status:4}}]);
  assert.equal(bridge.getDeliveryStatus(group,'msg-verify'),null,'ACK de socket antigo é ignorado');
 }finally{await bridge.shutdown();}
});
test('ACK chega antes de sendMessage resolver e não pode voltar a pendente',async()=>{
 let sock;
 const mock={default:()=>{sock={ev:new EventEmitter(),end:()=>{},groupFetchAllParticipating:async()=>({[group]:{subject:'Equipe'}}),
  sendMessage:async()=>{sock.ev.emit('messages.update',[{key:{id:'early',remoteJid:group,fromMe:true},update:{status:2}}]);return {key:{id:'early'},status:1};}};return sock;},
  useMultiFileAuthState:async()=>({state:{creds:{}},saveCreds:async()=>{}})};
 const bridge=new WhatsAppBridge('real',{baileys:mock,pino:{default:()=>({})}});
 try{await bridge.connect();bridge.status='conectado';await bridge.groups();
  const result=await bridge.send(group,Buffer.from('media'),'');
  assert.equal(result.deliveryStatus,'confirmado_servidor');
  assert.equal(bridge.getDeliveryStatus(group,'early').deliveryCode,2);
 }finally{await bridge.shutdown();}
});
