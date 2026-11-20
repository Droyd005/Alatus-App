import test from 'node:test';
import assert from 'node:assert/strict';
import {validateScheduleInput,newSchedule,changeSchedule,scheduleDue,reschedule,pauseSchedule} from '../src/scheduler.mjs';
const t=Date.parse('2026-11-19T20:00:00Z');
test('agendamento padrao desligado e nao ativa sozinho na instalacao',()=>{
 const s=newSchedule({},t);assert.equal(s.enabled,false);assert.equal(s.nextRunAt,null);
 assert.equal(scheduleDue(s,t+60*60_000),false);
});
test('liga a cada 20 minutos somente apos confirmacao na API e respeita hora agendada',()=>{
 let s=changeSchedule(newSchedule({},t),{enabled:true,intervalMinutes:20},t);
 assert.equal(scheduleDue(s,t+19*60_000),false);
 assert.equal(scheduleDue(s,t+20*60_000),true);
 s=reschedule(s,t+20*60_000);
 assert.equal(scheduleDue(s,t+39*60_000),false);
 assert.equal(scheduleDue(s,t+40*60_000),true);
});
test('desligar elimina horario futuro; reiniciar nao acumula disparos perdidos',()=>{
 let s=changeSchedule(newSchedule({},t),{enabled:true,intervalMinutes:20},t);
 s=newSchedule(s,t+180*60_000);
 assert.equal(scheduleDue(s,t+180*60_000),false);
 assert.equal(scheduleDue(s,t+200*60_000),true);
 s=pauseSchedule(s,'falha de conexao');
 assert.equal(s.enabled,false);assert.equal(scheduleDue(s,t+400*60_000),false);
});
test('aceita intervalos positivos sem teto artificial e rejeita entradas invalidas',()=>{
 for(const intervalMinutes of [0,-1,20.5,'20',null,Number.MAX_SAFE_INTEGER])assert.throws(()=>validateScheduleInput({enabled:true,intervalMinutes}),{status:422});
 for(const minutes of [1,5,20,1441,10080])assert.deepEqual(validateScheduleInput({enabled:true,intervalMinutes:minutes},t),{enabled:true,intervalMinutes:minutes});
 assert.deepEqual(validateScheduleInput({enabled:false,intervalMinutes:1440}),{enabled:false,intervalMinutes:1440});
});
