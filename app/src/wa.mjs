import {setTimeout as delay} from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import {DIR, audit} from './core.mjs';
import {createMediaUploadCache} from './media-cache.mjs';
import {createDeliveryTracker} from './delivery.mjs';

// 515 (restartRequired) é normal após ler um QR no Baileys.
// O pareamento somente termina após abrir um NOVO socket com credenciais persistidas.
export const LOGIN_RESTART_CODE = 515;
export const LOGGED_OUT_CODE = 401;
// Nao presumir falta de permissao quando o Baileys devolve identificadores LID
// que nao conseguimos comparar com a identidade conectada.
function stableJid(value){
 const match=String(value||'').match(/^([^@:]+)(?::\d+)?@([^@]+)$/);
 return match?`${match[1]}@${match[2]}`:null;
}
export function groupPostingPermission(metadata,identity=[]){
 if(!metadata?.announce)return {status:'permitido',reason:'grupo_aberto'};
 const ownIds=new Set(identity.map(stableJid).filter(Boolean));
 const participant=(metadata.participants||[]).find(p=>
  [p.id,p.phoneNumber,p.lid].map(stableJid).some(id=>id&&ownIds.has(id)));
 if(!participant)return {status:'desconhecido',reason:'identidade_nao_correspondida'};
 const admin=participant.admin==='admin'||participant.admin==='superadmin'||
  participant.isAdmin===true||participant.isSuperAdmin===true;
 return admin?{status:'permitido',reason:'administrador'}:
  {status:'sem_permissao',reason:'somente_administradores'};
}
const RETRY_DELAYS = [1200, 2500, 5000, 10000, 20000];
function phoneFromJid(jid){
 const value=String(jid||'');
 if(!value.endsWith('@s.whatsapp.net'))return null;
 const digits=value.split('@')[0].split(':')[0];
 return /^\d{10,15}$/.test(digits)?'+'+digits:null;
}

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
  this.shuttingDown=false;this.groupMetadata=new Map();this.mediaCache=createMediaUploadCache();
   this.onDeliveryUpdate=null;this.deliveryTracker=createDeliveryTracker({onChange:value=>this.onDeliveryUpdate?.(value)});
 }
 publicStatus() {return {mode:this.mode,status:this.status,qr:this.qr,qrCreatedAt:this.qrCreatedAt,lastError:this.lastError,connected:this.status==='conectado',connectedNumber:this.status==='conectado'?phoneFromJid(this.socket?.user?.id):null,groupsLoaded:this.lastGroups.length,reconnectAttempt:this.retries,lastDisconnectCode:this.lastDisconnectCode};}
 _clearTimer() {if(this.retryTimer!==null){clearTimeout(this.retryTimer);this.retryTimer=null;}}
 _closeSocket() {
  const previous=this.socket;this.socket=null;this.mediaCache.clear();this.deliveryTracker.clear();
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
   // Baileys reusa a mídia já enviada para grupos seguintes e rodadas da mesma sessão.
   mediaCache:this.mediaCache,
   // Evita buscar novamente a lista de participantes a cada mensagem.
   cachedGroupMetadata:async jid=>{
    const cached=this.groupMetadata.get(jid);
    return cached&&Date.now()-cached.time<10*60_000?cached.metadata:undefined;
   }
  });
  this.socket=socket;this.qr=null;this.qrCreatedAt=null;this.status='conectando';
  socket.ev.on('messages.update',updates=>{
    if(generation!==this.generation)return;
    for(const event of Array.isArray(updates)?updates:[]){
     if(event?.key?.fromMe===false)continue;
     const code=event?.update?.status;
     this.deliveryTracker.observe(event?.key?.remoteJid,event?.key?.id,code);
    }
   });
   // Recebimentos em grupo podem indicar apenas UM participante, nao todos.
   socket.ev.on('message-receipt.update',updates=>{
    if(generation!==this.generation)return;
    for(const event of Array.isArray(updates)?updates:[]){
     if(event?.key?.fromMe===false)continue;
     const r=event?.receipt||{};
     const code=r.readTimestamp!=null?4:(r.receiptTimestamp!=null||r.deliveredTimestamp!=null?3:null);
     if(code!=null)this.deliveryTracker.observe(event?.key?.remoteJid,event?.key?.id,code);
    }
   });
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
   this.socket=null;this.qr=null;this.qrCreatedAt=null;this.lastGroups=[];this.groupMetadata.clear();this.mediaCache.clear();this.deliveryTracker.clear();
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
  const backup=path.join(DIR.data,'session-backup-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid);
  if(fs.existsSync(DIR.session))fs.renameSync(DIR.session,backup);
  fs.mkdirSync(DIR.session,{recursive:true});
  this.retries=0;this.lastGroups=[];this.groupMetadata.clear();this.lastDisconnectCode=null;this.qr=null;this.qrCreatedAt=null;this.lastError=null;this.status='desconectado';
  audit('whatsapp_sessao_redefinida',{backupCreated:fs.existsSync(backup)});
  return this.connect();
 }
 async groups() {
  if(this.mode==='simulacao')return [{id:'teste-alatus@g.us',name:'ALATUS | Grupo de teste (SIMULADO)',demo:true},{id:'teste-parceiros@g.us',name:'Parceiros | Grupo de teste (SIMULADO)',demo:true}];
  if(this.status!=='conectado'||!this.socket)throw new Error('Conecte o WhatsApp primeiro.');
  const raw=await this.socket.groupFetchAllParticipating();
  this.groupMetadata=new Map(Object.entries(raw).map(([jid,metadata])=>[jid,{metadata,time:Date.now()}]));
  const identity=[this.socket.user?.id,this.socket.user?.lid,this.socket.authState?.creds?.me?.id,this.socket.authState?.creds?.me?.lid];
  const groups=Object.entries(raw).filter(([jid,g])=>jid.endsWith('@g.us')&&!g.isCommunityAnnounce)
   .map(([jid,g])=>({id:jid,name:g.subject||'Grupo sem nome',demo:false,
    permission:groupPostingPermission(g,identity).status}))
   .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  this.lastGroups=groups;return groups;
 }
 async prepareImage(imagePath){
  if(this.mode==='simulacao')return imagePath;
  const file=path.resolve(imagePath);
  if(path.dirname(file)!==path.resolve(DIR.images))throw new Error('Imagem fora da pasta de cargas.');
  const stat=await fs.promises.stat(file);
  if(!stat.isFile()||stat.size<16||stat.size>8_000_000)throw new Error('Imagem fora do limite para envio.');
  // Passar {url:arquivo} em vez de Buffer habilita mediaCache do Baileys.
  // O arquivo tem UUID único e não é sobrescrito durante novos uploads.
  return file;
 }
 async shutdown(){
  // Não excluir a sessão. Ao reabrir, as credenciais salvas serão reutilizadas.
  this.shuttingDown=true;this._clearTimer();++this.generation;
  try {await this.credentialFlush;}catch(e){audit('credenciais_flush_erro',{error:e.message});}
  this._closeSocket();this.groupMetadata.clear();this.lastGroups=[];
  this.qr=null;this.qrCreatedAt=null;this.status='desconectado';
  audit('whatsapp_desconectado_ao_fechar');
 }
 getDeliveryStatus(groupId,messageId){return this.deliveryTracker.get(groupId,messageId);}
  async send(groupId,imagePath,caption,{freshGroupMetadata=false}={}) {
  if(this.mode==='simulacao'){await delay(50);return {simulated:true,messageId:`sim-${Date.now()}`};}
  if(this.status!=='conectado'||!this.socket)throw Object.assign(new Error('WhatsApp desconectado antes de enviar.'),{notSubmitted:true});
  if(!this.lastGroups.some(g=>g.id===groupId))throw Object.assign(new Error('Grupo não consta na lista verificada pelo WhatsApp.'),{notSubmitted:true});
  const identity=[this.socket.user?.id,this.socket.user?.lid,this.socket.authState?.creds?.me?.id,this.socket.authState?.creds?.me?.lid];
  const permission=groupPostingPermission(this.groupMetadata.get(groupId)?.metadata,identity);
  if(permission.status==='sem_permissao'){
   // Bloqueio conhecido ANTES de sendMessage. Nao houve tentativa nem risco de duplicacao.
   audit('grupo_sem_permissao',{groupId,reason:permission.reason});
   throw Object.assign(new Error('Somente administradores podem enviar mensagens neste grupo.'),
    {notSubmitted:true,skipGroup:true,errorKind:'group_permission'});
  }
  const image=Buffer.isBuffer(imagePath)?imagePath:{url:imagePath};
  // Baileys: imagem pura (sem propriedade caption) quando usuário desativa a legenda.
  const message=typeof caption==='string'&&caption.trim()?{image,caption}:{image};
  let result;
  try{
   // Nos envios agendados, busca participantes atuais em vez de confiar em cache.
   result=await this.socket.sendMessage(groupId,message);
  }catch(e){
   const msg=String(e?.message||e).slice(0,160);
   const stage=/assertSessions|createParticipantNodes|encrypt/i.test(e?.stack||'')?'sessoes_ou_criptografia':'indeterminada';
   audit('whatsapp_falha_envio',{groupId,reason:msg,stage,automaticFreshMetadata:freshGroupMetadata});
   throw e;
  }
  if(!result?.key?.id)throw new Error('WhatsApp não retornou identificador da mensagem. Resultado incerto.');
  const receipt=this.deliveryTracker.observe(groupId,result.key.id,Number.isInteger(result.status)?result.status:1);
   return {simulated:false,messageId:result.key.id,deliveryStatus:receipt?.deliveryStatus||'aguardando_servidor'};
 }
}
