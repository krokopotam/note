import { useEffect, useRef, useState } from 'react';
import styles from './RowMenu.module.css';

export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  /** Deletion and other things that cannot be undone. */
  danger?: boolean;
}

const MENU_WIDTH = 180;
const ITEM_HEIGHT = 32;
const GAP = 6;

/**
 * The actions of one row, behind three dots on its right edge.
 *
 * A row offering three verbs stops being a row and becomes a wall of buttons; the
 * dots keep the row quiet without hiding what it can do. Every list in the apps uses
 * this one — a file, a message, a card, a resource — so the gesture is learned once.
 *
 * The menu is `position: fixed` at the button's own rectangle rather than a child of
 * the row: rows live in scrolling panes, and an absolutely positioned child would be
 * clipped by the pane the moment it reached its edge.
 */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const button = useRef<HTMLButtonElement>(null);
  const [spot, setSpot] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!spot) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSpot(null);
    };
    // The menu does not move with the page, so any scroll ends it.
    const dismiss = () => setSpot(null);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [spot]);

  if (items.length === 0) return null;

  const toggle = () => {
    if (spot) {
      setSpot(null);
      return;
    }
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    setSpot(place(rect, items.length));
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className={styles.dots}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={spot !== null}
        onClick={toggle}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>

      {spot && (
        <>
          <div className={styles.backdrop} onPointerDown={() => setSpot(null)} data-testid="row-menu-backdrop" />
          <div className={styles.menu} role="menu" style={{ left: spot.left, top: spot.top, width: MENU_WIDTH }}>
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={item.danger ? `${styles.entry} ${styles.danger}` : styles.entry}
                onClick={() => {
                  // Close first: the action may re-render or remove this very row.
                  setSpot(null);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/** Right-aligned under the button, and turned upwards if the screen runs out below. */
function place(rect: DOMRect, itemCount: number) {
  const height = ITEM_HEIGHT * itemCount + GAP * 2;
  const left = Math.max(6, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 6));
  const below = rect.bottom + 4;
  const top = below + height > window.innerHeight - 6 ? rect.top - height - 4 : below;
  return { left, top: Math.max(6, top) };
}
