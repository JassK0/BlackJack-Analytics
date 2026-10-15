// Twenty-One Stakes: arcade sounds and an optional chill loop, all synthesised in the browser

export type StakesSfx = 'deal' | 'flip' | 'chips' | 'mult' | 'xmult' | 'money' | 'score' | 'big' | 'bust' | 'lose' | 'click' | 'buy' | 'cleared' | 'fail' | 'shatter' | 'select';

class StakesSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: { stop: () => void } | null = null;
  private noise: AudioBuffer | null = null;
  sfx = false;
  musicOn = false;

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }
  set(sfx: boolean, music: boolean) {
    this.sfx = sfx;
    if (sfx || music) this.ensure();
    if (music && !this.musicOn) this.startMusic();
    if (!music && this.musicOn) this.stopMusic();
    this.musicOn = music;
  }

  private tone(f: number, at: number, dur: number, type: OscillatorType, peak: number, glide?: number, dest?: AudioNode) {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(dest ?? this.master!);
    o.start(at);
    o.stop(at + dur + 0.05);
  }
  private hiss(at: number, dur: number, freq: number, peak: number) {
    const ctx = this.ctx!, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise;
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 1.2;
    g.gain.setValueAtTime(peak, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f).connect(g).connect(this.master!);
    s.start(at, Math.random() * 0.5);
    s.stop(at + dur + 0.05);
  }

  /** `step` raises the pitch, so a long scoring run climbs like a slot machine. */
  play(kind: StakesSfx, step = 0) {
    if (!this.sfx) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    const up = 2 ** (Math.min(step, 18) / 12);
    switch (kind) {
      case 'deal': this.hiss(t, 0.06, 3800, 0.22); break;
      case 'flip': this.hiss(t, 0.05, 2600, 0.2); this.hiss(t + 0.045, 0.05, 4200, 0.12); break;
      case 'select': this.tone(880, t, 0.05, 'square', 0.04); break;
      case 'click': this.tone(660, t, 0.04, 'square', 0.035); break;
      case 'chips': this.tone(523 * up, t, 0.09, 'square', 0.05); this.tone(1046 * up, t + 0.02, 0.07, 'triangle', 0.04); break;
      case 'mult': this.tone(220 * up, t, 0.14, 'triangle', 0.12, 330 * up); break;
      case 'xmult': this.tone(330 * up, t, 0.08, 'sawtooth', 0.05, 660 * up); this.tone(660 * up, t + 0.07, 0.16, 'square', 0.05, 990 * up); break;
      case 'money': [1318, 1760].forEach((f, i) => this.tone(f, t + i * 0.06, 0.12, 'square', 0.04)); break;
      case 'buy': [784, 1046, 1318].forEach((f, i) => this.tone(f, t + i * 0.05, 0.1, 'square', 0.04)); break;
      case 'score': [392, 523, 659].forEach((f) => this.tone(f, t, 0.3, 'triangle', 0.07)); break;
      case 'big': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.05, 0.4, 'square', 0.04)); this.hiss(t, 0.5, 1800, 0.08); break;
      case 'cleared': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, t + i * 0.08, 0.35, 'triangle', 0.09)); break;
      case 'bust': this.tone(196, t, 0.3, 'sawtooth', 0.06, 98); break;
      case 'lose': this.tone(262, t, 0.2, 'triangle', 0.08, 196); break;
      case 'fail': [330, 262, 196, 131].forEach((f, i) => this.tone(f, t + i * 0.16, 0.3, 'triangle', 0.08)); break;
      case 'shatter': for (let i = 0; i < 6; i++) this.tone(2000 + Math.random() * 2500, t + i * 0.02, 0.08, 'triangle', 0.03); this.hiss(t, 0.25, 6000, 0.15); break;
    }
  }

  // a mellow four-chord loop with a walking bass and a lazy arpeggio
  private startMusic() {
    const ctx = this.ensure();
    if (!ctx) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1600;
    out.connect(lp).connect(this.master!);
    const chords = [[57, 60, 64, 67], [50, 57, 60, 65], [55, 59, 62, 65], [48, 55, 59, 64]];
    const midi = (m: number) => 440 * 2 ** ((m - 69) / 12);
    const beat = 60 / 84;
    let next = ctx.currentTime + 0.1, bar = 0;
    const id = window.setInterval(() => {
      while (next < ctx.currentTime + 0.6) {
        const ch = chords[bar % 4];
        ch.forEach((m) => this.tone(midi(m), next, beat * 3.8, 'triangle', 0.018, undefined, out));
        [0, 2].forEach((b) => this.tone(midi(ch[0] - 12), next + b * beat, beat * 1.6, 'sine', 0.06, undefined, out));
        [0, 1, 2, 3, 2, 1, 3, 2].forEach((k, i) => { if ((bar + i) % 3 !== 1) this.tone(midi(ch[k] + 12), next + i * beat / 2, beat * 0.45, 'square', 0.008, undefined, out); });
        next += beat * 4;
        bar += 1;
      }
    }, 200);
    this.music = { stop: () => { window.clearInterval(id); const n = ctx.currentTime; out.gain.cancelScheduledValues(n); out.gain.setValueAtTime(out.gain.value, n); out.gain.linearRampToValueAtTime(0, n + 0.5); window.setTimeout(() => out.disconnect(), 4500); } };
  }
  private stopMusic() { this.music?.stop(); this.music = null; }
}

export const stakesSound = new StakesSound();
