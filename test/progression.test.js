import test from 'node:test';
import assert from 'node:assert/strict';
import { completeMission, loadProgress } from '../src/client/progression.js';

test('winning the second campaign mission unlocks the third', () => {
  let saved = '';
  globalThis.localStorage = {
    getItem: () => saved,
    setItem: (_key, value) => { saved = value; },
  };
  const progress = loadProgress();
  progress.unlocked = 2;
  const stars = completeMission(progress, 'red-forge', {
    status: 'victory', score: 2000,
    tanks: [{ kind: 'player', alive: true, hp: 3, maxHp: 3 }],
  });
  assert.equal(stars, 3);
  assert.equal(progress.unlocked, 3);
  assert.equal(JSON.parse(saved).unlocked, 3);
  delete globalThis.localStorage;
});

test('saved stars repair a stale unlocked mission counter', () => {
  globalThis.localStorage = {
    getItem: () => JSON.stringify({ unlocked: 2, stars: { 'red-forge': 1 } }),
    setItem: () => {},
  };
  assert.equal(loadProgress().unlocked, 3);
  delete globalThis.localStorage;
});
