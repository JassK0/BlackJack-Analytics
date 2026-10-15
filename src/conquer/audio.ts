// Count & Conquer: sound made in the browser (no audio files). Off until the player turns it on.

type Sfx = 'card' | 'flip' | 'chip' | 'win' | 'big' | 'lose' | 'push' | 'heat' | 'alarm' | 'backoff' | 'cleared' | 'shuffle' | 'click' | 'coin' | 'fail';

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: { stop: () => void } | null = null;
  private noise: AudioBuffer | null = null;
  enabled = false;

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      let last = 0;
      // brown noise: a soft, low rumble like a distant crowd
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) { this.ensure(); this.startAmbience(); }
    else this.stopAmbience();
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  private tone(freq: number, at: number, dur: number, type: OscillatorType = 'sine', peak = 0.2, glide?: number) {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, at + dur);
    this.env(g, at, peak, 0.008, dur);
    o.connect(g).connect(this.master!);
    o.start(at);
    o.stop(at + dur + 0.05);
  }
  private burst(at: number, dur: number, freq: number, q: number, peak: number) {
    const ctx = this.ctx!, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise;
    s.playbackRate.value = 6;
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    this.env(g, at, peak, 0.004, dur);
    s.connect(f).connect(g).connect(this.master!);
    s.start(at, Math.random());
    s.stop(at + dur + 0.05);
  }

  play(kind: Sfx) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    switch (kind) {
      case 'card': this.burst(t, 0.07, 3200, 0.9, 0.35); break;
      case 'flip': this.burst(t, 0.05, 2400, 1.4, 0.3); this.burst(t + 0.05, 0.05, 3600, 1.2, 0.2); break;
      case 'chip': this.tone(2600, t, 0.06, 'triangle', 0.12); this.tone(3400, t + 0.035, 0.08, 'triangle', 0.09); break;
      case 'coin': [1568, 2093].forEach((f, i) => this.tone(f, t + i * 0.07, 0.18, 'square', 0.05)); break;
      case 'click': this.tone(1200, t, 0.03, 'square', 0.04); break;
      case 'win': [523, 659, 784].forEach((f, i) => this.tone(f, t + i * 0.07, 0.22, 'triangle', 0.14)); break;
      case 'big': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, t + i * 0.06, 0.3, 'triangle', 0.14)); break;
      case 'push': this.tone(440, t, 0.15, 'sine', 0.08); this.tone(440, t + 0.12, 0.15, 'sine', 0.06); break;
      case 'lose': this.tone(180, t, 0.35, 'sine', 0.22, 95); break;
      case 'fail': this.tone(330, t, 0.25, 'triangle', 0.12, 220); this.tone(220, t + 0.22, 0.45, 'triangle', 0.12, 140); break;
      case 'heat': this.tone(880, t, 0.09, 'square', 0.05); this.tone(660, t + 0.12, 0.12, 'square', 0.05); break;
      case 'alarm': for (let i = 0; i < 3; i++) { this.tone(990, t + i * 0.22, 0.1, 'square', 0.06); this.tone(740, t + i * 0.22 + 0.1, 0.1, 'square', 0.06); } break;
      case 'backoff': this.tone(600, t, 0.9, 'sawtooth', 0.07, 120); this.tone(300, t + 0.1, 0.9, 'sine', 0.12, 70); break;
      case 'cleared': [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.09, 0.4, 'triangle', 0.13)); this.tone(1568, t + 0.5, 0.6, 'sine', 0.06); break;
      case 'shuffle': for (let i = 0; i < 14; i++) this.burst(t + i * 0.035 + Math.random() * 0.01, 0.03, 2800 + Math.random() * 1200, 1.1, 0.16); break;
    }
  }

  private startAmbience() {
    const ctx = this.ctx;
    if (!ctx || this.ambience) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.5);
    out.connect(this.master!);

    // crowd murmur: brown noise through a low, slowly wandering filter
    const crowd = ctx.createBufferSource();
    crowd.buffer = this.noise;
    crowd.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const cg = ctx.createGain();
    cg.gain.value = 0.09;
    const wander = ctx.createOscillator(), wg = ctx.createGain();
    wander.frequency.value = 0.07;
    wg.gain.value = 140;
    wander.connect(wg).connect(lp.frequency);
    crowd.connect(lp).connect(cg).connect(out);

    // lounge pad: a soft minor-seventh chord with a slow tremolo
    const pad = ctx.createGain();
    pad.gain.value = 0.022;
    const padLp = ctx.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 900;
    const trem = ctx.createOscillator(), tg = ctx.createGain();
    trem.frequency.value = 0.18;
    tg.gain.value = 0.009;
    trem.connect(tg).connect(pad.gain);
    const oscs = [110, 130.81, 164.81, 196, 220.5].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.detune.value = (i - 2) * 4;
      o.connect(padLp);
      return o;
    });
    padLp.connect(pad).connect(out);

    // now and then, a far-off chip stack or a glass
    const timer = window.setInterval(() => {
      if (!this.enabled || !this.ctx || Math.random() < 0.55) return;
      const t = this.ctx.currentTime;
      if (Math.random() < 0.5) { this.tone(2900 + Math.random() * 600, t, 0.05, 'triangle', 0.025); this.tone(3500, t + 0.04, 0.06, 'triangle', 0.02); }
      else this.tone(1800 + Math.random() * 900, t, 0.5, 'sine', 0.012);
    }, 2400);

    const nodes = [crowd, wander, trem, ...oscs];
    nodes.forEach((n) => n.start());
    this.ambience = {
      stop: () => {
        window.clearInterval(timer);
        const now = ctx.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(out.gain.value, now);
        out.gain.linearRampToValueAtTime(0, now + 0.6);
        nodes.forEach((n) => n.stop(now + 0.7));
      },
    };
  }
  private stopAmbience() { this.ambience?.stop(); this.ambience = null; }
}

export const sound = new Sound();
export type { Sfx };
