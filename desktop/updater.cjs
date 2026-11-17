'use strict';
// Atualizador testável, sem depender do runtime do Electron nesta camada.
// Nunca instala enquanto há envio ativo; nenhuma atualização é silenciosa.
function createUpdateController({updater, app, dialog, getWindow, isBusy, stopBackend, log, isPackaged}) {
  let offered = false;
  let downloading = false;
  let installing = false;
  const report = (code, err) => log(`${code} ${err?.message || String(err)}`);
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;

  async function available(info) {
    if (offered || downloading || installing) return;
    offered = true;
    try {
      const busy = await isBusy();
      if (busy) { log('U02 Atualização adiada: há publicações ativas.'); return; }
      const choice = await dialog.showMessageBox(getWindow(), {
        type:'info', title:'ALATUS | Nova versão',
        message:`ALATUS ${info.version} disponível`,
        detail:'Deseja baixar a atualização oficial do GitHub? Seus dados e a sessão do WhatsApp serão preservados.',
        buttons:['Baixar atualização','Agora não'], defaultId:0, cancelId:1, noLink:true
      });
      if (choice.response !== 0) return;
      downloading = true;
      await updater.downloadUpdate();
    } catch(err) { downloading = false; report('U03 Falha no download:',err); }
  }

  async function downloaded(info) {
    downloading = false;
    if (installing) return;
    try {
      const busy = await isBusy();
      if (busy) { log('U04 Atualização baixada, mas envio em andamento: instalação adiada.'); return; }
      const choice = await dialog.showMessageBox(getWindow(), {
        type:'info', title:'ALATUS | Atualização pronta',
        message:`ALATUS ${info.version} pronto para instalar`,
        detail:'A instalação fechará o ALATUS e desconectará a sessão ativa, sem sair do WhatsApp ou apagar suas credenciais.',
        buttons:['Instalar e reiniciar','Depois'],defaultId:0,cancelId:1,noLink:true
      });
      if (choice.response !== 0) return;
      // Revalida a fila depois da confirmação para evitar corrida com novos envios.
      if (await isBusy()) { log('U04 Fila iniciou durante confirmação: instalação adiada.'); return; }
      installing = true;
      const safe = await stopBackend();
      if (!safe) { installing = false; log('U05 Backend não encerrou com segurança; atualização adiada.'); return; }
      updater.quitAndInstall(false, true);
    } catch(err) { installing=false;report('U05 Erro ao instalar:',err); }
  }

  async function check() {
    if (!isPackaged() || process.env.ALATUS_SKIP_UPDATES === '1') return false;
    try { await updater.checkForUpdates(); return true; }
    catch(err) { report('U01 Falha na verificação:',err); return false; }
  }

  updater.on('update-available', info => { void available(info); });
  updater.on('update-downloaded', info => { void downloaded(info); });
  updater.on('download-progress', progress => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.setProgressBar(Math.min(1,Math.max(0,progress.percent/100)));
  });
  updater.on('update-not-available', () => log('U00 Versão atualizada.'));
  updater.on('error', err => report('U01 Updater:',err));

  return {check, _test: {available,downloaded}};
}
module.exports = {createUpdateController};
