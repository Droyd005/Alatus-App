'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {allowedNavigation,readSavedRoot,saveSelectedRoot,hasLegacyHome}=require('../lifecycle.cjs');

test('D08 janela aceita somente origem local e impede sites externos',()=>{
 assert.equal(allowedNavigation('http://127.0.0.1:3187/'),true);
 assert.equal(allowedNavigation('http://127.0.0.1:3187/api/status'),true);
 for(const url of ['https://example.com','file:///etc/passwd','http://localhost:3187','http://127.0.0.1:3188','http://127.0.0.1:3187.evil.net'])assert.equal(allowedNavigation(url),false,url);
});
test('D07 dados selecionados são persistidos e não sobrescritos',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'alatus-desktop-'));
 try {const cfg=path.join(tmp,'settings.json');
  assert.equal(readSavedRoot(cfg),null);
  saveSelectedRoot(cfg,tmp);
  assert.equal(readSavedRoot(cfg),tmp);
  fs.mkdirSync(path.join(tmp,'data','session'),{recursive:true});
  fs.writeFileSync(path.join(tmp,'data','session','creds.json'),'segredo de teste');
  assert.equal(hasLegacyHome(tmp),true);
  saveSelectedRoot(cfg,tmp);
  assert.equal(fs.readFileSync(path.join(tmp,'data','session','creds.json'),'utf8'),'segredo de teste');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
