import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ps=readFileSync(new URL('../../RECUPERAR_VERSAO.ps1',import.meta.url),'utf8');
const docs=readFileSync(new URL('../../docs/ROLLBACK.md',import.meta.url),'utf8');
const changelog=readFileSync(new URL('../../CHANGELOG.md',import.meta.url),'utf8');
const packageJson=JSON.parse(readFileSync(new URL('../../desktop/package.json',import.meta.url),'utf8'));

test('rollback preserva main e publica restauracao como nova tag atomica',()=>{
 assert.match(ps,/restore','--source'/);
 assert.match(ps,/push','--atomic'/);
 assert.match(ps,/Read-Host/);
 assert.match(ps,/backup-pre-rollback-/);
 assert.doesNotMatch(ps,/['"]push['"],['"]--force['"]/);
 assert.match(ps,/Set-AlatusVersion/);
});

test('documenta compatibilidade do updater e mantém a versao 0.8.8',()=>{
 assert.equal(packageJson.version,'0.8.8');
 assert.match(docs,/nova vers[aã]o/i);
 assert.match(changelog,/\[0\.8\.8\]/);
 assert.match(changelog,/Apagar TODO o hist[oó]rico/i);
});
