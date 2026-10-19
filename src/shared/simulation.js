import { campaignMission, normalizeUpgrades } from './campaign.js';
import { cloneMap, TILE } from './maps.js?v=14';

export const STEP = 1 / 60;
export const MAX_PLAYERS = 4;
export const DIFFICULTIES = Object.freeze({
  easy: { id: 'easy', name: 'Patrulla', enemies: 8, maxAlive: 3, speed: .86, fire: .72, drop: .46 },
  normal: { id: 'normal', name: 'Asedio', enemies: 12, maxAlive: 4, speed: 1, fire: 1, drop: .36 },
  hard: { id: 'hard', name: 'Tormenta', enemies: 18, maxAlive: 5, speed: 1.16, fire: 1.25, drop: .3 },
});
export const WEAPONS = Object.freeze({
  cannon: { name: 'Canón', speed: 7.2, cooldown: .42, damage: 1, life: 2.5, color: '#91ffe0' },
  rapid: { name: 'Autocanón', speed: 8.2, cooldown: .18, damage: 1, life: 2, color: '#ffe66d' },
  heavy: { name: 'Perforante', speed: 5.7, cooldown: .72, damage: 2, life: 2.8, penetration: 1, color: '#ffad66' },
  ricochet: { name: 'Rebote', speed: 6.7, cooldown: .55, damage: 1, life: 3.4, bounces: 2, color: '#75d5ff' },
  rocket: { name: 'Foguete', speed: 4.9, cooldown: .9, damage: 2, life: 2.7, blast: 1.05, color: '#ff6577' },
});
export const RANKS = Object.freeze([
  { rank: 1, kills: 0, name: 'Recruta' },
  { rank: 2, kills: 5, name: 'Veterano' },
  { rank: 3, kills: 12, name: 'Artillero' },
  { rank: 4, kills: 22, name: 'Comandante' },
  { rank: 5, kills: 35, name: 'Elite' },
]);
export const ITEMS = Object.freeze({
  freeze: { name: 'Conxelador' },
  bomb: { name: 'Bomba' },
  emp: { name: 'EMP' },
  mine: { name: 'Mina' },
  decoy: { name: 'Engado' },
  repair: { name: 'Reparación' },
  fortress: { name: 'Fortaleza' },
});

const BULLET_RADIUS = .12;
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function rng(state) {
  let x = state.seed |= 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.seed = x | 0;
  return (x >>> 0) / 4294967296;
}

function approach(value, target, amount) {
  return value < target ? Math.min(target, value + amount) : Math.max(target, value - amount);
}

export function createGame(options = {}) {
  const mission = campaignMission(options.missionId);
  const mapSource = options.map || mission?.mapId || options.mapId || 'citadel';
  const difficulty = mission?.difficulty || options.difficulty || 'normal';
  const challenge = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  const objective = mission?.objective || options.objective || 'eliminate';
  const map = cloneMap(mapSource);
  const basePosition = findBase(map);
  const state = {
    version: 3, tick: 0, elapsed: 0, seed: (options.seed ?? Date.now()) | 0 || 1,
    map, tanks: [], bullets: [], powerups: [], mines: [], decoys: [], effects: [], status: 'playing',
    objective, duration: mission?.duration || options.duration || 0, missionId: mission?.id || null,
    enemiesToSpawn: objective === 'survive' || objective === 'capture' ? 999 : mission?.enemies ?? challenge.enemies,
    maxEnemies: challenge.maxAlive, difficulty: challenge.id,
    bossEnabled: objective === 'boss' || (!mission && difficulty === 'hard'), bossSpawned: false,
    spawnTimer: .5, nextEntityId: 1, score: 0, teamKills: 0, teamRank: 1,
    baseHp: 3, baseMaxHp: 3, baseShieldTimer: 0, basePosition,
    capture: objective === 'capture' ? { x: mission?.target?.[0] || map.width / 2, z: mission?.target?.[1] || map.height / 2, progress: 0, goal: mission?.duration || 35 } : null,
    upgrades: normalizeUpgrades(options.upgrades),
  };
  for (let index = 0; index < (options.players ?? 1); index++) addPlayer(state, `p${index + 1}`, `Jugador ${index + 1}`);
  if (objective === 'escort') addConvoy(state);
  if (objective === 'generators') addGenerators(state, mission?.targets);
  if (mission?.tutorialItem) {
    const [x, z] = mission.itemDrop || map.playerSpawns[0];
    state.powerups.push({ id: `u${state.nextEntityId++}`, type: mission.tutorialItem, x, z, life: 90, tutorial: true });
  }
  return state;
}

function findBase(map) {
  for (let row = 0; row < map.height; row++) for (let col = 0; col < map.width; col++) {
    if (map.tiles[row][col] === TILE.BASE) return { x: col + .5, z: row + .5 };
  }
  return null;
}

function addGenerators(state, targets = []) {
  for (const [x, z] of targets) state.tanks.push({
    id: `generator${state.nextEntityId++}`, name: 'Xerador', kind: 'generator', role: 'generator', team: 'enemies',
    x, z, dx: 0, dz: 1, vx: 0, vz: 0, hp: 5, maxHp: 5, alive: true, cooldown: 0, speed: 0,
    color: '#ff5d73', shield: 0, recoil: 0, weapon: 'cannon', weapons: ['cannon'], reload: 1,
  });
}

function addConvoy(state) {
  state.tanks.push({
    id: 'convoy', name: 'Transporte', kind: 'convoy', role: 'convoy', team: 'players',
    x: state.map.width / 2, z: state.map.height - 2.5, dx: 0, dz: -1, vx: 0, vz: 0,
    hp: 6, maxHp: 6, alive: true, cooldown: 0, speed: 1.05, reload: 1,
    color: '#f2c14e', shield: 1, recoil: 0, weapon: 'cannon', weapons: ['cannon'], switchLatch: false,
  });
}

export function addPlayer(state, id, name = 'Jugador') {
  const existing = state.tanks.find((tank) => tank.id === id);
  if (existing) return existing;
  const number = state.tanks.filter((tank) => tank.kind === 'player').length;
  if (number >= MAX_PLAYERS) return null;
  const spawn = state.map.playerSpawns[number] || state.map.playerSpawns[0];
  const maxHp = 3 + (state.upgrades?.armor || 0);
  const tank = {
    id, name: String(name).slice(0, 18), kind: 'player', role: 'commander', team: 'players',
    x: spawn[0], z: spawn[1], dx: 0, dz: -1, vx: 0, vz: 0,
    hp: maxHp, maxHp, alive: true, cooldown: 0,
    speed: 3.2 * (1 + (state.upgrades?.engine || 0) * .08), reload: 1 - (state.upgrades?.reload || 0) * .1,
    color: ['#3ddc97', '#58a6ff', '#ffd166', '#d982ff'][number % 4],
    respawn: 0, shield: 0, rapidTimer: 0, recoil: 0, rank: state.teamRank || 1, item: null,
    weapon: 'cannon', weapons: ['cannon'], switchLatch: false, useLatch: false,
  };
  applyRankStats(state, tank);
  state.tanks.push(tank);
  return tank;
}

export function removePlayer(state, id) { state.tanks = state.tanks.filter((tank) => tank.id !== id); }

function rankForKills(kills) {
  return RANKS.reduce((current, rank) => kills >= rank.kills ? rank.rank : current, 1);
}

function applyRankStats(state, tank) {
  if (tank.kind !== 'player') return;
  const rank = tank.rank || 1;
  tank.speed = 3.2 * (1 + (state.upgrades?.engine || 0) * .08) * (rank >= 2 ? 1.1 : 1);
  tank.reload = (1 - (state.upgrades?.reload || 0) * .1) * (rank >= 3 ? .85 : 1);
}

function registerEnemyKill(state, tank) {
  if (tank.kind === 'generator') return;
  state.teamKills++;
  const nextRank = rankForKills(state.teamKills);
  if (nextRank <= state.teamRank) return;
  state.teamRank = nextRank;
  for (const player of state.tanks.filter((candidate) => candidate.kind === 'player')) {
    player.rank = nextRank;
    applyRankStats(state, player);
    state.effects.push({ type: 'rank', x: player.x, z: player.z, tick: state.tick });
  }
}

function brickBit(x, z) {
  const right = x - Math.floor(x) >= .5 ? 1 : 0;
  const bottom = z - Math.floor(z) >= .5 ? 2 : 0;
  return 1 << (right + bottom);
}

function tileAt(state, x, z) {
  const col = Math.floor(x), row = Math.floor(z);
  if (row < 0 || row >= state.map.height || col < 0 || col >= state.map.width) return TILE.STEEL;
  const tile = state.map.tiles[row][col];
  if (tile === TILE.BRICK) {
    const mask = state.map.brickMasks?.[`${row}:${col}`] ?? 15;
    if (!(mask & brickBit(x, z))) return TILE.EMPTY;
  }
  return tile;
}

function blocksTank(tile) { return tile === TILE.BRICK || tile === TILE.STEEL || tile === TILE.WATER || tile === TILE.BASE; }
function tankRadius(tank) { return tank.kind === 'boss' ? .56 : tank.kind === 'convoy' ? .42 : .31; }

function circleIntersectsRect(x, z, radius, left, top, right, bottom) {
  const closestX = Math.max(left, Math.min(x, right));
  const closestZ = Math.max(top, Math.min(z, bottom));
  return (x - closestX) ** 2 + (z - closestZ) ** 2 < radius ** 2;
}

function canOccupy(state, x, z, self) {
  const radius = tankRadius(self);
  const firstCol = Math.floor(x - radius), lastCol = Math.floor(x + radius);
  const firstRow = Math.floor(z - radius), lastRow = Math.floor(z + radius);
  for (let row = firstRow; row <= lastRow; row++) for (let col = firstCol; col <= lastCol; col++) {
    if (row < 0 || row >= state.map.height || col < 0 || col >= state.map.width) return false;
    const tile = state.map.tiles[row][col];
    if (!blocksTank(tile)) continue;
    if (tile !== TILE.BRICK) {
      if (circleIntersectsRect(x, z, radius, col, row, col + 1, row + 1)) return false;
      continue;
    }
    const mask = state.map.brickMasks?.[`${row}:${col}`] ?? 15;
    for (let quadrant = 0; quadrant < 4; quadrant++) if (mask & (1 << quadrant)) {
      const left = col + (quadrant % 2) * .5;
      const top = row + (quadrant > 1 ? .5 : 0);
      if (circleIntersectsRect(x, z, radius, left, top, left + .5, top + .5)) return false;
    }
  }
  return !state.tanks.some((tank) => tank !== self && tank.alive && Math.hypot(tank.x - x, tank.z - z) < radius + tankRadius(tank) - .08);
}

function projectileCollision(state, fromX, fromZ, toX, toZ) {
  const distance = Math.hypot(toX - fromX, toZ - fromZ);
  const steps = Math.max(1, Math.ceil(distance / (BULLET_RADIUS * .5)));
  for (let step = 1; step <= steps; step++) {
    const progress = step / steps;
    const x = fromX + (toX - fromX) * progress;
    const z = fromZ + (toZ - fromZ) * progress;
    const firstCol = Math.floor(x - BULLET_RADIUS), lastCol = Math.floor(x + BULLET_RADIUS);
    const firstRow = Math.floor(z - BULLET_RADIUS), lastRow = Math.floor(z + BULLET_RADIUS);
    for (let row = firstRow; row <= lastRow; row++) for (let col = firstCol; col <= lastCol; col++) {
      const outside = row < 0 || row >= state.map.height || col < 0 || col >= state.map.width;
      const tile = outside ? TILE.STEEL : state.map.tiles[row][col];
      if (tile !== TILE.BRICK && tile !== TILE.STEEL && tile !== TILE.BASE) continue;
      if (tile === TILE.BRICK) {
        const mask = state.map.brickMasks?.[`${row}:${col}`] ?? 15;
        const preferredQuadrant = (x - col >= .5 ? 1 : 0) + (z - row >= .5 ? 2 : 0);
        for (let offset = 0; offset < 4; offset++) {
          const quadrant = (preferredQuadrant + offset) % 4;
          if (!(mask & (1 << quadrant))) continue;
          const left = col + (quadrant % 2) * .5;
          const top = row + (quadrant > 1 ? .5 : 0);
          if (circleIntersectsRect(x, z, BULLET_RADIUS, left, top, left + .5, top + .5)) {
            return { tile, col, row, quadrant, left, top, right: left + .5, bottom: top + .5, x, z };
          }
        }
      } else if (circleIntersectsRect(x, z, BULLET_RADIUS, col, row, col + 1, row + 1)) {
        return { tile, col, row, left: col, top: row, right: col + 1, bottom: row + 1, x, z };
      }
    }
  }
  return null;
}

function cycleWeapon(tank, pressed) {
  if (pressed && !tank.switchLatch && tank.weapons.length > 1) {
    tank.weapon = tank.weapons[(tank.weapons.indexOf(tank.weapon) + 1) % tank.weapons.length];
  }
  tank.switchLatch = !!pressed;
}

function moveTank(state, tank, input, dt) {
  let x = Number(input?.x || 0), z = Number(input?.z || 0);
  if (Math.abs(x) > Math.abs(z)) z = 0; else if (z) x = 0;
  const moving = !!(x || z);
  if (moving) {
    const length = Math.hypot(x, z) || 1;
    x /= length; z /= length;
    if (Math.hypot(input?.aimX || 0, input?.aimZ || 0) < .25) { tank.dx = x; tank.dz = z; }
  }
  const aimLength = Math.hypot(input?.aimX || 0, input?.aimZ || 0);
  if (aimLength >= .25) { tank.dx = input.aimX / aimLength; tank.dz = input.aimZ / aimLength; }
  const acceleration = tank.kind === 'player' ? 13 : 8;
  tank.vx = approach(tank.vx || 0, moving ? x * tank.speed : 0, acceleration * dt);
  tank.vz = approach(tank.vz || 0, moving ? z * tank.speed : 0, acceleration * dt);
  const nx = tank.x + tank.vx * dt, nz = tank.z + tank.vz * dt;
  if (canOccupy(state, nx, tank.z, tank)) tank.x = nx; else tank.vx = 0;
  if (canOccupy(state, tank.x, nz, tank)) tank.z = nz; else tank.vz = 0;
}

function addBullet(state, tank, weaponId, dx = tank.dx, dz = tank.dz) {
  const weapon = WEAPONS[weaponId] || WEAPONS.cannon;
  const radius = tankRadius(tank);
  state.bullets.push({
    id: `b${state.nextEntityId++}`, owner: tank.id, team: tank.team, type: weaponId,
    x: tank.x + dx * (radius + .2), z: tank.z + dz * (radius + .2), dx, dz,
    life: weapon.life, damage: weapon.damage + (tank.kind === 'player' && tank.rank >= 4 ? 1 : 0), speed: weapon.speed,
    penetration: weapon.penetration || 0, bounces: weapon.bounces || 0, blast: weapon.blast || 0, color: weapon.color,
  });
}

function shoot(state, tank) {
  if (!tank.alive || tank.cooldown > 0) return;
  const weaponId = tank.rapidTimer > 0 ? 'rapid' : tank.weapon || 'cannon';
  const weapon = WEAPONS[weaponId] || WEAPONS.cannon;
  const rate = tank.team === 'enemies' ? 1 / DIFFICULTIES[state.difficulty].fire : tank.reload || 1;
  tank.cooldown = weapon.cooldown * rate; tank.recoil = 1;
  if (tank.kind === 'boss') {
    for (const angle of [-.2, 0, .2]) {
      const cosine = Math.cos(angle), sine = Math.sin(angle);
      addBullet(state, tank, weaponId, tank.dx * cosine - tank.dz * sine, tank.dx * sine + tank.dz * cosine);
    }
  } else if (tank.kind === 'player' && tank.rank >= 5) {
    for (const angle of [-.09, .09]) {
      const cosine = Math.cos(angle), sine = Math.sin(angle);
      addBullet(state, tank, weaponId, tank.dx * cosine - tank.dz * sine, tank.dx * sine + tank.dz * cosine);
    }
  } else addBullet(state, tank, weaponId);
}

function clearLine(state, from, to) {
  if (Math.abs(from.x - to.x) > .45 && Math.abs(from.z - to.z) > .45) return null;
  const dx = Math.abs(from.x - to.x) > Math.abs(from.z - to.z) ? Math.sign(to.x - from.x) : 0;
  const dz = dx ? 0 : Math.sign(to.z - from.z);
  for (let distance = .5; distance < Math.hypot(to.x - from.x, to.z - from.z); distance += .4) {
    if (blocksTank(tileAt(state, from.x + dx * distance, from.z + dz * distance))) return null;
  }
  return [dx, dz];
}

function chooseEnemyDirection(state, tank) {
  const players = [
    ...state.tanks.filter((candidate) => candidate.team === 'players' && candidate.alive),
    ...state.decoys.map((decoy) => ({ ...decoy, kind: 'decoy' })),
  ];
  const nearest = players.sort((a, b) => Math.hypot(a.x - tank.x, a.z - tank.z) - Math.hypot(b.x - tank.x, b.z - tank.z))[0];
  if ((tank.role === 'sniper' || tank.role === 'commander') && nearest) {
    const line = clearLine(state, tank, nearest);
    if (line) return line;
  }
  const target = tank.role === 'scout' && nearest ? nearest : { x: state.map.width / 2, z: state.map.height - 1.5 };
  const choices = DIRECTIONS.filter(([dx, dz]) => canOccupy(state, tank.x + dx * .42, tank.z + dz * .42, tank));
  if (!choices.length) return [-tank.dx, -tank.dz];
  choices.sort((a, b) => {
    const score = ([dx, dz]) => Math.abs(tank.x + dx - target.x) + Math.abs(tank.z + dz - target.z) + rng(state) * 1.4;
    return score(a) - score(b);
  });
  return choices[0];
}

function convoyInput(state, tank) {
  tank.aiTimer = (tank.aiTimer || 0) - STEP;
  if (tank.aiTimer <= 0) {
    const choices = DIRECTIONS.filter(([dx, dz]) => canOccupy(state, tank.x + dx * .45, tank.z + dz * .45, tank));
    choices.sort((a, b) => (tank.z + a[1]) + Math.abs(tank.x + a[0] - state.map.width / 2) * .18 - ((tank.z + b[1]) + Math.abs(tank.x + b[0] - state.map.width / 2) * .18));
    [tank.aiX, tank.aiZ] = choices[0] || [0, 0];
    tank.aiTimer = .35;
  }
  return { x: tank.aiX || 0, z: tank.aiZ || 0 };
}

function enemyInput(state, tank, dt) {
  tank.aiTimer = (tank.aiTimer || 0) - dt;
  if (tank.aiTimer <= 0) {
    [tank.aiX, tank.aiZ] = chooseEnemyDirection(state, tank);
    tank.aiTimer = tank.role === 'scout' ? .32 + rng(state) * .55 : .55 + rng(state) * 1.15;
    if (tank.role === 'engineer' && rng(state) < .45) repairBrickNear(state, tank);
  }
  const fireBias = tank.role === 'sniper' ? 1.4 : tank.role === 'commander' ? 1.2 : .75;
  return { x: tank.aiX || 0, z: tank.aiZ || 1, fire: rng(state) < dt * fireBias * DIFFICULTIES[state.difficulty].fire };
}

function bossInput(state, tank, dt) {
  const nextPhase = tank.hp <= 6 ? 2 : tank.hp <= 13 ? 1 : 0;
  if (nextPhase > (tank.phase || 0)) {
    tank.phase = nextPhase;
    tank.shield += 2;
    tank.weapon = nextPhase === 1 ? 'heavy' : 'rapid';
    tank.speed = nextPhase === 1 ? 1.42 : 1.72;
    state.enemiesToSpawn += 2;
    state.effects.push({ type: 'boss', x: tank.x, z: tank.z, tick: state.tick });
  }
  return enemyInput(state, tank, dt);
}

function repairBrickNear(state, tank) {
  for (const [dx, dz] of DIRECTIONS) {
    const col = Math.floor(tank.x + dx), row = Math.floor(tank.z + dz), key = `${row}:${col}`;
    const mask = state.map.brickMasks?.[key];
    if (mask === undefined || mask === 15) continue;
    const missing = (~mask) & 15;
    state.map.brickMasks[key] = mask | (missing & -missing);
    state.map.tiles[row][col] = TILE.BRICK;
    state.effects.push({ type: 'repair', x: col + .5, z: row + .5, tick: state.tick });
    return true;
  }
  return false;
}

function enemyProfile(roll) {
  if (roll < .25) return { role: 'scout', name: 'Explorador', hp: 1, speed: 2.75, color: '#ff9f43', weapon: 'cannon' };
  if (roll < .5) return { role: 'assault', name: 'Asaltante', hp: 1, speed: 2.1, color: '#ff4d6d', weapon: 'cannon' };
  if (roll < .7) return { role: 'heavy', name: 'Pesado', hp: 3, speed: 1.45, color: '#b85cff', weapon: 'heavy' };
  if (roll < .84) return { role: 'sniper', name: 'Francotirador', hp: 1, speed: 1.65, color: '#4cc9f0', weapon: 'ricochet' };
  if (roll < .94) return { role: 'engineer', name: 'Enxeñeiro', hp: 2, speed: 1.7, color: '#a8df65', weapon: 'cannon' };
  return { role: 'commander', name: 'Comandante', hp: 2, speed: 1.85, color: '#ffcf56', weapon: 'rapid' };
}

function spawnEnemy(state) {
  const living = state.tanks.filter((tank) => tank.team === 'enemies' && tank.alive).length;
  if (living >= state.maxEnemies || state.enemiesToSpawn <= 0) return false;
  const spawn = state.map.enemySpawns[Math.floor(rng(state) * state.map.enemySpawns.length)];
  if (state.tanks.some((tank) => tank.alive && Math.hypot(tank.x - spawn[0], tank.z - spawn[1]) < .8)) return false;
  const profile = enemyProfile(rng(state));
  state.tanks.push({
    id: `e${state.nextEntityId++}`, kind: 'enemy', team: 'enemies', ...profile,
    x: spawn[0], z: spawn[1], dx: 0, dz: 1, vx: 0, vz: 0,
    hp: profile.hp, maxHp: profile.hp, alive: true, cooldown: .5 + rng(state),
    speed: profile.speed * DIFFICULTIES[state.difficulty].speed,
    shield: profile.role === 'commander' ? 1 : 0, recoil: 0, aiTimer: 0,
    weapons: [profile.weapon], reload: 1,
  });
  state.enemiesToSpawn--;
  return true;
}

function spawnBoss(state) {
  const spawn = state.map.enemySpawns[1];
  state.bossSpawned = true;
  state.tanks.push({
    id: `boss${state.nextEntityId++}`, name: 'Leviatán', kind: 'boss', role: 'boss', team: 'enemies',
    x: spawn[0], z: spawn[1], dx: 0, dz: 1, vx: 0, vz: 0,
    hp: 20, maxHp: 20, alive: true, cooldown: 1, speed: 1.15,
    color: '#ff315c', shield: 3, recoil: 0, aiTimer: 0,
    weapon: 'rocket', weapons: ['rocket'], reload: 1,
    phase: 0,
  });
  state.effects.push({ type: 'boss', x: spawn[0], z: spawn[1], tick: state.tick });
}

function dropPowerup(state, x, z) {
  if (rng(state) > DIFFICULTIES[state.difficulty].drop) return;
  const roll = rng(state);
  const type = roll < .11 ? 'shield' : roll < .22 ? 'rapid' : roll < .33 ? 'heavy' : roll < .42 ? 'ricochet' : roll < .5 ? 'rocket'
    : roll < .6 ? 'freeze' : roll < .69 ? 'bomb' : roll < .77 ? 'emp' : roll < .85 ? 'mine' : roll < .91 ? 'repair' : roll < .96 ? 'decoy' : 'fortress';
  state.powerups.push({ id: `u${state.nextEntityId++}`, type, x, z, life: 14 });
}

function damageBrick(state, x, z, damage = 1) {
  const col = Math.floor(x), row = Math.floor(z), key = `${row}:${col}`;
  if (state.map.tiles[row]?.[col] !== TILE.BRICK) return false;
  let mask = state.map.brickMasks[key] ?? 15;
  mask &= ~brickBit(x, z);
  if (damage > 1 && mask) mask &= mask - 1;
  state.map.brickMasks[key] = mask;
  if (!mask) state.map.tiles[row][col] = TILE.EMPTY;
  state.effects.push({ type: 'brick', x, z, tick: state.tick });
  return true;
}

function destroyTank(state, tank, ownerId = null) {
  if (!tank.alive) return;
  tank.alive = false; tank.vx = 0; tank.vz = 0;
  state.effects.push({ type: tank.kind === 'boss' ? 'base' : 'boom', x: tank.x, z: tank.z, tick: state.tick });
  if (tank.team === 'enemies') {
    state.score += tank.kind === 'boss' ? 2500 : tank.kind === 'generator' ? 400 : 100;
    registerEnemyKill(state, tank);
    if (tank.kind === 'enemy') dropPowerup(state, tank.x, tank.z);
  } else if (tank.kind === 'convoy') state.status = 'defeat';
  else tank.respawn = 2.2;
}

function damageTank(state, tank, damage, ownerId = null) {
  if (tank.shield > 0) {
    const absorbed = Math.min(tank.shield, damage);
    tank.shield -= absorbed; damage -= absorbed;
  }
  tank.hp -= damage;
  state.effects.push({ type: 'hit', x: tank.x, z: tank.z, tick: state.tick });
  if (tank.hp <= 0) destroyTank(state, tank, ownerId);
}

function explode(state, bullet) {
  const radius = bullet.blast || .8;
  state.effects.push({ type: 'boom', x: bullet.x, z: bullet.z, tick: state.tick });
  for (const tank of state.tanks) if (tank.alive && tank.team !== bullet.team && Math.hypot(tank.x - bullet.x, tank.z - bullet.z) <= radius + tankRadius(tank)) damageTank(state, tank, bullet.damage, bullet.owner);
  for (let row = Math.floor(bullet.z - radius); row <= Math.floor(bullet.z + radius); row++) for (let col = Math.floor(bullet.x - radius); col <= Math.floor(bullet.x + radius); col++) {
    if (state.map.tiles[row]?.[col] === TILE.BRICK && Math.hypot(col + .5 - bullet.x, row + .5 - bullet.z) <= radius + .5) {
      for (let quadrant = 0; quadrant < 4; quadrant++) damageBrick(state, col + (quadrant % 2 ? .75 : .25), row + (quadrant > 1 ? .75 : .25));
    }
  }
}

function updateBullets(state, dt) {
  for (const bullet of state.bullets) {
    bullet.life -= dt;
    const oldX = bullet.x, oldZ = bullet.z;
    const nextX = bullet.x + bullet.dx * bullet.speed * dt;
    const nextZ = bullet.z + bullet.dz * bullet.speed * dt;
    const collision = projectileCollision(state, oldX, oldZ, nextX, nextZ);
    bullet.x = collision?.x ?? nextX;
    bullet.z = collision?.z ?? nextZ;
    if (collision?.tile === TILE.BRICK) {
      const hitX = collision.col + (collision.quadrant % 2 ? .75 : .25);
      const hitZ = collision.row + (collision.quadrant > 1 ? .75 : .25);
      damageBrick(state, hitX, hitZ, bullet.damage);
      if (bullet.penetration > 0) bullet.penetration--; else bullet.life = 0;
      if (bullet.blast) explode(state, bullet);
      continue;
    }
    if (collision?.tile === TILE.STEEL) {
      if (bullet.bounces > 0) {
        let hitX = oldX <= collision.left - BULLET_RADIUS || oldX >= collision.right + BULLET_RADIUS;
        let hitZ = oldZ <= collision.top - BULLET_RADIUS || oldZ >= collision.bottom + BULLET_RADIUS;
        if (!hitX && !hitZ) {
          hitX = Math.abs(bullet.dx) >= Math.abs(bullet.dz);
          hitZ = !hitX;
        }
        if (hitX || !hitZ) bullet.dx *= -1;
        if (hitZ || !hitX) bullet.dz *= -1;
        bullet.x = oldX; bullet.z = oldZ; bullet.bounces--;
      } else {
        bullet.life = 0;
        if (bullet.blast) explode(state, bullet);
        else state.effects.push({ type: 'spark', x: bullet.x, z: bullet.z, tick: state.tick });
      }
      continue;
    }
    if (collision?.tile === TILE.BASE) {
      bullet.life = 0;
      const col = collision.col, row = collision.row;
      if (bullet.team === 'enemies' && state.baseShieldTimer <= 0) state.baseHp = Math.max(0, state.baseHp - bullet.damage);
      state.effects.push({ type: state.baseShieldTimer > 0 ? 'shield' : 'base', x: col + .5, z: row + .5, tick: state.tick });
      if (state.baseHp <= 0) { state.map.tiles[row][col] = TILE.EMPTY; state.status = 'defeat'; }
      continue;
    }
    const target = state.tanks.find((tank) => tank.alive && tank.team !== bullet.team && Math.hypot(tank.x - bullet.x, tank.z - bullet.z) < tankRadius(tank) + BULLET_RADIUS);
    if (target) {
      if (bullet.blast) explode(state, bullet); else damageTank(state, target, bullet.damage, bullet.owner);
      bullet.life = 0;
    }
  }
  for (let first = 0; first < state.bullets.length; first++) for (let second = first + 1; second < state.bullets.length; second++) {
    const a = state.bullets[first], b = state.bullets[second];
    if (a.life > 0 && b.life > 0 && a.team !== b.team && Math.hypot(a.x - b.x, a.z - b.z) < .2) {
      a.life = 0; b.life = 0;
      state.effects.push({ type: 'spark', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, tick: state.tick });
    }
  }
  state.bullets = state.bullets.filter((bullet) => bullet.life > 0);
}

function updatePowerups(state, dt) {
  for (const powerup of state.powerups) {
    powerup.life -= dt;
    const collector = state.tanks.find((tank) => tank.kind === 'player' && tank.alive && Math.hypot(tank.x - powerup.x, tank.z - powerup.z) < .55);
    if (!collector) continue;
    powerup.life = 0;
    if (powerup.type === 'shield') collector.shield = Math.min(4, collector.shield + 2);
    else if (powerup.type === 'rapid') collector.rapidTimer = Math.max(collector.rapidTimer, 10);
    else if (WEAPONS[powerup.type] && !collector.weapons.includes(powerup.type)) { collector.weapons.push(powerup.type); collector.weapon = powerup.type; }
    else if (ITEMS[powerup.type]) collector.item = powerup.type;
    state.score += 25;
    state.effects.push({ type: 'pickup', powerup: powerup.type, x: powerup.x, z: powerup.z, tick: state.tick });
  }
  state.powerups = state.powerups.filter((powerup) => powerup.life > 0);
}

function repairBunker(state) {
  if (!state.basePosition) return;
  const baseCol = Math.floor(state.basePosition.x), baseRow = Math.floor(state.basePosition.z);
  for (let row = baseRow - 1; row <= baseRow; row++) for (let col = baseCol - 1; col <= baseCol + 1; col++) {
    if (row === baseRow && col === baseCol) continue;
    if (state.map.tiles[row]?.[col] === TILE.STEEL) continue;
    state.map.tiles[row][col] = TILE.BRICK;
    state.map.brickMasks[`${row}:${col}`] = 15;
  }
}

function useItem(state, tank) {
  const item = tank.item;
  if (!item) return;
  tank.item = null;
  if (item === 'freeze') {
    for (const enemy of state.tanks.filter((candidate) => candidate.team === 'enemies' && candidate.alive)) enemy.frozenTimer = Math.max(enemy.frozenTimer || 0, enemy.kind === 'boss' ? 2.5 : 5);
  } else if (item === 'bomb') {
    for (const enemy of state.tanks.filter((candidate) => candidate.kind === 'enemy' && candidate.alive)) destroyTank(state, enemy, tank.id);
  } else if (item === 'emp') {
    for (const enemy of state.tanks.filter((candidate) => candidate.team === 'enemies' && candidate.alive)) {
      enemy.empTimer = Math.max(enemy.empTimer || 0, 6);
      enemy.shield = 0;
    }
  } else if (item === 'mine') {
    state.mines.push({ id: `mine${state.nextEntityId++}`, owner: tank.id, x: tank.x, z: tank.z, life: 25 });
  } else if (item === 'decoy') {
    state.decoys.push({ id: `decoy${state.nextEntityId++}`, x: tank.x, z: tank.z, life: 8 });
  } else if (item === 'repair') {
    tank.hp = Math.min(tank.maxHp, tank.hp + 2);
  } else if (item === 'fortress') {
    state.baseHp = state.baseMaxHp;
    state.baseShieldTimer = Math.max(state.baseShieldTimer, 12);
    repairBunker(state);
  }
  state.effects.push({ type: item, x: tank.x, z: tank.z, tick: state.tick });
}

function updateDeployables(state, dt) {
  for (const mine of state.mines) {
    mine.life -= dt;
    const target = state.tanks.find((tank) => tank.team === 'enemies' && tank.alive && Math.hypot(tank.x - mine.x, tank.z - mine.z) < .75 + tankRadius(tank));
    if (!target) continue;
    mine.life = 0;
    explode(state, { x: mine.x, z: mine.z, blast: 1.35, damage: 3, team: 'players', owner: mine.owner });
  }
  state.mines = state.mines.filter((mine) => mine.life > 0);
  for (const decoy of state.decoys) decoy.life -= dt;
  state.decoys = state.decoys.filter((decoy) => decoy.life > 0);
}

function updateCapture(state, dt) {
  if (!state.capture) return;
  const occupying = state.tanks.some((tank) => tank.kind === 'player' && tank.alive && Math.hypot(tank.x - state.capture.x, tank.z - state.capture.z) <= 1.25);
  const contested = state.tanks.some((tank) => tank.team === 'enemies' && tank.alive && Math.hypot(tank.x - state.capture.x, tank.z - state.capture.z) <= 1.25);
  if (occupying && !contested) state.capture.progress = Math.min(state.capture.goal, state.capture.progress + dt);
}

function respawnPlayers(state, dt) {
  for (const tank of state.tanks) {
    if (tank.kind !== 'player' || tank.alive) continue;
    tank.respawn -= dt;
    if (tank.respawn <= 0 && state.status === 'playing') {
      const number = state.tanks.filter((candidate) => candidate.kind === 'player').indexOf(tank);
      const spawn = state.map.playerSpawns[Math.max(0, number)] || state.map.playerSpawns[0];
      tank.x = spawn[0]; tank.z = spawn[1]; tank.hp = tank.maxHp; tank.shield = 0; tank.vx = 0; tank.vz = 0; tank.alive = true;
    }
  }
}

export function advance(state, dt, inputs = {}) {
  if (state.status !== 'playing') return state;
  state.tick++; state.elapsed += dt; state.effects = []; state.spawnTimer -= dt;
  state.baseShieldTimer = Math.max(0, (state.baseShieldTimer || 0) - dt);
  if (state.spawnTimer <= 0) {
    if (spawnEnemy(state)) state.spawnTimer = state.objective === 'survive' ? 1.75 : 2.35;
    else state.spawnTimer = .35;
  }
  for (const tank of state.tanks) {
    tank.cooldown = Math.max(0, tank.cooldown - dt);
    tank.rapidTimer = Math.max(0, (tank.rapidTimer || 0) - dt);
    tank.frozenTimer = Math.max(0, (tank.frozenTimer || 0) - dt);
    tank.empTimer = Math.max(0, (tank.empTimer || 0) - dt);
    tank.recoil = Math.max(0, (tank.recoil || 0) - dt * 7);
    if (!tank.alive) continue;
    if (tank.kind === 'generator') continue;
    const input = tank.kind === 'boss' ? bossInput(state, tank, dt) : tank.team === 'enemies' ? enemyInput(state, tank, dt) : tank.kind === 'convoy' ? convoyInput(state, tank) : inputs[tank.id] || {};
    cycleWeapon(tank, input.switch);
    if (tank.kind === 'player') {
      if (input.use && !tank.useLatch) useItem(state, tank);
      tank.useLatch = !!input.use;
    }
    if (tank.frozenTimer <= 0) moveTank(state, tank, input, dt);
    if (input.fire && tank.empTimer <= 0 && tank.frozenTimer <= 0) shoot(state, tank);
  }
  updateBullets(state, dt); updatePowerups(state, dt); updateDeployables(state, dt); updateCapture(state, dt); respawnPlayers(state, dt);
  const hostileAlive = state.tanks.some((tank) => tank.team === 'enemies' && tank.alive);
  if (state.objective === 'survive' && state.elapsed >= state.duration) state.status = 'victory';
  else if (state.objective === 'capture' && state.capture.progress >= state.capture.goal) state.status = 'victory';
  else if (state.objective === 'escort' && state.tanks.find((tank) => tank.kind === 'convoy')?.z <= 1.7) state.status = 'victory';
  else if (state.objective === 'generators' && !state.tanks.some((tank) => tank.kind === 'generator' && tank.alive)) state.status = 'victory';
  else if (!['survive', 'capture', 'generators'].includes(state.objective) && !hostileAlive && state.enemiesToSpawn <= 0) {
    if (state.bossEnabled && !state.bossSpawned) spawnBoss(state); else state.status = 'victory';
  }
  if (!state.tanks.some((tank) => tank.kind === 'player')) state.status = 'defeat';
  return state;
}

export function publicState(state) {
  return {
    version: state.version, tick: state.tick, elapsed: state.elapsed,
    map: state.map, tanks: state.tanks, bullets: state.bullets, powerups: state.powerups, mines: state.mines, decoys: state.decoys, effects: state.effects,
    status: state.status, score: state.score, enemiesToSpawn: state.enemiesToSpawn,
    difficulty: state.difficulty, objective: state.objective, duration: state.duration,
    missionId: state.missionId, bossSpawned: state.bossSpawned, teamKills: state.teamKills, teamRank: state.teamRank,
    baseHp: state.baseHp, baseMaxHp: state.baseMaxHp, baseShieldTimer: state.baseShieldTimer, capture: state.capture,
  };
}
