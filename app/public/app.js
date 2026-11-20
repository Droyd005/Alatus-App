'use strict';
const $=id=>document.getElementById(id);
let imageId=null,groups=[],requestId=crypto.randomUUID(),mode='simulacao',isBusy=false,ocrSeq=0,customCaption=false,activeJobId=null,activeBatchId=null,profile={company:'',phone:'',configured:false},cachedOutbox=[];
function message(el,text,kind=''){const target=$(el);target.textContent=text;target.className=`${el==='ocrStatus'?'notice':'toast'} ${kind}`;}
async function api(endpoint,options={}){
 const res=await fetch(endpoint,{credentials:'same-origin',...options,headers:{...(options.body?{'Content-Type':'application/json','X-Alatus-Request':'1'}:{}),...(options.headers||{})}});
 let data;try{data=await res.json();}catch{throw new Error('Resposta inválida do servidor.');}
 if(!res.ok)throw new Error(data.error||`Erro HTTP ${res.status}`);
 return data;
}
const post=(endpoint,data)=>api(endpoint,{method:'POST',body:JSON.stringify(data)});
function deliveryText(r){const label={aguardando_servidor:'aguardando confirmação do WhatsApp',confirmado_servidor:'confirmado pelo servidor WhatsApp',entrega_dispositivo:'recebido por ao menos um dispositivo',lido:'leitura registrada',reproduzido:'reprodução registrada',falhou:'FALHA de envio, confira o WhatsApp'};return label[r.deliveryStatus]||'sem confirmação de entrega';}
function labelStatus(s){return ({simulacao:'SIMULAÇÃO (SEM ENVIO)',real:'MODO REAL'})[s]||s;}
function setMode(newMode){mode=newMode;document.body.classList.remove('simulacao','real');document.body.classList.add(mode);}
function syncCaption(silent=false){
 const origin=$('origin').value.trim().replace(/\n+/g,' + '),destination=$('destination').value.trim().replace(/\n+/g,' + '),vehicle=$('vehicle').value.trim(),weight=$('weight').value.trim();
 if(!profile.configured||!profile.company||!profile.phone||!origin||!destination||!vehicle){
  $('caption').value='';
  if(!silent)message('sendStatus','Sem dados suficientes para gerar legenda. A imagem pode ser enviada sozinha.','warning');
  return false;
 }
 $('caption').value=`🚛 *${profile.company.toUpperCase()} | FRETE DISPONÍVEL*\n\n📍 *Coleta:* ${origin}\n🏁 *Entrega:* ${destination}\n🚚 *Veículo:* ${vehicle}${weight?`\n⚖️ *Peso:* ${weight}`:''}\n\n💰 *Valores a negociar*\n📲 *${profile.phone}*`;
 return true;
}

async function loadProfile(){
 const data=await api('/api/profile');profile=data.profile;
 $('companyName').value=profile.company||'';$('companyPhone').value=profile.phone||'';

 $('companySettings').open=!profile.configured;
 message('profileStatus',profile.configured?'Perfil configurado para esta instalação.':'Antes do primeiro envio, cadastre empresa e telefone.',profile.configured?'ok':'warning');
 if(!customCaption)syncCaption(true);
}
async function saveProfile(){try{
 const data=await post('/api/profile',{company:$('companyName').value,phone:$('companyPhone').value});
 profile=data.profile;requestId=crypto.randomUUID();customCaption=false;
 await loadProfile();syncCaption(true);message('profileStatus','Perfil salvo. A legenda foi atualizada.','ok');
 }catch(e){message('profileStatus',e.message,'bad');}
}
function resetContent(){for(const id of ['origin','destination','vehicle','weight','caption'])$(id).value='';customCaption=false;requestId=crypto.randomUUID();}
function imagePreview(id){
 imageId=id;++ocrSeq;resetContent();
 const image=$('preview');image.src='/api/image/'+encodeURIComponent(id);
 image.classList.remove('hidden');$('emptyPreview').classList.add('hidden');
 void pollOcr(id);
}
async function pollOcr(id){
 const seq=++ocrSeq;message('ocrStatus','Lendo o texto da imagem para gerar a legenda automaticamente…');
 let attempts=0;
 while(id===imageId&&seq===ocrSeq&&attempts++<90){
  try{
   let info=await api('/api/ocr/'+encodeURIComponent(id));
   if(info.ocr.status==='not_started'||info.ocr.status==='skipped'){
    info=await post('/api/analyze/'+encodeURIComponent(id),{});
   }
   const ocr=info.ocr;
   if(ocr.status==='ready'||ocr.status==='needs_review'){
    const d=ocr.data||{};
    if(id!==imageId||seq!==ocrSeq)return;
    $('origin').value=d.origin||'';$('destination').value=d.destination||'';$('vehicle').value=d.vehicle||'';$('weight').value=d.weight||'';
    customCaption=false;
    const complete=syncCaption(true);
    if(complete){message('ocrStatus',ocr.method==='ordem_da_arte'?'Legenda gerada automaticamente pela leitura da imagem. A sequência de cidades foi interpretada pela posição na arte; confira os dados acima.':'Legenda gerada automaticamente! Confira os dados detectados antes de usar.','ok');}
    else message('ocrStatus','OCR parcial: '+(ocr.missing||[]).join(', ')+'. A imagem será enviada sem legenda, a menos que você complete os dados.','warning');
    return;
   }
   if(ocr.status==='error'){
    message('ocrStatus','Não foi possível ler a imagem automaticamente. '+(ocr.error||'Erro desconhecido')+' Você pode preencher os campos manualmente.','bad');return;
   }
  }catch(e){message('ocrStatus',e.message,'bad');return;}
  await new Promise(resolve=>setTimeout(resolve,1200));
 }
 if(id===imageId&&seq===ocrSeq)message('ocrStatus','[E12] A análise demorou além do limite. Verifique a instalação OCR ou consulte o diagnóstico em docs/ERROS.md.','bad');
}
async function refreshImages(){const data=await api('/api/images'),list=$('recent'),old=imageId;list.replaceChildren(new Option('Selecione uma imagem',''));
 for(const im of data.images)list.add(new Option(`${im.filename||'Arte'} • ${new Date(im.createdAt).toLocaleString('pt-BR')}`,im.id));
 if(old&&data.images.some(x=>x.id===old))list.value=old;
}
async function fileUpload(file,selectAfter=true){if(!file)return;if(!/^image\/(png|jpeg|webp)$/.test(file.type)){message('uploadStatus','Formato inválido. Use PNG, JPG ou WEBP.','bad');return;}
 if(file.size>8000000){message('uploadStatus','Máximo 8 MB por imagem.','bad');return;}
 message('uploadStatus','Importando imagem…');
 try{
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Falha ao ler imagem.'));reader.readAsDataURL(file);});
  const res=await post('/api/upload',{data,filename:file.name});if(selectAfter)imagePreview(res.image.id);await refreshImages();message('uploadStatus',`Imagem importada: ${file.name}`,'ok');
 }catch(e){message('uploadStatus',e.message,'bad');}}
async function uploadFiles(list){
 const files=[...list];if(!files.length)return;
 for(let i=0;i<files.length;i++){
  message('uploadStatus',`Importando imagem ${i+1}/${files.length}: ${files[i].name}`);
  await fileUpload(files[i],i===files.length-1);
 }
 message('uploadStatus',`${files.length} arquivo(s) processado(s). Escolha uma arte para conferir a leitura automática. Se não houver legenda, poderá enviar somente a imagem.`, 'ok');
}
function currentPublication(){
 if(!imageId)throw new Error('Selecione uma imagem.');
 const groupIds=selectedGroups();if(!groupIds.length)throw new Error('Selecione ao menos um grupo para esta carga.');
 const origin=$('origin').value.trim().replace(/\n+/g,' + '),destination=$('destination').value.trim().replace(/\n+/g,' + '),vehicle=$('vehicle').value.trim(),weight=$('weight').value.trim(),caption=$('caption').value.trim();
 return {imageId,origin,destination,vehicle,weight,caption,groupIds,requestId};
}
async function addToOutbox(){
 if(isBusy||activeBatchId)return;
 try{
  isBusy=true;$('addToOutbox').disabled=true;
  const data=await post('/api/outbox/add',currentPublication());
  requestId=crypto.randomUUID();
  message('outboxStatus',`Carga incluída! ${data.item.groupIds.length} grupo(s) selecionado(s). Repita para as outras imagens.`, 'ok');
  await loadOutbox();
 }catch(e){message('outboxStatus',e.message,'bad');}
 finally{isBusy=false;$('addToOutbox').disabled=false;}
}
async function startOutbox(){
 try{
  $('startOutbox').disabled=true;
  const data=await post('/api/outbox/start',{});
  message('outboxStatus',`Fila iniciada: ${data.items} carga(s). Confira a evolução abaixo.`, 'ok');
  await loadOutbox();
 }catch(e){message('outboxStatus',e.message,'bad');await loadOutbox();}
}
async function repeatOutbox(){
 if(isBusy||activeBatchId||activeJobId)return;
 const items=cachedOutbox;
 if(!items.length||items.some(x=>!['simulado','submetido'].includes(x.status))){
  message('outboxStatus','Finalize ou revise as cargas pendentes antes de repetir a fila completa.','warning');return;
 }
 const total=items.reduce((n,item)=>n+item.groupIds.length,0);
 if(!confirm(`Reenviar ${items.length} arte(s) para ${total} grupo(s) no total?\n\nEste comando iniciará uma NOVA rodada de publicações. As mensagens já enviadas serão publicadas novamente somente após sua confirmação.`))return;
 isBusy=true;$('repeatOutbox').disabled=true;
 try{
  const data=await post('/api/outbox/start',{repeat:true,confirm:'REPETIR FILA'});
  message('outboxStatus',`Nova rodada iniciada: ${data.items} carga(s). Os cadastros ficarão salvos para reutilização.`, 'ok');
  await loadOutbox();
 }catch(e){message('outboxStatus',e.message,'bad');await loadOutbox();}
 finally{isBusy=false;await loadOutbox();}
}
async function loadOutbox(){
 try{
  const data=await api('/api/outbox');activeBatchId=data.activeBatchId;
  if(data.lastBatchError)message('outboxStatus','Falha do lote: '+data.lastBatchError,'bad');
  const items=data.items||[],pending=items.filter(i=>i.status==='pendente');cachedOutbox=items;
  $('startOutbox').disabled=!!activeBatchId||!!activeJobId||isBusy||!pending.length||!!data.uncertainSendBlock;
  $('repeatOutbox').disabled=!!activeBatchId||!!activeJobId||isBusy||!items.length||items.some(i=>!['simulado','submetido'].includes(i.status))||!!data.uncertainSendBlock;
  $('addToOutbox').disabled=!!activeBatchId||isBusy;
  $('cancelOutbox').classList.toggle('hidden',!activeBatchId);
  $('clearOutbox').disabled=!!activeBatchId||!items.some(i=>['simulado','submetido','interrompido_pelo_usuario'].includes(i.status));
  $('outboxProgress').classList.toggle('hidden',!activeBatchId);
  if(activeBatchId){const done=items.filter(i=>i.status!=='pendente').length;const progress=items.reduce((n,i)=>n+(i.progress?.done||0),0);
   $('outboxProgress').textContent=`Lote ativo: ${done} carga(s) iniciada(s), ${progress} grupo(s) processado(s). Você pode interromper os próximos envios.`;}
  const target=$('outboxItems');target.replaceChildren();
  if(!items.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Nenhuma carga na fila. Importe uma arte e clique em Adicionar esta carga à fila.';target.append(empty);return;}
  const summary=document.createElement('p');summary.className='muted';summary.textContent=`${pending.length} pendente(s) • ${items.length} carga(s) salvas${items.length&&!pending.length&&items.every(i=>['simulado','submetido'].includes(i.status))?' • Pronta para reenviar':''}`;target.append(summary);
  for(const [index,item] of items.entries()){
   const box=document.createElement('div');box.className='outbox-item';
   const thumb=document.createElement('img');thumb.className='outbox-thumb';thumb.alt='Prévia da carga';thumb.src='/api/image/'+encodeURIComponent(item.imageId);
   const info=document.createElement('div');info.className='outbox-info';
   const title=document.createElement('strong');title.textContent=item.origin&&item.destination?`${index+1}. ${item.origin} → ${item.destination}`:`${index+1}. Imagem ${item.imageId?.slice(0,8)||'sem rota'}`;
   const details=document.createElement('div');details.className='muted';const retry=item.retryGroupIds?.length?` • ${item.retryGroupIds.length} reenvio(s) por falha confirmada na proxima programacao`:'';const times=Number.isInteger(item.sendCount)?item.sendCount:(['simulado','submetido'].includes(item.status)?1:0);details.textContent=`${item.vehicle||'Veículo não informado'} • ${item.caption?'com legenda':'imagem sem legenda'} • ${item.groupIds.length} grupos • ${item.status} • ${item.progress?.done||0}/${item.progress?.total||0} • ${times} rodada(s) concluída(s)${retry}`;
   const destinations=document.createElement('div');destinations.className='muted';destinations.textContent=(item.groupNames||[]).join(' · ');
   info.append(title,details,destinations);
   if(item.error){const err=document.createElement('div');err.className='bad';err.textContent=item.error;info.append(err);}
   for(const result of item.results||[]){const line=document.createElement('div');line.className='muted';line.textContent=`• ${result.groupName}: ${result.status}${result.status==='submetido'?' | '+deliveryText(result):''}`;info.append(line);}
   const remove=document.createElement('button');remove.type='button';remove.className='btn secondary outbox-remove';remove.textContent='Remover';remove.disabled=!!activeBatchId;
   remove.addEventListener('click',async()=>{try{await post('/api/outbox/remove',{id:item.id});await loadOutbox();}catch(e){message('outboxStatus',e.message,'bad');}});
   box.append(thumb,info,remove);target.append(box);
  }
 }catch(e){message('outboxStatus','Não foi possível consultar a fila: '+e.message,'bad');}
}
let scheduleLoaded=false;
async function loadSchedule(force=false){
 try{
  const {schedule}=await api('/api/schedule');
  if(!scheduleLoaded||force){$('scheduleEnabled').checked=!!schedule.enabled;$('scheduleMinutes').value=schedule.intervalMinutes||20;scheduleLoaded=true;}
  const next=schedule.enabled&&schedule.nextRunAt?' Próximo horário: '+new Date(schedule.nextRunAt).toLocaleString('pt-BR')+'.':'';
  message('scheduleStatus',(schedule.enabled?'Agendamento ligado. ':'Agendamento desligado. ')+(schedule.lastResult||'')+next,schedule.enabled?'ok':'');
 }catch(e){message('scheduleStatus','Erro ao ler programação: '+e.message,'bad');}
}
async function saveSchedule(){
 const enabled=$('scheduleEnabled').checked;
 const intervalMinutes=Number($('scheduleMinutes').value);
 if(!Number.isSafeInteger(intervalMinutes)||intervalMinutes<=0){message('scheduleStatus','Informe um intervalo positivo em minutos inteiros.','bad');return;}
 if(enabled){
  const total=cachedOutbox.reduce((n,item)=>n+(item.groupIds?.length||0),0);
  if(!cachedOutbox.length){message('scheduleStatus','Cadastre a fila antes de ativar o envio automático.','bad');return;}
  if(!confirm(`Ativar reenvio automático a cada ${intervalMinutes} minutos?\n\nA fila contém ${cachedOutbox.length} artes e ${total} destinatários por rodada. Os grupos devem ter autorizado essas mensagens. O envio começa apenas no próximo horário, enquanto o aplicativo estiver aberto.`))return;
 }
 $('saveSchedule').disabled=true;
 try{
  const {schedule}=await post('/api/schedule',{enabled,intervalMinutes,confirm:enabled?'ATIVAR AUTOMATICO':undefined});
  $('scheduleEnabled').checked=schedule.enabled;$('scheduleMinutes').value=schedule.intervalMinutes;
  await loadSchedule(true);
 }catch(e){message('scheduleStatus',e.message,'bad');}
 finally{$('saveSchedule').disabled=false;}
}

function updateSelectedCount(){const selected=selectedGroups().length,total=groups.length;
 $('selectedCount').textContent=`${selected} de ${total} grupo(s) selecionado(s)`;
 $('selectAll').disabled=!total||selected===total;
 $('clearAll').disabled=!selected;
}
function renderGroups(){const container=$('groups'),previous=new Set(selectedGroups());container.replaceChildren();
 if(!groups.length){const p=document.createElement('p');p.textContent='Nenhum grupo disponível. Conecte ou atualize.';container.append(p);updateSelectedCount();return;}
 for(const g of groups){const lab=document.createElement('label');lab.className='group';const box=document.createElement('input');box.type='checkbox';box.value=g.id;box.checked=previous.has(g.id);box.addEventListener('change',updateSelectedCount);
 const span=document.createElement('span');span.textContent=g.name+(g.demo?' [TESTE]':'');lab.append(box,span);container.append(lab);}
 updateSelectedCount();
}
function selectedGroups(){return [...$('groups').querySelectorAll('input:checked')].map(n=>n.value);}
function toggleAllGroups(checked){for(const input of $('groups').querySelectorAll('input[type=checkbox]'))input.checked=checked;updateSelectedCount();}
async function updateStatus(){try{const s=await api('/api/status');setMode(s.mode);
 const labels={conectado:'WhatsApp conectado.',aguardando_qr:'Escaneie o QR em Dispositivos conectados no WhatsApp.',finalizando_pareamento:'QR lido. Finalizando pareamento automaticamente, não escaneie novamente.',reconectando:'Reconectando automaticamente…',reiniciando:'Reiniciando conexão…',conectando:'Conectando ao WhatsApp…',sessao_encerrada:'Sessão inválida. Clique em Trocar número / novo QR para conectar outra conta.',erro:'Falha na conexão. Reinicie ou veja o diagnóstico.',desconectado:'WhatsApp desconectado.'};
 $('waStatus').textContent=s.mode==='simulacao'?'SIMULAÇÃO: nenhum WhatsApp conectado. Use os grupos de teste.':(labels[s.status]||`Estado: ${s.status}.`)+(s.connectedNumber?' Número conectado: '+s.connectedNumber+'.':'')+(s.lastError?' '+s.lastError:'');
 $('qr').classList.toggle('hidden',!s.qr);if(s.qr)$('qr').src=s.qr;
 $('connect').disabled=s.mode==='simulacao'||s.status==='conectado'||s.status==='aguardando_qr'||s.status==='conectando'||s.status==='finalizando_pareamento'||s.status==='reconectando';
 $('reconnect').disabled=s.mode==='simulacao'||!!s.activeJobId;
 $('resetSession').disabled=s.mode==='simulacao'||!!s.activeJobId||!!s.activeBatchId;
 return s;
 }catch(e){$('waStatus').textContent=e.message;}}
async function loadGroups(){message('groupStatus','Consultando grupos…');try{const ret=await api('/api/groups');groups=ret.groups||[];renderGroups();message('groupStatus',`${groups.length} grupo(s) encontrado(s).`,'ok');}catch(e){groups=[];renderGroups();message('groupStatus',e.message,'bad');}}
async function loadJobs(){try{const data=await api('/api/jobs');
 activeJobId=data.activeJobId||null;
 $('send').disabled=!!activeJobId||!!activeBatchId||isBusy||!!data.uncertainSendBlock;
  $('clearJobs').disabled=!!activeJobId||!!activeBatchId||isBusy||!data.jobs.some(j=>['simulado','submetido','interrompido_pelo_usuario'].includes(j.status));
 $('cancelSend').classList.toggle('hidden',!activeJobId);
 if(activeJobId){const job=data.jobs.find(j=>j.id===activeJobId);
  $('queueProgress').classList.remove('hidden');
  $('queueProgress').textContent=`Fila em execução: ${job?.progress?.done??0} de ${job?.progress?.total??'?'} grupos processados. Envio em até 3 grupos em paralelo, sem repetição automática de erros. Ao fechar o aplicativo, os próximos envios serão interrompidos.`;
 }else{
  $('queueProgress').classList.add('hidden');
  if(data.uncertainSendBlock)message('sendStatus','Envio bloqueado após timeout incerto. Confira o WhatsApp e reinicie o servidor.','bad');
 }
 $('history').replaceChildren();for(const j of data.jobs){const div=document.createElement('div');div.className='history';
  const summary=document.createElement('div');summary.className='job-status';summary.textContent=`${new Date(j.createdAt).toLocaleString('pt-BR')} | ${j.mode} | ${j.status}${j.progress?' | '+j.progress.done+'/'+j.progress.total:''}`;div.append(summary);
  const line=document.createElement('div');line.textContent=j.origin&&j.destination?`${j.origin} → ${j.destination}`:'Imagem enviada sem rota informada';div.append(line);
  for(const r of j.results||[]){const detail=document.createElement('div');detail.textContent=`• ${r.groupName}: ${r.status}${r.status==='submetido'?' | '+deliveryText(r):''}${r.error?' ('+r.error+')':''}`;div.append(detail);}
  $('history').append(div);}if(!data.jobs.length)$('history').textContent='Sem publicações registradas.';
 }catch(e){$('history').textContent=e.message;}}
async function publish(){if(isBusy)return;const groupIds=selectedGroups();if(!imageId){message('sendStatus','Selecione uma arte primeiro.','bad');return;}
 if(!groupIds.length){message('sendStatus','Selecione pelo menos um grupo.','bad');return;}
 // Este botão é o único comando explícito de envio. Não existe disparo ao importar a imagem.
 isBusy=true;$('send').disabled=true;message('sendStatus',mode==='real'?'Enviando para os grupos selecionados…':'Simulando envio…');
 const payload={imageId,origin:$('origin').value.trim().replace(/\n+/g,' + '),destination:$('destination').value.trim().replace(/\n+/g,' + '),vehicle:$('vehicle').value.trim(),weight:$('weight').value.trim(),caption:$('caption').value.trim(),groupIds,requestId};
 try{const ret=await post('/api/send',payload);requestId=crypto.randomUUID();
 message('sendStatus',`Fila iniciada: ${ret.job.progress.total} grupo(s) selecionado(s). O histórico será atualizado automaticamente.`, 'ok');await loadJobs();
 }catch(e){message('sendStatus',e.message,'bad');await loadJobs();}
 finally{isBusy=false;await loadJobs();}}
$('saveProfile').addEventListener('click',saveProfile);
$('drop').addEventListener('click',()=>$('file').click());$('drop').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('file').click();}});
$('drop').addEventListener('dragover',e=>{e.preventDefault();$('drop').classList.add('drag');});$('drop').addEventListener('dragleave',()=>$('drop').classList.remove('drag'));
$('drop').addEventListener('drop',e=>{e.preventDefault();$('drop').classList.remove('drag');void uploadFiles(e.dataTransfer.files);});$('file').addEventListener('change',e=>{void uploadFiles(e.target.files);e.target.value='';});
$('recent').addEventListener('change',e=>{if(e.target.value)imagePreview(e.target.value);});
for(const id of ['origin','destination','vehicle','weight'])$(id).addEventListener('input',()=>{requestId=crypto.randomUUID();if(!customCaption)syncCaption(true);});
$('caption').addEventListener('input',()=>{customCaption=true;requestId=crypto.randomUUID();});
$('generate').addEventListener('click',()=>{customCaption=false;syncCaption();});
$('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('caption').value);message('sendStatus','Legenda copiada.','ok');}catch{message('sendStatus','Não foi possível copiar. Selecione o texto manualmente.','bad');}});
$('connect').addEventListener('click',async()=>{message('groupStatus','Iniciando conexão…');try{await post('/api/connect',{});await updateStatus();message('groupStatus','Conexão iniciada. Aguarde o QR ou atualize o status.','ok');}catch(e){message('groupStatus',e.message,'bad');}});
$('loadGroups').addEventListener('click',loadGroups);
$('selectAll').addEventListener('click',()=>toggleAllGroups(true));
$('clearAll').addEventListener('click',()=>toggleAllGroups(false));
$('reconnect').addEventListener('click',async()=>{message('groupStatus','Reiniciando conexão sem apagar credenciais…');try{await post('/api/reconnect',{});groups=[];renderGroups();await updateStatus();message('groupStatus','Conexão reiniciada. Aguarde o QR ou a reconexão automática.','ok');}catch(e){message('groupStatus',e.message,'bad');}});
$('resetSession').addEventListener('click',async()=>{
 if(!confirm('Trocar a conta de WhatsApp conectada?\n\nA sessão anterior ficará arquivada e será gerado um QR para o NOVO número. As cargas pendentes não serão enviadas automaticamente.'))return;
 $('resetSession').disabled=true;
 try{
  message('groupStatus','Arquivando a conta anterior e preparando novo QR…');
  const result=await post('/api/session/reset',{confirm:'REDEFINIR SESSAO'});
  groups=[];renderGroups();await updateStatus();await loadOutbox();
  message('groupStatus',`Sessão anterior arquivada. No NOVO WhatsApp, abra Dispositivos conectados > Conectar dispositivo e escaneie o QR.${result.pendingReview?` ${result.pendingReview} carga(s) pendente(s) precisam ser adicionadas novamente.`:''}`,'ok');
 }catch(e){message('groupStatus',e.message,'bad');}
 finally{await updateStatus();}
});
$('cancelSend').addEventListener('click',async()=>{if(!activeJobId)return;try{await post('/api/cancel',{jobId:activeJobId});message('sendStatus','Interrupção solicitada. A mensagem atual pode ainda ser enviada; o restante será interrompido.','warning');}catch(e){message('sendStatus',e.message,'bad');}});
 $('clearJobs').addEventListener('click',async()=>{
  if(activeBatchId||activeJobId||isBusy){message('historyStatus','Aguarde o término dos envios para limpar o histórico.','warning');return;}
  if(!confirm('Excluir o histórico de envios finalizados? Registros com resultado incerto serão mantidos para conferência.'))return;
  $('clearJobs').disabled=true;
  try{const result=await post('/api/jobs/clear',{});
   await loadJobs();message('historyStatus',`${result.removed} registro(s) removido(s). ${result.preserved} registro(s) de revisão preservado(s).`,'ok');
  }catch(e){message('historyStatus',e.message,'bad');await loadJobs();}
 });
$('reloadJobs').addEventListener('click',loadJobs);$('send').addEventListener('click',publish);
$('saveSchedule').addEventListener('click',saveSchedule);
$('addToOutbox').addEventListener('click',addToOutbox);$('startOutbox').addEventListener('click',startOutbox);$('repeatOutbox').addEventListener('click',repeatOutbox);
$('cancelOutbox').addEventListener('click',async()=>{if(!activeBatchId)return;try{await post('/api/outbox/cancel',{batchId:activeBatchId});message('outboxStatus','Parada solicitada. Aguarde o envio atual e confira o histórico.','warning');}catch(e){message('outboxStatus',e.message,'bad');}});
$('clearOutbox').addEventListener('click',async()=>{if(!confirm('Excluir definitivamente os itens finalizados da fila salva? Você precisará cadastrá-los novamente para enviar essas artes.'))return;try{await post('/api/outbox/clear',{});await loadOutbox();}catch(e){message('outboxStatus',e.message,'bad');}});
(async()=>{try{const res=await api('/api/status');setMode(res.mode);await loadProfile();await Promise.all([updateStatus(),refreshImages(),loadJobs(),loadOutbox(),loadSchedule(true)]);await loadGroups();}catch(e){message('sendStatus','Falha ao iniciar: '+e.message,'bad');}})();
setInterval(updateStatus,4500);
setInterval(loadJobs,2200);
setInterval(loadOutbox,2200);

setInterval(()=>{void loadSchedule();},12000);
