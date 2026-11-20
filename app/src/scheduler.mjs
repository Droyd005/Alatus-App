// Intervalo configuravel, sem teto artificial; impede horarios invalidos e lotes sobrepostos.
export function validInterval(minutes,now=Date.now()){
 return Number.isSafeInteger(minutes)&&minutes>0&&Number.isFinite(new Date(now+minutes*60_000).getTime());
}
export function validateScheduleInput(value,now=Date.now()){
 if(!value||typeof value!=='object'||typeof value.enabled!=='boolean')
  throw Object.assign(new Error('Informe se o envio automatico esta ligado ou desligado.'),{status:422});
 const n=value.intervalMinutes;
 if(!validInterval(n,now))throw Object.assign(new Error('Informe um intervalo positivo em minutos inteiros (por exemplo: 1, 5, 20 ou 2880).'),{status:422});
 return {enabled:value.enabled,intervalMinutes:n};
}
export function newSchedule(raw={},now=Date.now()){
 const n=validInterval(raw.intervalMinutes,now)?raw.intervalMinutes:20;
 // Sem reexecutar horarios antigos apos reiniciar ou atualizar o aplicativo.
 return {enabled:raw.enabled===true,intervalMinutes:n,nextRunAt:raw.enabled===true?new Date(now+n*60_000).toISOString():null,
  lastRunAt:typeof raw.lastRunAt==='string'?raw.lastRunAt:null,lastResult:'Aguardando proximo horario. Nenhum envio iniciado ao abrir.'};
}
export function changeSchedule(old,input,now=Date.now()){
 const {enabled,intervalMinutes}=validateScheduleInput(input,now);
 return {...old,enabled,intervalMinutes,nextRunAt:enabled?new Date(now+intervalMinutes*60_000).toISOString():null,lastResult:enabled?'Programacao ativada.':'Programacao desativada.'};
}
export function scheduleDue(current,now=Date.now()){
 return current.enabled===true&&Number.isFinite(Date.parse(current.nextRunAt||''))&&Date.parse(current.nextRunAt)<=now;
}
export function reschedule(current,now=Date.now(),result='Rodada agendada'){
 return {...current,nextRunAt:current.enabled?new Date(now+current.intervalMinutes*60_000).toISOString():null,lastRunAt:new Date(now).toISOString(),lastResult:result};
}
export function pauseSchedule(current,reason){return {...current,enabled:false,nextRunAt:null,lastResult:String(reason).slice(0,280)};}
