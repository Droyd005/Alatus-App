'use strict';
const path = require('node:path');
const fs = require('node:fs');

const LOOPBACK_URL = 'http://127.0.0.1:3187';
const LEGACY_HOME = 'Z:\\ALATUS';

function allowedNavigation(value) {
  try { const url=new URL(value); return url.origin===LOOPBACK_URL && url.username==='' && url.password===''; }
  catch {return false;}
}
function hasLegacyHome(folder=LEGACY_HOME){
  return fs.existsSync(path.join(folder,'data','profile.json')) ||
    fs.existsSync(path.join(folder,'data','session','creds.json'));
}
function readSavedRoot(settingsFile){
  try {
    const obj=JSON.parse(fs.readFileSync(settingsFile,'utf8'));
    return typeof obj?.home==='string'&&path.isAbsolute(obj.home)?obj.home:null;
  } catch {return null;}
}
function saveSelectedRoot(settingsFile,root){
  if(typeof root!=='string'||!path.isAbsolute(root))throw new Error('Diretório de dados inválido');
  fs.mkdirSync(path.dirname(settingsFile),{recursive:true});
  const temp=settingsFile+'.tmp';
  fs.writeFileSync(temp,JSON.stringify({schema:1,home:root},null,2),{mode:0o600});
  fs.renameSync(temp,settingsFile);
}
module.exports={LOOPBACK_URL,LEGACY_HOME,allowedNavigation,hasLegacyHome,readSavedRoot,saveSelectedRoot};
