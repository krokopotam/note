import { appTitle, AppGlyph } from './registry';
import { useDesktop } from './desktopStore';
import { openApp } from './openApp';
import { useWindows } from './windowStore';
import styles from './Dock.module.css';

/**
 * Bottom dock (macOS-style): pinned apps with a magnified hover and a dot for
 * every running app.
 */
export function Dock() {
  const favorites = useDesktop((state) => state.favorites.dock);
  const windows = useWindows((state) => state.windows);
  const focusedKey = useWindows((state) => state.focusedKey);

  return (
    <nav className={styles.dock} aria-label="Dock z ulubionymi aplikacjami">
      {favorites.map((appId) => {
        const win = windows.find((candidate) => candidate.appId === appId);
        const title = appTitle(appId);
        return (
          <button
            key={appId}
            type="button"
            className={styles.item}
            title={title}
            aria-label={title}
            onClick={() => openApp(appId)}
            data-testid={`dock-${appId}`}
          >
            <AppGlyph appId={appId} size={46} />
            <span className={win ? `${styles.dot} ${styles.dotOn}` : styles.dot} />
            {focusedKey === win?.key && <span className={styles.focused} />}
          </button>
        );
      })}
    </nav>
  );
}
