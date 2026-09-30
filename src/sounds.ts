import { modal, noise, tone, voiceOut, type Bus } from './dsp';
import type { Theme } from './themes';

export interface PlayOptions {
  /** 0..1.5 velocity multiplier */
  volume?: number;
  /** semitone offset */
  pitch?: number;
  /** explicit scale step (for select / tick / slide) */
  step?: number;
  /** -1..1 stereo position (scaled by the engine's `spatial` setting) */
  pan?: number;
  /** 0..1 — used by `slide` */
  value?: number;
  /** seconds from now */
  delay?: number;
}

/** Everything a sound recipe needs. */
export interface SoundCtx {
  bus: Bus;
  theme: Theme;
  t: number;
  vel: number;
  pan: number;
  opts: PlayOptions;
  /** round-robin counter (0..4) for this sound, avoids machine-gun repetition */
  rr: number;
  /** frequency of a pentatonic scale step (negative steps allowed) */
  note(step: number): number;
  /** frequency from raw semitones above root */
  semi(semitones: number): number;
  /** voice output strip */
  out(o?: { cutoff?: number; send?: number; gain?: number; q?: number }): AudioNode;
  /** random in [-a, a] */
  jit(a: number): number;
}

export interface SoundDef {
  play(c: SoundCtx): void;
  /** minimum ms between two plays of this sound */
  gap?: number;
  /** loudness trim (1 = unchanged) */
  trim?: number;
}

/**
 * The catalogue. Levels are tuned so a tap peaks around -14 dBFS and a hover
 * around -30 dBFS — you feel hover, you don't "hear" it.
 */
export const sounds: Record<string, SoundDef> = {
  // ── pointer ────────────────────────────────────────────────────────────
  /** barely-there tick when a pointer enters an element */
  hover: {
    gap: 60,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: Math.min(th.cutoff, 4200), send: th.reverb * 0.35 });
      const step = c.opts.step ?? 10 + [0, 2, 1, 3, 4][c.rr];
      modal(c.bus, o, { freq: c.note(step), when: t, gain: 0.085 * c.vel, decay: 0.07 * th.decay, partials: th.partials.slice(0, 2), attack: 0.003 });
      noise(c.bus, o, { when: t, dur: 0.012, gain: 0.025 * th.air, freq: 5200, q: 0.7 });
    },
  },

  /** soft "push" at pointer-down */
  press: {
    gap: 30,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: Math.min(th.cutoff, 3600), send: th.reverb * 0.2 });
      modal(c.bus, o, { freq: c.note(3), when: t, gain: 0.26 * c.vel, decay: 0.075 * th.decay, partials: th.partials.slice(0, 2), glideFrom: 1.06, glideTime: 0.025, attack: 0.005 });
      tone(c.bus, o, { freq: 150, when: t, gain: 0.16 * th.thump * c.vel, decay: 0.06, glideFrom: 1.4, glideTime: 0.04, attack: 0.004 });
    },
  },

  /** crisp, slightly brighter "tock" at pointer-up */
  release: {
    gap: 30,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: th.cutoff, send: th.reverb * 0.5 });
      modal(c.bus, o, { freq: c.note(6), when: t, gain: 0.3 * c.vel, decay: 0.13 * th.decay, partials: th.partials, glideFrom: 1.035, glideTime: 0.018, attack: 0.003 });
      noise(c.bus, o, { when: t, dur: 0.018, gain: 0.09 * th.air, freq: 3400, q: 0.9 });
    },
  },

  /** single-shot click: press + release fused into one satisfying tock */
  tap: {
    gap: 25,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: th.cutoff, send: th.reverb * 0.5 });
      modal(c.bus, o, { freq: c.note(5), when: t, gain: 0.4 * c.vel, decay: 0.16 * th.decay, partials: th.partials, glideFrom: 1.05, glideTime: 0.02, attack: 0.003 });
      tone(c.bus, o, { freq: 160, when: t, gain: 0.26 * th.thump * c.vel, decay: 0.085, glideFrom: 1.5, glideTime: 0.05, attack: 0.004 });
      noise(c.bus, o, { when: t, dur: 0.02, gain: 0.1 * th.air, freq: 3200, q: 0.9 });
    },
  },

  // ── state ──────────────────────────────────────────────────────────────
  toggleOn: {
    trim: 0.72,
    gap: 40,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: th.cutoff, send: th.reverb * 0.7 });
      modal(c.bus, o, { freq: c.note(5), when: t, gain: 0.3 * c.vel, decay: 0.12 * th.decay, partials: th.partials, attack: 0.004 });
      modal(c.bus, o, { freq: c.note(8), when: t + 0.058, gain: 0.36 * c.vel, decay: 0.2 * th.decay, partials: th.partials, attack: 0.004 });
    },
  },

  toggleOff: {
    trim: 0.8,
    gap: 40,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: th.cutoff * 0.8, send: th.reverb * 0.5 });
      modal(c.bus, o, { freq: c.note(8), when: t, gain: 0.25 * c.vel, decay: 0.09 * th.decay, partials: th.partials, attack: 0.004 });
      modal(c.bus, o, { freq: c.note(5), when: t + 0.05, gain: 0.29 * c.vel, decay: 0.14 * th.decay, partials: th.partials, attack: 0.004 });
    },
  },

  /** selection tick; pass `step` to pick the note (tabs, segmented controls, lists) */
  select: {
    gap: 30,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: th.cutoff, send: th.reverb * 0.4 });
      modal(c.bus, o, { freq: c.note(c.opts.step ?? 6), when: t, gain: 0.3 * c.vel, decay: 0.1 * th.decay, partials: th.partials, glideFrom: 1.03, glideTime: 0.015, attack: 0.003 });
      noise(c.bus, o, { when: t, dur: 0.012, gain: 0.05 * th.air, freq: 4200 });
    },
  },

  focus: {
    gap: 80,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: Math.min(th.cutoff, 4500), send: th.reverb * 0.4 });
      modal(c.bus, o, { freq: c.note(9), when: t, gain: 0.13 * c.vel, decay: 0.09 * th.decay, partials: th.partials.slice(0, 2), attack: 0.004 });
    },
  },

  /** round bubble pop — copy, add, like */
  pop: {
    gap: 40,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: Math.min(th.cutoff, 4800), send: th.reverb * 0.5 });
      tone(c.bus, o, { freq: c.note(8), when: t, gain: 0.32 * c.vel, decay: 0.075, glideFrom: 0.55, glideTime: 0.05, attack: 0.004 });
      tone(c.bus, o, { freq: c.note(8) * 2, when: t, gain: 0.05 * c.vel, decay: 0.04, glideFrom: 0.55, glideTime: 0.05 });
    },
  },

  /** slider / stepper — pass `value` 0..1 */
  slide: {
    gap: 28,
    play(c) {
      const { theme: th, t } = c;
      const v = c.opts.value ?? 0.5;
      const o = c.out({ cutoff: Math.min(th.cutoff, 4200), send: th.reverb * 0.3 });
      const step = Math.round(5 + v * 9);
      modal(c.bus, o, { freq: c.note(step), when: t, gain: 0.16 * c.vel, decay: 0.055 * th.decay, partials: th.partials.slice(0, 2), attack: 0.003 });
    },
  },

  /** keyboard-ish micro tick for text input */
  type: {
    gap: 22,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: Math.min(th.cutoff, 4200), send: th.reverb * 0.15 });
      modal(c.bus, o, { freq: c.note(2 + Math.floor(Math.random() * 3)), when: t, gain: 0.07 * c.vel, decay: 0.035, partials: th.partials.slice(0, 2), attack: 0.002 });
      noise(c.bus, o, { when: t, dur: 0.012, gain: 0.05 * th.air, freq: 2200 + Math.random() * 900, q: 0.8 });
    },
  },

  // ── surfaces ───────────────────────────────────────────────────────────
  open: {
    gap: 80,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: th.cutoff, send: th.reverb * 0.8 });
      noise(c.bus, o, { when: t, dur: 0.15, gain: 0.15 * th.air + 0.03, freq: 500, freqTo: 2300, q: 0.7, attack: 0.045 });
      modal(c.bus, o, { freq: c.note(5), when: t + 0.05, gain: 0.2 * c.vel, decay: 0.15 * th.decay, partials: th.partials, attack: 0.005 });
    },
  },

  close: {
    gap: 80,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: th.cutoff * 0.85, send: th.reverb * 0.6 });
      noise(c.bus, o, { when: t, dur: 0.12, gain: 0.12 * th.air + 0.03, freq: 2200, freqTo: 480, q: 0.7, attack: 0.03 });
      modal(c.bus, o, { freq: c.note(3), when: t + 0.02, gain: 0.17 * c.vel, decay: 0.12 * th.decay, partials: th.partials, attack: 0.005 });
    },
  },

  swipe: {
    trim: 2.8,
    gap: 90,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: th.cutoff, send: th.reverb * 0.4 });
      noise(c.bus, o, { when: t, dur: 0.11, gain: (0.22 * th.air + 0.08) * c.vel, freq: 900, freqTo: 3000, q: 0.9, attack: 0.03 });
    },
  },

  // ── drag & drop ────────────────────────────────────────────────────────
  /** "lift": rising glide + airy swell — the object leaves the surface */
  dragStart: {
    gap: 80,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: Math.min(th.cutoff, 5000), send: th.reverb * 0.6 });
      tone(c.bus, o, { freq: c.note(3), when: t, gain: 0.2 * c.vel, decay: 0.12, glideFrom: 0.75, glideTime: 0.11, attack: 0.012 });
      noise(c.bus, o, { when: t, dur: 0.12, gain: 0.1 * th.air + 0.02, freq: 700, freqTo: 2600, q: 0.8, attack: 0.03 });
      modal(c.bus, o, { freq: c.note(8), when: t + 0.085, gain: 0.18 * c.vel, decay: 0.12 * th.decay, partials: th.partials.slice(0, 2), attack: 0.004 });
    },
  },

  /** tiny tick while moving through slots (reorder). Pass `step` to walk the scale. */
  dragMove: {
    gap: 45,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: Math.min(th.cutoff, 4500), send: th.reverb * 0.2 });
      modal(c.bus, o, { freq: c.note(c.opts.step ?? 8 + [0, 1, 0, 2, 1][c.rr]), when: t, gain: 0.14 * c.vel, decay: 0.05 * th.decay, partials: th.partials.slice(0, 2), attack: 0.003 });
    },
  },

  /** entering a valid drop target */
  dragOver: {
    gap: 110,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: Math.min(th.cutoff, 5000), send: th.reverb * 0.5 });
      modal(c.bus, o, { freq: c.note(7), when: t, gain: 0.2 * c.vel, decay: 0.09 * th.decay, partials: th.partials, glideFrom: 0.97, glideTime: 0.03, attack: 0.004 });
      noise(c.bus, o, { when: t, dur: 0.015, gain: 0.05 * th.air, freq: 3600 });
    },
  },

  /** "settle": soft thump + warm chime — the object lands */
  drop: {
    gap: 80,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: th.cutoff, send: th.reverb * 0.9 });
      tone(c.bus, o, { freq: 130, when: t, gain: 0.34 * th.thump * c.vel, decay: 0.17, glideFrom: 1.6, glideTime: 0.07, attack: 0.004 });
      modal(c.bus, o, { freq: c.note(5), when: t, gain: 0.28 * c.vel, decay: 0.2 * th.decay, partials: th.partials, attack: 0.004 });
      modal(c.bus, o, { freq: c.note(10), when: t + 0.05, gain: 0.14 * c.vel, decay: 0.3 * th.decay, partials: th.partials.slice(0, 2), attack: 0.005 });
      noise(c.bus, o, { when: t, dur: 0.02, gain: 0.09 * th.air, freq: 1400, q: 0.8 });
    },
  },

  /** dropped nowhere: gentle falling glide */
  dragCancel: {
    gap: 80,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: Math.min(th.cutoff, 3800), send: th.reverb * 0.5 });
      tone(c.bus, o, { freq: c.note(2), when: t, gain: 0.2 * c.vel, decay: 0.17, glideFrom: 1.55, glideTime: 0.13, attack: 0.008 });
      noise(c.bus, o, { when: t, dur: 0.09, gain: 0.06 * th.air, freq: 2400, freqTo: 700, q: 0.8, attack: 0.02 });
    },
  },

  // ── feedback ───────────────────────────────────────────────────────────
  success: {
    trim: 0.6,
    gap: 150,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: th.cutoff, send: th.reverb * 1.3 });
      const seq: [number, number, number, number][] = [
        [5, 0, 0.26, 0.16],
        [7, 0.065, 0.28, 0.18],
        [8, 0.13, 0.3, 0.2],
        [10, 0.2, 0.36, 0.5],
      ];
      for (const [s, dt, g, d] of seq) {
        modal(c.bus, o, { freq: c.note(s), when: t + dt, gain: g * c.vel, decay: d * th.decay, partials: th.partials, attack: 0.004 });
      }
    },
  },

  /** soft, low, descending — "not quite", never harsh */
  error: {
    trim: 0.65,
    gap: 200,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: 1500, q: 0.4, send: th.reverb * 0.6 });
      const a = c.semi(7);
      const b = c.semi(3);
      tone(c.bus, o, { freq: a, when: t, gain: 0.3 * c.vel, decay: 0.15, type: 'triangle', attack: 0.006 });
      tone(c.bus, o, { freq: a * 2, when: t, gain: 0.06 * c.vel, decay: 0.08, attack: 0.006 });
      tone(c.bus, o, { freq: b, when: t + 0.1, gain: 0.34 * c.vel, decay: 0.22, type: 'triangle', attack: 0.006 });
      tone(c.bus, o, { freq: b * 2, when: t + 0.1, gain: 0.06 * c.vel, decay: 0.1, attack: 0.006 });
      tone(c.bus, o, { freq: 120, when: t + 0.1, gain: 0.16 * th.thump * c.vel, decay: 0.12, glideFrom: 1.3, glideTime: 0.05 });
    },
  },

  warning: {
    trim: 0.8,
    gap: 200,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: Math.min(th.cutoff, 4600), send: th.reverb * 0.7 });
      const f = c.semi(9 + 12);
      modal(c.bus, o, { freq: f, when: t, gain: 0.26 * c.vel, decay: 0.12 * th.decay, partials: th.partials, attack: 0.004 });
      modal(c.bus, o, { freq: f, when: t + 0.115, gain: 0.2 * c.vel, decay: 0.18 * th.decay, partials: th.partials, attack: 0.004 });
    },
  },

  /** two-note bell, long soft tail */
  notify: {
    trim: 0.65,
    gap: 250,
    play(c) {
      const { theme: th, t } = c;
      const o = c.out({ cutoff: th.cutoff, send: th.reverb * 1.8 });
      modal(c.bus, o, { freq: c.note(7), when: t, gain: 0.25 * c.vel, decay: 0.32 * th.decay, partials: th.partials, attack: 0.004 });
      modal(c.bus, o, { freq: c.note(10), when: t + 0.11, gain: 0.3 * c.vel, decay: 0.6 * th.decay, partials: th.partials, attack: 0.004 });
    },
  },
};

export type BuiltinSound = keyof typeof sounds;
