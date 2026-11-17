'use strict';
// ALATUS Desktop: janela Electron com backend Node isolado em loopback.
// Ao encerrar, pede ao backend o flush da sessão e fecha o socket (sem logout).
const {app,BrowserWindow,dialog} = require('electron');
const {createUpdateController} = require('./updater.cjs');
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const {LOOPBACK_URL,LEGACY_HOME,allowedNavigation,hasLegacyHome,readSavedRoot,saveSelectedRoot}=require('./lifecycle.cjs');

let mainWindow,serverProcess,closing=false,canClose=false,logStream;
let dataHome,shutdownToken,updateController;
if(!app.requestSingleInstanceLock())app.quit();
app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();}});

function writeLog(msg){
 const text=new Date().toISOString()+' '+msg+'\n';
 try {if(dataHome){const p=path.join(dataHome,'logs');fs.mkdirSync(p,{recursive:true});fs.appendFileSync(path.join(p,'desktop.log'),text);}}
 catch{};
}
function showFailure(code,detail){
 writeLog(code+' '+detail);
 dialog.showErrorBox('ALATUS | '+code,detail+'\n\nVeja logs/desktop.log e docs/ERROS_DESKTOP.md.');
}
async function isPortInUse(){
 return await new Promise(resolve=>{
  const c=net.connect({host:'127.0.0.1',port:3187});
  c.setTimeout(1000);
  c.once('connect',()=>{c.destroy();resolve(true)});
  c.once('error',()=>resolve(false));
  c.once('timeout',()=>{c.destroy();resolve(false)});
 });
}
function chooseDataHome(){
 const perUser=app.getPath('userData');
 const settings=path.join(perUser,'desktop-settings.json');
 const saved=readSavedRoot(settings);
 if(saved){fs.mkdirSync(saved,{recursive:true});return saved;}
 let selected=perUser;
 if(process.platform==='win32'&&hasLegacyHome()){
  const choice=dialog.showMessageBoxSync({type:'question',title:'ALATUS | Seus dados anteriores',
   message:'Encontramos uma sessão anterior em Z:\\ALATUS.',
   detail:'Deseja reutilizar empresa, telefone, imagens e sessão do WhatsApp? O SSD Z: é compartilhado e outras contas com permissão podem acessar esses dados.',
   buttons:['Usar meus dados do Z:','Criar instalação separada'],defaultId:0,cancelId:1,noLink:true});
  if(choice===0)selected=LEGACY_HOME;
 }
 saveSelectedRoot(settings,selected);
 fs.mkdirSync(path.join(selected,'logs'),{recursive:true});
 return selected;
}
async function waitHealth(timeoutMs=20000){
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){
  if(!serverProcess||serverProcess.exitCode!==null)throw new Error('Servidor finalizou antes de abrir.');
  try {const response=await fetch(LOOPBACK_URL+'/api/health',{signal:AbortSignal.timeout(1200)});
   if(response.ok){const data=await response.json();if(data?.app==='ALATUS v0.7'&&data.ok)return;}
  }catch{}
  await new Promise(r=>setTimeout(r,220));
 }
 throw new Error('Servidor não respondeu em 20 segundos.');
}
function createWindow(){
 mainWindow=new BrowserWindow({
  title:'ALATUS | Publicador de Fretes',width:1350,height:900,minWidth:970,minHeight:690,
  backgroundColor:'#061c38',autoHideMenuBar:true,show:false,
  icon:path.join(__dirname,'assets','alatus.ico'),
  webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,
   allowRunningInsecureContent:false,webviewTag:false}
 });
 mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 mainWindow.webContents.on('will-navigate',(event,url)=>{if(!allowedNavigation(url))event.preventDefault();});
 mainWindow.webContents.session.setPermissionRequestHandler((_web,permission,callback)=>callback(false));
 mainWindow.on('close',event=>{if(!canClose){event.preventDefault();void requestClose();}});
 mainWindow.once('ready-to-show',()=>{mainWindow.show();setTimeout(()=>void updateController?.check(),1600);});
 void mainWindow.loadURL(LOOPBACK_URL).catch(err=>showFailure('D04','Não abriu a interface: '+err.message));
}
async function activeQueue(){
 try {
  const [jobResponse,outboxResponse]=await Promise.all([
   fetch(LOOPBACK_URL+'/api/jobs',{signal:AbortSignal.timeout(1800)}),
   fetch(LOOPBACK_URL+'/api/outbox',{signal:AbortSignal.timeout(1800)})]);
  if(!jobResponse.ok || !outboxResponse.ok)return 'estado_desconhecido';
  const [job,outbox]=await Promise.all([jobResponse.json(),outboxResponse.json()]);
  return job.activeJobId || outbox.activeBatchId || null;
 }catch{return 'estado_desconhecido';}
}
async function waitProcessExit(ms){
 if(!serverProcess||serverProcess.exitCode!==null)return true;
 return new Promise(resolve=>{
  const timer=setTimeout(()=>{serverProcess?.off('exit',onExit);resolve(false)},ms);
  function onExit(){clearTimeout(timer);resolve(true);}
  serverProcess.once('exit',onExit);
 });
}
async function stopBackendForUpdate(){
 // Caso algum envio esteja ativo ou não seja possível verificar a fila, adia a instalação.
 if(closing || await activeQueue())return false;
 closing=true;
 try {
  const response=await fetch(LOOPBACK_URL+'/api/internal/shutdown',{
   method:'POST',headers:{'X-Alatus-Desktop-Token':shutdownToken},signal:AbortSignal.timeout(3500)});
  if(!response.ok)throw new Error('shutdown HTTP '+response.status);
  if(!(await waitProcessExit(15000)))throw new Error('Timeout encerrando backend.');
  if(logStream){logStream.end();logStream=null;}
  canClose=true;
  writeLog('U06 Backend encerrado; instalando atualização.');
  return true;
 }catch(err){writeLog('U05 '+err.message);closing=false;return false;}
}
function initUpdater(){
 try {
  const {autoUpdater}=require('electron-updater');
  updateController=createUpdateController({
   updater:autoUpdater,app,dialog,getWindow:()=>mainWindow,
   isBusy:activeQueue,stopBackend:stopBackendForUpdate,
   log:writeLog,isPackaged:()=>app.isPackaged && process.platform==='win32'
  });
 }catch(err){writeLog('U01 Inicialização do atualizador falhou: '+err.message);}
}
async function requestClose(){
 if(closing)return;
 closing=true;
 const job=await activeQueue();
 if(job){
  const choice=dialog.showMessageBoxSync(mainWindow,{type:'warning',title:'ALATUS | Envio em andamento',
   message:'Ainda há uma publicação em andamento.',
   detail:'Fechar interromperá os próximos grupos. A mensagem atual poderá ser concluída. Deseja encerrar?',
   buttons:['Continuar usando','Interromper fila e fechar'],defaultId:0,cancelId:0,noLink:true});
  if(choice===0){closing=false;return;}
 }
 writeLog('D05 Encerramento solicitado pelo usuário.');
 // Timeout da fila: 45 s. Aguarda a mensagem atual, sem prosseguir para outras.
 try {await fetch(LOOPBACK_URL+'/api/internal/shutdown',{method:'POST',headers:{'X-Alatus-Desktop-Token':shutdownToken},signal:AbortSignal.timeout(3000)});}
 catch(e){writeLog('D05 encerramento via API falhou: '+e.message);}
 const exited=await waitProcessExit(job?59000:12000);
 if(!exited&&serverProcess){writeLog('D06 Backend demorou para encerrar; forçando encerramento.');serverProcess.kill();}
 if(logStream){logStream.end();logStream=null;}
 canClose=true;
 app.quit();
}
async function start(){
 if(process.platform!=='win32')writeLog('Execução em ambiente não Windows para desenvolvimento.');
 dataHome=chooseDataHome();
 if(await isPortInUse()){
  showFailure('D01','A porta 3187 está ocupada. Feche a v0.4/v0.5 no PowerShell antes de iniciar o aplicativo instalado.');
  app.quit();return;
 }
 const backend=app.isPackaged?path.join(process.resourcesPath,'backend'):path.resolve(__dirname,'..','app');
 const serverFile=path.join(backend,'server.mjs');
 if(!fs.existsSync(serverFile)){showFailure('D02','Não encontrei o servidor em '+serverFile);app.quit();return;}
 fs.mkdirSync(path.join(dataHome,'logs'),{recursive:true});
 logStream=fs.createWriteStream(path.join(dataHome,'logs','server.log'),{flags:'a'});
 shutdownToken=randomBytes(32).toString('hex');
 serverProcess=spawn(process.execPath,[serverFile],{
  cwd:backend,windowsHide:true,stdio:['ignore','pipe','pipe'],
  env:{...process.env,ELECTRON_RUN_AS_NODE:'1',ALATUS_HOME:dataHome,ALATUS_MODE:'real',ALATUS_PORT:'3187',ALATUS_DESKTOP_TOKEN:shutdownToken}
 });
 serverProcess.stdout.pipe(logStream,{end:false});
 serverProcess.stderr.pipe(logStream,{end:false});
 serverProcess.on('error',e=>{writeLog('D02 Backend spawn: '+e.message);});
 serverProcess.on('exit',(code,signal)=>{writeLog('D03 Backend encerrou: '+code+'/'+signal);if(!closing&&mainWindow){showFailure('D03','Servidor encerrou inesperadamente. Consulte logs/server.log.');canClose=true;app.quit();}});
 try {await waitHealth();writeLog('D04 Backend iniciado; janela aberta.');initUpdater();createWindow();}
 catch(e){showFailure('D03','Não foi possível iniciar o backend: '+e.message+'\nDados preservados em '+dataHome);serverProcess?.kill();app.quit();}
}
app.whenReady().then(start).catch(e=>{showFailure('D00',e.message);app.quit()});
app.on('before-quit',e=>{if(serverProcess&&!canClose&&mainWindow&&!mainWindow.isDestroyed()){e.preventDefault();void requestClose();}});
