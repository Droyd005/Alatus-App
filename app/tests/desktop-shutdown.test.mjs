import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,existsSync,readFileSync} from 'node:fs';

const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('D05: endpoint privado encerra servidor e não remove sessão',async()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'alatus-desktop-stop-'));
 const port=36500+Math.floor(Math.random()*1000);
 const secret='teste-secret-do-desktop';
 const service=spawn(process.execPath,[path.resolve('server.mjs')],{
  cwd:path.resolve('.'),env:{...process.env,ALATUS_PORT:String(port),ALATUS_HOME:root,ALATUS_MODE:'simulacao',ALATUS_DESKTOP_TOKEN:secret},stdio:'ignore'
 });
 const url=`http://127.0.0.1:${port}`;
 try {
  let ready=false;
  for(let i=0;i<70;i++){
   try {const r=await fetch(url+'/api/health');if(r.ok){ready=true;break;}}catch{}
   await delay(75);
  }
  assert.equal(ready,true);
  let r=await fetch(url+'/api/internal/shutdown',{method:'POST'});assert.equal(r.status,403);
  r=await fetch(url+'/api/internal/shutdown',{method:'POST',headers:{'X-Alatus-Desktop-Token':'invalido'}});assert.equal(r.status,403);
  r=await fetch(url+'/api/internal/shutdown',{method:'POST',headers:{'X-Alatus-Desktop-Token':secret}});assert.equal(r.status,202);
  for(let i=0;i<70&&service.exitCode===null;i++)await delay(80);
  assert.equal(service.exitCode,0);
  assert.equal(existsSync(path.join(root,'logs','events.ndjson')),true);
  assert.match(readFileSync(path.join(root,'logs','events.ndjson'),'utf8'),/whatsapp_desconectado_ao_fechar/);
 }finally{if(service.exitCode===null)service.kill();rmSync(root,{recursive:true,force:true});}
});
