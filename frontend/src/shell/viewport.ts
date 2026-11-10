import { useEffect, useState } from 'react';

/**
 * When the shell has to stop pretending to be a desktop.
 *
 * The desktop layout — icons on a wide grid, windows you drag, two bars of chrome —
 * needs room. Below this width the same applications are shown one at a time,
 * full screen, with a way back instead of a title bar to grab.
 */
export const PHONE_MAX_WIDTH = 760;

const QUERY = `(max-width: ${PHONE_MAX_WIDTH}px)`;

function media(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(QUERY);
}

/** One-shot answer, for code that runs outside a component. */
export function isPhone(): boolean {
  return media()?.matches ?? false;
}

/**
 * Live answer: a window dragged narrow (or a phone rotated) flips the layout.
 *
 * jsdom answers `matchMedia` but does not deliver its change events, so the
 * listener is attached only when it really exists.
 */
export function usePhone(): boolean {
  const [phone, setPhone] = useState(isPhone);

  useEffect(() => {
    const list = media();
    if (!list) return undefined;

    const sync = () => setPhone(list.matches);
    sync();
    if (typeof list.addEventListener !== 'function') return undefined;

    list.addEventListener('change', sync);
    return () => list.removeEventListener('change', sync);
  }, []);

  return phone;
}
