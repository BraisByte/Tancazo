import test from 'node:test';
import assert from 'node:assert/strict';
import { nextBattle } from '../src/client/gameflow.js';
import { radioMessage } from '../src/client/radio.js';
import { readFileSync } from 'node:fs';
import { CAMPAIGN } from '../src/shared/campaign.js';

const victory = { status: 'victory', map: { id: 'citadel' }, difficulty: 'easy' };
test('a quick-play victory continues to another field, and defeat never advances', () => {
  assert.deepEqual(nextBattle(victory), { mapId: 'foundry', difficulty: 'easy' });
  assert.equal(nextBattle({ ...victory, status: 'defeat' }), null);
  assert.equal(nextBattle({ ...victory, map: { id: 'custom' } }), null);
});
test('training leads to campaign, campaign advances along its route, final mission ends', () => {
  assert.deepEqual(nextBattle(victory, { training: true }), { missionId: 'green-line' });
  assert.deepEqual(nextBattle(victory, { missionId: 'green-line' }), { missionId: 'red-forge' });
  assert.equal(nextBattle(victory, { missionId: 'cobalt-heart' }), null);
});
test('radio uses spoken Galician sentences from a single Galician catalog', () => {
  assert.equal(radioMessage({ type: 'critical' }), 'Unidade danada. Protexe a parte traseira.');
  assert.equal(radioMessage({ type: 'pickup', powerup: 'freeze' }), 'Conxelador dispoñible.');

});
test('each campaign mission has its own valid, distinct audio recording', () => {
  const manifest = JSON.parse(readFileSync(new URL('../src/client/music/tracks.json', import.meta.url)));
  const paths = CAMPAIGN.map((mission) => manifest.tracks[mission.id]);
  assert.equal(new Set(paths).size, CAMPAIGN.length);
  for (const path of paths) {
    assert.ok(path);
    const wav = readFileSync(new URL(`..${path}`, import.meta.url));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.readUInt32LE(4), wav.length - 8);
    assert.ok(wav.length > 500000);
  }
});
