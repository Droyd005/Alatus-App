import {setTimeout as delay} from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import {DIR, audit} from './core.mjs';

// 515 (restartRequired) é normal após ler um QR no Baileys.
// O pareamento somente termina após abrir um NOVO socket com credenciais persistidas.
export const LOGIN_RESTART_CODE = 515;
export const LOGGED_OUT_CODE = 401;
const RETRY_DELAYS = [1200, 2500, 5000, 10000, 20000];

export function connectionPlan(code, attempt) {
 if(Number(code)===LOGGED_OUT_CODE)return {retry:false,reason:'logged_out',delay:0};
 if(Number(code)===LOGIN_RESTART_CODE) {
  return attempt<RETRY_DELAYS.length?{retry:true,reason:'restart_required',delay:700}:{retry:false,reason:'too_many_restarts',delay:0};
 }
 const transient=new Set([408, 428, 503, 504, 499]);
 if((code==null||transient.has(Number(code)))&&attempt<RETRY_DELAYS.length){
  return {retry:true,reason:'temporary_failure',delay:RETRY_DELAYS[attempt]};
 }
 return {retry:false,reason:'manual_check',delay:0};
}

export class WhatsAppBridge {
 constructor(mode='simulacao', dependencies={}) {
  this.mode=mode;this.status=mode==='simulacao'?'simulacao':'desconectado';
  this.qr=null;this.qrCreatedAt=null;this.lastError=null;this.socket=null;
  this.startPromise=null;this.generation=0;this.lastGroups=[];this.retries=0;
  this.retryTimer=null;this.credentialFlush=Promise.resolve();
  this.lastDisconnectCode=null;this.dependencies=dependencies;
  this.shuttingDown=false;this.groupMetadata=new Map();
 }
 publicStatus() {return {mode:this.mode,status:this.status,qr:this.qr,qrCreatedAt:this.qrCreatedAt,lastError:this.lastError,connected:this.status==='conectado',groupsLoaded:this.lastGroups.length,reconnectAttempt:this.retries,lastDisconnectCode:this.lastDisconnectCode};}
 _clearTimer() {if(this.retryTimer!==null){clearTimeout(this.retryTimer);this.retryTimer=null;}}
 _closeSocket() {
  const previous=this.socket;this.socket=null;
  if(previous&&typeof previous.end==='function') {
   try { previous.end(new Error('Conexão reiniciada pelo painel')); } catch(e) {audit('socket_fechamento_erro',{message:e.message});}
  }
 }
 async connect({restart=false}={}) {
  if(this.mode==='simulacao')return this.publicStatus();
  if(this.shuttingDown)throw new Error('Aplicativo encerrando.');
  if(this.startPromise)await this.startPromise;
  if(restart) {
   this._clearTimer();++this.generation;this._closeSocket();
   this.lastGroups=[];this.qr=null;this.qrCreatedAt=null;this.retries=0;
   this.status='reiniciando';this.lastError=null;
   try {await this.credentialFlush;}catch{} // não descartar credenciais após QR
  } else if(this.socket||this.retryTimer)return this.publicStatus();
  this.startPromise=this._start().catch(e=>{
   this.lastError=`Não foi possível abrir o WhatsApp: ${e.message}`;
   this.status='erro';audit('conexao_erro',{error:e.message});
  }).finally(()=>{this.startPromise=null;});
  await this.startPromise;
  return this.publicStatus();
 }
 async _start() {
  const mod=this.dependencies.baileys||await import('baileys').catch(()=>{throw new Error('Baileys não instalado. Execute instalar-dependencias.ps1.');});
  const pinoMod=this.dependencies.pino||await import('pino').catch(()=>{throw new Error('Pino não instalado. Execute instalar-dependencias.ps1.');});
  const makeWASocket=mod.default;
  const {useMultiFileAuthState}=mod;
  if(typeof makeWASocket!=='function'||typeof useMultiFileAuthState!=='function')throw new Error('API Baileys incompatível; confira a versão declarada no package.json.');
  const {state,saveCreds}=await useMultiFileAuthState(DIR.session);
  const generation=++this.generation;
  const socket=makeWASocket({
   auth:state,logger:pinoMod.default({level:'silent'}),markOnlineOnConnect:false,syncFullHistory:false,
   // Evita buscar novamente a lista de participantes a cada mensagem.
   cachedGroupMetadata:async jid=>{
    const cached=this.groupMetadata.get(jid);
    return cached&&Date.now()-cached.time<10*60_000?cached.metadata:undefined;
   }
  });
  this.socket=socket;this.qr=null;this.qrCreatedAt=null;this.status='conectando';
  socket.ev.on('creds.update',()=>{
   if(generation!==this.generation)return;
   this.credentialFlush=this.credentialFlush.catch(()=>{}).then(()=>saveCreds());
   this.credentialFlush.catch(e=>{this.lastError='Falha ao salvar sessão em Z:. Verifique permissões do disco.';audit('credenciais_erro',{error:e.message});});
  });
  socket.ev.on('connection.update',update=>{void this._handleUpdate(generation,update).catch(e=>{
   if(generation!==this.generation)return;
   this.status='erro';this.lastError=`Erro de conexão: ${e.message}`;audit('connection_update_erro',{error:e.message});
  });});
  audit('whatsapp_socket_iniciado',{generation});
 }
 async _handleUpdate(generation,{connection,lastDisconnect,qr,isNewLogin}={}) {
  if(generation!==this.generation||this.shuttingDown)return;
  if(qr){
   try {
    const qrGen=this.dependencies.qrcode||await import('qrcode');
    const image=await qrGen.default.toDataURL(qr,{width:320,margin:2});
    if(generation!==this.generation||!this.socket||this.status==='conectado'||this.status==='finalizando_pareamento')return;
    this.qr=image;this.qrCreatedAt=new Date().toISOString();this.status='aguardando_qr';
    this.lastError=null;audit('whatsapp_qr_gerado');
   }catch(e){this.status='erro';this.lastError='Não foi possível criar o QR Code. Verifique o pacote qrcode.';audit('qr_erro',{error:e.message});}
  }
  if(isNewLogin){this.status='finalizando_pareamento';this.qr=null;this.qrCreatedAt=null;audit('whatsapp_qr_lido');}
  if(connection==='open'){
   this._clearTimer();this.status='conectado';this.qr=null;this.qrCreatedAt=null;
   this.lastError=null;this.retries=0;this.lastDisconnectCode=null;audit('whatsapp_conectado');
  }
  if(connection==='close'){
   this.socket=null;this.qr=null;this.qrCreatedAt=null;this.lastGroups=[];this.groupMetadata.clear();
   const code=lastDisconnect?.error?.output?.statusCode??null;
   this.lastDisconnectCode=code;
   const plan=connectionPlan(code,this.retries);
   audit('whatsapp_desconectado',{code,reason:plan.reason,retries:this.retries});
   if(!plan.retry){
    this.status=plan.reason==='logged_out'?'sessao_encerrada':'erro';
    this.lastError=plan.reason==='logged_out'?'Sessão expirada ou removida (401). Para novo QR, use Redefinir sessão.':`Conexão encerrada (${code??'sem código'}). Reinicie pelo botão; consulte o diagnóstico R03.`;
    return;
   }
   this.retries++;
   this.status=plan.reason==='restart_required'?'finalizando_pareamento':'reconectando';
   this.lastError=plan.reason==='restart_required'?'QR lido. Finalizando pareamento e reconectando automaticamente (515)…':`Conexão interrompida (${code??'sem código'}). Tentativa ${this.retries}/${RETRY_DELAYS.length}.`;
   this._clearTimer();
   this.retryTimer=setTimeout(()=>{this.retryTimer=null;void this._reconnectAfterClose(generation);},plan.delay);
   this.retryTimer.unref?.();
  }
 }
 async _reconnectAfterClose(generation){
  if(generation!==this.generation||this.shuttingDown)return;
  try {await this.credentialFlush;}catch{}
  if(generation!==this.generation)return;
  // Neste ponto o socket antigo está fechado; abrir novo socket NÃO desloga a conta.
  await this.connect();
 }
 async resetSession() {
  if(this.mode!=='real')throw new Error('Redefinição disponível somente no modo real.');
  if(this.startPromise)await this.startPromise;
  this._clearTimer();++this.generation;this._closeSocket();
  try {await this.credentialFlush;}catch{}
  const backup=path.join(DIR.data,'session-backup-'+new Date().toISOString().replace(/[:.]/g,'-'));
  if(fs.existsSync(DIR.session))fs.renameSync(DIR.session,backup);
  fs.mkdirSync(DIR.session,{recursive:true});
  this.retries=0;this.lastGroups=[];this.qr=null;this.qrCreatedAt=null;this.lastError=null;this.status='desconectado';
  audit('whatsapp_sessao_redefinida',{backupCreated:fs.existsSync(backup)});
  return this.connect();
 }
 async groups() {
  if(this.mode==='simulacao')return [{id:'teste-alatus@g.us',name:'ALATUS | Grupo de teste (SIMULADO)',demo:true},{id:'teste-parceiros@g.us',name:'Parceiros | Grupo de teste (SIMULADO)',demo:true}];
  if(this.status!=='conectado'||!this.socket)throw new Error('Conecte o WhatsApp primeiro.');
  const raw=await this.socket.groupFetchAllParticipating();
  this.groupMetadata=new Map(Object.entries(raw).map(([jid,metadata])=>[jid,{metadata,time:Date.now()}]));
  const groups=Object.entries(raw).filter(([jid,g])=>jid.endsWith('@g.us')&&!g.isCommunityAnnounce).map(([jid,g])=>({id:jid,name:g.subject||'Grupo sem nome',demo:false})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  this.lastGroups=groups;return groups;
 }
 async prepareImage(imagePath){
  if(this.mode==='simulacao')return imagePath;
  const buffer=await fs.promises.readFile(imagePath);
  if(buffer.length<16||buffer.length>8_000_000)throw new Error('Imagem fora do limite para envio.');
  return buffer;
 }
 async shutdown(){
  // Não excluir a sessão. Ao reabrir, as credenciais salvas serão reutilizadas.
  this.shuttingDown=true;this._clearTimer();++this.generation;
  try {await this.credentialFlush;}catch(e){audit('credenciais_flush_erro',{error:e.message});}
  this._closeSocket();this.groupMetadata.clear();this.lastGroups=[];
  this.qr=null;this.qrCreatedAt=null;this.status='desconectado';
  audit('whatsapp_desconectado_ao_fechar');
 }
 async send(groupId,imagePath,caption) {
  if(this.mode==='simulacao'){await delay(50);return {simulated:true,messageId:`sim-${Date.now()}`};}
  if(this.status!=='conectado'||!this.socket)throw new Error('WhatsApp desconectado antes de enviar.');
  if(!this.lastGroups.some(g=>g.id===groupId))throw new Error('Grupo não consta na lista verificada pelo WhatsApp.');
  const image=Buffer.isBuffer(imagePath)?imagePath:{url:imagePath};
  const result=await this.socket.sendMessage(groupId,{image,caption});
  if(!result?.key?.id)throw new Error('WhatsApp não retornou identificador da mensagem. Resultado incerto.');
  return {simulated:false,messageId:result.key.id};
 }
}
