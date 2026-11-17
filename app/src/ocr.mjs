// Leitura local das artes criadas no ChatGPT. Apenas dados encontrados no OCR
// são usados; campos ausentes permanecem vazios e impedem o envio.
import path from 'node:path';
import {mkdirSync} from 'node:fs';
import {DIR, ROOT} from './core.mjs';

const STATES='AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const cityLine=new RegExp('^\\s*[•*|]?\\s*(.{2,90}?)\\s*[-–—]\\s*('+STATES.join('|')+')\\b','i');
const noise=/^(?:[QO0]\s+)?(?:ORIGEM|DESTINO|COLETA|ENTREGA|VE[IÍ]CULO|ALATUS|LOG[IÍ]STICA|NOTIFICA|FRETE|VALORES|CONTATO)/i;
const vehicleKey=/VE[IÍ]CULO\s+NECESS[AÁ]RIO/i;
const clean=s=>String(s||'').replace(/[“”"'`]/g,'').replace(/^[•*|0OQ\s]+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç])/,'').replace(/\s+/g,' ').trim();
function canonicalCity(raw,uf){let s=clean(raw);s=s.replace(/^Gov\.?\s+/i,'Governador ');return `${s} - ${uf.toUpperCase()}`;}
function vehicleFrom(lines){const idx=lines.findIndex(x=>vehicleKey.test(x));const area=idx>=0?lines.slice(idx+1,idx+5):lines;
 const t=area.join(' ').toUpperCase();
 let name='';if(/TRUCK\s+OU\s+BITRUCK/.test(t))name='Truck ou bitruck';else if(/BITRUCK/.test(t))name='Bitruck';else if(/CARRETA/.test(t))name='Carreta';else if(/TRUCK/.test(t))name='Truck';
 if(!name)return '';
 const refrigeration=/REFRIGERAD[AO]/.test(t);
 if(refrigeration)return name+(name==='Carreta'?' refrigerada':' refrigerado');
 return name;
}
export function parseFreightOcr(rawText){
 const lines=String(rawText||'').split(/\r?\n/).map(clean).filter(Boolean);
 const cities=[];
 let section='';let explicitOrigin=false,explicitDestination=false;
 for(const [i,line] of lines.entries()){
  if(/\bORIGEM\b|\bCOLETA\b/i.test(line)){section='origin';explicitOrigin=true;continue;}
  if(/\bDESTINO\b|\bENTREGA\b/i.test(line)){section='destination';explicitDestination=true;continue;}
  if(vehicleKey.test(line)){section='vehicle';continue;}
  if(section==='vehicle')continue;
  const m=line.match(cityLine);
  if(m&&!noise.test(m[1]))cities.push({city:canonicalCity(m[1],m[2]),section,index:i});
 }
 let origin=[],destination=[];
 if(explicitDestination && cities.some(c=>c.section==='destination')){
   origin=cities.filter(c=>c.section!=='destination').map(c=>c.city);
   destination=cities.filter(c=>c.section==='destination').map(c=>c.city);
 }else if(cities.length>=2){
   // Layout das artes ALATUS: coleta(s) em cima, entrega(s) abaixo.
   origin=cities.slice(0,-1).map(c=>c.city);
   destination=[cities.at(-1).city];
 }
 const vehicle=vehicleFrom(lines);
 const missing=[];
 if(!origin.length)missing.push('coleta');
 if(!destination.length)missing.push('entrega');
 if(!vehicle)missing.push('veículo');
 return {origin:origin.join('\n'),destination:destination.join('\n'),vehicle,complete:missing.length===0,missing,method:explicitDestination?'rotulos':'ordem_da_arte',text:rawText};
}

let workerPromise=null;
async function worker(){
 if(workerPromise)return workerPromise;
 workerPromise=(async()=>{
   let lib;
   try {lib=await import('tesseract.js');}
   catch {throw new Error('[E11] OCR não instalado. Execute instalar-dependencias.ps1 na pasta Z:\\ALATUS\\app.');}
   const cachePath=path.join(ROOT,'runtime','ocr-cache');mkdirSync(cachePath,{recursive:true});
   // O modelo 'por' é baixado somente na primeira utilização e fica no SSD Z:.
   return lib.createWorker('por',1,{langPath:'https://tessdata.projectnaptha.com/4.0.0_fast',cachePath});
 })().catch(e=>{workerPromise=null;throw e;});
 return workerPromise;
}
export async function recognizeImage(image){
 const w=await worker();
 const result=await w.recognize(path.join(DIR.images,image.file));
 return {parsed:parseFreightOcr(result.data.text),confidence:result.data.confidence};
}
