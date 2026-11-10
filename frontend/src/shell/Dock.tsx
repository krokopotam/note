import { appTitle, AppGlyph } from './registry';
import { badgeCount, useBadges } from './badgeStore';
import { IconBadge, iconLabel } from './IconBadge';
import { useDesktop } from './desktopStore';
import { openApp } from './openApp';
import { useWindows } from './windowStore';
import styles from './Dock.module.css';

/**
 * Bottom dock (macOS-style): pinned apps with a magnified hover, a dot for every
 * running app and a number for whatever is waiting inside.
 */
export function Dock() {
  const favorites = useDesktop((state) => state.favorites.dock);
  const windows = useWindows((state) => state.windows);
  const focusedKey = useWindows((state) => state.focusedKey);
  const counts = useBadges((state) => state.counts);

  return (
    <nav className={styles.dock} aria-label="Dock z ulubionymi aplikacjami">
      {favorites.map((appId) => {
        const win = windows.find((candidate) => candidate.appId === appId);
        const title = appTitle(appId);
        const waiting = badgeCount(counts, appId);
        return (
          <button
            key={appId}
            type="button"
            className={styles.item}
            title={title}
            aria-label={iconLabel(title, waiting)}
            onClick={() => openApp(appId)}
            data-testid={`dock-${appId}`}
          >
            <AppGlyph appId={appId} size={46} />
            <IconBadge count={waiting} testId={`dock-${appId}`} />
            <span className={win ? `${styles.dot} ${styles.dotOn}` : styles.dot} />
            {focusedKey === win?.key && <span className={styles.focused} />}
          </button>
        );
      })}
    </nav>
  );
}
