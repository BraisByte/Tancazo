import { STEP, advance, createGame } from '../shared/simulation.js';
import { CAMPAIGN, UPGRADES } from '../shared/campaign.js';
import { readLocalInputs, consume, getBindings, setBindings } from './input.js';
import { GameRenderer } from './render.js';
import { GameAudio } from './audio.js';
import { buyUpgrade, completeMission, loadProgress } from './progression.js';
import { EDITOR_TILES, defaultDraft, draftToMap, mapToDraft } from './editor.js';

const $ = (selector) => document.querySelector(selector);
const ui = {
  menu: $('#menu'), hud: $('#hud'), result: $('#result'), message: $('#menu-message'),
  score: $('#score'), enemies: $('#enemies'), status: $('#status'), mode: $('#mode'),
  room: $('#room'), roomWrap: $('#room-wrap'), connection: $('#connection'),
  resultTitle: $('#result-title'), resultCopy: $('#result-copy'), name: $('#player-name'), code: $('#room-code'),
  difficulty: $('#difficulty'), lobby: $('#online-lobby'), lobbyRoom: $('#lobby-room'),
  roster: $('#lobby-roster'), lobbyHint: $('#lobby-hint'), lobbyReady: $('#lobby-ready'), lobbyStart: $('#lobby-start'),
  lobbyMap: $('#lobby-map'), lobbyDifficulty: $('#lobby-difficulty'),
  campaign: $('#campaign-panel'), campaignMissions: $('#campaign-missions'), medals: $('#medals'), upgrades: $('#upgrade-list'),
  editor: $('#editor-panel'), editorGrid: $('#editor-grid'), editorJson: $('#editor-json'), editorMessage: $('#editor-message'),
  settings: $('#settings-panel'), playerStatus: $('#player-status'), touch: $('#touch-controls'),
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
let customMap = null;
let editorDraft = defaultDraft();
let editorTile = 'B';
let progress = loadProgress();
let preferences;
try { preferences = { volume: 70, ui: 100, shake: true, contrast: false, aim: false, bindings: getBindings(), ...JSON.parse(localStorage.getItem('tancazo.settings') || '{}') }; }
catch { preferences = { volume: 70, ui: 100, shake: true, contrast: false, aim: false, bindings: getBindings() }; }

function applyPreferences() {
  audio.setVolume(preferences.volume / 100);
  view.setShakeEnabled(preferences.shake);
  document.documentElement.style.fontSize = `${preferences.ui}%`;
  document.body.classList.toggle('high-contrast', preferences.contrast);
  $('#setting-volume').value = preferences.volume;
  $('#setting-ui').value = preferences.ui;
  $('#setting-shake').checked = preferences.shake;
  $('#setting-contrast').checked = preferences.contrast;
  $('#setting-aim').checked = preferences.aim;
  setBindings(preferences.bindings || getBindings());
  renderBindings();
}

function renderBindings() {
  const names = { up: 'Arriba', down: 'Abaixo', left: 'Esquerda', right: 'Dereita', fire: 'Disparo', switch: 'Arma' };
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

function hidePanels() {
  for (const panel of [ui.menu, ui.lobby, ui.result, ui.campaign, ui.editor, ui.settings]) panel.classList.add('hidden');
}

function setPlaying(nextMode) {
  mode = nextMode;
  shownResult = false;
  campaignStars = 0;
  hidePanels();
  ui.hud.classList.remove('hidden');
  ui.playerStatus.classList.remove('hidden');
  document.body.classList.add('playing');
  ui.roomWrap.classList.toggle('hidden', nextMode !== 'online');
  ui.mode.textContent = nextMode === 'online' ? (isSpectator ? 'ESPECTADOR ONLINE' : 'ONLINE') : nextMode === 'local2' ? 'COOPERATIVO LOCAL' : 'ARCADE LOCAL';
}

function startLocal(players, options = {}) {
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

function updateHud() {
  ui.score.textContent = String(game.score || 0).padStart(6, '0');
  const alive = game.tanks.filter((tank) => tank.team === 'enemies' && tank.alive).length;
  ui.enemies.textContent = game.objective === 'survive'
    ? `${Math.max(0, Math.ceil(game.duration - game.elapsed))}s`
    : String((game.enemiesToSpawn || 0) + alive).padStart(2, '0');
  ui.difficulty.textContent = ({ easy: 'PATRULLA', normal: 'ASEDIO', hard: 'TORMENTA' })[game.difficulty] || 'ASEDIO';
  const objectiveText = game.objective === 'survive' ? 'RESISTE ATA A EVACUACIÓN' : game.objective === 'escort' ? 'ESCOLTA O TRANSPORTE' : game.bossSpawned ? 'DESTRÚE O LEVIATÁN' : 'DEFENDE O NÚCLEO';
  ui.status.textContent = game.status === 'playing' ? objectiveText : game.status === 'victory' ? 'SECTOR ASEGURADO' : 'NÚCLEO DESTRUÍDO';
  ui.playerStatus.replaceChildren(...game.tanks.filter((tank) => tank.kind === 'player' || tank.kind === 'convoy').map((tank) => {
    const chip = document.createElement('div'); chip.className = 'player-chip';
    const name = document.createElement('b'); name.textContent = tank.name;
    const status = document.createElement('span');
    const health = document.createElement('i'); health.className = 'health-pips';
    health.textContent = `${'◆'.repeat(Math.max(0, tank.hp))}${'◇'.repeat(Math.max(0, tank.maxHp - tank.hp))}`;
    status.append(health, document.createTextNode(` · ${tank.weapon || 'cannon'}${tank.shield ? ` · escudo ${tank.shield}` : ''}`));
    chip.append(name, status); return chip;
  }));
  if (game.status !== 'playing' && !shownResult) {
    shownResult = true;
    if (campaignMissionId) campaignStars = completeMission(progress, campaignMissionId, game);
    setTimeout(() => {
      ui.resultTitle.textContent = game.status === 'victory' ? 'VICTORIA' : 'DERROTA';
      ui.resultCopy.textContent = `Puntuación: ${String(game.score || 0).padStart(6, '0')}${campaignMissionId && game.status === 'victory' ? ` · ${'★'.repeat(campaignStars)}${'☆'.repeat(3 - campaignStars)}` : ''}`;
      const me = currentLobby?.clients.find((client) => client.clientId === clientId);
      $('#restart').disabled = mode === 'online' && !me?.host;
      const missionIndex = CAMPAIGN.findIndex((mission) => mission.id === campaignMissionId);
      $('#restart').textContent = mode === 'online' && !me?.host ? 'Agardando o anfitrión' : campaignMissionId && game.status === 'victory' && missionIndex < CAMPAIGN.length - 1 ? 'Seguinte misión' : 'Xogar de novo';
      ui.result.classList.remove('hidden');
    }, 500);
  }
}

function returnToMenu() {
  clearTimeout(reconnectTimer); reconnectTimer = null;
  socket?.close(); socket = null; onlinePlayers = []; clientId = null; currentLobby = null; isSpectator = false;
  currentRoomCode = '';
  mode = 'menu'; campaignMissionId = null; game = createGame({ players: 0, seed: 1985 });
  hidePanels();
  ui.hud.classList.add('hidden'); ui.playerStatus.classList.add('hidden'); ui.connection.classList.add('hidden'); ui.menu.classList.remove('hidden');
  document.body.classList.remove('playing');
}

function openPanel(panel, nextMode) {
  hidePanels();
  ui.hud.classList.add('hidden'); ui.playerStatus.classList.add('hidden');
  document.body.classList.remove('playing');
  panel.classList.remove('hidden'); mode = nextMode;
}

function renderCampaign() {
  ui.medals.textContent = progress.medals;
  ui.campaignMissions.replaceChildren(...CAMPAIGN.map((mission, index) => {
    const card = document.createElement('article');
    const locked = index >= progress.unlocked;
    card.className = `mission-card${locked ? ' locked' : ''}`;
    const title = document.createElement('h3'); title.textContent = `${index + 1}. ${mission.title}`;
    const briefing = document.createElement('p'); briefing.textContent = mission.briefing;
    const stars = document.createElement('div'); stars.className = 'stars';
    const earned = progress.stars[mission.id] || 0; stars.textContent = `${'★'.repeat(earned)}${'☆'.repeat(3 - earned)}`;
    const play = document.createElement('button'); play.textContent = locked ? 'Bloqueada' : 'Despregar'; play.disabled = locked;
    play.addEventListener('click', () => startLocal(1, { missionId: mission.id }));
    card.append(title, briefing, stars, play); return card;
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
$('#campaign').addEventListener('click', () => { renderCampaign(); openPanel(ui.campaign, 'campaign'); });
$('#editor').addEventListener('click', () => openPanel(ui.editor, 'editor'));
$('#settings').addEventListener('click', () => openPanel(ui.settings, 'settings'));
$('#campaign-back').addEventListener('click', returnToMenu);
$('#editor-back').addEventListener('click', returnToMenu);
$('#settings-back').addEventListener('click', () => {
  preferences = {
    volume: Number($('#setting-volume').value), ui: Number($('#setting-ui').value),
    shake: $('#setting-shake').checked, contrast: $('#setting-contrast').checked, aim: $('#setting-aim').checked,
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
$('#back').addEventListener('click', returnToMenu);
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
  else if (campaignMissionId && game.status === 'victory') {
    const index = CAMPAIGN.findIndex((mission) => mission.id === campaignMissionId);
    startLocal(1, { missionId: CAMPAIGN[Math.min(index + 1, CAMPAIGN.length - 1)].id });
  } else if (customMap && game.map.id === 'custom') startLocal(1, { map: customMap });
  else startLocal(mode === 'local2' ? 2 : 1);
});

const autostart = new URLSearchParams(location.search).get('autostart');
if (autostart === 'solo') startLocal(1);
if (autostart === 'local') startLocal(2);
if (autostart === 'host') connect(true);
if (autostart === 'campaign') { renderCampaign(); openPanel(ui.campaign, 'campaign'); }
if (autostart === 'editor') openPanel(ui.editor, 'editor');
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
  if (consume('Escape') && mode !== 'menu') returnToMenu();
  view.render(game, dt);
  audio.update(game);
  if (mode.startsWith('local') || mode === 'online') updateHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
