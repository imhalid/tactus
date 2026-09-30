import { play, type SoundName } from './index';
import type { PlayOptions } from './sounds';

export type SoundRef =
  | SoundName
  | false
  | null
  | undefined
  | [SoundName, PlayOptions]
  | ((e: Event, node: Element) => SoundName | [SoundName, PlayOptions] | false | void);

/** event → sound. Keys are DOM event names, or the aliases hover/press/release/focus/blur. */
export type SoundMap = Record<string, SoundRef>;

const ALIAS: Record<string, string> = {
  hover: 'pointerenter',
  press: 'pointerdown',
  release: 'pointerup',
  focus: 'focusin',
  blur: 'focusout',
};

const isCheckable = (n: Element) => n instanceof HTMLInputElement && (n.type === 'checkbox' || n.type === 'radio');
const toggleSound = (e: Event, n: Element) => {
  const on = isCheckable(n) ? (n as HTMLInputElement).checked : n.getAttribute('aria-checked') !== 'true';
  return on ? 'toggleOn' : 'toggleOff';
};

/** Ready-made interaction bundles. Use as `use:sound="button"` or `data-sound="button"`. */
export const presets: Record<string, SoundMap> = {
  /** hover tick + soft press + crisp release. Keyboard activation gets a single tap. */
  button: { hover: 'hover', press: 'press', release: 'release', 'click:keyboard': 'tap' },
  /** hover tick + single tap on click */
  link: { hover: 'hover', click: 'tap' },
  card: { hover: 'hover', click: 'tap' },
  /** checkbox / radio (change) or role="switch" (click) */
  toggle: {
    hover: 'hover',
    change: (e, n) => (isCheckable(n) ? toggleSound(e, n) : false),
    click: (e, n) => (isCheckable(n) ? false : toggleSound(e, n)),
  },
  /** tabs, segmented controls, menu items */
  tab: { hover: 'hover', click: 'select' },
  /** text fields: a soft note when focused */
  input: { focus: 'focus' },
  /** text fields with per-keystroke ticks */
  typing: { focus: 'focus', input: 'type' },
  /** HTML5 draggable element */
  draggable: {
    hover: 'hover',
    dragstart: 'dragStart',
    dragend: (e) => ((e as DragEvent).dataTransfer?.dropEffect === 'none' ? 'dragCancel' : false),
  },
  /** HTML5 drop target */
  dropzone: { dragenter: 'dragOver', drop: 'drop' },
  /** svelte-dnd-action zones (`consider` / `finalize` custom events) */
  sortable: { consider: 'dragMove', finalize: 'drop' },
  /** buttons that confirm something */
  confirm: { hover: 'hover', press: 'press', release: 'release', 'click:keyboard': 'tap' },
  /** subtle: hover only */
  quiet: { hover: 'hover' },
};

export type PresetName = keyof typeof presets;

interface NodeState {
  pressed: boolean;
  depth: number;
}
const states = new WeakMap<Element, NodeState>();
const stateOf = (n: Element) => {
  let s = states.get(n);
  if (!s) states.set(n, (s = { pressed: false, depth: 0 }));
  return s;
};

/** Normalise aliases and merge a preset with overrides into { realEventName: ref }. */
export function resolveMap(input: string | ({ preset?: string } & SoundMap) | undefined | null): SoundMap {
  if (!input) return {};
  const out: SoundMap = {};
  const put = (m: SoundMap) => {
    for (const [k, v] of Object.entries(m)) {
      if (k === 'preset') continue;
      const [ev, suffix] = k.split(':');
      out[(ALIAS[ev] ?? ev) + (suffix ? ':' + suffix : '')] = v;
    }
  };
  if (typeof input === 'string') {
    put(presets[input] ?? {});
  } else {
    if (input.preset) put(presets[input.preset] ?? {});
    put(input as SoundMap);
  }
  return out;
}

/** DOM events that must be listened to for a given (normalised) map. */
export function eventsOf(map: SoundMap): string[] {
  const set = new Set<string>();
  for (const k of Object.keys(map)) set.add(k.split(':')[0]);
  if (set.has('dragenter')) set.add('dragleave');
  if (set.has('pointerdown') || set.has('pointerup')) set.add('pointerenter'); // to reset "pressed"
  return [...set];
}

/**
 * Central dispatcher used by both the Svelte action and the delegated Astro/vanilla binder.
 * `type` is the logical event ('pointerenter', 'click', …), which may differ from `e.type`.
 */
export function dispatch(node: Element, map: SoundMap, type: string, e: Event) {
  const st = stateOf(node);
  const pe = e as PointerEvent;

  // pointer guards ---------------------------------------------------------
  if (type === 'pointerenter') {
    if (pe.pointerType === 'touch') return;
    if (pe.buttons === 0) st.pressed = false;
    if (pe.buttons !== 0) return; // dragging across other elements shouldn't tick
  }
  if (type === 'pointerdown') {
    if (pe.button !== 0) return;
    st.pressed = true;
  }
  if (type === 'pointerup') {
    if (!st.pressed) return;
    st.pressed = false;
  }
  if (type === 'dragenter') {
    st.depth++;
    if (st.depth > 1) return;
  }
  if (type === 'dragleave') {
    st.depth = Math.max(0, st.depth - 1);
    return;
  }
  if (type === 'drop' || type === 'dragend') st.depth = 0;

  // lookup -----------------------------------------------------------------
  let ref: SoundRef;
  if (type === 'click') {
    const kb = (e as MouseEvent).detail === 0;
    ref = kb ? (map['click:keyboard'] ?? map.click) : (map['click:pointer'] ?? map.click);
  } else {
    ref = map[type];
  }
  const resolved = typeof ref === 'function' ? ref(e, node) : ref;
  if (!resolved) return;

  const [name, opts] = Array.isArray(resolved) ? resolved : ([resolved, undefined] as const);
  const x = 'clientX' in e && (e as MouseEvent).clientX ? (e as MouseEvent).clientX : node.getBoundingClientRect().left + node.getBoundingClientRect().width / 2;
  const pan = typeof window !== 'undefined' && window.innerWidth ? (x / window.innerWidth) * 2 - 1 : 0;
  play(name, { pan, ...opts });
}
