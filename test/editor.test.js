import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDraft, draftToMap, mapToDraft, validateDraft } from '../src/client/editor.js';

test('the editor validates and round-trips a custom battlefield', () => {
  const draft = defaultDraft();
  assert.equal(validateDraft(draft), null);
  const map = draftToMap(draft, 'Test sector');
  assert.equal(map.rows.length, 15);
  assert.equal(map.playerSpawns.length, 4);
  assert.equal(map.enemySpawns.length, 3);
  const restored = mapToDraft(map);
  assert.equal(validateDraft(restored), null);
});

test('the editor rejects maps without a core', () => {
  const draft = defaultDraft();
  for (const row of draft) for (let index = 0; index < row.length; index++) if (row[index] === 'H') row[index] = '.';
  assert.match(validateDraft(draft), /núcleo/i);
});
