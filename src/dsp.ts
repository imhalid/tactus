/**
 * Low-level synthesis primitives. Everything is built from oscillators,
 * filtered noise and gentle envelopes — no samples.
 *
 * Design rules that make the result feel "expensive" instead of "beepy":
 *  - never start a voice at full level (3–10 ms soft attacks => no clicks)
 *  - exponential-ish decays (setTargetAtTime) instead of linear ones
 *  - high partials decay faster than the fundamental (like real struck objects)
 *  - every voice goes through a lowpass so nothing ever gets shrill
 */

export interface Bus {
  ctx: BaseAudioContext;
  /** dry mix input */
  dry: AudioNode;
  /** reverb send input */
  wet: AudioNode;
  noise: AudioBuffer;
  voices: { count: number; max: number };
  /** 0..1 — how far pan values are applied */
  spatial: number;
}

export interface Partial_ {
  ratio: number;
  gain: number;
  /** decay multiplier relative to the note decay */
  decay: number;
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export interface OutOpts {
  cutoff?: number;
  q?: number;
  pan?: number;
  send?: number;
  gain?: number;
}

/** Creates the per-sound output strip: gain → lowpass → pan → dry (+ reverb send). */
export function voiceOut(bus: Bus, o: OutOpts = {}): AudioNode {
  const { ctx } = bus;
  const input = ctx.createGain();
  input.gain.value = o.gain ?? 1;
  let node: AudioNode = input;
  if (o.cutoff) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.cutoff;
    f.Q.value = o.q ?? 0.5;
    node.connect(f);
    node = f;
  }
  if (o.pan && bus.spatial > 0 && typeof ctx.createStereoPanner === 'function') {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(o.pan * bus.spatial, -1, 1);
    node.connect(p);
    node = p;
  }
  node.connect(bus.dry);
  if (o.send && o.send > 0) {
    const s = ctx.createGain();
    s.gain.value = o.send;
    node.connect(s);
    s.connect(bus.wet);
  }
  return input;
}

/** Soft-attack, exponential-decay envelope. `decay` ≈ time to -40 dB. */
function envelope(g: AudioParam, t: number, peak: number, attack: number, decay: number) {
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(peak, t + attack);
  g.setTargetAtTime(0, t + attack, Math.max(0.004, decay / 4.6));
}

export interface ToneOpts {
  freq: number;
  when: number;
  gain: number;
  decay: number;
  attack?: number;
  type?: OscillatorType;
  /** start pitch as ratio of `freq` (e.g. 1.5 = start a fifth above) */
  glideFrom?: number;
  glideTime?: number;
  detune?: number;
}

export function tone(bus: Bus, out: AudioNode, o: ToneOpts) {
  if (bus.voices.count >= bus.voices.max || o.freq > 18000) return;
  const { ctx } = bus;
  const attack = o.attack ?? 0.004;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? 'sine';
  if (o.detune) osc.detune.value = o.detune;
  if (o.glideFrom && o.glideFrom !== 1) {
    osc.frequency.setValueAtTime(o.freq * o.glideFrom, o.when);
    osc.frequency.exponentialRampToValueAtTime(o.freq, o.when + (o.glideTime ?? 0.03));
  } else {
    osc.frequency.value = o.freq;
  }
  envelope(g.gain, o.when, o.gain, attack, o.decay);
  osc.connect(g);
  g.connect(out);
  bus.voices.count++;
  osc.onended = () => {
    bus.voices.count--;
    g.disconnect();
  };
  osc.start(o.when);
  osc.stop(o.when + attack + o.decay * 2 + 0.03);
}

export interface ModalOpts {
  freq: number;
  when: number;
  gain: number;
  decay: number;
  partials: Partial_[];
  attack?: number;
  glideFrom?: number;
  glideTime?: number;
  type?: OscillatorType;
}

/** A struck-object voice: a handful of sine partials with individual decays. */
export function modal(bus: Bus, out: AudioNode, o: ModalOpts) {
  for (const p of o.partials) {
    tone(bus, out, {
      freq: o.freq * p.ratio,
      when: o.when,
      gain: o.gain * p.gain,
      decay: o.decay * p.decay,
      attack: o.attack,
      glideFrom: o.glideFrom,
      glideTime: o.glideTime,
      type: p.ratio === 1 ? o.type : 'sine',
    });
  }
}

export interface NoiseOpts {
  when: number;
  dur: number;
  gain: number;
  freq: number;
  freqTo?: number;
  q?: number;
  type?: BiquadFilterType;
  attack?: number;
}

/** Filtered pink-noise burst / sweep — used for "air", transients and whooshes. */
export function noise(bus: Bus, out: AudioNode, o: NoiseOpts) {
  if (bus.voices.count >= bus.voices.max) return;
  const { ctx } = bus;
  const src = ctx.createBufferSource();
  src.buffer = bus.noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.Q.value = o.q ?? 0.8;
  f.frequency.setValueAtTime(o.freq, o.when);
  if (o.freqTo) f.frequency.exponentialRampToValueAtTime(o.freqTo, o.when + o.dur);
  const g = ctx.createGain();
  envelope(g.gain, o.when, o.gain, o.attack ?? 0.003, o.dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  bus.voices.count++;
  src.onended = () => {
    bus.voices.count--;
    g.disconnect();
  };
  src.start(o.when, Math.random() * 0.8);
  src.stop(o.when + (o.attack ?? 0.003) + o.dur * 2 + 0.03);
}

// ---------------------------------------------------------------------------
// buffers

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1.6 s of pink noise (Paul Kellet) — softer than white, sounds like "air". */
export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 1.6);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const rnd = mulberry32(1337);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = rnd() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

/**
 * Small, warm, dark "room" impulse response generated from noise.
 * Tail gets darker over time (like a real soft-furnished room) — that is what
 * gives the "cozy" glow without washing out the transient.
 */
export function makeImpulse(ctx: BaseAudioContext, seconds = 1.15, curve = 3.4): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(seconds * rate);
  const buf = ctx.createBuffer(2, len, rate);
  const fadeIn = Math.floor(0.012 * rate);
  const pre = Math.floor(0.006 * rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const rnd = mulberry32(9001 + ch * 77);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const k = 0.42 * Math.pow(1 - t, 1.6) + 0.035; // cutoff falls with time
      lp += ((rnd() * 2 - 1) - lp) * k;
      const env = Math.pow(1 - t, curve);
      const ramp = i < pre ? 0 : Math.min(1, (i - pre) / fadeIn);
      d[i] = lp * env * ramp;
    }
  }
  return buf;
}
