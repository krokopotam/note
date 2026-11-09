import { resolveView } from './registry';
import { usePointerDrag } from './usePointerDrag';
import { CloseIcon } from './icons';
import type { WindowState } from './windowStore';
import { useWindows } from './windowStore';
import styles from './WindowFrame.module.css';

/**
 * One window: title bar plus the app component.
 *
 * Geometry lives in the window store, so a frame can be dragged anywhere without
 * an app knowing anything about coordinates.
 */
export function WindowFrame({ win, focused }: { win: WindowState; focused: boolean }) {
  const focus = useWindows((state) => state.focus);
  const close = useWindows((state) => state.close);
  const move = useWindows((state) => state.move);
  const toggleMinimize = useWindows((state) => state.toggleMinimize);
  const toggleMaximize = useWindows((state) => state.toggleMaximize);

  const { delta, onPointerDown } = usePointerDrag({
    enabled: () => !win.maximized,
    onEnd: (drag) => move(win.key, win.x + drag.dx, win.y + drag.dy),
  });

  const View = resolveView(win.appId);
  const left = win.maximized ? 0 : win.x + (delta?.dx ?? 0);
  const top = win.maximized ? 0 : win.y + (delta?.dy ?? 0);

  if (win.minimized) return null;

  return (
    <section
      className={win.maximized ? `${styles.window} ${styles.maximized}` : styles.window}
      data-active={focused}
      style={{ left, top, width: win.maximized ? undefined : win.width, zIndex: win.z }}
      onPointerDown={() => focus(win.key)}
      data-testid={`window-${win.appId}`}
      aria-label={win.title}
    >
      <header
        className={focused ? `${styles.bar} ${styles.barActive}` : styles.bar}
        onPointerDown={onPointerDown}
        data-testid={`titlebar-${win.appId}`}
      >
        <span className={styles.title}>{win.title}</span>
        <span className={styles.controls}>
          <button
            type="button"
            className={styles.minimize}
            aria-label="Zminimalizuj"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => toggleMinimize(win.key)}
          />
          <button
            type="button"
            className={styles.maximize}
            aria-label="Maksymalizuj"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => toggleMaximize(win.key)}
          />
          <button
            type="button"
            className={styles.close}
            aria-label="Zamknij"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => close(win.key)}
          >
            <CloseIcon />
          </button>
        </span>
      </header>
      <div className={styles.body}>
        <View windowKey={win.key} appId={win.appId} payload={win.payload} />
      </div>
    </section>
  );
}
