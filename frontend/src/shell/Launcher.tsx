import { GridIcon } from './icons';
import { appTitle, AppGlyph } from './registry';
import { badgeCount, useBadges } from './badgeStore';
import { IconBadge, iconLabel } from './IconBadge';
import { useDesktop } from './desktopStore';
import { useDrawer } from './drawerStore';
import { openApp } from './openApp';
import { usePhone } from './viewport';
import { useWindows } from './windowStore';
import styles from './Launcher.module.css';

/**
 * Left launcher (Ubuntu-style): pinned apps always visible, plus the overlay with
 * every installed application (`AppDrawer`).
 *
 * On a phone the bar is gone — there is no horizontal room to spare — and the
 * overlay is reached from the bottom bar instead.
 */
export function Launcher() {
  const favorites = useDesktop((state) => state.favorites.launcher);
  const windows = useWindows((state) => state.windows);
  const counts = useBadges((state) => state.counts);
  const drawerOpen = useDrawer((state) => state.open);
  const toggleDrawer = useDrawer((state) => state.toggle);
  const phone = usePhone();

  if (phone) return null;

  return (
    <nav className={styles.launcher} aria-label="Pasek aplikacji">
      <button
        type="button"
        className={styles.gridButton}
        aria-label="Wszystkie aplikacje"
        aria-expanded={drawerOpen}
        onClick={toggleDrawer}
        data-testid="launcher-all"
      >
        <GridIcon />
      </button>
      {favorites.map((appId) => {
        const waiting = badgeCount(counts, appId);
        return (
          <button
            key={appId}
            type="button"
            className={styles.item}
            title={appTitle(appId)}
            aria-label={iconLabel(appTitle(appId), waiting)}
            onClick={() => openApp(appId)}
            data-testid={`launcher-${appId}`}
          >
            <AppGlyph appId={appId} size={34} />
            <IconBadge count={waiting} testId={`launcher-${appId}`} />
            {windows.some((win) => win.appId === appId) && <span className={styles.running} />}
          </button>
        );
      })}
    </nav>
  );
}
