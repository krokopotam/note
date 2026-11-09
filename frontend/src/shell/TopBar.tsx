import { useEffect, useState } from 'react';
import { useWindows } from './windowStore';
import styles from './TopBar.module.css';

/** Top bar: which window owns the keyboard, plus a clock. */
export function TopBar() {
  const focused = useWindows((state) => state.windows.find((win) => win.key === state.focusedKey));
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className={styles.bar}>
      <span className={styles.brand}>note</span>
      <span className={styles.app}>{focused?.title ?? 'Pulpit'}</span>
      <span className={styles.clock} data-testid="clock">
        {formatClock(now)}
      </span>
    </header>
  );
}

/** `HH:MM` in 24h form — separated for testing without waiting for a tick. */
export function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
