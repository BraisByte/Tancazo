import { campaignMission, normalizeUpgrades } from './campaign.js';
import { cloneMap, TILE } from './maps.js';

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

const BULLET_RADIUS = .1;
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
  const state = {
    version: 2, tick: 0, elapsed: 0, seed: (options.seed ?? Date.now()) | 0 || 1,
    map: cloneMap(mapSource), tanks: [], bullets: [], powerups: [], effects: [], status: 'playing',
    objective, duration: mission?.duration || options.duration || 0, missionId: mission?.id || null,
    enemiesToSpawn: objective === 'survive' ? 999 : challenge.enemies,
    maxEnemies: challenge.maxAlive, difficulty: challenge.id,
    bossEnabled: objective === 'boss' || (!mission && difficulty === 'hard'), bossSpawned: false,
    spawnTimer: .5, nextEntityId: 1, score: 0, upgrades: normalizeUpgrades(options.upgrades),
  };
  for (let index = 0; index < (options.players ?? 1); index++) addPlayer(state, `p${index + 1}`, `Jugador ${index + 1}`);
  if (objective === 'escort') addConvoy(state);
  return state;
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
    respawn: 0, shield: 0, rapidTimer: 0, recoil: 0,
    weapon: 'cannon', weapons: ['cannon'], switchLatch: false,
  };
  state.tanks.push(tank);
  return tank;
}

export function removePlayer(state, id) { state.tanks = state.tanks.filter((tank) => tank.id !== id); }

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

function canOccupy(state, x, z, self) {
  const radius = tankRadius(self);
  const points = [[x - radius, z - radius], [x + radius, z - radius], [x - radius, z + radius], [x + radius, z + radius]];
  if (points.some(([px, pz]) => blocksTank(tileAt(state, px, pz)))) return false;
  return !state.tanks.some((tank) => tank !== self && tank.alive && Math.hypot(tank.x - x, tank.z - z) < radius + tankRadius(tank) - .08);
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
    life: weapon.life, damage: weapon.damage, speed: weapon.speed,
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
  const players = state.tanks.filter((candidate) => candidate.team === 'players' && candidate.alive);
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
  const type = roll < .2 ? 'repair' : roll < .4 ? 'shield' : roll < .6 ? 'rapid' : roll < .74 ? 'bomb' : roll < .84 ? 'heavy' : roll < .93 ? 'ricochet' : 'rocket';
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

function destroyTank(state, tank) {
  if (!tank.alive) return;
  tank.alive = false; tank.vx = 0; tank.vz = 0;
  state.effects.push({ type: tank.kind === 'boss' ? 'base' : 'boom', x: tank.x, z: tank.z, tick: state.tick });
  if (tank.team === 'enemies') {
    state.score += tank.kind === 'boss' ? 2500 : 100;
    if (tank.kind !== 'boss') dropPowerup(state, tank.x, tank.z);
  } else if (tank.kind === 'convoy') state.status = 'defeat';
  else tank.respawn = 2.2;
}

function damageTank(state, tank, damage) {
  if (tank.shield > 0) {
    const absorbed = Math.min(tank.shield, damage);
    tank.shield -= absorbed; damage -= absorbed;
  }
  tank.hp -= damage;
  state.effects.push({ type: 'hit', x: tank.x, z: tank.z, tick: state.tick });
  if (tank.hp <= 0) destroyTank(state, tank);
}

function explode(state, bullet) {
  const radius = bullet.blast || .8;
  state.effects.push({ type: 'boom', x: bullet.x, z: bullet.z, tick: state.tick });
  for (const tank of state.tanks) if (tank.alive && tank.team !== bullet.team && Math.hypot(tank.x - bullet.x, tank.z - bullet.z) <= radius + tankRadius(tank)) damageTank(state, tank, bullet.damage);
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
    bullet.x += bullet.dx * bullet.speed * dt;
    bullet.z += bullet.dz * bullet.speed * dt;
    const tile = tileAt(state, bullet.x, bullet.z);
    if (tile === TILE.BRICK) {
      damageBrick(state, bullet.x, bullet.z, bullet.damage);
      if (bullet.penetration > 0) bullet.penetration--; else bullet.life = 0;
      if (bullet.blast) explode(state, bullet);
      continue;
    }
    if (tile === TILE.STEEL) {
      if (bullet.bounces > 0) {
        const hitX = tileAt(state, bullet.x, oldZ) === TILE.STEEL;
        const hitZ = tileAt(state, oldX, bullet.z) === TILE.STEEL;
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
    if (tile === TILE.BASE) {
      bullet.life = 0;
      const col = Math.floor(bullet.x), row = Math.floor(bullet.z);
      state.map.tiles[row][col] = TILE.EMPTY; state.status = 'defeat';
      state.effects.push({ type: 'base', x: col + .5, z: row + .5, tick: state.tick });
      continue;
    }
    const target = state.tanks.find((tank) => tank.alive && tank.team !== bullet.team && Math.hypot(tank.x - bullet.x, tank.z - bullet.z) < tankRadius(tank) + BULLET_RADIUS);
    if (target) {
      if (bullet.blast) explode(state, bullet); else damageTank(state, target, bullet.damage);
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
    if (powerup.type === 'repair') collector.hp = Math.min(collector.maxHp, collector.hp + 2);
    else if (powerup.type === 'shield') collector.shield = Math.min(4, collector.shield + 2);
    else if (powerup.type === 'rapid') collector.rapidTimer = Math.max(collector.rapidTimer, 10);
    else if (powerup.type === 'bomb') for (const enemy of state.tanks) if (enemy.kind === 'enemy' && enemy.alive) destroyTank(state, enemy);
    else if (WEAPONS[powerup.type] && !collector.weapons.includes(powerup.type)) { collector.weapons.push(powerup.type); collector.weapon = powerup.type; }
    state.score += 25;
    state.effects.push({ type: 'pickup', powerup: powerup.type, x: powerup.x, z: powerup.z, tick: state.tick });
  }
  state.powerups = state.powerups.filter((powerup) => powerup.life > 0);
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
  if (state.spawnTimer <= 0) {
    if (spawnEnemy(state)) state.spawnTimer = state.objective === 'survive' ? 1.75 : 2.35;
    else state.spawnTimer = .35;
  }
  for (const tank of state.tanks) {
    tank.cooldown = Math.max(0, tank.cooldown - dt);
    tank.rapidTimer = Math.max(0, (tank.rapidTimer || 0) - dt);
    tank.recoil = Math.max(0, (tank.recoil || 0) - dt * 7);
    if (!tank.alive) continue;
    const input = tank.kind === 'boss' ? bossInput(state, tank, dt) : tank.team === 'enemies' ? enemyInput(state, tank, dt) : tank.kind === 'convoy' ? convoyInput(state, tank) : inputs[tank.id] || {};
    cycleWeapon(tank, input.switch); moveTank(state, tank, input, dt);
    if (input.fire) shoot(state, tank);
  }
  updateBullets(state, dt); updatePowerups(state, dt); respawnPlayers(state, dt);
  const hostileAlive = state.tanks.some((tank) => tank.team === 'enemies' && tank.alive);
  if (state.objective === 'survive' && state.elapsed >= state.duration) state.status = 'victory';
  else if (state.objective === 'escort' && state.tanks.find((tank) => tank.kind === 'convoy')?.z <= 1.7) state.status = 'victory';
  else if (state.objective !== 'survive' && !hostileAlive && state.enemiesToSpawn <= 0) {
    if (state.bossEnabled && !state.bossSpawned) spawnBoss(state); else state.status = 'victory';
  }
  if (!state.tanks.some((tank) => tank.kind === 'player')) state.status = 'defeat';
  return state;
}

export function publicState(state) {
  return {
    version: state.version, tick: state.tick, elapsed: state.elapsed,
    map: state.map, tanks: state.tanks, bullets: state.bullets, powerups: state.powerups, effects: state.effects,
    status: state.status, score: state.score, enemiesToSpawn: state.enemiesToSpawn,
    difficulty: state.difficulty, objective: state.objective, duration: state.duration,
    missionId: state.missionId, bossSpawned: state.bossSpawned,
  };
}
