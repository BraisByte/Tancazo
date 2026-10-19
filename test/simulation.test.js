import test from 'node:test';
import assert from 'node:assert/strict';
import { STEP, advance, createGame, publicState } from '../src/shared/simulation.js';
import { MAPS } from '../src/shared/maps.js';
import { CAMPAIGN } from '../src/shared/campaign.js';

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

test('the protected core withstands three hits and falls on the fourth', () => {
  const game = createGame({ players: 1, seed: 9 });
  for (let hit = 1; hit <= 4; hit++) {
    game.bullets.push({ id: `base-shot-${hit}`, owner: 'enemy', team: 'enemies', type: 'cannon', x: 7.5, z: 13.5, dx: 0, dz: 0, speed: 0, damage: 1, life: 1, penetration: 0, bounces: 0, blast: 0 });
    advance(game, STEP, {});
    assert.equal(game.baseHp, 4 - hit);
    if (hit < 4) assert.equal(game.status, 'playing');
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

test('garage parts change the tank stats, weapon and appearance data', () => {
  const game = createGame({ players: 1, seed: 41, loadout: { chassis: 'bulwark', turret: 'siege', engine: 'turbine', ultimate: 'aegis' } });
  const player = game.tanks[0];
  assert.equal(player.maxHp, 6);
  assert.equal(player.weapon, 'heavy');
  assert.equal(player.ultimate, 'aegis');
  assert.equal(player.chassisScale, 1.14);
  assert.ok(player.speed > 2.9);
});

test('a charged ultimate activates once and artillery destroys light enemies', () => {
  const game = createGame({ players: 1, seed: 42, loadout: { ultimate: 'artillery' } });
  game.enemiesToSpawn = 0;
  const player = game.tanks[0];
  player.ultimateCharge = 100;
  game.tanks.push({ id: 'ultimate-target', kind: 'enemy', team: 'enemies', alive: true, x: 7.5, z: 6.5, dx: 0, dz: 1, hp: 1, maxHp: 1, shield: 0, speed: 0, cooldown: 1, weapon: 'cannon' });
  advance(game, STEP, { p1: { ultimate: true } });
  assert.equal(player.ultimateCharge, 17);
  assert.equal(game.tanks.find((tank) => tank.id === 'ultimate-target').alive, false);
  assert.ok(game.effects.some((effect) => effect.type === 'ultimate'));
});

test('explosive barrels detonate and open the battlefield', () => {
  const game = createGame({ players: 1, seed: 43, mapId: 'foundry' });
  game.spawnTimer = 999;
  game.bullets.push({ id: 'barrel-shot', owner: 'p1', team: 'players', type: 'cannon', x: 4.5, z: 5.5, dx: 0, dz: 0, speed: 0, damage: 1, life: 1, penetration: 0, bounces: 0, blast: 0 });
  advance(game, STEP, {});
  assert.equal(game.map.tiles[5][4], '.');
  assert.ok(game.effects.some((effect) => effect.type === 'boom'));
});

test('the rescue operation activates and extracts every survivor', () => {
  const game = createGame({ players: 1, seed: 44, missionId: 'ghost-rescue' });
  game.spawnTimer = 999;
  const player = game.tanks[0];
  const survivors = game.tanks.filter((tank) => tank.kind === 'survivor');
  assert.equal(survivors.length, 2);
  for (const survivor of survivors) {
    player.x = survivor.x; player.z = survivor.z;
    advance(game, STEP, {});
    assert.equal(survivor.activated, true);
    survivor.x = game.rescue.extraction[0]; survivor.z = game.rescue.extraction[1];
    advance(game, STEP, {});
  }
  assert.equal(game.rescue.rescued, 2);
  assert.equal(game.status, 'victory');
});

test('Leviathan weak points protect its hull', () => {
  const game = createGame({ players: 1, seed: 45, missionId: 'cobalt-heart' });
  game.enemiesToSpawn = 0;
  advance(game, STEP, {});
  const boss = game.tanks.find((tank) => tank.kind === 'boss');
  assert.equal(game.tanks.filter((tank) => tank.kind === 'weakpoint' && tank.alive).length, 2);
  game.bullets.push({ id: 'boss-shot', owner: 'p1', team: 'players', type: 'heavy', x: boss.x, z: boss.z, dx: 0, dz: 0, speed: 0, damage: 3, life: 1, penetration: 0, bounces: 0, blast: 0 });
  advance(game, STEP, {});
  assert.equal(boss.hp, boss.maxHp);
});

test('rear impacts cause critical subsystem damage', () => {
  const game = createGame({ players: 1, seed: 46 });
  game.spawnTimer = 999;
  const player = game.tanks[0];
  game.tanks.push({ id: 'rear-attacker', kind: 'enemy', role: 'assault', team: 'enemies', alive: true, x: 5.5, z: 10.5, dx: 0, dz: -1, vx: 0, vz: 0, hp: 2, maxHp: 2, shield: 0, speed: 0, cooldown: 99, aiTimer: 99, weapon: 'cannon' });
  game.bullets.push({ id: 'rear-hit', owner: 'rear-attacker', team: 'enemies', type: 'cannon', x: player.x, z: player.z, dx: 0, dz: -1, speed: 0, damage: 1, life: 1, penetration: 0, bounces: 0, blast: 0 });
  advance(game, STEP, {});
  assert.equal(player.hp, player.maxHp - 2);
  assert.ok(player.burningTimer > 0);
  assert.ok(game.effects.some((effect) => effect.type === 'critical'));
});

test('a nearby teammate revives a downed player', () => {
  const game = createGame({ players: 2, seed: 47 });
  game.spawnTimer = 999;
  const [first, second] = game.tanks.filter((tank) => tank.kind === 'player');
  game.tanks.push({ id: 'revive-attacker', kind: 'enemy', role: 'heavy', team: 'enemies', alive: true, x: 7.5, z: 8.5, dx: 0, dz: 1, vx: 0, vz: 0, hp: 3, maxHp: 3, shield: 0, speed: 0, cooldown: 99, aiTimer: 99, weapon: 'heavy' });
  game.bullets.push({ id: 'downing-hit', owner: 'revive-attacker', team: 'enemies', type: 'heavy', x: first.x, z: first.z, dx: 0, dz: 1, speed: 0, damage: 9, life: 1, penetration: 0, bounces: 0, blast: 0 });
  advance(game, STEP, {});
  assert.equal(first.downed, true);
  second.x = first.x + .5; second.z = first.z;
  for (let tick = 0; tick < 95; tick++) advance(game, STEP, {});
  assert.equal(first.alive, true);
  assert.equal(first.downed, false);
  assert.equal(first.shield, 1);
});

test('enemy squads navigate in two axes and aim instead of firing straight ahead', () => {
  const rows = Array.from({ length: 15 }, (_, row) => row === 0 || row === 14 ? 'SSSSSSSSSSSSSSS' : 'S.............S');
  rows[13] = 'S......H......S';
  const map = { id: 'custom', name: 'AI range', rows, playerSpawns: [[11.5, 11.5], [10.5, 11.5], [9.5, 11.5], [8.5, 11.5]], enemySpawns: [[2.5, 2.5], [3.5, 2.5], [4.5, 2.5]] };
  const game = createGame({ players: 1, seed: 52, map, difficulty: 'normal' });
  game.enemiesToSpawn = 1; game.maxEnemies = 1; game.spawnTimer = 0; game.baseHp = 999;
  game.tanks[0].shield = 999;
  advance(game, STEP, {});
  const enemy = game.tanks.find((tank) => tank.kind === 'enemy');
  const origin = [enemy.x, enemy.z];
  let aimedShot = false;
  for (let tick = 0; tick < 420; tick++) {
    advance(game, STEP, {});
    if (game.bullets.some((bullet) => bullet.team === 'enemies' && Math.abs(bullet.dx) > .1 && Math.abs(bullet.dz) > .1)) aimedShot = true;
  }
  assert.ok(Math.abs(enemy.x - origin[0]) > .5);
  assert.ok(Math.abs(enemy.z - origin[1]) > .5);
  assert.equal(aimedShot, true);
});

test('enemies do not fire through an unbroken steel wall', () => {
  const rows = Array.from({ length: 15 }, (_, row) => row === 0 || row === 14 || row === 7 ? 'SSSSSSSSSSSSSSS' : 'S.............S');
  rows[13] = 'S......H......S';
  const map = { id: 'custom', name: 'Blocked range', rows, playerSpawns: [[11.5, 11.5], [10.5, 11.5], [9.5, 11.5], [8.5, 11.5]], enemySpawns: [[2.5, 2.5], [3.5, 2.5], [4.5, 2.5]] };
  const game = createGame({ players: 1, seed: 53, map, difficulty: 'normal' });
  game.enemiesToSpawn = 1; game.maxEnemies = 1; game.spawnTimer = 0;
  let fired = false;
  for (let tick = 0; tick < 240; tick++) {
    advance(game, STEP, {});
    if (game.bullets.some((bullet) => bullet.team === 'enemies')) fired = true;
  }
  assert.equal(fired, false);
});

test('enemy squads split their attack between players and the base', () => {
  const game = createGame({ players: 1, seed: 54, missionId: 'green-line' });
  game.enemiesToSpawn = 3;
  const objectives = [];
  for (let index = 0; index < 3; index++) {
    game.spawnTimer = 0;
    advance(game, STEP, {});
    const enemy = game.tanks.filter((tank) => tank.kind === 'enemy' && tank.alive).at(-1);
    objectives.push(enemy.targetObjective);
    enemy.alive = false;
  }
  assert.ok(objectives.includes('players'));
  assert.ok(objectives.includes('base'));
});

test('patrol enemies take time to aim before their first shot', () => {
  const rows = Array.from({ length: 15 }, (_, row) => row === 0 || row === 14 ? 'SSSSSSSSSSSSSSS' : 'S.............S');
  rows[13] = 'S......H......S';
  const map = { id: 'custom', name: 'Reaction range', rows, playerSpawns: [[7.5, 6.5]], enemySpawns: [[7.5, 3.5]] };
  const game = createGame({ players: 1, seed: 55, map, difficulty: 'easy' });
  game.enemiesToSpawn = 1; game.maxEnemies = 1; game.spawnTimer = 0;
  advance(game, STEP, {});
  const enemy = game.tanks.find((tank) => tank.kind === 'enemy');
  enemy.cooldown = 0;
  for (let tick = 0; tick < 20; tick++) advance(game, STEP, {});
  assert.equal(enemy.cooldown, 0);
  for (let tick = 0; tick < 12; tick++) advance(game, STEP, {});
  assert.ok(enemy.cooldown > 0);
});

test('every campaign mission can reach victory and every node is reachable', () => {
  const reachable = new Set(['green-line']);
  for (let pass = 0; pass < CAMPAIGN.length; pass++) for (const mission of CAMPAIGN) if (reachable.has(mission.id)) for (const next of mission.next || []) reachable.add(next);
  assert.deepEqual(new Set(CAMPAIGN.map((mission) => mission.id)), reachable);

  for (const mission of CAMPAIGN) {
    const game = createGame({ players: 1, seed: 60, missionId: mission.id });
    game.spawnTimer = 999;
    if (mission.objective === 'survive') game.elapsed = game.duration;
    else if (mission.objective === 'capture') game.capture.progress = game.capture.goal;
    else if (mission.objective === 'escort') game.tanks.find((tank) => tank.kind === 'convoy').z = 1.5;
    else if (mission.objective === 'generators') game.tanks.filter((tank) => tank.kind === 'generator').forEach((tank) => { tank.alive = false; });
    else if (mission.objective === 'rescue') game.rescue.rescued = game.rescue.total;
    else game.enemiesToSpawn = 0;
    advance(game, STEP, {});
    if (mission.objective === 'boss') {
      game.tanks.filter((tank) => tank.team === 'enemies').forEach((tank) => { tank.alive = false; });
      advance(game, STEP, {});
    }
    assert.equal(game.status, 'victory', `${mission.id} did not reach victory`);
  }
});
