'use strict';
const $=id=>document.getElementById(id);
let imageId=null,groups=[],requestId=crypto.randomUUID(),mode='simulacao',isBusy=false,ocrSeq=0,customCaption=false,activeJobId=null,activeBatchId=null,profile={company:'',phone:'',configured:false};
function message(el,text,kind=''){const target=$(el);target.textContent=text;target.className=`${el==='ocrStatus'?'notice':'toast'} ${kind}`;}
async function api(endpoint,options={}){
 const res=await fetch(endpoint,{credentials:'same-origin',...options,headers:{...(options.body?{'Content-Type':'application/json','X-Alatus-Request':'1'}:{}),...(options.headers||{})}});
 let data;try{data=await res.json();}catch{throw new Error('Resposta inválida do servidor.');}
 if(!res.ok)throw new Error(data.error||`Erro HTTP ${res.status}`);
 return data;
}
const post=(endpoint,data)=>api(endpoint,{method:'POST',body:JSON.stringify(data)});
function labelStatus(s){return ({simulacao:'SIMULAÇÃO (SEM ENVIO)',real:'MODO REAL'})[s]||s;}
function setMode(newMode){mode=newMode;document.body.classList.remove('simulacao','real');document.body.classList.add(mode);$('mode').textContent=labelStatus(mode);}
function syncCaption(silent=false){
 const origin=$('origin').value.trim().replace(/\n+/g,' + '),destination=$('destination').value.trim().replace(/\n+/g,' + '),vehicle=$('vehicle').value.trim();
 if(!profile.configured||!profile.company||!profile.phone){$('caption').value='';if(!silent)message('sendStatus','Configure empresa e contato para gerar a legenda.','warning');return false;}
 if(!origin||!destination||!vehicle){$('caption').value='';if(!silent)message('sendStatus','Preencha os campos ainda não reconhecidos para gerar a legenda.','warning');return false;}
 $('caption').value=`🚛 *${profile.company.toUpperCase()} | FRETE DISPONÍVEL*\n\n📍 *Coleta:* ${origin}\n🏁 *Entrega:* ${destination}\n❄️ *Veículo:* ${vehicle}\n\n💰 *Valores a negociar*\n📲 *${profile.phone}*`;
 return true;
}
async function loadProfile(){
 const data=await api('/api/profile');profile=data.profile;
 $('companyName').value=profile.company||'';$('companyPhone').value=profile.phone||'';
 $('brandTitle').textContent=profile.company||'PUBLICADOR DE FRETES';
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
function resetContent(){for(const id of ['origin','destination','vehicle','caption'])$(id).value='';customCaption=false;requestId=crypto.randomUUID();}
function imagePreview(id){imageId=id;resetContent();const image=$('preview');image.src='/api/image/'+encodeURIComponent(id);image.classList.remove('hidden');$('emptyPreview').classList.add('hidden');void pollOcr(id);}
async function pollOcr(id){
 const seq=++ocrSeq;message('ocrStatus','Lendo o texto da imagem para gerar a legenda automaticamente…');
 let attempts=0;
 while(id===imageId&&seq===ocrSeq&&attempts++<90){
  try{
   let info=await api('/api/ocr/'+encodeURIComponent(id));
   if(info.ocr.status==='not_started'){
    info=await post('/api/analyze/'+encodeURIComponent(id),{});
   }
   const ocr=info.ocr;
   if(ocr.status==='ready'||ocr.status==='needs_review'){
    const d=ocr.data||{};
    if(id!==imageId||seq!==ocrSeq)return;
    $('origin').value=d.origin||'';$('destination').value=d.destination||'';$('vehicle').value=d.vehicle||'';
    customCaption=false;
    const complete=syncCaption(true);
    if(complete){message('ocrStatus',ocr.method==='ordem_da_arte'?'Legenda gerada automaticamente pela leitura da imagem. A sequência de cidades foi interpretada pela posição na arte; confira os dados acima.':'Legenda gerada automaticamente! Confira os dados detectados antes de usar.','ok');}
    else message('ocrStatus','Reconhecimento parcial. Não consegui identificar: '+(ocr.missing||[]).join(', ')+'. Complete os campos acima para gerar a legenda automaticamente.','warning');
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
 message('uploadStatus',`${files.length} arquivo(s) processado(s). Escolha uma arte na lista, aguarde o OCR e adicione à fila.`, 'ok');
}
function currentPublication(){
 if(!profile.configured)throw new Error('Configure empresa e telefone no topo do painel.');
 if(!imageId)throw new Error('Selecione uma imagem.');
 const groupIds=selectedGroups();if(!groupIds.length)throw new Error('Selecione ao menos um grupo para esta carga.');
 const origin=$('origin').value.trim().replace(/\n+/g,' + '),destination=$('destination').value.trim().replace(/\n+/g,' + '),vehicle=$('vehicle').value.trim(),caption=$('caption').value.trim();
 if(!origin||!destination||!vehicle||!caption)throw new Error('Aguarde o OCR e confira origem, destino, veículo e legenda.');
 return {imageId,origin,destination,vehicle,caption,groupIds,requestId};
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
async function loadOutbox(){
 try{
  const data=await api('/api/outbox');activeBatchId=data.activeBatchId;
  if(data.lastBatchError)message('outboxStatus','Falha do lote: '+data.lastBatchError,'bad');
  const items=data.items||[],pending=items.filter(i=>i.status==='pendente');
  $('startOutbox').disabled=!!activeBatchId||!!activeJobId||isBusy||!pending.length||!!data.uncertainSendBlock;
  $('addToOutbox').disabled=!!activeBatchId||isBusy;
  $('cancelOutbox').classList.toggle('hidden',!activeBatchId);
  $('clearOutbox').disabled=!!activeBatchId||!items.some(i=>['simulado','submetido','interrompido_pelo_usuario'].includes(i.status));
  $('outboxProgress').classList.toggle('hidden',!activeBatchId);
  if(activeBatchId){const done=items.filter(i=>i.status!=='pendente').length;const progress=items.reduce((n,i)=>n+(i.progress?.done||0),0);
   $('outboxProgress').textContent=`Lote ativo: ${done} carga(s) iniciada(s), ${progress} grupo(s) processado(s). Você pode interromper os próximos envios.`;}
  const target=$('outboxItems');target.replaceChildren();
  if(!items.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Nenhuma carga na fila. Importe uma arte e clique em Adicionar esta carga à fila.';target.append(empty);return;}
  const summary=document.createElement('p');summary.className='muted';summary.textContent=`${pending.length} pendente(s) • ${items.length} carga(s) cadastrada(s)`;target.append(summary);
  for(const [index,item] of items.entries()){
   const box=document.createElement('div');box.className='outbox-item';
   const thumb=document.createElement('img');thumb.className='outbox-thumb';thumb.alt='Prévia da carga';thumb.src='/api/image/'+encodeURIComponent(item.imageId);
   const info=document.createElement('div');info.className='outbox-info';
   const title=document.createElement('strong');title.textContent=`${index+1}. ${item.origin} → ${item.destination}`;
   const details=document.createElement('div');details.className='muted';details.textContent=`${item.vehicle} • ${item.groupIds.length} grupos • ${item.status} • ${item.progress?.done||0}/${item.progress?.total||0}`;
   const destinations=document.createElement('div');destinations.className='muted';destinations.textContent=(item.groupNames||[]).join(' · ');
   info.append(title,details,destinations);
   if(item.error){const err=document.createElement('div');err.className='bad';err.textContent=item.error;info.append(err);}
   for(const result of item.results||[]){const line=document.createElement('div');line.className='muted';line.textContent=`• ${result.groupName}: ${result.status}`;info.append(line);}
   const remove=document.createElement('button');remove.type='button';remove.className='btn secondary outbox-remove';remove.textContent='Remover';remove.disabled=!!activeBatchId;
   remove.addEventListener('click',async()=>{try{await post('/api/outbox/remove',{id:item.id});await loadOutbox();}catch(e){message('outboxStatus',e.message,'bad');}});
   box.append(thumb,info,remove);target.append(box);
  }
 }catch(e){message('outboxStatus','Não foi possível consultar a fila: '+e.message,'bad');}
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
 $('cancelSend').classList.toggle('hidden',!activeJobId);
 if(activeJobId){const job=data.jobs.find(j=>j.id===activeJobId);
  $('queueProgress').classList.remove('hidden');
  $('queueProgress').textContent=`Fila em execução: ${job?.progress?.done??0} de ${job?.progress?.total??'?'} grupos processados. Envio individual sem pausa fixa entre grupos. Ao fechar o aplicativo, os próximos envios serão interrompidos.`;
 }else{
  $('queueProgress').classList.add('hidden');
  if(data.uncertainSendBlock)message('sendStatus','Envio bloqueado após timeout incerto. Confira o WhatsApp e reinicie o servidor.','bad');
 }
 $('history').replaceChildren();for(const j of data.jobs){const div=document.createElement('div');div.className='history';
  const summary=document.createElement('div');summary.className='job-status';summary.textContent=`${new Date(j.createdAt).toLocaleString('pt-BR')} | ${j.mode} | ${j.status}${j.progress?' | '+j.progress.done+'/'+j.progress.total:''}`;div.append(summary);
  const line=document.createElement('div');line.textContent=`${j.origin} → ${j.destination}`;div.append(line);
  for(const r of j.results||[]){const detail=document.createElement('div');detail.textContent=`• ${r.groupName}: ${r.status}${r.error?' ('+r.error+')':''}`;div.append(detail);}
  $('history').append(div);}if(!data.jobs.length)$('history').textContent='Sem publicações registradas.';
 }catch(e){$('history').textContent=e.message;}}
async function publish(){if(isBusy)return;if(!profile.configured){message('sendStatus','Configure empresa e telefone no topo do painel.','bad');$('companySettings').open=true;return;}const groupIds=selectedGroups();if(!imageId){message('sendStatus','Selecione uma arte primeiro.','bad');return;}
 if(!groupIds.length){message('sendStatus','Selecione pelo menos um grupo.','bad');return;}
 if(!($('origin').value.trim()&&$('destination').value.trim()&&$('vehicle').value.trim()&&$('caption').value.trim())){message('sendStatus','Os dados da carga estão incompletos. Corrija antes de enviar.','bad');return;}
 // Este botão é o único comando explícito de envio. Não existe disparo ao importar a imagem.
 isBusy=true;$('send').disabled=true;message('sendStatus',mode==='real'?'Enviando para os grupos selecionados…':'Simulando envio…');
 const payload={imageId,origin:$('origin').value.trim().replace(/\n+/g,' + '),destination:$('destination').value.trim().replace(/\n+/g,' + '),vehicle:$('vehicle').value.trim(),caption:$('caption').value.trim(),groupIds,requestId};
 try{const ret=await post('/api/send',payload);requestId=crypto.randomUUID();
 message('sendStatus',`Fila iniciada: ${ret.job.progress.total} grupo(s) selecionado(s). O histórico será atualizado automaticamente.`, 'ok');await loadJobs();
 }catch(e){message('sendStatus',e.message,'bad');await loadJobs();}
 finally{isBusy=false;await loadJobs();}}
$('saveProfile').addEventListener('click',saveProfile);
$('drop').addEventListener('click',()=>$('file').click());$('drop').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('file').click();}});
$('drop').addEventListener('dragover',e=>{e.preventDefault();$('drop').classList.add('drag');});$('drop').addEventListener('dragleave',()=>$('drop').classList.remove('drag'));
$('drop').addEventListener('drop',e=>{e.preventDefault();$('drop').classList.remove('drag');void uploadFiles(e.dataTransfer.files);});$('file').addEventListener('change',e=>{void uploadFiles(e.target.files);e.target.value='';});
$('recent').addEventListener('change',e=>{if(e.target.value)imagePreview(e.target.value);});
for(const id of ['origin','destination','vehicle'])$(id).addEventListener('input',()=>{requestId=crypto.randomUUID();if(!customCaption)syncCaption(true);});
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
$('reloadJobs').addEventListener('click',loadJobs);$('send').addEventListener('click',publish);
$('addToOutbox').addEventListener('click',addToOutbox);$('startOutbox').addEventListener('click',startOutbox);
$('cancelOutbox').addEventListener('click',async()=>{if(!activeBatchId)return;try{await post('/api/outbox/cancel',{batchId:activeBatchId});message('outboxStatus','Parada solicitada. Aguarde o envio atual e confira o histórico.','warning');}catch(e){message('outboxStatus',e.message,'bad');}});
$('clearOutbox').addEventListener('click',async()=>{try{await post('/api/outbox/clear',{});await loadOutbox();}catch(e){message('outboxStatus',e.message,'bad');}});
(async()=>{try{const res=await api('/api/status');setMode(res.mode);await loadProfile();await Promise.all([updateStatus(),refreshImages(),loadJobs(),loadOutbox()]);await loadGroups();}catch(e){message('sendStatus','Falha ao iniciar: '+e.message,'bad');}})();
setInterval(updateStatus,4500);
setInterval(loadJobs,2200);
setInterval(loadOutbox,2200);
