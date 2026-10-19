export class GameAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.musicBus = null;
    this.effectsBus = null;
    this.knownBullets = new Set();
    this.knownEffects = new Set();
    this.musicVolume = .7;
    this.effectsVolume = .7;
    this.radioEnabled = true;
    this.nextBeat = 0;
    this.beat = 0;
    this.trackManifest = {};
    this.trackTitles = {};
    this.radioPlaying = false;
    this.radioRequest = 0;
    this.radioBuffers = new Map();
    this.radioManifest = {};
    this.radioReady = fetch('/src/client/radio/clips.json').then((response) => response.ok ? response.json() : {}).then((manifest) => { this.radioManifest = manifest.clips || {}; }).catch(() => {});
    this.lastRadio = '';
    this.lastRadioAt = -Infinity;
    this.ducked = false;
    this.trackBuffers = new Map();
    this.trackSource = null;
    this.trackGain = null;
    this.trackKey = '';
    this.requestedTrack = '';
    this.trackRequest = 0;
    fetch('/src/client/music/tracks.json').then((response) => response.ok ? response.json() : {}).then((manifest) => {
      this.trackManifest = manifest.tracks || {};
      this.trackTitles = manifest.titles || {};
      this.requestedTrack = '';
    }).catch(() => {});
    const unlock = () => this.unlock();
    addEventListener('pointerdown', unlock, { once: true });
    addEventListener('keydown', unlock, { once: true });
  }

  unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.musicBus = this.context.createGain();
      this.effectsBus = this.context.createGain();
      this.master.gain.value = .38;
      this.musicBus.gain.value = Math.min(1.4, this.musicVolume * 1.35);
      this.effectsBus.gain.value = this.effectsVolume;
      this.musicBus.connect(this.master);
      this.effectsBus.connect(this.master);
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') return this.context.resume().then(() => {
      this.nextBeat = this.context.currentTime;
    });
    this.nextBeat = Math.min(this.nextBeat, this.context.currentTime);
    return Promise.resolve();
  }

  setVolumes(music, effects) {
    this.musicVolume = Math.max(0, Math.min(1, Number(music)));
    this.effectsVolume = Math.max(0, Math.min(1, Number(effects)));
    if (this.musicBus) this.musicBus.gain.value = Math.min(1.4, this.musicVolume * 1.35) * (this.ducked ? .25 : 1);
    if (this.effectsBus) this.effectsBus.gain.value = this.effectsVolume;
    if (this.radioGain) this.radioGain.gain.value = this.effectsVolume * 2.2;
  }

  setRadioEnabled(enabled) { this.radioEnabled = !!enabled; if (!enabled) this.stopRadio(); }

  stopRadio() {
    this.radioRequest++;
    this.radioSource?.stop();
    this.radioSource = null;
    this.radioGain = null;
    this.radioPlaying = false;
    this.duckMusic(false);
  }

  duckMusic(enabled) {
    this.ducked = enabled;
    if (this.musicBus && this.context) this.musicBus.gain.setTargetAtTime(Math.min(1.4, this.musicVolume * 1.35) * (enabled ? .25 : 1), this.context.currentTime, .12);
  }

  radio(message) {
    if (!this.radioEnabled || !message || this.radioPlaying) return;
    if (message === this.lastRadio && performance.now() - this.lastRadioAt < 6000) return;
    const request = ++this.radioRequest;
    this.lastRadio = message; this.lastRadioAt = performance.now();
    this.radioPlaying = true;
    this.playRadioClip(message, request).then((played) => {
      if (!played && request === this.radioRequest) this.radioPlaying = false;
    }).catch(() => {
      if (request === this.radioRequest) this.radioPlaying = false;
    });
  }

  async playRadioClip(message, request) {
    await this.unlock();
    await this.radioReady;
    const url = this.radioManifest[message];
    if (!url) return false;
    let buffer = this.radioBuffers.get(url);
    if (!buffer) {
      const response = await fetch(url);
      if (!response.ok) return false;
      buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      this.radioBuffers.set(url, buffer);
      if (this.radioBuffers.size > 8) this.radioBuffers.delete(this.radioBuffers.keys().next().value);
    }
    if (request !== this.radioRequest || !this.radioEnabled) return true;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = this.effectsVolume * 2.2;
    source.connect(gain).connect(this.master);
    this.radioSource = source; this.radioGain = gain;
    source.onended = () => {
      source.disconnect(); gain.disconnect();
      if (request !== this.radioRequest) return;
      this.radioSource = null; this.radioGain = null;
      this.radioPlaying = false; this.duckMusic(false);
    };
    this.duckMusic(true);
    source.start();
    return true;
  }

  async previewMusic() {
    await this.unlock();
    if (!this.context || this.context.state !== 'running') return;
    await this.selectTrack('menu');
  }

  tone(frequency, duration, type = 'square', volume = .18, slide = .55, destination = this.effectsBus) {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, frequency * slide), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    oscillator.connect(gain).connect(destination || this.master);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  noise(duration = .18, volume = .28, destination = this.effectsBus) {
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
    source.connect(filter).connect(gain).connect(destination || this.master);
    source.start();
  }

  async selectTrack(key) {
    if (!this.context || this.requestedTrack === key) return;
    this.requestedTrack = key;
    const request = ++this.trackRequest;
    const url = this.trackManifest[key];
    if (!url) { this.fadeTrack(); return; }
    try {
      let buffer = this.trackBuffers.get(url);
      if (!buffer) {
        const response = await fetch(url);
        if (!response.ok) throw new Error('track unavailable');
        buffer = await this.context.decodeAudioData(await response.arrayBuffer());
        this.trackBuffers.set(url, buffer);
        // Keep decoded audio bounded on phones during long campaigns.
        if (this.trackBuffers.size > 3) this.trackBuffers.delete(this.trackBuffers.keys().next().value);
      }
      if (request !== this.trackRequest || !this.context) return;
      const now = this.context.currentTime;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = buffer; source.loop = true;
      gain.gain.setValueAtTime(.001, now);
      gain.gain.exponentialRampToValueAtTime(1, now + 1.5);
      source.connect(gain).connect(this.musicBus);
      source.start();
      this.fadeTrack(now);
      this.trackSource = source;
      this.trackGain = gain;
      this.trackKey = key;
    } catch {
      if (request === this.trackRequest) this.fadeTrack();
    }
  }

  fadeTrack(at = this.context?.currentTime || 0) {
    if (this.trackGain && this.trackSource && this.context) {
      this.trackGain.gain.cancelScheduledValues(at);
      this.trackGain.gain.setValueAtTime(Math.max(.001, this.trackGain.gain.value), at);
      this.trackGain.gain.exponentialRampToValueAtTime(.001, at + 1.5);
      this.trackSource.stop(at + 1.55);
    }
    this.trackSource = null;
    this.trackGain = null;
    this.trackKey = '';
  }

  update(state, mode = 'menu') {
    if (this.failed) return;
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
      else if (effect.type === 'artillery' || effect.type === 'ultimate') { this.noise(.48, .5); this.tone(72, .55, 'sawtooth', .3, .35); }
      else if (effect.type === 'tesla') { this.tone(840, .16, 'sawtooth', .14, .45); this.tone(1260, .1, 'square', .08, .6); }
      else if (effect.type === 'core-hit') { this.tone(155, .2, 'triangle', .18, .65); }
      else if (effect.type === 'critical') { this.tone(115, .3, 'square', .2, .5); }
      else if (effect.type === 'revive' || effect.type === 'rescue') { this.tone(523.25, .35, 'triangle', .12, 1.5); this.tone(659.25, .45, 'triangle', .1, 1.25); }
      else if (effect.type === 'brick') this.noise(.1, .12);
      else this.tone(520, .055, 'triangle', .08, .7);
    }
    if (this.knownEffects.size > 300) this.knownEffects.clear();
    const scene = !mode.startsWith('local') && mode !== 'online' ? 'menu' : state.bossSpawned ? 'boss' : this.trackManifest[state.missionId] ? state.missionId : state.map.id;
    if (this.context?.state === 'running') this.selectTrack(scene);
    if (this.context?.state === 'running' && !this.trackKey && state.status === 'playing' && this.context.currentTime >= this.nextBeat) {
      const pressure = state.tanks.filter((tank) => tank.team === 'enemies' && tank.alive).length + (state.bossSpawned ? 4 : 0);
      const interval = mode === 'menu' || mode === 'campaign' ? .62 : Math.max(.18, .42 - pressure * .018);
      const roots = { menu: 65.41, citadel: 82.41, foundry: 73.42, delta: 92.5, glacier: 98, marsh: 69.3, arsenal: 77.78, fortress: 58.27, boss: 55, custom: 87.31 };
      const root = roots[scene] || roots.custom;
      const pattern = [1, 1.5, 1.25, 2, 1, 1.25, 1.5, 2.5];
      this.tone(root * pattern[this.beat % pattern.length], interval * 1.25, this.beat % 4 ? 'triangle' : 'sawtooth', mode === 'menu' ? .09 : .14, .9, this.musicBus);
      if (this.beat % 4 === 0) {
        this.tone(root / 2, interval * 3.2, 'sine', mode === 'menu' ? .12 : .18, .86, this.musicBus);
        this.tone(root * 1.25, interval * 2.8, 'sine', mode === 'menu' ? .07 : .1, .96, this.musicBus);
        this.tone(58, .16, 'sine', .22, .45, this.musicBus);
      } else if (this.beat % 4 === 2) {
        this.noise(.09, .06, this.musicBus);
      }
      this.beat++;
      this.nextBeat = this.context.currentTime + interval;
    }
  }
}
