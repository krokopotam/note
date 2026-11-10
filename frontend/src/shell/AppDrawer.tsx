import { APPS } from '@note/shared/manifest';
import { AppGlyph } from './registry';
import { badgeCount, useBadges } from './badgeStore';
import { IconBadge, iconLabel } from './IconBadge';
import { useDrawer } from './drawerStore';
import { openApp } from './openApp';
import styles from './AppDrawer.module.css';

/**
 * Every installed application, as an overlay.
 *
 * Reached from the launcher on a desktop and from the bottom bar on a phone; the
 * same list, the same test ids, one implementation.
 */
export function AppDrawer() {
  const counts = useBadges((state) => state.counts);
  const close = useDrawer((state) => state.close);

  return (
    <div className={styles.overlay} role="dialog" aria-label="Wszystkie aplikacje">
      <ul className={styles.list}>
        {APPS.map((app) => {
          const waiting = badgeCount(counts, app.id);
          return (
            <li key={app.id}>
              <button
                type="button"
                className={styles.bigItem}
                aria-label={iconLabel(app.title, waiting)}
                onClick={() => {
                  openApp(app.id);
                  close();
                }}
                data-testid={`appgrid-${app.id}`}
              >
                <span className={styles.bigGlyph}>
                  <AppGlyph appId={app.id} size={56} />
                  <IconBadge count={waiting} testId={`appgrid-${app.id}`} />
                </span>
                <span>{app.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className={styles.dismiss} onClick={close}>
        Zamknij
      </button>
    </div>
  );
}
