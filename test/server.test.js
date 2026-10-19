import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';

test('lobby configures and starts a four-seat online operation', { timeout: 15_000 }, async () => {
  const port = 21000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: 'ignore',
  });
  const sockets = [];
  try {
    let health;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { health = await fetch(`http://127.0.0.1:${port}/health`).then((response) => response.json()); break; } catch { await delay(50); }
    }
    assert.equal(health?.ok, true);
    assert.equal((await fetch(`http://127.0.0.1:${port}/server/index.js`)).status, 404);
    const musicManifest = await fetch(`http://127.0.0.1:${port}/src/client/music/tracks.json`);
    assert.equal(musicManifest.status, 200);
    assert.deepEqual(await musicManifest.json(), { tracks: {} });

    const host = new WebSocket(`ws://127.0.0.1:${port}/online?create=1&name=Alpha&seats=2`);
    sockets.push(host);
    const welcome = await nextMessage(host, (message) => message.type === 'welcome');
    assert.match(welcome.room, /^[A-Z2-9]{5}$/);
    assert.equal(welcome.playerIds.length, 2);

    const guest = new WebSocket(`ws://127.0.0.1:${port}/online?room=${welcome.room}&name=Bravo&seats=2`);
    sockets.push(guest);
    const joined = await nextMessage(guest, (message) => message.type === 'welcome');
    assert.equal(joined.room, welcome.room);
    assert.equal(joined.playerIds.length, 2);

    const configured = nextMessage(guest, (message) => message.type === 'lobby' && message.settings.mapId === 'foundry' && message.settings.difficulty === 'hard');
    host.send(JSON.stringify({ type: 'settings', mapId: 'foundry', difficulty: 'hard' }));
    await configured;

    const allReady = nextMessage(guest, (message) => message.type === 'lobby' && message.clients.length === 2 && message.clients.every((client) => client.ready));
    host.send(JSON.stringify({ type: 'ready', ready: true }));
    guest.send(JSON.stringify({ type: 'ready', ready: true }));
    await allReady;

    const countdown = nextMessage(guest, (message) => message.type === 'countdown');
    const started = nextMessage(guest, (message) => message.type === 'started');
    const snapshotPromise = nextMessage(guest, (message) => message.type === 'snapshot');
    host.send(JSON.stringify({ type: 'start' }));
    assert.equal((await countdown).seconds, 3);
    await started;
    const snapshot = await snapshotPromise;
    assert.equal(snapshot.state.tanks.filter((tank) => tank.kind === 'player').length, 4);
    assert.equal(snapshot.state.map.id, 'foundry');
    assert.equal(snapshot.state.difficulty, 'hard');

    guest.close();
    await delay(100);
    const rejoined = new WebSocket(`ws://127.0.0.1:${port}/online?room=${welcome.room}&name=Bravo&seats=2&reconnect=1`);
    sockets.push(rejoined);
    const rewelcome = await nextMessage(rejoined, (message) => message.type === 'welcome');
    assert.equal(rewelcome.phase, 'playing');
    const resumed = await nextMessage(rejoined, (message) => message.type === 'snapshot');
    assert.equal(resumed.state.tanks.filter((tank) => tank.kind === 'player').length, 4);

    const spectator = new WebSocket(`ws://127.0.0.1:${port}/online?room=${welcome.room}&name=Observer&spectate=1`);
    sockets.push(spectator);
    const spectatorWelcome = await nextMessage(spectator, (message) => message.type === 'welcome');
    assert.equal(spectatorWelcome.spectator, true);
    assert.deepEqual(spectatorWelcome.playerIds, []);
    const observed = await nextMessage(spectator, (message) => message.type === 'snapshot');
    assert.equal(observed.state.tanks.filter((tank) => tank.kind === 'player').length, 4);
  } finally {
    for (const socket of sockets) socket.close();
    child.kill();
  }
});

function nextMessage(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket timeout')), 5000);
    socket.on('message', function onMessage(data) {
      const message = JSON.parse(data.toString());
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message);
    });
    socket.once('error', reject);
  });
}
