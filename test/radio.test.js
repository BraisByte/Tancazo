import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { radioCatalog } from '../src/client/radio.js';
import { GameAudio } from '../src/client/audio.js';

const settle = () => new Promise((resolve) => setImmediate(resolve));
function environment(deferred = false, failed = false) {
  const originals = { fetch: globalThis.fetch, addEventListener: globalThis.addEventListener, AudioContext: globalThis.AudioContext, speechSynthesis: globalThis.speechSynthesis };
  const sources = [];
  let release;
  globalThis.addEventListener = () => {};
  globalThis.fetch = async (url) => {
    if (url.endsWith('clips.json')) return { ok: true, json: async () => ({ clips: { 'Unidade danada.': '/voice.wav' } }) };
    if (url.endsWith('tracks.json')) return { ok: true, json: async () => ({ tracks: {} }) };
    if (failed) return { ok: false };
    if (deferred) await new Promise((resolve) => { release = resolve; });
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  };
  globalThis.AudioContext = class {
    state = 'running'; currentTime = 0; destination = {};
    createGain() { return { gain: { value: 1, setTargetAtTime() {} }, connect() { return this; }, disconnect() {} }; }
    createBufferSource() {
      const source = { connect() { return this; }, disconnect() {}, start() { this.started = true; }, stop() { this.onended?.(); } };
      sources.push(source); return source;
    }
    async decodeAudioData() { return { duration: 2 }; }
  };
  return { sources, release: () => release(), restore: () => Object.assign(globalThis, originals) };
}

test('the bundled neural radio plays without installed speech voices and restores music', async () => {
  const env = environment();
  try {
    const audio = new GameAudio();
    audio.radio('Unidade danada.');
    await settle();
    assert.equal(env.sources.length, 1);
    assert.equal(env.sources[0].started, true);
    assert.equal(audio.radioPlaying, true);
    assert.equal(audio.ducked, true);
    env.sources[0].onended();
    assert.equal(audio.ducked, false);
    assert.equal(audio.radioPlaying, false);
  } finally { env.restore(); }
});

test('leaving a match cancels radio even when its audio is still loading', async () => {
  const env = environment(true);
  try {
    const audio = new GameAudio();
    audio.radio('Unidade danada.');
    await settle();
    audio.stopRadio();
    env.release();
    await settle();
    assert.equal(env.sources.length, 0);
    assert.equal(audio.radioPlaying, false);
    assert.equal(audio.ducked, false);
  } finally { env.restore(); }
});

test('every radio phrase has a bundled, nonempty Galician recording', () => {
  const manifest = JSON.parse(readFileSync(new URL('../src/client/radio/clips.json', import.meta.url)));
  assert.equal(manifest.language, 'gl-ES');
  for (const text of Object.values(radioCatalog())) {
    const path = manifest.clips[text];
    assert.ok(path, `Missing recording: ${text}`);
    const wav = readFileSync(new URL(`..${path}`, import.meta.url));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.ok(wav.length > 5000);
  }
});

test('a missing Celtia clip never falls back to another speaker', async () => {
  const env = environment(false, true);
  let otherVoice = false;
  globalThis.speechSynthesis = { speak() { otherVoice = true; } };
  try {
    const audio = new GameAudio();
    audio.radio('Unidade danada.');
    await settle();
    assert.equal(otherVoice, false);
    assert.equal(audio.radioPlaying, false);
    assert.equal(env.sources.length, 0);
  } finally { env.restore(); }
});

test('all radio clips use a consistent speech volume without clipping', () => {
  const manifest = JSON.parse(readFileSync(new URL('../src/client/radio/clips.json', import.meta.url)));
  const levels = [];
  for (const path of Object.values(manifest.clips)) {
    const wav = readFileSync(new URL(`..${path}`, import.meta.url));
    const samples = Array.from({ length: (wav.length - 44) / 2 }, (_, i) => wav.readInt16LE(44 + i * 2));
    const frame = Math.floor(wav.readUInt32LE(24) / 50);
    const chunks = [];
    for (let start = 0; start < samples.length; start += frame) {
      const values = samples.slice(start, start + frame);
      const energy = values.reduce((sum, value) => sum + value * value, 0);
      chunks.push({ energy, count: values.length, rms: Math.sqrt(energy / values.length) });
    }
    const threshold = Math.max(150, Math.max(...chunks.map((chunk) => chunk.rms)) * .08);
    const active = chunks.filter((chunk) => chunk.rms > threshold);
    const level = Math.sqrt(active.reduce((sum, chunk) => sum + chunk.energy, 0) / active.reduce((sum, chunk) => sum + chunk.count, 0));
    levels.push(level);
    assert.ok(Math.max(...samples.map(Math.abs)) <= 32767 * .85, path);
  }
  assert.ok(20 * Math.log10(Math.max(...levels) / Math.min(...levels)) < .3);
  assert.ok(levels.every((level) => Math.abs(level - 3000) < 30));
});
