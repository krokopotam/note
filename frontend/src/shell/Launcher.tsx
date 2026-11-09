import { useState } from 'react';
import { APPS } from '@note/shared/manifest';
import { GridIcon } from './icons';
import { appTitle, AppGlyph } from './registry';
import { useDesktop } from './desktopStore';
import { openApp } from './openApp';
import { useWindows } from './windowStore';
import styles from './Launcher.module.css';

/**
 * Left launcher (Ubuntu-style): pinned apps always visible, plus an overlay with
 * every installed application.
 */
export function Launcher() {
  const favorites = useDesktop((state) => state.favorites.launcher);
  const windows = useWindows((state) => state.windows);
  const [showAll, setShowAll] = useState(false);

  return (
    <>
      <nav className={styles.launcher} aria-label="Pasek aplikacji">
        <button
          type="button"
          className={styles.gridButton}
          aria-label="Wszystkie aplikacje"
          aria-expanded={showAll}
          onClick={() => setShowAll((value) => !value)}
          data-testid="launcher-all"
        >
          <GridIcon />
        </button>
        {favorites.map((appId) => (
          <button
            key={appId}
            type="button"
            className={styles.item}
            title={appTitle(appId)}
            aria-label={appTitle(appId)}
            onClick={() => openApp(appId)}
            data-testid={`launcher-${appId}`}
          >
            <AppGlyph appId={appId} size={34} />
            {windows.some((win) => win.appId === appId) && <span className={styles.running} />}
          </button>
        ))}
      </nav>

      {showAll && (
        <div className={styles.overlay} role="dialog" aria-label="Wszystkie aplikacje">
          <ul className={styles.list}>
            {APPS.map((app) => (
              <li key={app.id}>
                <button
                  type="button"
                  className={styles.bigItem}
                  onClick={() => {
                    openApp(app.id);
                    setShowAll(false);
                  }}
                  data-testid={`appgrid-${app.id}`}
                >
                  <AppGlyph appId={app.id} size={56} />
                  <span>{app.title}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className={styles.dismiss} onClick={() => setShowAll(false)}>
            Zamknij
          </button>
        </div>
      )}
    </>
  );
}
