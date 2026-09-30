import { unlock } from './index';
import { dispatch, eventsOf, resolveMap, type SoundMap } from './bind';

export { play, configure, setMuted, setVolume, setTheme, muted, registerSound, registerTheme } from './index';
export { presets } from './bind';
export type { SoundMap, SoundRef, PresetName } from './bind';

export type SoundParams = string | ({ preset?: string } & SoundMap);

/**
 * Svelte action (Svelte 4 & 5):
 *
 *   <button use:sound={'button'}>Save</button>
 *   <div use:sound={{ preset: 'card', click: 'success' }} />
 *   <li use:sound={{ hover: 'hover', dragstart: 'dragStart' }} draggable="true" />
 */
export function sound(node: HTMLElement, params?: SoundParams) {
  let cleanups: (() => void)[] = [];

  const bind = (p?: SoundParams) => {
    const map = resolveMap(p);
    for (const ev of eventsOf(map)) {
      const h = (e: Event) => {
        if (e.type === 'pointerdown' || e.type === 'keydown') unlock();
        // event origin must be this node's own event (focusin bubbles from children — acceptable)
        dispatch(node, map, ev, e);
      };
      node.addEventListener(ev, h, { passive: true });
      cleanups.push(() => node.removeEventListener(ev, h));
    }
  };
  bind(params);

  return {
    update(next?: SoundParams) {
      cleanups.forEach((f) => f());
      cleanups = [];
      bind(next);
    },
    destroy() {
      cleanups.forEach((f) => f());
      cleanups = [];
    },
  };
}

/** Svelte 5 attachment form: `<button {@attach soundAttach('button')}>` */
export function soundAttach(params?: SoundParams) {
  return (node: HTMLElement) => {
    const a = sound(node, params);
    return () => a.destroy();
  };
}
