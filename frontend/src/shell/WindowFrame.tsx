import { resolveView } from './registry';
import { usePointerDrag } from './usePointerDrag';
import { BackIcon, CloseIcon } from './icons';
import { usePhone } from './viewport';
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

  const phone = usePhone();

  const { delta, onPointerDown } = usePointerDrag({
    enabled: () => !win.maximized && !phone,
    onEnd: (drag) => move(win.key, win.x + drag.dx, win.y + drag.dy),
  });

  const View = resolveView(win.appId);
  // While maximized the frame carries no geometry at all: the stylesheet owns it,
  // so the window fills the safe area instead of hiding under the shell bars.
  // Height belongs here too: every app is written as `height: 100%`, so without it
  // a window collapsed to whatever its content happened to be (a game board with no
  // content of its own showed no board at all).
  const geometry = win.maximized
    ? {}
    : {
        left: win.x + (delta?.dx ?? 0),
        top: win.y + (delta?.dy ?? 0),
        width: win.width,
        height: win.height,
      };

  if (win.minimized) return null;

  // Na telefonie nie ma czego przeciągać: aplikacja zajmuje ekran, a zamiast
  // trzech kolorowych kółek jest jedna strzałka na powrót i jedna na zamknięcie.
  if (phone) {
    return (
      <section
        className={styles.sheet}
        data-active={focused}
        style={{ zIndex: win.z }}
        data-testid={`window-${win.appId}`}
        data-phone="true"
        aria-label={win.title}
      >
        <header className={styles.sheetBar}>
          <button
            type="button"
            className={styles.back}
            aria-label="Wróć do pulpitu"
            onClick={() => toggleMinimize(win.key)}
          >
            <BackIcon />
          </button>
          <span className={styles.title}>{win.title}</span>
          <button
            type="button"
            className={styles.sheetClose}
            aria-label="Zamknij"
            onClick={() => close(win.key)}
          >
            <CloseIcon size={16} />
          </button>
        </header>
        <div className={styles.body}>
          <View windowKey={win.key} appId={win.appId} payload={win.payload} />
        </div>
      </section>
    );
  }

  return (
    <section
      className={win.maximized ? `${styles.window} ${styles.maximized}` : styles.window}
      data-active={focused}
      style={{ ...geometry, zIndex: win.z }}
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
