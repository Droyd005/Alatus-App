import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
test('painel usa logo e fundo oficial sem etapas nem indicador de modo',()=>{
 assert.match(html,/alatus-emblem\.png/);assert.match(html,/alatus-wallpaper\.webp/);
 assert.match(html,/brand-wordmark/);
 assert.ok(!html.includes('ETAPA 1'));
 assert.ok(!html.includes('id="mode"'));
 assert.ok(!html.includes('Servidor local 127.0.0.1'));
 assert.ok(fs.existsSync(new URL('../public/brand/alatus-emblem.png',import.meta.url)));
 assert.ok(fs.existsSync(new URL('../public/brand/alatus-wallpaper.webp',import.meta.url)));
});
test('limpar histórico exige confirmação e usa rota restrita para finalizados',()=>{
 assert.match(html,/id="clearJobs"/);assert.match(html,/id="historyStatus"/);
 assert.match(js,/confirm\('Excluir o histórico/);
 assert.match(js,/\/api\/jobs\/clear/);
 assert.match(server,/pathname==='\/api\/jobs\/clear'/);
 assert.match(server,/if\(busy\|\|activeJobId\|\|activeBatchId\)/);
});
