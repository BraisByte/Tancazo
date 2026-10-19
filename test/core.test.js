import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, CORE_HITS, createGame, STEP } from '../src/shared/simulation.js';

function impact(game, team = 'enemies', damage = 1) {
  game.bullets.push({ id: `core-${game.tick}-${team}`, owner: team, team, type: damage > 1 ? 'heavy' : 'cannon', ...game.basePosition, dx: 0, dz: 0, speed: 0, damage, life: 1, penetration: 0, bounces: 0, blast: 0 });
  advance(game, STEP, {});
}

test('four direct enemy hits destroy the core and every player, regardless of weapon damage', () => {
  const game = createGame({ players: 2, seed: 9 });
  game.spawnTimer = 999;
  assert.equal(game.baseHp, CORE_HITS);
  for (let hit = 1; hit <= CORE_HITS; hit++) {
    impact(game, 'enemies', hit % 2 ? 2 : 1);
    assert.equal(game.baseHp, CORE_HITS - hit);
    assert.equal(game.status, hit < CORE_HITS ? 'playing' : 'defeat');
    if (hit < CORE_HITS) assert.ok(game.effects.some((effect) => effect.type === 'core-hit'));
  }
  assert.ok(game.tanks.filter((tank) => tank.kind === 'player').every((tank) => !tank.alive && !tank.downed && tank.hp === 0 && tank.respawn === 0));
  const tick = game.tick;
  for (let i = 0; i < 180; i++) advance(game, STEP, {});
  assert.equal(game.tick, tick);
  assert.equal(game.map.tiles[13][7], '.');
});

test('friendly hits and shielded enemy hits never masquerade as core damage', () => {
  const game = createGame({ seed: 9 });
  game.spawnTimer = 999;
  impact(game, 'players');
  assert.equal(game.baseHp, CORE_HITS);
  assert.ok(game.effects.some((effect) => effect.type === 'spark'));
  assert.ok(!game.effects.some((effect) => effect.type === 'base' || effect.type === 'core-hit'));
  game.baseShieldTimer = 1;
  impact(game);
  assert.equal(game.baseHp, CORE_HITS);
  assert.ok(game.effects.some((effect) => effect.type === 'shield'));
  for (let i = 0; i < 65; i++) advance(game, STEP, {});
  impact(game);
  assert.equal(game.baseHp, CORE_HITS - 1);
});

test('a fatal core hit takes precedence over victory in the same tick', () => {
  for (const missionId of ['green-line', 'red-forge', 'silent-depot']) {
    const game = createGame({ missionId, seed: 9 });
    game.baseHp = 1;
    game.enemiesToSpawn = 0;
    game.spawnTimer = 999;
    game.elapsed = game.duration;
    if (game.capture) game.capture.progress = game.capture.goal;
    impact(game);
    assert.equal(game.status, 'defeat', missionId);
    assert.equal(game.tanks[0].alive, false);
  }
});
