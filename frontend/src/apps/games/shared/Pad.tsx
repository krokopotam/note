import { useRef } from 'react';
import styles from './Pad.module.css';

/**
 * Directions without a keyboard.
 *
 * A phone has no arrow keys and a desktop player sometimes prefers the mouse, so
 * every game that steers gets the same cross of buttons. `onPointerDown` rather
 * than `onClick`: holding a direction should start immediately, not on release.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';

const KEYS: { dir: Direction; label: string; area: string }[] = [
  { dir: 'up', label: '↑', area: 'up' },
  { dir: 'left', label: '←', area: 'left' },
  { dir: 'right', label: '→', area: 'right' },
  { dir: 'down', label: '↓', area: 'down' },
];

export function DirectionPad({
  onDirection,
  extra,
}: {
  onDirection: (direction: Direction) => void;
  extra?: { label: string; onPress: () => void; hold?: boolean }[];
}) {
  const hold = useRef<number | null>(null);
  const stopHold = () => {
    if (hold.current !== null) {
      window.clearInterval(hold.current);
      hold.current = null;
    }
  };

  return (
    <div className={styles.wrap} onPointerUp={stopHold} onPointerLeave={stopHold}>
      <div className={styles.cross}>
        {KEYS.map((key) => (
          <button
            key={key.dir}
            type="button"
            className={styles.key}
            style={{ gridArea: key.area }}
            aria-label={key.dir}
            onPointerDown={() => onDirection(key.dir)}
          >
            {key.label}
          </button>
        ))}
      </div>
      {extra && extra.length > 0 && (
        <div className={styles.side}>
          {extra.map((button) => (
            <button
              key={button.label}
              type="button"
              className={styles.keyWide}
              onPointerDown={() => {
                button.onPress();
                if (!button.hold) return;
                stopHold();
                hold.current = window.setInterval(button.onPress, 90);
              }}
            >
              {button.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Swipe across an element becomes a direction — 2048 and the snake prefer it. */
export function useSwipe(onDirection: (direction: Direction) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onPointerDown: (event: { clientX: number; clientY: number }) => {
      start.current = { x: event.clientX, y: event.clientY };
    },
    onPointerUp: (event: { clientX: number; clientY: number }) => {
      if (!start.current) return;
      const dx = event.clientX - start.current.x;
      const dy = event.clientY - start.current.y;
      start.current = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) onDirection(dx > 0 ? 'right' : 'left');
      else onDirection(dy > 0 ? 'down' : 'up');
    },
  };
}
