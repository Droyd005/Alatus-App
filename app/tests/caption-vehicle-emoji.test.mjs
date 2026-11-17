import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {makeCaption} from '../src/core.mjs';

test('legenda usa emoji de caminhao para qualquer veiculo', () => {
  const caption = makeCaption({origin:'Timbo - SC',destination:'Guararapes - SP',vehicle:'Truck ou bitruck'},
    {company:'ALATUS LOGISTICA',phone:'(43) 92000-5487',configured:true});
  assert.ok(caption.includes('🚚 *Veículo:* Truck ou bitruck'));
  assert.ok(!caption.includes('❄️ *Veículo:*'));
});

test('legenda do painel usa o mesmo emoji', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const script = readFileSync(path.join(here, '../public/app.js'), 'utf8');
  assert.ok(script.includes('🚚 *Veículo:*'));
  assert.ok(!script.includes('❄️ *Veículo:*'));
});