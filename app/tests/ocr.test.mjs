import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {parseFreightOcr} from '../src/ocr.mjs';
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
