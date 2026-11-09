import { useEffect } from 'react';
import { useContextMenu } from './contextMenuStore';
import styles from './ContextMenu.module.css';

const MENU_WIDTH = 190;

/**
 * The context menu. Content is provided by whoever asked for it
 * (see contextMenuStore), so this file only knows about positioning.
 */
export function ContextMenu() {
  const x = useContextMenu((state) => state.x);
  const y = useContextMenu((state) => state.y);
  const actions = useContextMenu((state) => state.actions);
  const close = useContextMenu((state) => state.close);

  useEffect(() => {
    if (actions.length === 0) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions.length, close]);

  if (actions.length === 0) return null;

  const left = Math.max(4, Math.min(x, window.innerWidth - MENU_WIDTH));
  const top = Math.max(36, Math.min(y, window.innerHeight - 40 * actions.length - 12));

  return (
    <>
      <div className={styles.backdrop} onPointerDown={close} data-testid="menu-backdrop" />
      <div className={styles.menu} style={{ left, top, width: MENU_WIDTH }} role="menu" data-testid="context-menu">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            className={action.danger ? `${styles.entry} ${styles.danger}` : styles.entry}
            onClick={action.run}
          >
            {action.label}
          </button>
        ))}
      </div>
    </>
  );
}
