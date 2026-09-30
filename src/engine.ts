import { clamp, makeImpulse, makeNoise, voiceOut, type Bus } from './dsp';
import { sounds as builtin, type PlayOptions, type SoundCtx, type SoundDef } from './sounds';
import { themes as builtinThemes, type Theme } from './themes';

export interface Settings {
  /** theme name or a custom Theme object */
  theme: string | Theme;
  /** master volume 0..1 */
  volume: number;
  muted: boolean;
  /** 0..1 stereo spread from element position (0 disables) */
  spatial: number;
  /** ± cents / ± level randomisation so repeats never sound identical (0..1) */
  humanize: number;
  /** max simultaneous voices */
  maxVoices: number;
  /** remember `muted` in localStorage */
  persist: boolean;
}

export interface EngineOptions extends Partial<Settings> {
  /** supply your own (Offline)AudioContext — used for rendering / tests */
  context?: BaseAudioContext;
}

type Listener = (s: Readonly<Settings>) => void;

const STORAGE_KEY = 'tactus:muted';

export function createEngine(options: EngineOptions = {}) {
  const { context: injected, ...init } = options;
  const settings: Settings = {
    theme: 'cozy',
    volume: 0.8,
    muted: false,
    spatial: 0.3,
    humanize: 0.5,
    maxVoices: 40,
    persist: true,
    ...init,
  };
  const registry: Record<string, SoundDef> = { ...builtin };
  const themeRegistry: Record<string, Theme> = { ...builtinThemes };
  const listeners = new Set<Listener>();
  const lastPlayed = new Map<string, number>();
  const rrCounters = new Map<string, number>();

  let ctx: BaseAudioContext | null = injected ?? null;
  let bus: Bus | null = null;
  let master: GainNode | null = null;
  let booted = false;

  if (settings.persist && typeof localStorage !== 'undefined') {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v !== null) settings.muted = v === '1';
    } catch {}
  }

  const emit = () => listeners.forEach((l) => l(settings));

  function resolveTheme(): Theme {
    const t = settings.theme;
    return typeof t === 'string' ? themeRegistry[t] ?? themeRegistry.cozy : t;
  }

  /** Build (once) the master chain: dry + reverb → hp → soft shelf → compressor → master. */
  function boot(): boolean {
    if (booted) return true;
    if (!ctx) {
      const AC = typeof window !== 'undefined' ? window.AudioContext || (window as any).webkitAudioContext : undefined;
      if (!AC) return false;
      ctx = new AC({ latencyHint: 'interactive' });
    }
    const c = ctx;
    const sum = c.createGain();
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 42;
    hp.Q.value = 0.5;
    const shelf = c.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 7000;
    shelf.gain.value = -3; // tame any residual sparkle
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 24;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.002;
    comp.release.value = 0.16;
    master = c.createGain();
    master.gain.value = settings.muted ? 0 : settings.volume * 0.9;

    const dry = c.createGain();
    const wet = c.createGain();
    const conv = c.createConvolver();
    conv.buffer = makeImpulse(c);
    const wetOut = c.createGain();
    wetOut.gain.value = 0.9;
    wet.connect(conv);
    conv.connect(wetOut);
    dry.connect(sum);
    wetOut.connect(sum);
    sum.connect(hp);
    hp.connect(shelf);
    shelf.connect(comp);
    comp.connect(master);
    master.connect(c.destination);

    bus = {
      ctx: c,
      dry,
      wet,
      noise: makeNoise(c),
      voices: { count: 0, max: settings.maxVoices },
      spatial: settings.spatial,
    };
    booted = true;
    return true;
  }

  const isOffline = () => typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;

  function schedule(name: string, def: SoundDef, opts: PlayOptions) {
    if (!bus || !ctx) return;
    const theme = resolveTheme();
    const h = settings.humanize;
    const cents = (Math.random() * 2 - 1) * 7 * h;
    const rr = ((rrCounters.get(name) ?? -1) + 1) % 5;
    rrCounters.set(name, rr);
    const vel = clamp((opts.volume ?? 1) * theme.level * (def.trim ?? 1) * (1 + (Math.random() * 2 - 1) * 0.08 * h), 0, 1.6);
    const semiOffset = (opts.pitch ?? 0) + cents / 100;
    const b = bus;
    b.spatial = settings.spatial;
    b.voices.max = settings.maxVoices;
    const c: SoundCtx = {
      bus: b,
      theme,
      t: ctx.currentTime + 0.005 + (opts.delay ?? 0),
      vel,
      pan: opts.pan ?? 0,
      opts,
      rr,
      note(step) {
        const n = theme.scale.length;
        const oct = Math.floor(step / n);
        const deg = ((step % n) + n) % n;
        return theme.root * Math.pow(2, (theme.scale[deg] + 12 * oct + semiOffset) / 12);
      },
      semi: (s) => theme.root * Math.pow(2, (s + semiOffset) / 12),
      out: (o = {}) => voiceOut(b, { ...o, pan: opts.pan }),
      jit: (a) => (Math.random() * 2 - 1) * a,
    };
    def.play(c);
  }

  function play(name: string, opts: PlayOptions = {}) {
    if (settings.muted || settings.volume <= 0) return;
    const def = registry[name];
    if (!def) {
      if (typeof console !== 'undefined') console.warn(`[tactus] unknown sound "${name}"`);
      return;
    }
    if (!boot() || !ctx || !bus) return;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!isOffline() && def.gap) {
      const last = lastPlayed.get(name) ?? -Infinity;
      if (now - last < def.gap) return;
      lastPlayed.set(name, now);
    }
    if (bus.voices.count >= bus.voices.max) return;

    if (ctx.state === 'running' || isOffline()) {
      schedule(name, def, opts);
      return;
    }
    // Context still suspended: only continue if the user has interacted with the page,
    // otherwise browsers will refuse anyway and we'd burst-play later.
    const active = typeof navigator !== 'undefined' && (navigator as any).userActivation?.hasBeenActive;
    if (active && 'resume' in ctx) {
      (ctx as AudioContext).resume().then(() => schedule(name, def, opts)).catch(() => {});
    }
  }

  /** Call from a user gesture to wake the AudioContext (autoBind / the action do this for you). */
  function unlock() {
    if (settings.muted) return;
    if (boot() && ctx && 'resume' in ctx && ctx.state !== 'running') (ctx as AudioContext).resume().catch(() => {});
  }

  function configure(patch: Partial<Settings>) {
    Object.assign(settings, patch);
    if (patch.muted !== undefined && settings.persist && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, settings.muted ? '1' : '0');
      } catch {}
    }
    if (master && ctx) {
      master.gain.setTargetAtTime(settings.muted ? 0 : settings.volume * 0.9, ctx.currentTime, 0.02);
    }
    emit();
  }

  return {
    play,
    unlock,
    configure,
    get settings(): Readonly<Settings> {
      return settings;
    },
    subscribe(fn: Listener) {
      listeners.add(fn);
      fn(settings);
      return () => {
        listeners.delete(fn);
      };
    },
    registerSound(name: string, def: SoundDef | SoundDef['play']) {
      registry[name] = typeof def === 'function' ? { play: def } : def;
    },
    registerTheme(theme: Theme) {
      themeRegistry[theme.name] = theme;
    },
    list: () => Object.keys(registry),
    get context() {
      return ctx;
    },
  };
}

export type Engine = ReturnType<typeof createEngine>;
