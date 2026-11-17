import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const home=mkdtempSync(path.join(os.tmpdir(),'alatus-core-'));
process.env.ALATUS_HOME=home;
const core=await import('../src/core.mjs');
core.setupDirs();core.persistProfile({company:'TRANSPORTES EXEMPLO',phone:'(11) 91234-5678'});
test.after(()=>rmSync(home,{recursive:true,force:true}));

test('texto padrão da legenda conserva Valores a negociar e telefone',()=>{
 const text=core.makeCaption({origin:'Umuarama - PR',destination:'Guararapes - SP',vehicle:'Carreta refrigerada'});
 assert.match(text,/Umuarama - PR/);
 assert.match(text,/Guararapes - SP/);
 assert.match(text,/Valores a negociar/);
 assert.match(text,/\(11\) 91234-5678/);
});

test('upload valida assinatura de arquivo real e tamanho',()=>{
 const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
 const images=[];
 const r=core.imageUpload('data:image/png;base64,'+png.toString('base64'),'Frete de exemplo.png',images);
 assert.equal(r.mime,'image/png'); assert.equal(images.length,1);
 assert.throws(()=>core.imageUpload('data:image/png;base64,'+Buffer.from('texto').toString('base64'),'texto.png',images),/não reconhecido/);
 assert.throws(()=>core.imageUpload('data:image/png;base64,'+'a'.repeat(11_200_004),'grande.png',images),/8 MB/);
});

test('exige grupos e legenda com texto fixo (sem senha nem confirmação extra)',()=>{
 const im={id:randomUUID()};const groups=[{id:'teste@g.us',name:'Teste'}];
 const b={imageId:im.id,origin:'Origem',destination:'Destino',vehicle:'Refrigerado',caption:'Valores a negociar — (11) 91234-5678',groupIds:['teste@g.us'],requestId:randomUUID()};
 assert.equal(core.validateSend(b,[im],groups).requestId,b.requestId);
 assert.throws(()=>core.validateSend({...b,origin:''},[im],groups),/origem/);
 assert.throws(()=>core.validateSend({...b,caption:'sem contato'},[im],groups),/contato cadastrado/);
 assert.throws(()=>core.validateSend({...b,groupIds:['outro@g.us']},[im],groups),/desatualizada/);
 assert.throws(()=>core.validateSend({...b,groupIds:['teste@g.us','teste@g.us']},[im],groups),/sem repetir grupos/);
});


test('seleção de mais de 20 grupos válidos é permitida, sem repetição',()=>{
 const im={id:randomUUID()};
 const groups=Array.from({length:26},(_,i)=>({id:`grupo${i}@g.us`,name:`Grupo ${i}`}));
 const b={imageId:im.id,origin:'Origem',destination:'Destino',vehicle:'Truck refrigerado',caption:'Valores a negociar (11) 91234-5678',groupIds:groups.map(g=>g.id),requestId:randomUUID()};
 assert.equal(core.validateSend(b,[im],groups).groupIds.length,26);
 assert.throws(()=>core.validateSend({...b,groupIds:[...b.groupIds,groups[0].id]},[im],groups),/sem repetir grupos/);
});

test('perfil personalizado de parceiro é isolado da legenda anterior',()=>{
 core.persistProfile({company:'Parceiro XPTO',phone:'(11) 91234-5678'});
 const caption=core.makeCaption({origin:'SP',destination:'PR',vehicle:'Carreta'});
 assert.match(caption,/PARCEIRO XPTO/);assert.match(caption,/\(11\) 91234-5678/);
 assert.doesNotMatch(caption,/ALATUS LOGÍSTICA/);
 assert.throws(()=>core.persistProfile({company:'Empresa',phone:'123'}),/Telefone/);
});
