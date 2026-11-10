/**
 * Random numbers the games can live with.
 *
 * Every game takes its randomness as a function instead of calling Math.random
 * deep inside: a test can replay exactly the game a player had, and "the same
 * board again" becomes one number.
 */

export type Rng = () => number;

/** mulberry32 — 32 bits of state, no dependencies, good enough for games. */
export function rngFrom(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh, unrepeatable stream for a real game. */
export function randomRng(): Rng {
  return rngFrom(Math.floor(Math.random() * 0xffffffff) ^ Date.now());
}

/** New array, original untouched. */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}
