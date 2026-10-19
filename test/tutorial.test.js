import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, advance, STEP } from '../src/shared/simulation.js';
import { beginTraining, updateTraining } from '../src/client/tutorial.js';

test('training waits for actual movement, firing and item use before releasing its wave', () => {
  const game = createGame({ difficulty: 'easy', seed: 42 });
  const training = beginTraining(game);
  const step = (input = {}) => {
    advance(game, STEP, { p1: input });
    updateTraining(training, game);
  };
  for (let i = 0; i < 600; i++) step();
  assert.equal(training.step, 0);
  assert.equal(game.status, 'playing');
  assert.equal(game.tanks.filter((tank) => tank.team === 'enemies').length, 0);
  // Clear the brick above the spawn by moving into the adjacent corridor.
  for (let i = 0; i < 20; i++) step({ x: -1 });
  for (let i = 0; i < 65 && training.step === 0; i++) step({ z: -1 });
  assert.equal(training.step, 1);
  step({ fire: true, aimX: 1, aimZ: 0 });
  assert.equal(training.step, 2);
  assert.equal(game.tanks[0].item, 'fortress');
  for (let i = 0; i < 60; i++) step();
  assert.equal(training.step, 2);
  step({ use: true });
  assert.equal(training.step, 3);
  assert.ok(game.baseShieldTimer > 0);
  for (let i = 0; i < 130; i++) step();
  assert.equal(game.enemiesToSpawn, 2);
  assert.equal(game.tanks.filter((tank) => tank.team === 'enemies' && tank.alive).length, 1);
});

test('aiming while moving keeps projectile direction independent of movement', () => {
  const game = createGame({ difficulty: 'easy', seed: 12 });
  const player = game.tanks[0];
  const startZ = player.z;
  advance(game, STEP, { p1: { z: -1, aimX: .6, aimZ: .8, fire: true } });
  assert.ok(player.z < startZ);
  assert.equal(player.dx, .6);
  assert.equal(player.dz, .8);
  assert.equal(game.bullets[0].dx, .6);
  assert.equal(game.bullets[0].dz, .8);
});
