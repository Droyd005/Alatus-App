import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('interface possui troca de número distinta de reinício da mesma sessão',()=>{
 assert.match(html,/id="reconnect"[^>]*>Reiniciar conexão \(mesmo número\)/);
 assert.match(html,/id="resetSession"[^>]*>Trocar número \/ novo QR/);
 assert.match(js,/post\('\/api\/session\/reset',\{confirm:'REDEFINIR SESSAO'\}\)/);
 assert.match(js,/result\.pendingReview/);
});
