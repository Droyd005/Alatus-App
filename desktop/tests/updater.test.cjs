'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createUpdateController}=require('../updater.cjs');

function setup({busy=false,decision=0,packaged=true}={}){
 const updater=new EventEmitter();
 let checked=0,downloaded=0,installed=0,stopped=0;
 const prompts=[],logs=[];
 updater.checkForUpdates=async()=>{checked++;return {};};
 updater.downloadUpdate=async()=>{downloaded++;return [];};
 updater.quitAndInstall=()=>{installed++;};
 const dialog={showMessageBox:async(_win,opts)=>{prompts.push(opts);return {response:decision};}};
 const win={isDestroyed:()=>false,setProgressBar:()=>{}};
 const controller=createUpdateController({updater,app:{getVersion:()=> '0.7.1'},dialog,
  getWindow:()=>win,isBusy:async()=>busy,stopBackend:async()=>{stopped++;return true;},
  log:msg=>logs.push(msg),isPackaged:()=>packaged});
 return {controller,updater,prompts,logs,counts:()=>({checked,downloaded,installed,stopped})};
}
test('U01 verifica somente quando instalado',async()=>{
 const s=setup({packaged:false});assert.equal(await s.controller.check(),false);assert.equal(s.counts().checked,0);
 const p=setup();assert.equal(await p.controller.check(),true);assert.equal(p.counts().checked,1);
 assert.equal(p.updater.autoDownload,false);assert.equal(p.updater.autoInstallOnAppQuit,false);
});
test('U02 oferta atualização e baixa somente após permissão',async()=>{
 const s=setup({decision:1});await s.controller._test.available({version:'0.7.2'});
 assert.equal(s.counts().downloaded,0);assert.equal(s.prompts.length,1);
 const p=setup();await p.controller._test.available({version:'0.7.2'});
 assert.equal(p.counts().downloaded,1);
});
test('U03 impede download se fila estiver em andamento',async()=>{
 const s=setup({busy:true});await s.controller._test.available({version:'0.7.2'});
 assert.equal(s.counts().downloaded,0);assert.equal(s.prompts.length,0);
});
test('U04 instalação só ocorre após backend encerrar e confirmação',async()=>{
 const s=setup();await s.controller._test.downloaded({version:'0.7.2'});
 assert.deepEqual(s.counts(),{checked:0,downloaded:0,installed:1,stopped:1});
 const p=setup({decision:1});await p.controller._test.downloaded({version:'0.7.2'});
 assert.equal(p.counts().installed,0);assert.equal(p.counts().stopped,0);
});
test('U05 não instala durante envio nem repete a instalação',async()=>{
 const s=setup({busy:true});await s.controller._test.downloaded({version:'0.7.2'});
 assert.equal(s.counts().installed,0);
 const p=setup();await p.controller._test.downloaded({version:'0.7.2'});
 await p.controller._test.downloaded({version:'0.7.2'});
 assert.equal(p.counts().installed,1);
});
test('U06 erro ao verificar atualizações não bloqueia uso',async()=>{
 const s=setup();s.updater.checkForUpdates=async()=>{throw new Error('GitHub sem conexão');};
 assert.equal(await s.controller.check(),false);assert.ok(s.logs.some(x=>x.includes('U01')));
});
