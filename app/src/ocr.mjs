// OCR ALATUS: leitura restrita a dados verificáveis, sem completar texto imaginado.
// A primeira passagem isola textos claros; se incompleta, usa o recorte em cores.
import path from 'node:path';
import {mkdirSync} from 'node:fs';
import {DIR, ROOT} from './core.mjs';

const STATES='AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const cityLine=new RegExp('^\\s*[+•*|]?\\s*([\\p{L}][\\p{L}\\s.\'’\\-]{1,80}?)\\s*[-–—]\\s*('+STATES.join('|')+')\\s*$','iu');
const noise=/^(?:ORIGEM|DESTINO|COLETA|ENTREGA|VE[IÍ]CULO|ALATUS|LOG[IÍ]STICA|NOTIFICA|FRETE|VALORES|CONTATO|PESO)/i;
const vehicleKey=/VE[IÍ]CULO\s+NECESS[AÁ]RIO/i;
const clean=s=>String(s||'').replace(/[“”"'`]/g,'').replace(/\s+/g,' ').trim();
function canonicalCity(raw,uf){let s=clean(raw).replace(/^Gov\.?\s+/i,'Governador ');return `${s} - ${uf.toUpperCase()}`;}
function vehicleFrom(lines){
 const idx=lines.findIndex(x=>vehicleKey.test(x));
 const area=(idx>=0?lines.slice(idx+1,idx+7):lines).join(' ').toUpperCase();
 let name='';
 if(/TRUCK\s+OU\s+BITRUCK/.test(area))name='Truck ou bitruck';
 else if(/BITRUCK/.test(area))name='Bitruck';
 else if(/CARRETA/.test(area))name='Carreta';
 else if(/\bTRUCK\b/.test(area))name='Truck';
 if(!name)return '';
 if(/REFRIGERAD[AO]/.test(area))return name+(name==='Carreta'?' refrigerada':' refrigerado');
 return name;
}
export function normalizeWeight(raw){
 const cleaned=clean(raw).toUpperCase().replace(/\s+/g,' ');
 // Só aceita quantidade + unidade explícita. Não trata números isolados como peso.
 const m=cleaned.match(/(?:^|\s)(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d{1,5}(?:[.,]\d{1,2})?)\s*(TONELADAS?|TONS?|T|KGS?|QUILOS?)\b/i);
 if(!m)return '';
 const value=m[1];const numeric=Number(value.replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.'));
 if(!Number.isFinite(numeric)||numeric<=0||numeric>60000)return '';
 const unit=/^(?:T|TON)/.test(m[2])?'toneladas':'kg';
 return `${value} ${unit}`;
}
function weightFrom(lines){
 // Detecta somente valores que acompanham unidade, como "13,2 TONS".
 // Prioriza linhas perto de "PESO DA CARGA" quando a etiqueta está legível.
 const i=lines.findIndex(s=>/PESO\s+(?:DA\s+)?CARGA/i.test(s));
 if(i>=0){for(const part of lines.slice(i,i+5)){const weight=normalizeWeight(part);if(weight)return weight;}}
 for(const line of lines){const weight=normalizeWeight(line);if(weight)return weight;}
 return '';
}
export function parseFreightOcr(rawText){
 const lines=String(rawText||'').split(/\r?\n/).map(clean).filter(Boolean);
 const cities=[];let section='',explicitDestination=false;
 for(const [i,line] of lines.entries()){
  if(/\bORIGEM\b|\bCOLETA\b/i.test(line)){section='origin';continue;}
  if(/\bDESTINO\b|\bENTREGA\b/i.test(line)){section='destination';explicitDestination=true;continue;}
  if(vehicleKey.test(line)){section='vehicle';continue;}
  if(section==='vehicle')continue;
  const m=line.match(cityLine);
  if(m&&!noise.test(m[1])&&!/\d/.test(m[1]))cities.push({city:canonicalCity(m[1],m[2]),section,index:i});
 }
 let origin=[],destination=[];
 if(explicitDestination && cities.some(c=>c.section==='destination')){
  origin=cities.filter(c=>c.section==='origin').map(c=>c.city);
  destination=cities.filter(c=>c.section==='destination').map(c=>c.city);
 }else if(cities.length>=2){
  origin=cities.slice(0,-1).map(c=>c.city);
  destination=[cities.at(-1).city];
 }
 const vehicle=vehicleFrom(lines),weight=weightFrom(lines);
 const missing=[];
 if(!origin.length)missing.push('coleta');
 if(!destination.length)missing.push('entrega');
 if(!vehicle)missing.push('veículo');
 return {origin:origin.join('\n'),destination:destination.join('\n'),vehicle,weight,
  complete:missing.length===0,missing,method:explicitDestination?'rotulos':'ordem_da_arte',text:String(rawText||'')};
}

// Máscara branco/suave em preto sobre branco: ignora dourados, sombras azuladas e brilhos.
export function whiteTextMask(pixels,channels=3){
 const out=Buffer.alloc(Math.floor(pixels.length/channels),255);
 for(let i=0,p=0;i+2<pixels.length;i+=channels,p++){
  const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
  const lo=Math.min(r,g,b),hi=Math.max(r,g,b);
  if(lo>=145 && hi-lo<=72 && (r+g+b)>=510)out[p]=0;
 }
 return out;
}
async function croppedImage(filename,mask){
 // Sharp dispõe de binários pré-compilados para Windows x64.
 const {default:sharp}=await import('sharp');
 const {width,height}=await sharp(filename).metadata();
 if(!width||!height)throw new Error('Dimensão da imagem inválida.');
 const left=Math.floor(width*.06),top=Math.floor(height*.16);
 const region={left,top,width:width-left-Math.floor(width*.04),height:Math.min(height-top,Math.ceil(height*.49))};
 const pipeline=sharp(filename).extract(region).removeAlpha().toColourspace('srgb');
 if(!mask)return pipeline.normalize().png().toBuffer();
 const {data,info}=await pipeline.raw().toBuffer({resolveWithObject:true});
 const mono=whiteTextMask(data,info.channels);
 return sharp(mono,{raw:{width:info.width,height:info.height,channels:1}}).png().toBuffer();
}
let workerPromise=null;
async function worker(){
 if(workerPromise)return workerPromise;
 workerPromise=(async()=>{
  let lib;
  try{lib=await import('tesseract.js');}
  catch{throw new Error('[E11] OCR não instalado. Verifique as dependências do ALATUS.');}
  const cachePath=path.join(ROOT,'runtime','ocr-cache');mkdirSync(cachePath,{recursive:true});
  return lib.createWorker('por',1,{langPath:'https://tessdata.projectnaptha.com/4.0.0_fast',cachePath});
 })().catch(e=>{workerPromise=null;throw e;});
 return workerPromise;
}
export async function recognizeImage(image){
 const filename=path.join(DIR.images,image.file);
 const w=await worker();
 let first=null;
 try{first=await w.recognize(await croppedImage(filename,true));}catch{}
 if(first){
  const parsed=parseFreightOcr(first.data.text);
  if(parsed.complete)return {parsed,confidence:first.data.confidence};
 }
 // Se a máscara perder informações, tenta OCR em cores no recorte reduzido.
 let fallbackInput=filename;
 try{fallbackInput=await croppedImage(filename,false);}catch{}
 const second=await w.recognize(fallbackInput);
 const alternative=parseFreightOcr(second.data.text);
 if(!first)return {parsed:alternative,confidence:second.data.confidence};
 const primary=parseFreightOcr(first.data.text);
 const base=(alternative.complete && !primary.complete)?alternative:primary;
 const other=base===primary?alternative:primary;
 const result={...base,
  origin:base.origin||other.origin,destination:base.destination||other.destination,
  vehicle:base.vehicle||other.vehicle,weight:base.weight||other.weight};
 const missing=[];if(!result.origin)missing.push('coleta');if(!result.destination)missing.push('entrega');if(!result.vehicle)missing.push('veículo');
 result.missing=missing;result.complete=!missing.length;
 return {parsed:result,confidence:Math.max(first.data.confidence||0,second.data.confidence||0)};
}
