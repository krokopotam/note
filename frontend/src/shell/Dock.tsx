import { HomeIcon, GridIcon } from './icons';
import { appTitle, AppGlyph } from './registry';
import { badgeCount, useBadges } from './badgeStore';
import { IconBadge, iconLabel } from './IconBadge';
import { useDesktop } from './desktopStore';
import { useDrawer } from './drawerStore';
import { openApp } from './openApp';
import { usePhone } from './viewport';
import { useWindows } from './windowStore';
import styles from './Dock.module.css';

/**
 * Bottom bar.
 *
 * On a desktop it is the macOS dock: pinned apps, a dot for whatever is running,
 * a number for whatever is waiting inside. On a phone it becomes a tab bar the
 * same size as a thumb: pinned apps, a way home, and the list of everything
 * installed — the only two things you need to get anywhere with one hand.
 */
export function Dock() {
  const favorites = useDesktop((state) => state.favorites.dock);
  const windows = useWindows((state) => state.windows);
  const focusedKey = useWindows((state) => state.focusedKey);
  const counts = useBadges((state) => state.counts);
  const phone = usePhone();

  if (phone) return <PhoneBar favorites={favorites} windows={windows} focusedKey={focusedKey} counts={counts} />;

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

interface BarProps {
  favorites: string[];
  windows: { appId: string; key: string }[];
  focusedKey: string | null;
  counts: Record<string, number>;
}

/** One hand, one screen at a time: the phone's bar is also its window list. */
function PhoneBar({ favorites, windows, focusedKey, counts }: BarProps) {
  const goHome = useWindows((state) => state.goHome);
  const openDrawer = useDrawer((state) => state.toggle);

  return (
    <nav className={styles.tabbar} aria-label="Aplikacje i pulpit" data-testid="phone-bar">
      <button
        type="button"
        className={styles.tab}
        aria-label="Pulpit"
        onClick={goHome}
        data-testid="phone-home"
      >
        <HomeIcon />
      </button>
      {favorites.map((appId) => {
        const win = windows.find((candidate) => candidate.appId === appId);
        const waiting = badgeCount(counts, appId);
        return (
          <button
            key={appId}
            type="button"
            className={focusedKey === win?.key ? `${styles.tab} ${styles.tabOn}` : styles.tab}
            aria-label={iconLabel(appTitle(appId), waiting)}
            onClick={() => openApp(appId)}
            data-testid={`dock-${appId}`}
          >
            <span className={styles.tabGlyph}>
              <AppGlyph appId={appId} size={30} />
              <IconBadge count={waiting} testId={`dock-${appId}`} />
            </span>
            <span className={styles.tabLabel}>{appTitle(appId)}</span>
          </button>
        );
      })}
      <button
        type="button"
        className={styles.tab}
        aria-label="Wszystkie aplikacje"
        onClick={openDrawer}
        data-testid="phone-drawer"
      >
        <GridIcon />
        <span className={styles.tabLabel}>Wszystko</span>
      </button>
    </nav>
  );
}
