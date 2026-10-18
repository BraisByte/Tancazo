import test from 'node:test';
import assert from 'node:assert/strict';
import { STEP, advance, createGame, publicState } from '../src/shared/simulation.js';
import { MAPS } from '../src/shared/maps.js';

test('all battlefields are rectangular and expose valid spawns', () => {
  for (const map of Object.values(MAPS)) {
    assert.equal(map.rows.length, 15);
    assert.ok(map.rows.every((row) => row.length === 15), `${map.id} is not 15×15`);
    assert.equal(map.playerSpawns.length, 4);
    assert.equal(map.enemySpawns.length, 3);
  }
});

test('the fixed-step simulation is deterministic', () => {
  const first = createGame({ players: 1, seed: 42 });
  const second = createGame({ players: 1, seed: 42 });
  for (let tick = 0; tick < 360; tick++) {
    const input = { p1: { x: tick < 90 ? 1 : 0, z: tick >= 90 && tick < 180 ? -1 : 0, fire: tick % 45 === 0 } };
    advance(first, STEP, input);
    advance(second, STEP, input);
  }
  assert.deepEqual(publicState(first), publicState(second));
});

test('player shells destroy brick by quadrant but not steel', () => {
  const game = createGame({ players: 1, seed: 7 });
  game.bullets.push({ id: 'brick-shot', owner: 'p1', team: 'players', type: 'cannon', x: 3.5, z: 1.55, dx: 0, dz: 0, speed: 0, damage: 1, life: 1, penetration: 0, bounces: 0, blast: 0 });
  game.bullets.push({ id: 'steel-shot', owner: 'p1', team: 'players', type: 'cannon', x: .5, z: .55, dx: 0, dz: 0, speed: 0, damage: 1, life: 1, penetration: 0, bounces: 0, blast: 0 });
  advance(game, STEP, {});
  assert.equal(game.map.tiles[1][3], 'B');
  assert.equal(game.map.brickMasks['1:3'], 7);
  assert.equal(game.map.tiles[0][0], 'S');
  assert.equal(game.bullets.length, 0);
});

test('destroying the base ends the mission', () => {
  const game = createGame({ players: 1, seed: 9 });
  game.bullets.push({ id: 'base-shot', owner: 'enemy', team: 'enemies', type: 'cannon', x: 7.5, z: 13.5, dx: 0, dz: 0, speed: 0, damage: 1, life: 1, penetration: 0, bounces: 0, blast: 0 });
  advance(game, STEP, {});
  assert.equal(game.status, 'defeat');
  assert.equal(game.map.tiles[13][7], '.');
});

test('difficulty controls the assault and players collect synchronized powerups', () => {
  const game = createGame({ players: 1, seed: 11, mapId: 'delta', difficulty: 'hard' });
  assert.equal(game.enemiesToSpawn, 18);
  assert.equal(game.maxEnemies, 5);
  const player = game.tanks[0];
  game.powerups.push({ id: 'shield', type: 'shield', x: player.x, z: player.z, life: 10 });
  advance(game, STEP, {});
  assert.equal(player.shield, 2);
  assert.equal(game.powerups.length, 0);
  assert.equal(game.score, 25);
});

test('the final campaign sector deploys a boss before victory', () => {
  const game = createGame({ players: 1, seed: 23, missionId: 'cobalt-heart' });
  game.enemiesToSpawn = 0;
  advance(game, STEP, {});
  const boss = game.tanks.find((tank) => tank.kind === 'boss');
  assert.ok(boss);
  assert.equal(boss.name, 'Leviatán');
  assert.equal(game.status, 'playing');
  boss.alive = false;
  advance(game, STEP, {});
  assert.equal(game.status, 'victory');
});

test('the convoy mission is won when the transport reaches extraction', () => {
  const game = createGame({ players: 1, seed: 29, missionId: 'iron-convoy' });
  const convoy = game.tanks.find((tank) => tank.kind === 'convoy');
  assert.ok(convoy);
  assert.equal(convoy.maxHp, 6);
  convoy.z = 1.69;
  advance(game, STEP, {});
  assert.equal(game.status, 'victory');
});

test('opposing projectiles cancel each other', () => {
  const game = createGame({ players: 1, seed: 31 });
  const shell = (id, team, dx) => ({ id, owner: id, team, type: 'cannon', x: 7.5, z: 6.5, dx, dz: 0, speed: 0, damage: 1, life: 1, penetration: 0, bounces: 0, blast: 0 });
  game.bullets.push(shell('a', 'players', 1), shell('b', 'enemies', -1));
  advance(game, STEP, {});
  assert.equal(game.bullets.length, 0);
  assert.ok(game.effects.some((effect) => effect.type === 'spark'));
});
