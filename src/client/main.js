import { ITEMS, RANKS, STEP, advance, createGame } from '../shared/simulation.js?v=22';
import { CAMPAIGN, GARAGE_PARTS, RUN_PERKS, UPGRADES } from '../shared/campaign.js?v=22';
import { readLocalInputs, consume, getBindings, setBindings } from './input.js?v=22';
import { GameRenderer } from './render.js?v=22';
import { GameAudio } from './audio.js?v=22';
import { buyUpgrade, completeMission, equipPart, fabricatePart, loadProgress } from './progression.js?v=22';
import { EDITOR_TILES, defaultDraft, draftToMap, mapToDraft } from './editor.js?v=22';

const $ = (selector) => document.querySelector(selector);
const ui = {
  menu: $('#menu'), hud: $('#hud'), result: $('#result'), message: $('#menu-message'),
  score: $('#score'), enemies: $('#enemies'), counterLabel: $('#counter-label'), status: $('#status'), mode: $('#mode'),
  room: $('#room'), roomWrap: $('#room-wrap'), connection: $('#connection'),
  resultTitle: $('#result-title'), resultCopy: $('#result-copy'), name: $('#player-name'), code: $('#room-code'),
  difficulty: $('#difficulty'), lobby: $('#online-lobby'), lobbyRoom: $('#lobby-room'),
  roster: $('#lobby-roster'), lobbyHint: $('#lobby-hint'), lobbyReady: $('#lobby-ready'), lobbyStart: $('#lobby-start'),
  lobbyMap: $('#lobby-map'), lobbyDifficulty: $('#lobby-difficulty'),
  campaign: $('#campaign-panel'), campaignMissions: $('#campaign-missions'), campaignProgress: $('#campaign-progress'), medals: $('#medals'), upgrades: $('#upgrade-list'),
  garage: $('#garage-panel'), garageParts: $('#garage-parts'), garageSummary: $('#garage-summary'),
  editor: $('#editor-panel'), editorGrid: $('#editor-grid'), editorJson: $('#editor-json'), editorMessage: $('#editor-message'),
  settings: $('#settings-panel'), playerStatus: $('#player-status'), touch: $('#touch-controls'),
  battleStatus: $('#battle-status'), baseHealth: $('#base-health'), teamRank: $('#team-rank'), captureWrap: $('#capture-wrap'), captureProgress: $('#capture-progress'),
  rankFill: $('#rank-fill'), minimap: $('#minimap'), notice: $('#game-notice'), musicShortcut: $('#music-shortcut'), musicScene: $('#music-scene'), combo: $('#combo'), ultimate: $('#ultimate'),
};
const view = new GameRenderer($('#game'));
const audio = new GameAudio();
let game = createGame({ players: 0, seed: 1985 });
let mode = 'menu';
let socket = null;
let onlinePlayers = [];
let clientId = null;
let currentLobby = null;
let currentRoomCode = '';
let reconnectTimer = null;
let isSpectator = false;
let localPlayers = [];
let accumulator = 0;
let last = performance.now();
let lastPing = 0;
let latency = 0;
let shownResult = false;
let campaignStars = 0;
let campaignMissionId = null;
let campaignAdvanceTimer = null;
let runPerks = {};
let lastNoticeKey = '';
let noticeUntil = 0;
let customMap = null;
let editorDraft = defaultDraft();
let editorTile = 'B';
let progress = loadProgress();
let preferences;
try {
  const saved = JSON.parse(localStorage.getItem('tancazo.settings') || '{}');
  preferences = { music: saved.music ?? saved.volume ?? 70, effects: saved.effects ?? saved.volume ?? 70, radio: true, ui: 100, shake: true, contrast: false, aim: false, bindings: getBindings(), ...saved };
} catch { preferences = { music: 70, effects: 70, radio: true, ui: 100, shake: true, contrast: false, aim: false, bindings: getBindings() }; }

function applyPreferences() {
  audio.setVolumes(preferences.music / 100, preferences.effects / 100);
  audio.setRadioEnabled(preferences.radio);
  view.setShakeEnabled(preferences.shake);
  document.documentElement.style.fontSize = `${preferences.ui}%`;
  document.body.classList.toggle('high-contrast', preferences.contrast);
  $('#setting-music').value = preferences.music;
  $('#setting-effects').value = preferences.effects;
  $('#setting-radio').checked = preferences.radio;
  $('#setting-ui').value = preferences.ui;
  $('#setting-shake').checked = preferences.shake;
  $('#setting-contrast').checked = preferences.contrast;
  $('#setting-aim').checked = preferences.aim;
  ui.musicShortcut.textContent = `♪ Música adaptativa · ${preferences.music}%`;
  setBindings(preferences.bindings || getBindings());
  renderBindings();
}

function renderBindings() {
  const names = { up: 'Arriba', down: 'Abaixo', left: 'Esquerda', right: 'Dereita', fire: 'Disparo', switch: 'Arma', use: 'Obxecto', ultimate: 'Definitiva' };
  const current = getBindings();
  $('#binding-list').replaceChildren(...Object.entries(names).map(([action, label]) => {
    const button = document.createElement('button');
    const title = document.createElement('b');
    title.textContent = label;
    button.append(title, document.createTextNode(current[0][action]));
    button.addEventListener('click', () => {
      button.textContent = 'Preme unha tecla…';
      addEventListener('keydown', (event) => {
        event.preventDefault();
        const next = getBindings(); next[0][action] = event.code; setBindings(next);
        preferences.bindings = getBindings(); renderBindings();
      }, { once: true, capture: true });
    });
    return button;
  }));
}
applyPreferences();
$('#setting-music').addEventListener('input', () => {
  audio.setVolumes(Number($('#setting-music').value) / 100, Number($('#setting-effects').value) / 100);
  ui.musicShortcut.textContent = `♪ Música adaptativa · ${$('#setting-music').value}%`;
});
$('#setting-effects').addEventListener('input', () => audio.setVolumes(Number($('#setting-music').value) / 100, Number($('#setting-effects').value) / 100));
$('#preview-music').addEventListener('click', () => audio.previewMusic());

function hidePanels() {
  for (const panel of [ui.menu, ui.lobby, ui.result, ui.campaign, ui.garage, ui.editor, ui.settings]) panel.classList.add('hidden');
}

function setPlaying(nextMode) {
  mode = nextMode;
  shownResult = false;
  campaignStars = 0;
  hidePanels();
  ui.hud.classList.remove('hidden');
  ui.playerStatus.classList.remove('hidden');
  ui.battleStatus.classList.remove('hidden');
  ui.minimap.classList.remove('hidden');
  document.body.classList.add('playing');
  ui.roomWrap.classList.toggle('hidden', nextMode !== 'online');
  ui.mode.textContent = nextMode === 'online' ? (isSpectator ? 'ESPECTADOR ONLINE' : 'ONLINE') : nextMode === 'local2' ? 'COOPERATIVO LOCAL' : 'ARCADE LOCAL';
}

function startLocal(players, options = {}) {
  clearTimeout(campaignAdvanceTimer);
  campaignAdvanceTimer = null;
  socket?.close();
  socket = null;
  campaignMissionId = options.missionId || null;
  game = createGame({
    players, seed: Date.now(),
    map: options.map,
    mapId: options.mapId || $('#map-select').value,
    difficulty: options.difficulty || $('#difficulty-select').value,
    missionId: options.missionId,
    upgrades: campaignMissionId ? progress.upgrades : {},
    loadout: progress.loadout,
    runPerks,
  });
  localPlayers = game.tanks.filter((tank) => tank.kind === 'player').map((tank) => tank.id);
  setPlaying(players > 1 ? 'local2' : 'local1');
}

function onlineUrl(create, room = '', reconnect = false, spectate = false) {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = new URLSearchParams({ name: ui.name.value.trim() || 'Comandante' });
  query.set('seats', $('#online-seats').value);
  query.set('map', $('#map-select').value);
  query.set('difficulty', $('#difficulty-select').value);
  for (const [category, id] of Object.entries(progress.loadout || {})) query.set(category, id);
  if (create) query.set('create', '1');
  else query.set('room', room.toUpperCase());
  if (reconnect) query.set('reconnect', '1');
  if (spectate) query.set('spectate', '1');
  return `${scheme}//${location.host}/online?${query}`;
}

function connect(create, reconnect = false, spectate = false) {
  const room = (reconnect ? currentRoomCode : ui.code.value.trim()).toUpperCase();
  if (!create && room.length !== 5) { ui.message.textContent = 'O código debe ter cinco caracteres.'; return; }
  socket?.close();
  ui.connection.textContent = 'Conectando…';
  ui.connection.classList.remove('hidden');
  const ws = socket = new WebSocket(onlineUrl(create, room, reconnect, spectate));
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === 'welcome') {
      onlinePlayers = message.playerIds || (message.playerId ? [message.playerId] : []);
      isSpectator = !!message.spectator;
      clientId = message.clientId;
      currentRoomCode = message.room;
      ui.code.value = message.room;
      ui.room.textContent = message.room;
      ui.lobbyRoom.textContent = message.room;
      ui.connection.classList.add('hidden');
      if (message.phase === 'playing') setPlaying('online');
      else {
        mode = 'lobby';
        ui.menu.classList.add('hidden');
        ui.hud.classList.add('hidden');
        ui.lobby.classList.remove('hidden');
      }
    } else if (message.type === 'lobby') {
      renderLobby(message);
    } else if (message.type === 'countdown') {
      ui.lobbyHint.textContent = `A operación comeza en ${message.seconds}…`;
    } else if (message.type === 'started') {
      setPlaying('online');
    } else if (message.type === 'snapshot') {
      game = message.state;
    } else if (message.type === 'pong') {
      latency = Math.max(0, Math.round(performance.now() - message.sentAt));
      ui.room.textContent = `${currentLobby?.room || ui.room.textContent.split(' ')[0]} · ${latency} ms`;
    } else if (message.type === 'error') {
      if (mode === 'lobby') ui.lobbyHint.textContent = message.message;
      else ui.message.textContent = message.message;
      ui.connection.classList.add('hidden');
    }
  });
  ws.addEventListener('close', () => {
    if (mode === 'online' || mode === 'lobby') {
      ui.connection.textContent = mode === 'online' ? 'Conexión perdida. Reconectando…' : 'Conexión perdida. Volve ao menú para reconectar.';
      ui.connection.classList.remove('hidden');
      if (mode === 'online' && currentRoomCode) reconnectTimer = setTimeout(() => connect(false, true, isSpectator), 1200);
    }
  });
  ws.addEventListener('error', () => { ui.message.textContent = 'Non foi posible conectar co servidor.'; });
}

function renderLobby(lobby) {
  currentLobby = lobby;
  if (game.map.id !== lobby.settings.mapId || game.difficulty !== lobby.settings.difficulty) {
    game = createGame({ players: 0, seed: 1985, mapId: lobby.settings.mapId, difficulty: lobby.settings.difficulty });
  }
  const me = lobby.clients.find((client) => client.clientId === clientId);
  const isHost = !!me?.host;
  ui.lobbyMap.value = lobby.settings.mapId;
  ui.lobbyDifficulty.value = lobby.settings.difficulty;
  ui.lobbyMap.disabled = !isHost || lobby.phase !== 'lobby';
  ui.lobbyDifficulty.disabled = !isHost || lobby.phase !== 'lobby';
  ui.lobbyReady.disabled = lobby.phase !== 'lobby';
  ui.lobbyReady.textContent = me?.ready ? 'Cancelar preparación' : 'Estou preparado';
  ui.lobbyReady.classList.toggle('accent', !me?.ready);
  ui.lobbyStart.classList.toggle('hidden', !isHost);
  ui.lobbyStart.disabled = lobby.phase !== 'lobby' || !lobby.clients.length || !lobby.clients.every((client) => client.ready);
  ui.lobbyHint.textContent = lobby.phase === 'countdown'
    ? 'Motores en marcha…'
    : isHost ? 'Configura a operación e espera a que todos estean preparados.' : 'O anfitrión configura a operación.';
  ui.roster.replaceChildren(...lobby.clients.map((client) => {
    const row = document.createElement('div');
    row.className = 'roster-player';
    const identity = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = `${client.host ? '★ ' : ''}${client.name}`;
    const seats = document.createElement('small');
    seats.textContent = `${client.seats} ${client.seats === 1 ? 'tanque' : 'tanques'} neste dispositivo`;
    identity.append(title, seats);
    const state = document.createElement('span');
    state.className = `roster-state${client.ready ? ' ready' : ''}`;
    state.textContent = client.ready ? 'PREPARADO' : 'AXUSTANDO';
    row.append(identity, state);
    return row;
  }));
}

function currentOnlineInputs() {
  const values = assistedInputs(onlinePlayers);
  return onlinePlayers.map((id) => ({ id, ...values[id] }));
}

function assistedInputs(ids) {
  const values = readLocalInputs(ids);
  if (!preferences.aim) return values;
  const enemies = game.tanks.filter((tank) => tank.team === 'enemies' && tank.alive);
  for (const id of ids) {
    const input = values[id];
    const player = game.tanks.find((tank) => tank.id === id);
    if (!input?.fire || !player || Math.hypot(input.aimX || 0, input.aimZ || 0) > .25) continue;
    const target = enemies.sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0];
    if (target && Math.hypot(target.x - player.x, target.z - player.z) < 4.5) {
      input.aimX = target.x - player.x; input.aimZ = target.z - player.z;
    }
  }
  return values;
}

function drawMinimap() {
  const context = ui.minimap.getContext('2d');
  const width = ui.minimap.width, height = ui.minimap.height;
  const tileWidth = width / game.map.width, tileHeight = height / game.map.height;
  const colors = { '.': '#102936', B: '#a94f34', S: '#607d89', W: '#117a91', G: '#2c8d58', I: '#9edff2', M: '#5b4631', X: '#c94434', D: '#93633d', R: '#a87546', H: '#ffe07b' };
  context.fillStyle = '#07131e'; context.fillRect(0, 0, width, height);
  for (let row = 0; row < game.map.height; row++) for (let col = 0; col < game.map.width; col++) {
    context.fillStyle = colors[game.map.tiles[row][col]] || colors['.'];
    context.fillRect(col * tileWidth, row * tileHeight, Math.ceil(tileWidth), Math.ceil(tileHeight));
  }
  if (game.capture) {
    context.strokeStyle = '#47e6a4'; context.lineWidth = 2;
    context.beginPath(); context.arc(game.capture.x * tileWidth, game.capture.z * tileHeight, tileWidth * 1.15, 0, Math.PI * 2); context.stroke();
  }
  if (game.rescue) {
    context.strokeStyle = '#ffd166'; context.lineWidth = 2;
    context.beginPath(); context.arc(game.rescue.extraction[0] * tileWidth, game.rescue.extraction[1] * tileHeight, tileWidth, 0, Math.PI * 2); context.stroke();
  }
  for (const powerup of game.powerups || []) {
    context.fillStyle = '#f7e26b';
    context.fillRect(powerup.x * tileWidth - 2, powerup.z * tileHeight - 2, 4, 4);
  }
  for (const tank of game.tanks.filter((candidate) => candidate.alive)) {
    context.fillStyle = tank.kind === 'player' ? '#47e6a4' : tank.kind === 'convoy' ? '#ffd166' : tank.kind === 'survivor' ? '#f8f2d7' : tank.kind === 'boss' ? '#ff2f78' : tank.kind === 'generator' ? '#ff9f43' : '#ff536b';
    const size = tank.kind === 'boss' ? 7 : 5;
    context.fillRect(tank.x * tileWidth - size / 2, tank.z * tileHeight - size / 2, size, size);
  }
}

function updateNotices() {
  const radioMessages = { ultimate: 'HABILIDADE DEFINITIVA ACTIVADA', critical: 'IMPACTO TRASEIRO · SISTEMAS DANADOS', rescue: 'SUPERVIVENTE LOCALIZADO · ESCOLTA Á EXTRACCIÓN', revive: 'UNIDADE REANIMADA', boss: 'ALERTA · NOVA FASE DO LEVIATÁN' };
  const effect = [...(game.effects || [])].reverse().find((candidate) => candidate.type === 'pickup' || candidate.type === 'rank' || ITEMS[candidate.type] || radioMessages[candidate.type]);
  if (effect) {
    const key = `${effect.tick}:${effect.type}:${effect.powerup || ''}`;
    if (key !== lastNoticeKey) {
      lastNoticeKey = key;
      if (effect.type === 'pickup') {
        const item = ITEMS[effect.powerup];
        ui.notice.textContent = item ? `${item.name.toUpperCase()} RECOLLIDO · USA A ACCIÓN OBXECTO` : `${String(effect.powerup).toUpperCase()} CONSEGUIDO`;
      } else if (effect.type === 'rank') {
        ui.notice.textContent = `RANGO ${game.teamRank} · ${RANKS[(game.teamRank || 1) - 1]?.name.toUpperCase()}`;
      } else if (radioMessages[effect.type]) ui.notice.textContent = `RADIO · ${radioMessages[effect.type]}`;
      else ui.notice.textContent = `${ITEMS[effect.type].name.toUpperCase()} ACTIVADO`;
      noticeUntil = performance.now() + 2200;
      ui.notice.classList.remove('hidden');
      audio.radio(ui.notice.textContent);
    }
  }
  if (noticeUntil && performance.now() >= noticeUntil) ui.notice.classList.add('hidden');
}

function updateHud() {
  ui.score.textContent = String(game.score || 0).padStart(6, '0');
  const alive = game.tanks.filter((tank) => tank.team === 'enemies' && tank.alive).length;
  if (game.objective === 'survive') {
    ui.counterLabel.textContent = 'TEMPO';
    ui.enemies.textContent = `${Math.max(0, Math.ceil(game.duration - game.elapsed))}s`;
  } else if (game.objective === 'capture') {
    ui.counterLabel.textContent = 'BALIZA';
    ui.enemies.textContent = `${Math.round((game.capture?.progress || 0) / (game.capture?.goal || 1) * 100)}%`;
  } else if (game.objective === 'generators') {
    ui.counterLabel.textContent = 'XERADORES';
    ui.enemies.textContent = String(game.tanks.filter((tank) => tank.kind === 'generator' && tank.alive).length);
  } else if (game.objective === 'rescue') {
    ui.counterLabel.textContent = 'RESCATADOS';
    ui.enemies.textContent = `${game.rescue?.rescued || 0}/${game.rescue?.total || 0}`;
  } else {
    ui.counterLabel.textContent = 'INIMIGOS';
    ui.enemies.textContent = String((game.enemiesToSpawn || 0) + alive).padStart(2, '0');
  }
  ui.difficulty.textContent = ({ easy: 'PATRULLA', normal: 'ASEDIO', hard: 'TORMENTA' })[game.difficulty] || 'ASEDIO';
  ui.musicScene.textContent = game.bossSpawned ? 'LEVIATÁN' : ({ citadel: 'CIUDADELA', foundry: 'FORXA', delta: 'DELTA', glacier: 'GLACIAR', marsh: 'PANTANO', arsenal: 'ARSENAL', fortress: 'FORTALEZA' })[game.map.id] || 'CAMPO';
  const objectiveText = game.objective === 'survive' ? 'RESISTE ATA A EVACUACIÓN' : game.objective === 'escort' ? 'ESCOLTA O TRANSPORTE' : game.objective === 'capture' ? 'MANTÉN A BALIZA' : game.objective === 'generators' ? 'DESTRÚE OS XERADORES' : game.objective === 'rescue' ? 'RESCATA E EXTRAE A COLUMNA' : game.bossSpawned ? 'ROMPE OS PUNTOS DÉBILES DO LEVIATÁN' : 'DEFENDE O NÚCLEO';
  ui.status.textContent = game.status === 'playing' ? objectiveText : game.status === 'victory' ? 'SECTOR ASEGURADO' : 'NÚCLEO DESTRUÍDO';
  ui.baseHealth.textContent = `${'◆'.repeat(Math.max(0, game.baseHp || 0))}${'◇'.repeat(Math.max(0, (game.baseMaxHp || 3) - (game.baseHp || 0)))}${game.baseShieldTimer > 0 ? ' · ESCUDO' : ''}`;
  const rank = RANKS[(game.teamRank || 1) - 1] || RANKS[0];
  const nextRank = RANKS[game.teamRank || 1];
  ui.teamRank.textContent = `${['I', 'II', 'III', 'IV', 'V'][rank.rank - 1]} · ${game.teamKills || 0}${nextRank ? `/${nextRank.kills}` : ' · MÁX'}`;
  const rankProgress = nextRank ? ((game.teamKills || 0) - rank.kills) / (nextRank.kills - rank.kills) : 1;
  ui.rankFill.style.width = `${Math.max(0, Math.min(1, rankProgress)) * 100}%`;
  const primaryPlayer = game.tanks.find((tank) => tank.kind === 'player');
  ui.combo.textContent = `×${game.combo || 0}`;
  ui.ultimate.textContent = `${Math.round(primaryPlayer?.ultimateCharge || 0)}% · F`;
  drawMinimap();
  updateNotices();
  ui.captureWrap.classList.toggle('hidden', !game.capture);
  if (game.capture) ui.captureProgress.textContent = `${Math.round(game.capture.progress / game.capture.goal * 100)}%`;
  ui.playerStatus.replaceChildren(...game.tanks.filter((tank) => tank.kind === 'player' || tank.kind === 'convoy' || tank.kind === 'survivor').map((tank) => {
    const chip = document.createElement('div'); chip.className = 'player-chip';
    const name = document.createElement('b'); name.textContent = tank.name;
    const status = document.createElement('span');
    const health = document.createElement('i'); health.className = 'health-pips';
    health.textContent = `${'◆'.repeat(Math.max(0, tank.hp))}${'◇'.repeat(Math.max(0, tank.maxHp - tank.hp))}`;
    const item = tank.item ? ` · Obxecto: ${ITEMS[tank.item]?.name || tank.item}` : '';
    const damage = tank.trackDamage > 0 ? ' · ORUGAS DANADAS' : tank.turretDamage > 0 ? ' · TORRETA DANADA' : tank.burningTimer > 0 ? ' · INCENDIO' : '';
    const downed = tank.downed ? ` · CAÍDO ${Math.ceil(tank.respawn || 0)}s` : '';
    status.append(health, document.createTextNode(` · ${tank.weapon || 'cannon'}${tank.shield ? ` · escudo ${tank.shield}` : ''}${tank.kind === 'player' ? ` · R${tank.rank || 1}${item}${damage}${downed}` : tank.kind === 'survivor' ? (tank.activated ? ' · EN MARCHA' : ' · POR LOCALIZAR') : ''}`));
    chip.append(name, status); return chip;
  }));
  if (game.status !== 'playing' && !shownResult) {
    shownResult = true;
    if (campaignMissionId) campaignStars = completeMission(progress, campaignMissionId, game);
    setTimeout(() => {
      ui.resultTitle.textContent = game.status === 'victory' ? 'VICTORIA' : 'DERROTA';
      const missionIndex = CAMPAIGN.findIndex((mission) => mission.id === campaignMissionId);
      const mission = CAMPAIGN[missionIndex];
      const unlockCopy = campaignMissionId && game.status === 'victory' && mission?.reward ? ` · Recompensa: ${mission.reward.name}` : '';
      ui.resultCopy.textContent = `Puntuación: ${String(game.score || 0).padStart(6, '0')}${campaignMissionId && game.status === 'victory' ? ` · ${'★'.repeat(campaignStars)}${'☆'.repeat(3 - campaignStars)}` : ''}${unlockCopy}`;
      const me = currentLobby?.clients.find((client) => client.clientId === clientId);
      $('#restart').disabled = mode === 'online' && !me?.host;
      $('#restart').textContent = mode === 'online' && !me?.host ? 'Agardando o anfitrión' : campaignMissionId && game.status === 'victory' && mission?.next?.length ? (mission.next.length > 1 ? 'Continuar pola ruta principal' : 'Seguinte misión') : 'Xogar de novo';
      $('#result-campaign').classList.toggle('hidden', !campaignMissionId);
      $('#back').textContent = campaignMissionId ? 'Seleccionar misión' : 'Volver ao menú';
      ui.result.classList.remove('hidden');
      if (campaignMissionId && game.status === 'victory' && mission?.next?.length) {
        renderPerkChoices();
        ui.resultCopy.textContent += ' · Avance automático en 8 segundos';
        clearTimeout(campaignAdvanceTimer);
        campaignAdvanceTimer = setTimeout(() => { grantRunPerk(Object.keys(RUN_PERKS)[0]); startNextCampaignMission(); }, 8000);
      } else $('#perk-choices').classList.add('hidden');
    }, 500);
  }
}

function returnToMenu() {
  clearTimeout(campaignAdvanceTimer); campaignAdvanceTimer = null;
  runPerks = {};
  clearTimeout(reconnectTimer); reconnectTimer = null;
  socket?.close(); socket = null; onlinePlayers = []; clientId = null; currentLobby = null; isSpectator = false;
  currentRoomCode = '';
  mode = 'menu'; campaignMissionId = null; game = createGame({ players: 0, seed: 1985 });
  hidePanels();
  ui.hud.classList.add('hidden'); ui.playerStatus.classList.add('hidden'); ui.battleStatus.classList.add('hidden'); ui.minimap.classList.add('hidden'); ui.notice.classList.add('hidden'); ui.connection.classList.add('hidden'); ui.menu.classList.remove('hidden');
  document.body.classList.remove('playing');
}

function openPanel(panel, nextMode) {
  hidePanels();
  ui.hud.classList.add('hidden'); ui.playerStatus.classList.add('hidden'); ui.battleStatus.classList.add('hidden'); ui.minimap.classList.add('hidden'); ui.notice.classList.add('hidden');
  document.body.classList.remove('playing');
  panel.classList.remove('hidden'); mode = nextMode;
}

function openCampaignSelector() {
  clearTimeout(campaignAdvanceTimer); campaignAdvanceTimer = null;
  renderCampaign();
  openPanel(ui.campaign, 'campaign');
}

function startNextCampaignMission() {
  if (!campaignMissionId || game.status !== 'victory') return false;
  const mission = CAMPAIGN.find((candidate) => candidate.id === campaignMissionId);
  const nextId = mission?.next?.[0];
  if (!nextId) return false;
  ui.result.classList.add('hidden');
  startLocal(1, { missionId: nextId });
  return true;
}

function grantRunPerk(id) {
  if (RUN_PERKS[id]) runPerks[id] = Math.min(3, (runPerks[id] || 0) + 1);
}

function renderPerkChoices() {
  const container = $('#perk-choices');
  const choices = Object.entries(RUN_PERKS).sort(([first], [second]) => (((game.seed >>> 0) + first.length * 13) % 17) - (((game.seed >>> 0) + second.length * 13) % 17)).slice(0, 3);
  container.replaceChildren(...choices.map(([id, perk]) => {
    const button = document.createElement('button');
    button.textContent = `${perk.name} · ${perk.description}`;
    button.addEventListener('click', () => { clearTimeout(campaignAdvanceTimer); grantRunPerk(id); startNextCampaignMission(); });
    return button;
  }));
  container.classList.remove('hidden');
}

function renderCampaign() {
  progress = loadProgress();
  ui.medals.textContent = progress.medals;
  ui.campaignProgress.textContent = `${Object.keys(progress.stars).length}/${CAMPAIGN.length}`;
  const displayOrder = ['green-line', 'red-forge', 'silent-depot', 'frozen-pass', 'iron-convoy', 'emerald-marsh', 'broken-arsenal', 'ghost-rescue', 'last-bastion', 'command-gate', 'cobalt-heart'];
  const missions = [...CAMPAIGN].sort((first, second) => displayOrder.indexOf(first.id) - displayOrder.indexOf(second.id));
  ui.campaignMissions.replaceChildren(...missions.map((mission, index) => {
    const card = document.createElement('article');
    const locked = !progress.unlockedMissions.includes(mission.id);
    card.className = `mission-card${locked ? ' future' : ''}`;
    const sector = document.createElement('span'); sector.className = 'sector'; sector.textContent = `${mission.sector || 'SECTOR'} · ${mission.objective.toUpperCase()}`;
    const title = document.createElement('h3'); title.textContent = `${index + 1}. ${mission.title}`;
    const briefing = document.createElement('p'); briefing.textContent = mission.briefing;
    const reward = document.createElement('span'); reward.className = 'reward'; reward.textContent = mission.reward ? `RECOMPENSA · ${mission.reward.name}` : '';
    const stars = document.createElement('div'); stars.className = 'stars';
    const earned = progress.stars[mission.id] || 0; stars.textContent = `${'★'.repeat(earned)}${'☆'.repeat(3 - earned)}`;
    const play = document.createElement('button'); play.textContent = locked ? 'Probar misión' : 'Despregar';
    play.addEventListener('click', () => { runPerks = {}; startLocal(1, { missionId: mission.id }); });
    card.append(sector, title, briefing, reward, stars, play); return card;
  }));
  ui.upgrades.replaceChildren(...Object.entries(UPGRADES).map(([id, definition]) => {
    const item = document.createElement('div'); item.className = 'upgrade';
    const title = document.createElement('b'); title.textContent = `${definition.name} · ${progress.upgrades[id]}/${definition.max}`;
    const description = document.createElement('small'); description.textContent = definition.description;
    const level = progress.upgrades[id] || 0, cost = level + 1;
    const buy = document.createElement('button'); buy.textContent = level >= definition.max ? 'MÁXIMO' : `Mellorar · ${cost} ★`;
    buy.disabled = level >= definition.max || progress.medals < cost;
    buy.addEventListener('click', () => { if (buyUpgrade(progress, id)) renderCampaign(); });
    item.append(title, description, buy); return item;
  }));
}

function renderGarage() {
  progress = loadProgress();
  const selected = progress.loadout;
  const chassis = GARAGE_PARTS.chassis[selected.chassis], turret = GARAGE_PARTS.turret[selected.turret], engine = GARAGE_PARTS.engine[selected.engine], ultimate = GARAGE_PARTS.ultimate[selected.ultimate];
  ui.garageSummary.textContent = `${chassis.name} · ${turret.name} · ${engine.name} · ${ultimate.name} — Vida ${Math.max(2, 3 + chassis.hp + (progress.upgrades.armor || 0))}, velocidade ×${(chassis.speed * engine.speed).toFixed(2)}, recarga ×${turret.reload.toFixed(2)}.`;
  const categoryNames = { chassis: 'Chasis', turret: 'Torretas', engine: 'Motores', ultimate: 'Habilidades definitivas' };
  ui.garageParts.replaceChildren(...Object.entries(categoryNames).map(([category, name]) => {
    const section = document.createElement('section'); section.className = 'garage-category';
    const heading = document.createElement('h3'); heading.textContent = name;
    const grid = document.createElement('div'); grid.className = 'part-grid';
    grid.replaceChildren(...Object.entries(GARAGE_PARTS[category]).map(([id, definition]) => {
      const unlocked = progress.unlockedParts[category]?.includes(id);
      const card = document.createElement('article'); card.className = `part-card${selected[category] === id ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
      const title = document.createElement('b'); title.textContent = definition.name;
      const description = document.createElement('small'); description.textContent = definition.description;
      const button = document.createElement('button'); button.disabled = selected[category] === id || (!unlocked && progress.medals < 4);
      button.textContent = !unlocked ? 'Fabricar · 4 ★' : selected[category] === id ? 'EQUIPADO' : 'Equipar';
      button.addEventListener('click', () => {
        if (!unlocked && fabricatePart(progress, category, id, 4)) renderGarage();
        else if (equipPart(progress, category, id)) renderGarage();
      });
      card.append(title, description, button); return card;
    }));
    section.append(heading, grid); return section;
  }));
}

function openGarage() {
  renderGarage();
  openPanel(ui.garage, 'garage');
}

function renderEditor() {
  ui.editorGrid.replaceChildren(...editorDraft.flatMap((row, rowIndex) => row.map((tile, colIndex) => {
    const cell = document.createElement('button');
    cell.className = 'editor-cell'; cell.dataset.tile = tile; cell.title = `${rowIndex + 1}, ${colIndex + 1}: ${EDITOR_TILES[tile]}`;
    cell.addEventListener('pointerdown', (event) => { event.preventDefault(); editorDraft[rowIndex][colIndex] = editorTile; renderEditor(); });
    return cell;
  })));
}

function setupEditor() {
  $('#tile-palette').replaceChildren(...Object.entries(EDITOR_TILES).map(([tile, name]) => {
    const button = document.createElement('button'); button.textContent = name; button.dataset.tile = tile;
    button.classList.toggle('selected', tile === editorTile);
    button.addEventListener('click', () => {
      editorTile = tile;
      for (const candidate of document.querySelectorAll('#tile-palette button')) candidate.classList.toggle('selected', candidate.dataset.tile === tile);
    });
    return button;
  }));
  renderEditor();
}
setupEditor();

$('#solo').addEventListener('click', () => startLocal(1));
$('#local').addEventListener('click', () => startLocal(2));
$('#host').addEventListener('click', () => connect(true));
$('#join').addEventListener('click', () => connect(false));
$('#spectate').addEventListener('click', () => connect(false, false, true));
$('#campaign').addEventListener('click', openCampaignSelector);
$('#garage').addEventListener('click', openGarage);
$('#editor').addEventListener('click', () => openPanel(ui.editor, 'editor'));
$('#settings').addEventListener('click', () => openPanel(ui.settings, 'settings'));
ui.musicShortcut.addEventListener('click', () => openPanel(ui.settings, 'settings'));
$('#campaign-back').addEventListener('click', returnToMenu);
$('#garage-back').addEventListener('click', returnToMenu);
$('#editor-back').addEventListener('click', returnToMenu);
$('#settings-back').addEventListener('click', () => {
  preferences = {
    music: Number($('#setting-music').value), effects: Number($('#setting-effects').value), ui: Number($('#setting-ui').value),
    radio: $('#setting-radio').checked, shake: $('#setting-shake').checked, contrast: $('#setting-contrast').checked, aim: $('#setting-aim').checked,
    bindings: getBindings(),
  };
  localStorage.setItem('tancazo.settings', JSON.stringify(preferences));
  applyPreferences(); returnToMenu();
});
$('#editor-export').addEventListener('click', () => {
  try {
    customMap = draftToMap(editorDraft, $('#editor-name').value);
    ui.editorJson.value = JSON.stringify(customMap);
    ui.editorMessage.textContent = 'Mapa validado e exportado.';
  } catch (error) { ui.editorMessage.textContent = error.message; }
});
$('#editor-import').addEventListener('click', () => {
  try {
    const value = JSON.parse(ui.editorJson.value);
    editorDraft = mapToDraft(value); $('#editor-name').value = value.name || 'Campo importado';
    renderEditor(); ui.editorMessage.textContent = 'Mapa importado correctamente.';
  } catch (error) { ui.editorMessage.textContent = error.message; }
});
$('#editor-play').addEventListener('click', () => {
  try { customMap = draftToMap(editorDraft, $('#editor-name').value); startLocal(1, { map: customMap }); }
  catch (error) { ui.editorMessage.textContent = error.message; }
});
$('#room-code').addEventListener('input', (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
$('#back').addEventListener('click', () => campaignMissionId ? openCampaignSelector() : returnToMenu());
$('#result-campaign').addEventListener('click', openCampaignSelector);
$('#lobby-back').addEventListener('click', returnToMenu);
ui.lobbyReady.addEventListener('click', () => {
  const me = currentLobby?.clients.find((client) => client.clientId === clientId);
  socket?.send(JSON.stringify({ type: 'ready', ready: !me?.ready }));
});
ui.lobbyStart.addEventListener('click', () => socket?.send(JSON.stringify({ type: 'start' })));
function sendLobbySettings() {
  socket?.send(JSON.stringify({ type: 'settings', mapId: ui.lobbyMap.value, difficulty: ui.lobbyDifficulty.value }));
}
ui.lobbyMap.addEventListener('change', sendLobbySettings);
ui.lobbyDifficulty.addEventListener('change', sendLobbySettings);
$('#restart').addEventListener('click', () => {
  ui.result.classList.add('hidden'); shownResult = false;
  if (mode === 'online') socket?.send(JSON.stringify({ type: 'restart' }));
  else if (startNextCampaignMission()) return;
  else if (customMap && game.map.id === 'custom') startLocal(1, { map: customMap });
  else startLocal(mode === 'local2' ? 2 : 1);
});

const autostart = new URLSearchParams(location.search).get('autostart');
if (autostart === 'solo') startLocal(1);
if (autostart === 'local') startLocal(2);
if (autostart === 'host') connect(true);
if (autostart === 'campaign') openCampaignSelector();
if (autostart === 'garage') openGarage();
if (autostart === 'editor') openPanel(ui.editor, 'editor');
if (autostart === 'settings') openPanel(ui.settings, 'settings');
if (autostart === 'boss') startLocal(1, { missionId: 'cobalt-heart' });

function frame(now) {
  const dt = Math.min(.1, (now - last) / 1000);
  last = now;
  if (mode.startsWith('local')) {
    accumulator += dt;
    while (accumulator >= STEP) {
      advance(game, STEP, assistedInputs(localPlayers));
      accumulator -= STEP;
    }
  } else if (mode === 'online' && socket?.readyState === WebSocket.OPEN) {
    const inputs = currentOnlineInputs();
    view.setPredictedInputs(Object.fromEntries(inputs.map((input) => [input.id, input])));
    socket.send(JSON.stringify({ type: 'input', inputs }));
    if (now - lastPing > 2000) { lastPing = now; socket.send(JSON.stringify({ type: 'ping', sentAt: now })); }
  } else view.setPredictedInputs({});
  if (consume('Escape') && mode !== 'menu') {
    if (campaignMissionId && mode.startsWith('local')) openCampaignSelector();
    else returnToMenu();
  }
  view.render(game, dt);
  audio.update(game, mode);
  if (mode.startsWith('local') || mode === 'online') updateHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
