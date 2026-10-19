import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { DIFFICULTIES, STEP, addPlayer, advance, createGame, publicState, removePlayer } from '../src/shared/simulation.js';
import { MAPS } from '../src/shared/maps.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 8490);
const HOST = process.env.HOST || '127.0.0.1';
const rooms = new Map();
const types = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2'],
  ['.ogg', 'audio/ogg'], ['.mp3', 'audio/mpeg'], ['.wav', 'audio/wav'],
]);

function staticPath(urlPath) {
  if (urlPath.startsWith('/vendor/three/')) return join(ROOT, 'node_modules/three', urlPath.slice('/vendor/three/'.length));
  if (urlPath === '/') return join(ROOT, 'index.html');
  const allowed = ['/styles/', '/src/client/', '/src/shared/', '/assets/'];
  if (!allowed.some((prefix) => urlPath.startsWith(prefix))) return null;
  const requested = urlPath.slice(1);
  const safe = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  return join(ROOT, safe);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  if (url.pathname === '/metrics') {
    const activeRooms = [...rooms.values()];
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({
      rooms: activeRooms.length,
      playing: activeRooms.filter((room) => room.phase === 'playing').length,
      connections: activeRooms.reduce((total, room) => total + room.clients.size, 0),
      players: activeRooms.reduce((total, room) => total + room.state.tanks.filter((tank) => tank.kind === 'player').length, 0),
    }));
    return;
  }
  const path = staticPath(url.pathname);
  if (!path || !path.startsWith(ROOT) || !existsSync(path) || !statSync(path).isFile()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, {
    'content-type': types.get(extname(path)) || 'application/octet-stream',
    'cache-control': process.env.NODE_ENV === 'production' ? 'public, max-age=3600' : 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'self'; connect-src 'self' ws: wss:; style-src 'self'; img-src 'self' data:; script-src 'self'",
    'referrer-policy': 'no-referrer',
  });
  createReadStream(path).pipe(res);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: { threshold: 1024 } });

function code() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';
  do {
    value = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  } while (rooms.has(value));
  return value;
}

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function broadcast(room, message) {
  const encoded = JSON.stringify(message);
  for (const client of room.clients.keys()) if (client.readyState === WebSocket.OPEN) client.send(encoded);
}

function lobbyState(room) {
  return {
    type: 'lobby',
    room: room.code,
    phase: room.phase,
    settings: room.settings,
    clients: [...room.clients.values()].map((client) => ({
      clientId: client.clientId,
      name: client.name,
      seats: client.playerIds.length,
      ready: client.ready,
      host: client.clientId === room.hostId,
    })),
  };
}

function broadcastLobby(room) {
  broadcast(room, lobbyState(room));
}

function beginRoom(room) {
  room.phase = 'playing';
  room.state = createGame({ players: 0, mapId: room.settings.mapId, difficulty: room.settings.difficulty });
  room.inputs = {};
  for (const client of room.clients.values()) for (let index = 0; index < client.playerIds.length; index++) {
    const playerId = client.playerIds[index];
    addPlayer(room.state, playerId, index ? `${client.name} 2` : client.name);
    room.inputs[playerId] = {};
  }
  broadcast(room, { type: 'started' });
  broadcast(room, { type: 'snapshot', state: publicState(room.state) });
}

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname !== '/online') { socket.destroy(); return; }
  if (req.headers.origin) {
    try { if (new URL(req.headers.origin).host !== req.headers.host) { socket.destroy(); return; } }
    catch { socket.destroy(); return; }
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const wantsCreate = url.searchParams.get('create') === '1';
    const requestedCode = (url.searchParams.get('room') || '').toUpperCase();
    const roomCode = wantsCreate ? code() : requestedCode;
    let room = rooms.get(roomCode);
    if (wantsCreate) {
      const requestedMap = url.searchParams.get('map');
      const requestedDifficulty = url.searchParams.get('difficulty');
      const settings = {
        mapId: MAPS[requestedMap] ? requestedMap : 'citadel',
        difficulty: DIFFICULTIES[requestedDifficulty] ? requestedDifficulty : 'normal',
      };
      room = { code: roomCode, state: createGame({ players: 0, ...settings }), clients: new Map(), inputs: {}, idle: 0, phase: 'lobby', settings, hostId: null, startsAt: 0 };
      rooms.set(roomCode, room);
    }
    if (!room) { send(ws, { type: 'error', message: 'Sala inexistente' }); ws.close(); return; }
    const reconnecting = url.searchParams.get('reconnect') === '1';
    const spectating = url.searchParams.get('spectate') === '1';
    if (room.phase !== 'lobby' && !(reconnecting && room.phase === 'playing') && !(spectating && room.phase === 'playing')) { send(ws, { type: 'error', message: 'A operación xa comezou' }); ws.close(); return; }
    if (spectating && room.phase !== 'playing') { send(ws, { type: 'error', message: 'A partida aínda non comezou' }); ws.close(); return; }
    const seats = spectating ? 0 : Math.max(1, Math.min(2, Number(url.searchParams.get('seats')) || 1));
    const occupied = room.state.tanks.filter((tank) => tank.kind === 'player').length;
    if (occupied + seats > 4) { send(ws, { type: 'error', message: `Só quedan ${Math.max(0, 4 - occupied)} prazas` }); ws.close(); return; }
    const name = (url.searchParams.get('name') || 'Jugador').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 18) || 'Jugador';
    const playerIds = [];
    for (let seat = 0; seat < seats; seat++) {
      const playerId = `p-${Math.random().toString(36).slice(2, 8)}`;
      playerIds.push(playerId);
      addPlayer(room.state, playerId, seat ? `${name} 2` : name);
      room.inputs[playerId] = {};
    }
    const clientId = `c-${Math.random().toString(36).slice(2, 8)}`;
    const client = { clientId, name, playerIds, ready: spectating, spectator: spectating };
    room.clients.set(ws, client);
    if (!room.hostId) room.hostId = clientId;
    ws.room = room;
    ws.playerIds = playerIds;
    ws.rate = { at: Date.now(), count: 0 };
    send(ws, { type: 'welcome', room: roomCode, playerIds, clientId, phase: room.phase, spectator: spectating });
    if (room.phase === 'playing') {
      send(ws, { type: 'started', reconnected: true });
      send(ws, { type: 'snapshot', state: publicState(room.state) });
    } else broadcastLobby(room);
    ws.on('message', (raw, binary) => {
      if (binary) return;
      const now = Date.now();
      if (now - ws.rate.at >= 1000) { ws.rate.at = now; ws.rate.count = 0; }
      if (++ws.rate.count > 120) { ws.close(4008, 'Too many messages'); return; }
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === 'input' && Array.isArray(message.inputs)) {
          for (const input of message.inputs) {
            if (!playerIds.includes(input.id)) continue;
            room.inputs[input.id] = {
              x: Math.max(-1, Math.min(1, Number(input.x) || 0)),
              z: Math.max(-1, Math.min(1, Number(input.z) || 0)),
              aimX: Math.max(-1, Math.min(1, Number(input.aimX) || 0)),
              aimZ: Math.max(-1, Math.min(1, Number(input.aimZ) || 0)),
              fire: !!input.fire,
              switch: !!input.switch,
              use: !!input.use,
            };
          }
        }
        if (message.type === 'ping') send(ws, { type: 'pong', sentAt: Number(message.sentAt) || 0, serverAt: Date.now() });
        if (message.type === 'ready' && room.phase === 'lobby') {
          client.ready = !!message.ready;
          broadcastLobby(room);
        }
        if (message.type === 'settings' && room.phase === 'lobby' && room.hostId === clientId) {
          if (MAPS[message.mapId]) room.settings.mapId = message.mapId;
          if (DIFFICULTIES[message.difficulty]) room.settings.difficulty = message.difficulty;
          for (const member of room.clients.values()) member.ready = false;
          broadcastLobby(room);
        }
        if (message.type === 'start' && room.phase === 'lobby' && room.hostId === clientId) {
          if (![...room.clients.values()].every((member) => member.ready)) {
            send(ws, { type: 'error', message: 'Todos deben estar preparados' });
          } else {
            room.phase = 'countdown';
            room.startsAt = Date.now() + 3000;
            broadcast(room, { type: 'countdown', seconds: 3 });
            broadcastLobby(room);
          }
        }
        if (message.type === 'restart' && room.state.status !== 'playing' && room.hostId === clientId) {
          beginRoom(room);
        }
      } catch {}
    });
    ws.on('close', () => {
      room.clients.delete(ws);
      for (const playerId of playerIds) {
        delete room.inputs[playerId];
        removePlayer(room.state, playerId);
      }
      if (room.hostId === clientId) room.hostId = room.clients.values().next().value?.clientId || null;
      if (room.phase === 'countdown') {
        room.phase = 'lobby';
        room.startsAt = 0;
        for (const member of room.clients.values()) member.ready = false;
      }
      if (room.phase === 'lobby') broadcastLobby(room);
      room.idle = Date.now();
    });
  });
});

let last = performance.now();
let accumulator = 0;
let broadcastClock = 0;
setInterval(() => {
  const now = performance.now();
  accumulator += Math.min(0.1, (now - last) / 1000);
  last = now;
  while (accumulator >= STEP) {
    for (const room of rooms.values()) if (room.phase === 'playing' && room.clients.size) advance(room.state, STEP, room.inputs);
    accumulator -= STEP;
    broadcastClock += STEP;
  }
  if (broadcastClock >= 1 / 20) {
    for (const room of rooms.values()) {
      if (room.phase === 'countdown' && Date.now() >= room.startsAt) beginRoom(room);
      if (room.phase === 'playing') broadcast(room, { type: 'snapshot', state: publicState(room.state) });
    }
    broadcastClock = 0;
  }
  const expiry = Date.now() - 60_000;
  for (const [roomCode, room] of rooms) if (!room.clients.size && room.idle < expiry) rooms.delete(roomCode);
}, 1000 / 60).unref();

server.listen(PORT, HOST, () => console.log(`Tancazo listo en http://${HOST}:${PORT}`));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
