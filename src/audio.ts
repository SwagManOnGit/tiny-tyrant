// All sound is synthesised with WebAudio: no audio files to bundle, nothing to license.

type Mode = 'village' | 'battle' | null;

const VILLAGE = {
  bpm: 92,
  melody: [
    62, 65, 69, 67, 65, 64, 62, -1, 65, 67, 69, 72, 69, 67, 65, -1,
    69, 72, 74, 72, 69, 67, 65, 64, 62, 64, 65, 67, 64, 62, 62, -1,
    62, -1, 69, 67, 65, -1, 64, 62, 60, 62, 64, 65, 67, -1, 69, -1,
    74, 72, 69, 72, 69, 67, 65, 67, 64, 62, 60, 62, 62, -1, -1, -1,
  ],
  bass: [50, 53, 48, 50, 50, 48, 53, 50],
};
const BATTLE = {
  bpm: 138,
  melody: [
    57, 57, 60, 57, 62, 60, 57, 55, 57, 57, 60, 64, 62, 60, 59, 55,
    57, 60, 64, 65, 64, 60, 57, 60, 62, 60, 59, 57, 55, 57, 57, -1,
  ],
  bass: [45, 45, 43, 41, 45, 48, 43, 45],
};

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled = true;
  private mode: Mode = null;
  private step = 0;
  private nextTime = 0;
  private timer = 0;
  private suspended = false;

  /** Call from a user gesture: browsers refuse to start audio before one. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch { return; }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.9 : 0;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, len);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.timer = window.setInterval(() => this.schedule(), 90);
    }
    if (this.ctx.state === 'suspended' && !this.suspended) void this.ctx.resume();
  }
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.03);
  }
  pause(): void {
    this.suspended = true;
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }
  resume(): void {
    this.suspended = false;
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }
  music(mode: Mode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.step = 0;
    if (this.ctx) this.nextTime = this.ctx.currentTime + 0.15;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo = 0, dest?: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest || this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  private burst(dur: number, vol: number, freq: number, type: BiquadFilterType = 'lowpass', when = 0, sweepTo = 0, dest?: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest || this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.mode || !this.musicGain || ctx.state !== 'running') return;
    const song = this.mode === 'battle' ? BATTLE : VILLAGE;
    const beat = 60 / song.bpm / 2;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.25) {
      const when = this.nextTime - ctx.currentTime;
      const i = this.step % song.melody.length;
      const note = song.melody[i];
      if (note > 0) {
        // Plucked lute: a triangle with a quick decay plus a quiet octave shimmer.
        this.tone(hz(note), 0.42, 'triangle', 0.5, when, 0, this.musicGain);
        this.tone(hz(note + 12), 0.2, 'sine', 0.12, when, 0, this.musicGain);
      }
      if (i % 8 === 0) {
        const b = song.bass[Math.floor(i / 8) % song.bass.length];
        this.tone(hz(b - 12), beat * 7, 'sine', 0.55, when, 0, this.musicGain);
        this.tone(hz(b + 7 - 12), beat * 7, 'sine', 0.22, when, 0, this.musicGain);
      }
      if (this.mode === 'battle') {
        if (i % 4 === 0) { this.tone(110, 0.16, 'sine', 0.9, when, 45, this.musicGain); }
        if (i % 4 === 2) this.burst(0.09, 0.35, 1800, 'highpass', when, 0, this.musicGain);
      } else if (i % 8 === 4) {
        this.burst(0.05, 0.12, 3000, 'highpass', when, 0, this.musicGain);
      }
      this.step++;
      this.nextTime += beat;
    }
  }

  sfx(name: string): void {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    switch (name) {
      case 'click': this.tone(620, 0.06, 'triangle', 0.25); break;
      case 'open': this.tone(440, 0.07, 'triangle', 0.2); this.tone(660, 0.08, 'triangle', 0.18, 0.05); break;
      case 'deny': this.tone(170, 0.14, 'square', 0.14); this.tone(130, 0.16, 'square', 0.12, 0.08); break;
      case 'coin': this.tone(988, 0.08, 'square', 0.12); this.tone(1319, 0.22, 'square', 0.12, 0.07); break;
      case 'collect': this.tone(784, 0.07, 'triangle', 0.25); this.tone(1047, 0.16, 'triangle', 0.25, 0.06); break;
      case 'build': this.tone(140, 0.12, 'sine', 0.6, 0, 70); this.burst(0.1, 0.35, 900); this.burst(0.1, 0.3, 900, 'lowpass', 0.16); this.tone(140, 0.12, 'sine', 0.5, 0.16, 70); break;
      case 'done': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.28, i * 0.08)); break;
      case 'quest': [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.26, i * 0.07)); break;
      case 'train': this.burst(0.08, 0.3, 2400, 'highpass'); this.tone(330, 0.1, 'square', 0.1, 0.04); break;
      case 'deploy': this.tone(300, 0.1, 'sine', 0.35, 0, 520); break;
      case 'hit': this.burst(0.05, 0.22, 2600, 'bandpass'); break;
      case 'thud': this.tone(120, 0.12, 'sine', 0.5, 0, 60); this.burst(0.06, 0.2, 800); break;
      case 'arrow': this.burst(0.12, 0.16, 900, 'bandpass', 0, 4200); break;
      case 'magic': this.tone(620, 0.22, 'sine', 0.2, 0, 1500); this.tone(930, 0.18, 'triangle', 0.1, 0.03, 1900); break;
      case 'launch': this.burst(0.3, 0.28, 300, 'lowpass', 0, 1200); this.tone(90, 0.2, 'sine', 0.4, 0, 50); break;
      case 'boom': this.burst(0.4, 0.55, 700, 'lowpass', 0, 120); this.tone(70, 0.3, 'sine', 0.7, 0, 35); break;
      case 'crumble': this.burst(0.7, 0.6, 1200, 'lowpass', 0, 90); this.tone(60, 0.5, 'sine', 0.7, 0, 30); break;
      case 'oof': this.tone(240, 0.14, 'square', 0.12, 0, 110); break;
      case 'pop': this.tone(520, 0.09, 'triangle', 0.22, 0, 220); break;
      case 'horn': this.tone(196, 0.7, 'sawtooth', 0.16); this.tone(294, 0.7, 'sawtooth', 0.12, 0.02); this.tone(392, 0.5, 'sawtooth', 0.08, 0.2); break;
      case 'victory': [523, 523, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, i === 5 ? 0.7 : 0.16, 'square', 0.14, [0, 0.15, 0.3, 0.45, 0.62, 0.8][i])); break;
      case 'mana': this.tone(880 + Math.random() * 220, 0.1, 'sine', 0.2, 0, 1500); this.tone(1760, 0.06, 'triangle', 0.06, 0.03); break;
      case 'crit': [1047, 1319, 1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.2, 'sine', 0.2, i * 0.045)); break;
      case 'chop': this.tone(190, 0.09, 'triangle', 0.4, 0, 90); this.burst(0.06, 0.3, 900); break;
      case 'chip': this.tone(980, 0.05, 'triangle', 0.22, 0, 600); this.burst(0.05, 0.22, 3200, 'highpass'); break;
      case 'goblin': [392, 523, 392, 659].forEach((f, i) => this.tone(f, 0.11, 'square', 0.1, i * 0.09)); break;
      case 'spell': this.burst(0.55, 0.3, 2600, 'bandpass', 0, 260); this.tone(900, 0.5, 'sawtooth', 0.06, 0, 120); break;
      case 'heal': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.16, i * 0.07)); break;
      case 'freeze': this.tone(2000, 0.35, 'triangle', 0.14, 0, 500); this.burst(0.3, 0.2, 5000, 'highpass'); break;
      case 'dragon': this.tone(95, 1.1, 'sawtooth', 0.26, 0, 48); this.tone(142, 0.9, 'sawtooth', 0.14, 0.05, 70); this.burst(1.2, 0.4, 500, 'lowpass', 0.1, 1800); break;
      case 'ribbit': this.tone(150, 0.09, 'square', 0.1, 0, 95); this.tone(170, 0.11, 'square', 0.1, 0.11, 100); break;
      case 'defeat': [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.25, i * 0.25)); break;
    }
  }
  dispose(): void { window.clearInterval(this.timer); }
}
