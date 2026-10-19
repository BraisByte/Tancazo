import test from 'node:test';
import assert from 'node:assert/strict';
import { completeMission, equipPart, loadProgress } from '../src/client/progression.js';

test('a storage failure preserves victory, rewards and continuation in memory', () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error('Quota exceeded'); } };
  try {
    const progress = loadProgress();
    assert.ok(completeMission(progress, 'green-line', { status: 'victory', score: 1000, tanks: [{ kind: 'player', alive: true, hp: 3, maxHp: 3 }] }) > 0);
    assert.equal(progress.saveFailed, true);
    assert.ok(progress.unlockedMissions.includes('red-forge'));
    assert.ok(progress.stars['green-line'] > 0);
  } finally { delete globalThis.localStorage; }
});

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

test('mission rewards unlock garage parts that can be equipped', () => {
  let saved = '';
  globalThis.localStorage = {
    getItem: () => saved,
    setItem: (_key, value) => { saved = value; },
  };
  const progress = loadProgress();
  completeMission(progress, 'red-forge', {
    status: 'victory', score: 0,
    tanks: [{ kind: 'player', alive: true, hp: 1, maxHp: 3 }],
  });
  assert.ok(progress.unlockedParts.turret.includes('repeater'));
  assert.equal(equipPart(progress, 'turret', 'repeater'), true);
  assert.equal(progress.loadout.turret, 'repeater');
  assert.equal(equipPart(progress, 'turret', 'tesla'), false);
  delete globalThis.localStorage;
});
