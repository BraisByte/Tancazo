import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, advance, STEP } from '../src/shared/simulation.js';

function baseRaider() {
  const game = createGame({ missionId: 'green-line', seed: 54 });
  game.spawnTimer = 0;
  advance(game, STEP, {});
  const enemy = game.tanks.find((tank) => tank.kind === 'enemy');
  Object.assign(enemy, { role: 'assault', weapon: 'cannon', targetObjective: 'base', x: 7.5, z: 10.5, vx: 0, vz: 0, cooldown: 0, aiTimer: 0 });
  Object.assign(game.tanks[0], { x: 5.5, z: 10.5, shield: 100 });
  game.spawnTimer = 999;
  game.enemiesToSpawn = 1;
  return { game, enemy };
}

test('base raiders breach the bunker and destroy the core despite a closer player', () => {
  const { game } = baseRaider();
  let bunkerDamaged = false, shotAtCore = false;
  for (let tick = 0; tick < 1200 && game.status === 'playing'; tick++) {
    advance(game, STEP, {});
    bunkerDamaged ||= game.map.brickMasks['12:7'] !== 15;
    shotAtCore ||= game.bullets.some((bullet) => bullet.team === 'enemies' && Math.abs(bullet.dx) < .05 && bullet.dz > .9);
  }
  assert.ok(shotAtCore);
  assert.ok(bunkerDamaged);
  assert.equal(game.baseHp, 0);
  assert.equal(game.status, 'defeat');
  assert.equal(game.tanks[0].alive, false);
  assert.equal(game.tanks[0].hp, 0);
});

test('base attackers respect steel cover and the temporary core shield', () => {
  const { game, enemy } = baseRaider();
  game.map.tiles[12][7] = 'S';
  enemy.speed = 0;
  for (let tick = 0; tick < 180; tick++) advance(game, STEP, {});
  assert.equal(game.baseHp, 4);
  assert.equal(game.bullets.filter((bullet) => bullet.team === 'enemies').length, 0);
  game.map.tiles[12][7] = '.';
  game.baseShieldTimer = 10;
  for (let tick = 0; tick < 240; tick++) advance(game, STEP, {});
  assert.equal(game.baseHp, 4);
  game.baseShieldTimer = 0;
  for (let tick = 0; tick < 240; tick++) advance(game, STEP, {});
  assert.ok(game.baseHp < 4);
});

test('objective attackers occupy the capture beacon and stop its progress', () => {
  const game = createGame({ missionId: 'silent-depot', seed: 54 });
  game.spawnTimer = 0;
  advance(game, STEP, {});
  const enemy = game.tanks.find((tank) => tank.kind === 'enemy');
  Object.assign(enemy, { targetObjective: 'base', role: 'assault', x: 3.5, z: 8.5, speed: 1.5, cooldown: 999, aiTimer: 0 });
  Object.assign(game.tanks[0], { x: game.capture.x, z: game.capture.z, shield: 100 });
  game.spawnTimer = 999;
  for (let tick = 0; tick < 300; tick++) advance(game, STEP, {});
  assert.ok(Math.hypot(enemy.x - game.capture.x, enemy.z - game.capture.z) <= 1.25);
  const progress = game.capture.progress;
  for (let tick = 0; tick < 120; tick++) advance(game, STEP, {});
  assert.equal(game.capture.progress, progress);
});
