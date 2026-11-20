import test from 'node:test';
import assert from 'node:assert/strict';
import {markAttemptAccepted,markConfirmedFailure,pendingRecovery} from '../src/recovery.mjs';
const item=()=>({status:'submetido',groupIds:['a@g.us','b@g.us','c@g.us'],retryGroupIds:[]});
test('Falha confirmada reenvia somente o grupo afetado e nao duplica',()=>{
 const x=item();
 markAttemptAccepted(x,'a@g.us','a1');
 markAttemptAccepted(x,'b@g.us','b1');
 assert.equal(markConfirmedFailure(x,'a@g.us','a1'),true);
 assert.equal(markConfirmedFailure(x,'a@g.us','a1'),false);
 assert.deepEqual(x.retryGroupIds,['a@g.us']);
 assert.deepEqual(pendingRecovery([x]),[x]);
});
test('Reenvio confirmado apaga pendencia e conserva os outros grupos intactos',()=>{
 const x=item();
 markAttemptAccepted(x,'a@g.us','a1','falhou');
 markAttemptAccepted(x,'b@g.us','b1');
 assert.deepEqual(x.retryGroupIds,['a@g.us']);
 markAttemptAccepted(x,'a@g.us','a2','aguardando_servidor');
 assert.deepEqual(x.retryGroupIds,[]);
 assert.equal(x.latestMessageIds['b@g.us'],'b1');
});
test('ACK antigo depois de uma nova tentativa nao cria reenvio duplicado',()=>{
 const x=item();
 markAttemptAccepted(x,'a@g.us','a1');
 markConfirmedFailure(x,'a@g.us','a1');
 markAttemptAccepted(x,'a@g.us','a2');
 assert.equal(markConfirmedFailure(x,'a@g.us','a1'),false);
 assert.deepEqual(x.retryGroupIds,[]);
});
test('Falha recorrente nao tem limite artificial de tentativas, mas cada tentativa so ocorre apos falha explicita',()=>{
 const x=item();
 for(let n=0;n<40;n++){
  const id=`a-${n}`;
  markAttemptAccepted(x,'a@g.us',id);
  assert.equal(markConfirmedFailure(x,'a@g.us',id),true);
  assert.deepEqual(x.retryGroupIds,['a@g.us']);
 }
 assert.equal(x.latestMessageIds['a@g.us'],'a-39');
});
test('Resultado incerto sem ACK expresso nao permite repeticao automatica',()=>{
 const x=item();markAttemptAccepted(x,'a@g.us','a1');
 assert.deepEqual(pendingRecovery([x]),[]);
 x.status='revisar_manualmente';
 assert.equal(markConfirmedFailure(x,'a@g.us','a1'),false);
 assert.deepEqual(pendingRecovery([x]),[]);
});
test('Falha confirmada de grupo desconhecido nao adiciona destinatarios',()=>{
 const x=item();
 assert.equal(markConfirmedFailure(x,'desconhecido@g.us','z1'),false);
 assert.deepEqual(x.retryGroupIds,[]);
});
test('Grupo com falha fica isolado e recuperacao sobrevive ao JSON da fila',()=>{
 const x=item();markAttemptAccepted(x,'c@g.us','c1');
 markConfirmedFailure(x,'c@g.us','c1');
 const copy=JSON.parse(JSON.stringify(x));
 assert.deepEqual(pendingRecovery([copy]).map(y=>y.retryGroupIds),[['c@g.us']]);
 assert.deepEqual(copy.groupIds,['a@g.us','b@g.us','c@g.us']);
});
test('Falha antes da submissao inclui somente grupos comprovadamente nao enviados',async()=>{
 const {queueDefinitelyUnsent}=await import('../src/recovery.mjs');
 const x=item();markAttemptAccepted(x,'a@g.us','a1');
 assert.equal(queueDefinitelyUnsent(x,['b@g.us','c@g.us','desconhecido@g.us']),true);
 assert.deepEqual(x.retryGroupIds,['b@g.us','c@g.us']);
 assert.equal(queueDefinitelyUnsent(x,['b@g.us']),false);
});
test('Processador registra falha antes de sendMessage e preserva destinatarios nao tentados',async()=>{
 const {processPublicationQueue}=await import('../src/queue.mjs');
 const x=item();const job={mode:'real',status:'em_andamento',results:[]};
 const bridge={send:async()=>{throw Object.assign(new Error('Sem conexao'),{notSubmitted:true})}};
 const result=await processPublicationQueue({job,record:{imagePath:'fake.png',caption:'',groupIds:x.groupIds},bridge,groupNames:new Map()});
 assert.equal(result.uncertain,false);assert.equal(result.notSubmitted,true);
 assert.equal(job.status,'submetido_parcial');assert.equal(job.results[0].status,'nao_enviado');
 assert.deepEqual(job.unsentGroupIds,['b@g.us','c@g.us']);
});
