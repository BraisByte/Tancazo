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
    for (const [x, z] of [...map.playerSpawns, ...map.enemySpawns]) {
      const tile = map.rows[Math.floor(z)][Math.floor(x)];
      assert.ok(tile === '.' || tile === 'G', `${map.id} has a spawn inside tile ${tile} at ${x},${z}`);
    }
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

test('the visible edge of a shell damages a brick even when its center passes beside it', () => {
  const game = createGame({ players: 1, seed: 71 });
  game.enemiesToSpawn = 1;
  game.spawnTimer = 999;
  game.bullets.push({ id: 'edge-shot', owner: 'p1', team: 'players', type: 'cannon', x: 2.94, z: 1.25, dx: 0, dz: 0, speed: 0, damage: 1, life: 1, penetration: 0, bounces: 0, blast: 0 });
  advance(game, STEP, {});
  assert.equal(game.map.brickMasks['1:3'], 14);
  assert.equal(game.bullets.length, 0);
});

test('tank collision follows the solid quadrants of damaged bricks', () => {
  const game = createGame({ players: 1, seed: 8 });
  const player = game.tanks[0];
  game.enemiesToSpawn = 1;
  game.spawnTimer = 999;
  game.map.brickMasks['1:3'] = 1;
  player.x = 2.4;
  player.z = 1.72;
  for (let tick = 0; tick < 90; tick++) advance(game, STEP, { p1: { x: 1 } });
  assert.ok(player.x < 2.9, `tank crossed a remaining brick quadrant at x=${player.x}`);
});

test('the fortified base withstands two hits and falls on the third', () => {
  const game = createGame({ players: 1, seed: 9 });
  for (let hit = 1; hit <= 3; hit++) {
    game.bullets.push({ id: `base-shot-${hit}`, owner: 'enemy', team: 'enemies', type: 'cannon', x: 7.5, z: 13.5, dx: 0, dz: 0, speed: 0, damage: 1, life: 1, penetration: 0, bounces: 0, blast: 0 });
    advance(game, STEP, {});
    if (hit < 3) assert.equal(game.status, 'playing');
  }
  assert.equal(game.status, 'defeat');
  assert.equal(game.baseHp, 0);
  assert.equal(game.map.tiles[13][7], '.');
});

test('stored items activate on demand and team kills improve every player', () => {
  const game = createGame({ players: 2, seed: 10 });
  game.enemiesToSpawn = 0;
  const player = game.tanks[0];
  player.item = 'bomb';
  for (let index = 0; index < 5; index++) game.tanks.push({
    id: `target-${index}`, kind: 'enemy', team: 'enemies', alive: true, x: 2 + index, z: 2,
    hp: 1, maxHp: 1, cooldown: 0, rapidTimer: 0, recoil: 0,
  });
  advance(game, STEP, { [player.id]: { use: true } });
  assert.equal(player.item, null);
  assert.equal(game.teamKills, 5);
  assert.equal(game.teamRank, 2);
  assert.ok(game.tanks.filter((tank) => tank.kind === 'player').every((tank) => tank.rank === 2 && tank.speed > 3.2));
});

test('the freezer immobilizes enemies until its timer expires', () => {
  const game = createGame({ players: 1, seed: 12 });
  game.enemiesToSpawn = 0;
  const player = game.tanks[0];
  const enemy = { id: 'frozen-target', kind: 'enemy', team: 'enemies', alive: true, x: 3, z: 3, dx: 0, dz: 1, vx: 0, vz: 0, hp: 1, maxHp: 1, cooldown: 0, rapidTimer: 0, recoil: 0, speed: 2, weapon: 'cannon', reload: 1 };
  game.tanks.push(enemy);
  player.item = 'freeze';
  advance(game, STEP, { [player.id]: { use: true } });
  assert.ok(enemy.frozenTimer > 4.9);
  assert.equal(enemy.x, 3);
  assert.equal(enemy.z, 3);
});

test('capture and generator missions expose their new objectives', () => {
  const capture = createGame({ players: 1, seed: 13, missionId: 'silent-depot' });
  capture.tanks[0].x = capture.capture.x;
  capture.tanks[0].z = capture.capture.z;
  capture.enemiesToSpawn = 0;
  advance(capture, STEP, {});
  assert.ok(capture.capture.progress > 0);

  const generators = createGame({ players: 1, seed: 14, missionId: 'broken-arsenal' });
  assert.equal(generators.tanks.filter((tank) => tank.kind === 'generator').length, 3);
});

test('the frozen pass guarantees a freezer tutorial pickup', () => {
  const game = createGame({ players: 1, seed: 15, missionId: 'frozen-pass' });
  const pickup = game.powerups.find((powerup) => powerup.type === 'freeze');
  assert.ok(pickup);
  assert.equal(pickup.tutorial, true);
  assert.equal(pickup.life, 90);
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
