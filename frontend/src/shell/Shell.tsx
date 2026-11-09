import { useEffect } from 'react';
import { ContextMenu } from './ContextMenu';
import { Desktop } from './Desktop';
import { Dock } from './Dock';
import { Launcher } from './Launcher';
import { TopBar } from './TopBar';
import { useDesktop } from './desktopStore';
import { WindowFrame } from './WindowFrame';
import { useWindows } from './windowStore';
import styles from './Shell.module.css';

/**
 * Everything on screen: top bar, desktop, windows, launcher, dock, menu.
 *
 * Window stacking is a plain map over the store — there is no portal trickery,
 * because the shell owns the whole viewport anyway.
 */
export function Shell() {
  const load = useDesktop((state) => state.load);
  const status = useDesktop((state) => state.status);
  const error = useDesktop((state) => state.error);
  const windows = useWindows((state) => state.windows);
  const focusedKey = useWindows((state) => state.focusedKey);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={styles.shell} data-testid="shell">
      <Desktop />

      {windows.map((win) => (
        <WindowFrame key={win.key} win={win} focused={win.key === focusedKey} />
      ))}

      <TopBar />
      <Launcher />
      <Dock />
      <ContextMenu />

      {error && (
        <div className={styles.toast} role="alert" data-testid="error-toast">
          {error}
        </div>
      )}
      {status === 'loading' && (
        <p className={styles.loading} data-testid="desktop-loading">
          Wczytywanie pulpitu…
        </p>
      )}
    </div>
  );
}
