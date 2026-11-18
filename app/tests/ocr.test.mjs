import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {parseFreightOcr,whiteTextMask} from '../src/ocr.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const cases=[
 {origin:'Curitiba - PR\nMaringá - PR\nCuiabá - MT',destination:'São Luís - MA',vehicle:'Carreta refrigerada'},
 {origin:'Porto Alegre - RS',destination:'Campinas - SP',vehicle:'Carreta refrigerada'},
 {origin:'Salvador - BA',destination:'Campinas - SP',vehicle:'Truck ou bitruck refrigerado'},
 {origin:'Belo Horizonte - MG',destination:'São Luís - MA',vehicle:'Carreta refrigerada'},
 {origin:'Ribeirão Preto - SP\nFranca - SP',destination:'São Luís - MA',vehicle:'Bitruck refrigerado'},
];
for(const [i,expected] of cases.entries())test(`OCR ${i+1}: extração do texto da arte ALATUS`,()=>{
 const extracted=readFileSync(path.join(dir,`ocr_sample_${i+1}.txt`),'utf8');
 const parsed=parseFreightOcr(extracted);
 for(const key of ['origin','destination','vehicle'])assert.equal(parsed[key],expected[key]);
 assert.equal(parsed.complete,true);
});
test('OCR incompleto não cria dados fictícios',()=>{
 const parsed=parseFreightOcr('ALATUS\nNOTIFICAÇÃO DE CARGA\nUMUARAMA - PR\nValores a negociar');
 assert.equal(parsed.complete,false);assert.equal(parsed.destination,'');assert.equal(parsed.vehicle,'');
});

test('OCR com 3 coletas, entrega, veículo e peso explícito',()=>{
 const art=`ALATUS
NOTIFICAÇÃO DE CARGA
ORIGEM (COLETA)
Alta Floresta - MT
+ Colider - MT
+ Juara - MT
DESTINO (ENTREGA)
Maringá - PR
VEÍCULO NECESSÁRIO
BITRUCK
REFRIGERADO
PESO DA CARGA
13,2 TONS
Valores a negociar`;
 const data=parseFreightOcr(art);
 assert.equal(data.origin,'Alta Floresta - MT\nColider - MT\nJuara - MT');
 assert.equal(data.destination,'Maringá - PR');
 assert.equal(data.vehicle,'Bitruck refrigerado');
 assert.equal(data.weight,'13,2 toneladas');
 assert.equal(data.complete,true);
});
test('peso sem unidade não é inventado; ruídos de números não viram cidades',()=>{
 const art=`LOGÍSTICA
ORIGEM
ALATUS 1234 - MT
Curitiba - PR
DESTINO
Maringá - PR
VEÍCULO NECESSÁRIO
TRUCK
PESO DA CARGA
1234
(43) 92000-5487`;
 const data=parseFreightOcr(art);assert.equal(data.origin,'Curitiba - PR');
 assert.equal(data.weight,'');assert.equal(data.complete,true);
});
test('máscara remove dourado e fundo azul, mantendo letras brancas',()=>{
 const rgb=Buffer.from([251,250,247,249,183,68,5,23,59,195,202,208]);
 assert.deepEqual([...whiteTextMask(rgb)],[0,255,255,0]);
});
