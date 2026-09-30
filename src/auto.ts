import { unlock, configure, type Settings } from './index';
import { dispatch, resolveMap, type SoundMap } from './bind';

/**
 * Delegated, attribute-driven binding — perfect for Astro (works with View Transitions
 * because the listeners live on `document`) and any vanilla page.
 *
 *   <button data-sound="button">…</button>
 *   <a href="/" data-sound="link" data-sound-click="success">…</a>
 *   <div data-sound="card" data-sound-hover="off">…</div>
 *
 * Per-event overrides: data-sound-{hover,press,release,click,focus,change,dragstart,drop,…}.
 * Use "off" to silence one event.
 */

const cache = new WeakMap<Element, { key: string; map: SoundMap }>();

function mapFor(el: Element): SoundMap {
  const attrs = [...el.attributes].filter((a) => a.name === 'data-sound' || a.name.startsWith('data-sound-'));
  const key = attrs.map((a) => a.name + '=' + a.value).join('|');
  const hit = cache.get(el);
  if (hit && hit.key === key) return hit.map;
  const input: Record<string, any> = {};
  let preset = '';
  for (const a of attrs) {
    if (a.name === 'data-sound') preset = a.value;
    else input[a.name.slice('data-sound-'.length)] = a.value === 'off' || a.value === 'false' ? false : a.value;
  }
  const map = resolveMap({ preset, ...input });
  cache.set(el, { key, map });
  return map;
}

const SEL = '[data-sound]';

function find(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest(SEL) : null;
}

const EVENTS: [domEvent: string, logical: string][] = [
  ['pointerover', 'pointerenter'],
  ['pointerdown', 'pointerdown'],
  ['pointerup', 'pointerup'],
  ['click', 'click'],
  ['change', 'change'],
  ['input', 'input'],
  ['focusin', 'focusin'],
  ['dragstart', 'dragstart'],
  ['dragend', 'dragend'],
  ['dragenter', 'dragenter'],
  ['dragleave', 'dragleave'],
  ['drop', 'drop'],
  ['consider', 'consider'],
  ['finalize', 'finalize'],
];

const FLAG = Symbol.for('tactus.autobind');

/** Attach delegated listeners once. Returns an unbind function. */
export function autoBind(settings?: Partial<Settings>): () => void {
  if (typeof document === 'undefined') return () => {};
  if (settings) configure(settings);
  const g = globalThis as any;
  if (g[FLAG]) return g[FLAG];

  const off: (() => void)[] = [];
  for (const [domEvent, logical] of EVENTS) {
    const h = (e: Event) => {
      if (domEvent === 'pointerdown' || domEvent === 'keydown') unlock();
      const el = find(e.target);
      if (!el) return;
      // pointerover fires for children too: only count real entries into the element
      if (domEvent === 'pointerover' && el.contains((e as PointerEvent).relatedTarget as Node | null)) return;
      dispatch(el, mapFor(el), logical, e);
    };
    document.addEventListener(domEvent, h, { capture: true, passive: true });
    off.push(() => document.removeEventListener(domEvent, h, { capture: true } as any));
  }
  const kb = () => unlock();
  document.addEventListener('keydown', kb, { capture: true, passive: true, once: true });

  const unbind = () => {
    off.forEach((f) => f());
    delete g[FLAG];
  };
  g[FLAG] = unbind;
  return unbind;
}

export { configure, play, setMuted, setVolume, setTheme, muted } from './index';
