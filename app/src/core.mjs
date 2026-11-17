import {randomUUID, createHash} from 'node:crypto';
import {mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, appendFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const APP_PORT = 3187;
export const ROOT = process.env.ALATUS_HOME ? path.resolve(process.env.ALATUS_HOME) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DIR = {data: path.join(ROOT,'data'), images:path.join(ROOT,'images','entrada'), logs:path.join(ROOT,'logs'), session:path.join(ROOT,'data','session')};
export const DATA = { images: path.join(DIR.data,'images.json'), jobs: path.join(DIR.data,'jobs.json'), outbox: path.join(DIR.data,'outbox.json'), profile: path.join(DIR.data,'profile.json')};
export function setupDirs() { for (const p of Object.values(DIR)) mkdirSync(p,{recursive:true}); }
export function loadJson(filename, fallback) {try {return JSON.parse(readFileSync(filename,'utf8'));} catch(e) {if(e.code==='ENOENT')return fallback;throw e;}}
export function saveJson(filename, value) {const temp=`${filename}.${randomUUID()}.tmp`;writeFileSync(temp,JSON.stringify(value,null,2),{mode:0o600});renameSync(temp,filename);}
export function audit(type, info={}) { const line=JSON.stringify({time:new Date().toISOString(),type,...info});appendFileSync(path.join(DIR.logs,'events.ndjson'),line+'\n'); }
export function fail(code,message) {const error=new Error(message); error.status=code;return error;}
export function requireText(value,name,max=220) {if(typeof value!=='string' || !value.trim() || value.length>max)throw fail(422,`Preencha ${name} (até ${max} caracteres).`);return value.trim();}
export function safeFilename(s) {return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_.-]/g,'-').slice(0,65) || 'arte';}
export function getImageType(buffer) {
 if(buffer.length<16)return null;
 if(buffer.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) return {ext:'.png', mime:'image/png'};
 if(buffer.subarray(0,3).equals(Buffer.from('ffd8ff','hex'))) return {ext:'.jpg', mime:'image/jpeg'};
 if(buffer.subarray(0,4).toString()==='RIFF' && buffer.subarray(8,12).toString()==='WEBP')return {ext:'.webp',mime:'image/webp'};
 return null;
}
export function imageUpload(data, filename, images) {
 if(typeof data!=='string'|| !/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(data)) throw fail(422,'Imagem inválida. Use PNG, JPG ou WEBP.');
 const base64=data.split(',')[1]; if(base64.length>11_200_000)throw fail(413,'Imagem acima do limite de 8 MB.');
 const bytes=Buffer.from(base64,'base64');if(!bytes.length || bytes.length>8_000_000)throw fail(413,'Imagem acima do limite de 8 MB.');
 const format=getImageType(bytes);if(!format)throw fail(422,'Arquivo não reconhecido como PNG/JPG/WEBP.');
 const id=randomUUID(); const dest=path.join(DIR.images,`${id}${format.ext}`);writeFileSync(dest,bytes,{flag:'wx',mode:0o600});
 const record={id,filename:safeFilename(filename),file:path.basename(dest),mime:format.mime,size:bytes.length,hash:createHash('sha256').update(bytes).digest('hex'),createdAt:new Date().toISOString()};
 images.push(record);saveJson(DATA.images,images);audit('imagem_importada',{imageId:id,size:bytes.length});return {...record,file:undefined};
}
// Perfis são privados de cada instalação. Não inferir empresa ou telefone do histórico.
// Ao migrar instalações antigas, solicitar configuração se ainda não houver perfil.
export function getProfile() {
 const saved=loadJson(DATA.profile,null);
 if(saved)return saved;
 return {company:'',phone:'',configured:false};
}
export function validateProfile(body){
 const company=requireText(body?.company,'empresa',85).replace(/[\r\n]+/g,' ');
 const phone=requireText(body?.phone,'telefone',45).replace(/[\r\n]+/g,' ');
 const digits=phone.replace(/\D/g,'');
 if(digits.length<10||digits.length>15)throw fail(422,'Telefone deve conter de 10 a 15 dígitos.');
 return {company,phone,configured:true};
}
export function persistProfile(body){const p=validateProfile(body);saveJson(DATA.profile,p);audit('perfil_atualizado',{company:p.company});return p;}
export function makeCaption({origin,destination,vehicle},p=getProfile()) {
 if(!p.configured||!p.company||!p.phone)throw fail(422,'Configure a empresa e o telefone antes de gerar a legenda.');
 return `🚛 *${p.company.toUpperCase()} | FRETE DISPONÍVEL*\n\n📍 *Coleta:* ${requireText(origin,'origem',300)}\n🏁 *Entrega:* ${requireText(destination,'destino',300)}\n❄️ *Veículo:* ${requireText(vehicle,'veículo',160)}\n\n💰 *Valores a negociar*\n📲 *${p.phone}*`;
}
export function validateSend(body, images, groups) {
 if(!body || typeof body!=='object')throw fail(400,'Dados inválidos.');
 const record=images.find(im=>im.id===body.imageId);if(!record)throw fail(422,'Selecione primeiro uma imagem válida.');
 const origin=requireText(body.origin,'origem',300),destination=requireText(body.destination,'destino',300),vehicle=requireText(body.vehicle,'veículo',160);
 let caption=requireText(body.caption,'legenda',2500);
 const profile=getProfile();if(!profile.configured)throw fail(422,'Configure o perfil antes de enviar.');
 if(!caption.includes('Valores a negociar') || !caption.includes(profile.phone))throw fail(422,'A legenda deve manter “Valores a negociar” e o contato cadastrado.');
 if(!Array.isArray(body.groupIds)||body.groupIds.length<1||body.groupIds.length>groups.length||new Set(body.groupIds).size!==body.groupIds.length)throw fail(422,'Selecione pelo menos um grupo válido, sem repetir grupos.');
 if(body.groupIds.some(id=>!groups.some(g=>g.id===id)))throw fail(422,'Lista de grupos desatualizada. Atualize e selecione novamente.');
 if(!/^[a-f\d-]{36}$/.test(String(body.requestId||'')))throw fail(422,'Identificador de tentativa inválido. Recarregue o painel.');
 return {image:record, origin,destination,vehicle,caption,groupIds:body.groupIds,requestId:body.requestId};
}
