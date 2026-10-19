// Original Tancazo compositions. Rebuild with: node scripts/generate-music.mjs
// No samples or third-party recordings are used.
import { mkdir, writeFile } from 'node:fs/promises';
const rate = 22050;
const scores = [
  ['menu', 'Centro de mando', 96, 57, [0,3,7,10,7,3,5,7], [0,5,3,7], 'soft'],
  ['green-line', 'Amanecer esmeralda', 112, 52, [0,2,4,7,9,7,4,2], [0,5,7,3], 'bell'],
  ['red-forge', 'Pulso da forxa', 128, 50, [0,0,3,7,6,3,10,7], [0,3,5,7], 'pulse'],
  ['frozen-pass', 'Cristais do norte', 90, 62, [7,12,10,7,3,5,2,0], [0,8,5,7], 'bell'],
  ['silent-depot', 'Sinal na noite', 104, 54, [0,7,3,10,2,9,5,7], [0,5,10,7], 'soft'],
  ['iron-convoy', 'Columna de aceiro', 120, 48, [0,3,5,7,7,5,3,10], [0,5,3,7], 'pulse'],
  ['emerald-marsh', 'Ecos da néboa', 86, 51, [0,2,3,7,5,3,2,10], [0,8,3,5], 'soft'],
  ['broken-arsenal', 'Faíscas e sabotaxe', 136, 55, [0,7,6,3,0,10,7,3], [0,3,8,7], 'pulse'],
  ['ghost-rescue', 'Luces de rescate', 100, 59, [0,4,7,11,9,7,4,2], [0,5,9,7], 'bell'],
  ['last-bastion', 'A última muralla', 116, 46, [0,3,7,12,10,7,5,3], [0,8,5,7], 'pulse'],
  ['command-gate', 'Romper o cerco', 132, 53, [0,2,3,7,10,12,7,5], [0,5,8,7], 'bell'],
  ['cobalt-heart', 'Corazón cobalto', 124, 47, [0,3,6,7,12,10,7,6], [0,3,8,7], 'pulse'],
  ['boss', 'Leviatán', 144, 45, [0,1,7,6,0,3,10,7], [0,1,6,7], 'pulse'],
];
const destination = new URL('../src/client/music/', import.meta.url);
await mkdir(destination, { recursive: true });
const manifest = { tracks: {}, titles: {} };
for (let songIndex = 0; songIndex < scores.length; songIndex++) {
  const [id, title, bpm, root, motif, chords, timbre] = scores[songIndex];
  const beat = 60 / bpm, duration = beat * 32;
  const samples = new Float32Array(Math.ceil(duration * rate));
  let seed = 1234 + songIndex * 7919;
  const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 2147483648 - 1; };
  const add = (start, length, sound) => {
    const offset = Math.round(start * rate), count = Math.min(Math.round(length * rate), samples.length - offset);
    for (let i = 0; i < count; i++) samples[offset + i] += sound(i / rate, i / count);
  };
  const note = (start, length, midi, gain, type = 'soft') => {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    add(start, length, (t, p) => {
      const phase = 2 * Math.PI * frequency * t;
      const wave = type === 'pulse' ? Math.sin(phase) + .3 * Math.sin(phase * 3) + .12 * Math.sin(phase * 5) : type === 'bell' ? Math.sin(phase) + .35 * Math.sin(phase * 2) * Math.exp(-t * 6) : Math.sin(phase) + .18 * Math.sin(phase * 2);
      const envelope = Math.min(1, t / .012) * Math.min(1, (1 - p) * length / .07) * (type === 'pad' ? .8 : Math.exp(-p * 1.5));
      return wave * envelope * gain;
    });
  };
  for (let bar = 0; bar < 8; bar++) {
    const chord = root + chords[bar % 4];
    for (const interval of [0,3,7]) note(bar * 4 * beat, beat * 3.95, chord + interval, .035, 'pad');
    for (let pulse = 0; pulse < 8; pulse++) {
      const at = (bar * 4 + pulse / 2) * beat;
      note(at, beat * .38, chord - 12 + (pulse % 4 === 3 ? 7 : 0), .12, 'soft');
      const melody = motif[(pulse + (bar % 4) * 2) % motif.length];
      // A contrasting second phrase adds an octave answer and rhythmic rests.
      if ((pulse + bar + songIndex) % 7 !== 6) note(at, beat * (pulse === 7 ? .75 : .42), root + 12 + melody + (bar >= 4 && pulse % 3 === 0 ? 12 : 0), .085, timbre);
      add(at, .055, (t) => noise() * .025 * Math.exp(-t * 65));
    }
    for (let pulse = 0; pulse < 4; pulse++) {
      const at = (bar * 4 + pulse) * beat;
      if (pulse % 2 === 0 || (songIndex % 3 === 1 && pulse === 3)) add(at, .23, t => Math.sin(2 * Math.PI * (45 * t + 6 * (1 - Math.exp(-t * 22)))) * Math.exp(-t * 22) * .22);
      if (pulse % 2 === 1) add(at, .14, t => noise() * .075 * Math.exp(-t * 32));
    }
  }
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(rate,24); wav.writeUInt32LE(rate*2,28);
  wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(samples.length*2,40);
  for(let i=0;i<samples.length;i++) {
    const edge = Math.min(1, i / (rate * .008), (samples.length - 1 - i) / (rate * .025));
    wav.writeInt16LE(Math.round(Math.tanh(samples[i] * 1.6) * edge * 27000),44+i*2);
  }
  await writeFile(new URL(`${id}.wav`,destination),wav);
  manifest.tracks[id] = `/src/client/music/${id}.wav`;
  manifest.titles[id] = title;
}
for (const [map,mission] of Object.entries({citadel:'green-line',foundry:'red-forge',glacier:'frozen-pass',delta:'ghost-rescue',marsh:'emerald-marsh',arsenal:'broken-arsenal',fortress:'last-bastion'})) {
  manifest.tracks[map] = manifest.tracks[mission]; manifest.titles[map] = manifest.titles[mission];
}
await writeFile(new URL('tracks.json',destination),JSON.stringify(manifest,null,2)+'\n');
console.log(`Generated ${scores.length} original looping tracks.`);
