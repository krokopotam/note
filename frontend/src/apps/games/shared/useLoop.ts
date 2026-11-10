import { useEffect, useRef } from 'react';

/**
 * A fixed-tempo game clock.
 *
 * `delay` of null pauses without losing the game: the same hook runs a moving
 * snake and a stack that stopped because the window lost focus.
 */
export function useLoop(onTick: () => void, delay: number | null): void {
  const tick = useRef(onTick);
  tick.current = onTick;

  useEffect(() => {
    if (delay === null) return undefined;
    const id = window.setInterval(() => tick.current(), delay);
    return () => window.clearInterval(id);
  }, [delay]);
}
