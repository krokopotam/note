import { useEffect } from 'react';
import { ContextMenu } from './ContextMenu';
import { LoginScreen } from './LoginScreen';
import { useAuth, watchSessionLoss } from './authStore';
import { Desktop } from './Desktop';
import { Dock } from './Dock';
import { Launcher } from './Launcher';
import { TopBar } from './TopBar';
import { startBadgePoll } from './badgeStore';
import { useDesktop } from './desktopStore';
import { WindowFrame } from './WindowFrame';
import { useWindows } from './windowStore';
import styles from './Shell.module.css';

/**
 * Everything on screen: top bar, desktop, windows, launcher, dock, menu.
 *
 * Window stacking is a plain map over the store — there is no portal trickery,
 * because the shell owns the whole viewport anyway.
 *
 * Nothing of it renders until the session is known: boot asks the server who this
 * cookie belongs to, and an unknown visitor gets the login form instead.
 */
export function Shell() {
  const authStatus = useAuth((state) => state.status);
  const boot = useAuth((state) => state.boot);
  const load = useDesktop((state) => state.load);
  const status = useDesktop((state) => state.status);
  const error = useDesktop((state) => state.error);
  const windows = useWindows((state) => state.windows);
  const focusedKey = useWindows((state) => state.focusedKey);

  useEffect(() => {
    void boot();
    // A 401 anywhere later (10 days passed, account locked) brings the login form back.
    return watchSessionLoss();
  }, [boot]);

  useEffect(() => {
    if (authStatus === 'signed-in') void load();
  }, [authStatus, load]);

  useEffect(() => {
    // Icons keep counting what arrives while no chat window is open.
    if (authStatus !== 'signed-in') return undefined;
    return startBadgePoll();
  }, [authStatus]);

  if (authStatus === 'booting') {
    return (
      <div className={styles.boot} data-testid="boot-splash">
        note
      </div>
    );
  }

  if (authStatus === 'anonymous') return <LoginScreen />;

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
