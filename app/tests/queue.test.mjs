import test from 'node:test';
import assert from 'node:assert/strict';
import {processPublicationQueue} from '../src/queue.mjs';

const fixture=n=>({
 job:{mode:'real',status:'em_andamento',results:[]},
 record:{groupIds:Array.from({length:n},(_,i)=>`grupo-${i}@g.us`),imagePath:'arte.png',caption:'Frete disponível'},
 groupNames:new Map(Array.from({length:n},(_,i)=>[`grupo-${i}@g.us`,`Grupo ${i}`]))
});
test('envio com ate 3 grupos simultaneos, sem duplicacao',async()=>{
 const args=fixture(25);let inFlight=0,max=0,calls=0;
 const bridge={send:async()=>{inFlight++;max=Math.max(max,inFlight);await new Promise(r=>setTimeout(r,1));inFlight--;return {messageId:String(++calls),simulated:false};}};
 const result=await processPublicationQueue({...args,bridge});
 assert.ok(max>=2&&max<=3);assert.equal(result.uncertain,false);assert.equal(args.job.status,'submetido');assert.equal(args.job.results.length,25);assert.ok(args.job.results.every(x=>x.elapsedMs>=0));assert.equal(args.job.progress.done,25);
});
test('em caso de falha, interrompe o restante e não tenta reenviar',async()=>{
 const args=fixture(22);let calls=0;
 const bridge={send:async()=>{calls++;if(calls===3)throw new Error('queda da conexão');return {messageId:String(calls),simulated:false};}};
 const result=await processPublicationQueue({...args,bridge});
 assert.equal(result.uncertain,true);assert.ok(calls>=3&&calls<=6);assert.equal(args.job.results.length,calls);assert.equal(new Set(args.job.results.map(x=>x.groupId)).size,calls);assert.equal(args.job.status,'revisar_manualmente');
});
test('cancelamento interrompe próximos grupos, não cancela envio em curso',async()=>{
 const args=fixture(24);let calls=0,stop=false,completed=0;
 const bridge={send:async()=>{calls++;return {messageId:String(calls),simulated:false};}};
 await processPublicationQueue({...args,bridge,isCancelRequested:()=>stop,afterGroup:()=>{completed++;if(completed===2)stop=true;}});
 assert.ok(calls>=2&&calls<=5);assert.equal(args.job.status,'interrompido_pelo_usuario');assert.equal(args.job.unsentGroupIds.length,24-calls);
});
test('otimização: carrega imagem apenas uma vez antes dos grupos',async()=>{
 const args=fixture(27);let prepared=0,calls=0;const buffer=Buffer.from('exemplo');
 const bridge={prepareImage:async p=>{assert.equal(p,'arte.png');prepared++;return buffer;},send:async(_id,media)=>{assert.equal(media,buffer);calls++;return {messageId:String(calls)};}};
 await processPublicationQueue({...args,bridge});
 assert.equal(prepared,1);assert.equal(calls,27);
});
test('otimização: não envia se a preparação da imagem falhar',async()=>{
 const args=fixture(4);let calls=0;
 const bridge={prepareImage:async()=>{throw new Error('arquivo ausente')},send:async()=>{calls++}};
 const res=await processPublicationQueue({...args,bridge});
 assert.equal(res.uncertain,true);assert.equal(calls,0);assert.match(args.job.error,/arquivo ausente/);
});

// Regressão: a fila não pode introduzir nenhuma espera fixa antes do próximo grupo.
test('não há pausa artificial entre grupos consecutivos',async()=>{
 const args=fixture(8);let calls=0;
 const bridge={send:async()=>({messageId:String(++calls)})};
 const started=Date.now();
 const outcome=await processPublicationQueue({...args,bridge});
 assert.equal(outcome.uncertain,false);
 assert.equal(calls,8);
 assert.ok(Date.now()-started<2000,'A fila introduziu espera artificial entre grupos');
});
