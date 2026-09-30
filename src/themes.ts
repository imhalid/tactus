import type { Partial_ } from './dsp';

export interface Theme {
  name: string;
  /** fundamental of scale step 0, Hz */
  root: number;
  /** scale degrees in semitones (one octave; repeats every octave) */
  scale: number[];
  /** modal body of struck sounds */
  partials: Partial_[];
  /** fundamental oscillator type */
  tone: OscillatorType;
  /** per-voice lowpass, Hz */
  cutoff: number;
  /** global decay multiplier */
  decay: number;
  /** reverb send amount 0..1 */
  reverb: number;
  /** low "body" thump amount */
  thump: number;
  /** noise transient ("air") amount */
  air: number;
  /** overall loudness trim */
  level: number;
}

const PENTATONIC = [0, 2, 4, 7, 9];

/** Warm wooden marimba / felt-mallet feel. Bars are tuned 1 : 4 : 10. */
export const cozy: Theme = {
  name: 'cozy',
  root: 261.63,
  scale: PENTATONIC,
  partials: [
    { ratio: 1, gain: 1, decay: 1 },
    { ratio: 4, gain: 0.26, decay: 0.42 },
    { ratio: 10, gain: 0.06, decay: 0.18 },
  ],
  tone: 'sine',
  cutoff: 5200,
  decay: 1,
  reverb: 0.3,
  thump: 1,
  air: 0.7,
  level: 1,
};

/** Bright, crisp, glassy — closer to the Apple "tink" family. */
export const crystal: Theme = {
  name: 'crystal',
  root: 329.63,
  scale: PENTATONIC,
  partials: [
    { ratio: 1, gain: 1, decay: 1 },
    { ratio: 2.756, gain: 0.2, decay: 0.5 },
    { ratio: 5.404, gain: 0.07, decay: 0.28 },
  ],
  tone: 'sine',
  cutoff: 8800,
  decay: 0.85,
  reverb: 0.22,
  thump: 0.35,
  air: 1,
  level: 0.92,
};

/** Very quiet, dark, padded — for apps that want sound to be almost subliminal. */
export const felt: Theme = {
  name: 'felt',
  root: 196,
  scale: PENTATONIC,
  partials: [
    { ratio: 1, gain: 1, decay: 1 },
    { ratio: 2, gain: 0.14, decay: 0.5 },
  ],
  tone: 'sine',
  cutoff: 2600,
  decay: 0.8,
  reverb: 0.14,
  thump: 1.25,
  air: 0.25,
  level: 1.05,
};

export const themes: Record<string, Theme> = { cozy, crystal, felt };
