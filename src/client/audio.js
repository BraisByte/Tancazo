export class GameAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.knownBullets = new Set();
    this.knownEffects = new Set();
    this.volume = .7;
    this.nextBeat = 0;
    this.beat = 0;
    const unlock = () => this.unlock();
    addEventListener('pointerdown', unlock, { once: true });
    addEventListener('keydown', unlock, { once: true });
  }

  unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume * .3;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') this.context.resume();
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value)));
    if (this.master) this.master.gain.value = this.volume * .3;
  }

  tone(frequency, duration, type = 'square', volume = .18, slide = .55) {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, frequency * slide), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  noise(duration = .18, volume = .28) {
    if (!this.context || this.context.state !== 'running') return;
    const frames = Math.ceil(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frames; index++) data[index] = (Math.random() * 2 - 1) * (1 - index / frames);
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = 'lowpass'; filter.frequency.value = 1200;
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }

  update(state) {
    const current = new Set(state.bullets.map((bullet) => bullet.id));
    for (const bullet of state.bullets) if (!this.knownBullets.has(bullet.id)) {
      this.tone(bullet.team === 'players' ? 240 : 170, .085, 'square', .12, .48);
    }
    this.knownBullets = current;
    for (const effect of state.effects || []) {
      const key = `${effect.tick}:${effect.type}:${effect.x}:${effect.z}`;
      if (this.knownEffects.has(key)) continue;
      this.knownEffects.add(key);
      if (effect.type === 'boom' || effect.type === 'base') { this.noise(.32, .4); this.tone(95, .3, 'sawtooth', .22, .4); }
      else if (effect.type === 'brick') this.noise(.1, .12);
      else this.tone(520, .055, 'triangle', .08, .7);
    }
    if (this.knownEffects.size > 300) this.knownEffects.clear();
    if (this.context?.state === 'running' && state.status === 'playing' && this.context.currentTime >= this.nextBeat) {
      const pressure = state.tanks.filter((tank) => tank.team === 'enemies' && tank.alive).length + (state.bossSpawned ? 4 : 0);
      const interval = Math.max(.18, .42 - pressure * .018);
      const roots = { citadel: 82.41, foundry: 73.42, delta: 92.5, custom: 87.31 };
      const root = roots[state.map.id] || roots.custom;
      const pattern = [1, 1.5, 1.25, 2, 1, 1.25, 1.5, 2.5];
      this.tone(root * pattern[this.beat % pattern.length], interval * .72, this.beat % 4 ? 'triangle' : 'sawtooth', .035, .82);
      if (this.beat % 4 === 0) this.tone(root / 2, interval * .9, 'sine', .055, .7);
      this.beat++;
      this.nextBeat = this.context.currentTime + interval;
    }
  }
}
