// Agendamento explicito: sem recuperar disparos perdidos, sem filas sobrepostas.
export const MIN_SEND_INTERVAL_MINUTES=20;
export const MAX_SEND_INTERVAL_MINUTES=1440;
export function validateScheduleInput(value){
 if(!value||typeof value!=='object'||typeof value.enabled!=='boolean')throw Object.assign(new Error('Informe se o envio automatico esta ligado ou desligado.'),{status:422});
 const n=value.intervalMinutes;
 if(!Number.isInteger(n)||n<MIN_SEND_INTERVAL_MINUTES||n>MAX_SEND_INTERVAL_MINUTES)
  throw Object.assign(new Error(`Intervalo deve ser de ${MIN_SEND_INTERVAL_MINUTES} a ${MAX_SEND_INTERVAL_MINUTES} minutos.`),{status:422});
 return {enabled:value.enabled,intervalMinutes:n};
}
export function newSchedule(raw={},now=Date.now()){
 const n=Number.isInteger(raw.intervalMinutes)&&raw.intervalMinutes>=MIN_SEND_INTERVAL_MINUTES&&raw.intervalMinutes<=MAX_SEND_INTERVAL_MINUTES?raw.intervalMinutes:20;
 // Nao fazer catch-up apos reinicio do Windows / auto-updater.
 return {enabled:raw.enabled===true,intervalMinutes:n,nextRunAt:raw.enabled===true?new Date(now+n*60_000).toISOString():null,
  lastRunAt:typeof raw.lastRunAt==='string'?raw.lastRunAt:null,lastResult:'Aguardando proximo horario. Nenhum envio iniciado ao abrir.'};
}
export function changeSchedule(old,input,now=Date.now()){
 const {enabled,intervalMinutes}=validateScheduleInput(input);
 return {...old,enabled,intervalMinutes,nextRunAt:enabled?new Date(now+intervalMinutes*60_000).toISOString():null,lastResult:enabled?'Programacao ativada.':'Programacao desativada.'};
}
export function scheduleDue(current,now=Date.now()){
 return current.enabled===true&&Number.isFinite(Date.parse(current.nextRunAt||''))&&Date.parse(current.nextRunAt)<=now;
}
export function reschedule(current,now=Date.now(),result='Rodada agendada'){
 return {...current,nextRunAt:current.enabled?new Date(now+current.intervalMinutes*60_000).toISOString():null,lastRunAt:new Date(now).toISOString(),lastResult:result};
}
export function pauseSchedule(current,reason){return {...current,enabled:false,nextRunAt:null,lastResult:String(reason).slice(0,280)};}
