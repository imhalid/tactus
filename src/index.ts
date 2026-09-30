import { createEngine, type Engine, type Settings, type EngineOptions } from './engine';
import type { PlayOptions } from './sounds';

export { createEngine } from './engine';
export type { Engine, Settings, EngineOptions } from './engine';
export type { PlayOptions, SoundCtx, SoundDef, BuiltinSound } from './sounds';
export { sounds as builtinSounds } from './sounds';
export { themes, cozy, crystal, felt } from './themes';
export type { Theme } from './themes';

export type SoundName =
  | 'hover' | 'press' | 'release' | 'tap' | 'toggleOn' | 'toggleOff' | 'select' | 'focus' | 'pop'
  | 'slide' | 'type' | 'open' | 'close' | 'swipe' | 'dragStart' | 'dragMove' | 'dragOver' | 'drop'
  | 'dragCancel' | 'success' | 'error' | 'warning' | 'notify'
  | (string & {});

let engine: Engine | null = null;

/** The shared engine. Created lazily, so importing this module is SSR-safe. */
export function getEngine(): Engine {
  return (engine ??= createEngine());
}

/** Play a sound: `play('tap')`, `play('select', { step: 7 })`. */
export function play(name: SoundName, opts?: PlayOptions) {
  if (typeof window === 'undefined') return;
  getEngine().play(name, opts);
}

/** `configure({ theme: 'crystal', volume: 0.6, muted: false })` */
export function configure(patch: Partial<Settings>) {
  if (typeof window === 'undefined') return;
  getEngine().configure(patch);
}

export const setMuted = (muted: boolean) => configure({ muted });
export const setVolume = (volume: number) => configure({ volume });
export const setTheme = (theme: Settings['theme']) => configure({ theme });
export const unlock = () => typeof window !== 'undefined' && getEngine().unlock();
export const registerSound: Engine['registerSound'] = (n, d) => getEngine().registerSound(n, d);
export const registerTheme: Engine['registerTheme'] = (t) => getEngine().registerTheme(t);

/** Svelte-store-compatible `muted` — use `$muted` in components. */
export const muted = {
  subscribe(fn: (v: boolean) => void) {
    if (typeof window === 'undefined') {
      fn(false);
      return () => {};
    }
    return getEngine().subscribe((s) => fn(s.muted));
  },
  set: setMuted,
};

export type { EngineOptions as _EngineOptions };

export { modal, tone, noise, voiceOut } from './dsp';
