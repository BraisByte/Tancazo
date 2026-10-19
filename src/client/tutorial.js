// The training uses the regular simulation; only its first enemy wave is delayed.
export function beginTraining(game) {
  game.enemiesToSpawn = 3;
  game.maxEnemies = 1;
  game.spawnTimer = 3600;
  const player = game.tanks.find((tank) => tank.kind === 'player');
  return { step: 0, distance: 0, x: player.x, z: player.z };
}

export function updateTraining(training, game) {
  const player = game.tanks.find((tank) => tank.kind === 'player');
  if (!player || game.status !== 'playing') return;
  training.distance += Math.hypot(player.x - training.x, player.z - training.z);
  training.x = player.x; training.z = player.z;
  if (training.step === 0 && training.distance >= 1.5) training.step = 1;
  else if (training.step === 1 && player.recoil > .5) {
    training.step = 2;
    player.item = 'fortress';
  } else if (training.step === 2 && !player.item) {
    training.step = 3;
    game.spawnTimer = 2;
  }
}

export function trainingInstruction(training, bindings, mouse) {
  const key = (action) => bindings[action].replace('Key', '').replace('Arrow', 'Frecha ');
  return [
    `Move o tanque con ${['up', 'left', 'down', 'right'].map(key).join(' / ')} ou a cruceta táctil / stick esquerdo. Percorre un pequeno tramo.`,
    `${mouse ? 'Apunta co rato e dispara co clic esquerdo' : `Dispara con ${key('fire')}`} ou usa o botón ● táctil / gatillo do mando. Podes disparar mentres te moves.`,
    `Fortaleza equipada: preme ${key('use')} ou B no mando (E en táctil) para protexer o núcleo cun escudo.`,
    'Defende o núcleo dos tres inimigos. Evita darlles as costas: os impactos traseiros causan danos críticos.',
  ][training.step];
}
