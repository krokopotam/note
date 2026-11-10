import type { CSSProperties } from 'react';

/**
 * Inline style for a game board.
 *
 * `--ratio` is width / height; the shared stylesheet turns it into the largest box
 * of that shape the window has room for. React's style types only know standard
 * properties, so the custom one needs this one cast in one place.
 */
export function boardStyle(ratio: number, extra: CSSProperties = {}): CSSProperties {
  return { ...extra, '--ratio': ratio } as CSSProperties;
}
