import { vi } from 'vitest';

/**
 * Pretend the browser window has a given width.
 *
 * jsdom has no `matchMedia` at all, and the shell decides between a desktop and a
 * phone with it, so the tests need an answer that also reacts — `resize` fires the
 * change listeners exactly like a browser resizing the viewport.
 */
export function stubViewport(width = 1280) {
  const state = { width };
  const lists = new Set<{ listeners: Set<(event: { matches: boolean }) => void> }>();

  vi.stubGlobal(
    'matchMedia',
    (query: string) => {
      const max = Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? Number.POSITIVE_INFINITY);
      const list = { listeners: new Set<(event: { matches: boolean }) => void>() };
      lists.add(list);

      return {
        get matches() {
          return state.width <= max;
        },
        media: query,
        onchange: null,
        addEventListener: (_type: string, cb: (event: { matches: boolean }) => void) => list.listeners.add(cb),
        removeEventListener: (_type: string, cb: (event: { matches: boolean }) => void) => list.listeners.delete(cb),
        addListener: (cb: (event: { matches: boolean }) => void) => list.listeners.add(cb),
        removeListener: (cb: (event: { matches: boolean }) => void) => list.listeners.delete(cb),
        dispatchEvent: () => true,
      };
    },
  );

  return {
    resize(next: number) {
      state.width = next;
      lists.forEach((list) => list.listeners.forEach((cb) => cb({ matches: state.width <= 760 })));
    },
    /** How many listeners are still attached — a leak check for `usePhone`. */
    listenerCount: () => [...lists].reduce((total, list) => total + list.listeners.size, 0),
  };
}

export function clearViewportStub() {
  vi.unstubAllGlobals();
}
