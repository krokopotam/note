import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AIM_MODES, CAMERAS, TRIGGERS } from './controls';
import type { AimMode, CameraWanted, Controls, Trigger } from './controls';
import styles from './ControlStrip.module.css';

const PANEL_WIDTH = 232;

/**
 * The controls a player uses while aiming stay on the strip; everything else
 * hides behind three dots.
 *
 * A billiard is small and the screen is smaller — a phone showed the honest
 * ratio: three rows of switches and a table you needed a magnifier for. So the
 * strip keeps exactly what a shot needs (which way the finger steers, how hard,
 * and the strike itself) and the panel behind the dots holds what a player sets
 * once per visit: view, camera, trigger, distance, a new rack.
 *
 * The panel is `position: fixed` above its own button, like the row menus
 * elsewhere in the apps — the same gesture, learned once.
 */
export function ControlStrip({
  controls,
  onAim,
  onTrigger,
  camera,
  onCamera,
  onStrike,
  disabled = false,
  placedAvailable = false,
  presets,
  preset = null,
  presetsLabel = 'Kamera',
  onPreset,
  power,
  children,
  hint,
  testid,
}: {
  controls: Controls;
  onAim: (mode: AimMode) => void;
  onTrigger: (trigger: Trigger) => void;
  camera: CameraWanted;
  onCamera: (next: CameraWanted) => void;
  onStrike: () => void;
  disabled?: boolean;
  placedAvailable?: boolean;
  presets?: { id: string; label: string }[];
  preset?: string | null;
  presetsLabel?: string;
  onPreset?: (id: string) => void;
  /** The strength control, inline on the strip: it changes with every shot. */
  power?: ReactNode;
  /** Anything else the panel should carry (new rack, distance slider). */
  children?: ReactNode;
  hint?: string;
  testid: string;
}) {
  const dots = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<{ left: number; bottom: number } | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = dots.current?.getBoundingClientRect();
    if (!rect) return;
    // Na wąskim ekranie panel idzie od krawędzi do krawędzi — tak samo jak menu wierszy.
    const width = Math.min(PANEL_WIDTH, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    setSpot({ left, bottom: window.innerHeight - rect.top + 6 });
    setOpen(true);
  };

  return (
    <div className={styles.strip}>
      <span className={styles.group}>
        <span className={styles.label}>Celowanie</span>
        <span className={styles.buttons}>
          {AIM_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`${styles.button} ${controls.aim === mode.id ? styles.on : ''}`}
              aria-pressed={controls.aim === mode.id}
              data-testid={`${testid}-aim-${mode.id}`}
              onClick={() => onAim(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </span>
      </span>

      {power && <span className={styles.power}>{power}</span>}

      <span className={styles.grow} />

      <button
        ref={dots}
        type="button"
        className={styles.dots}
        aria-label="Ustawienia bilardu"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid={`${testid}-menu`}
        onClick={toggle}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>

      <button
        type="button"
        className={styles.strike}
        onClick={onStrike}
        disabled={disabled || camera === 'free'}
        data-testid={`${testid}-strike`}
      >
        Uderz
      </button>

      {open && spot && (
        <>
          <div
            className={styles.backdrop}
            onPointerDown={() => setOpen(false)}
            data-testid={`${testid}-menu-backdrop`}
          />
          <div
            className={styles.panel}
            role="group"
            aria-label="Ustawienia bilardu"
            style={{ left: spot.left, bottom: spot.bottom, width: Math.min(PANEL_WIDTH, window.innerWidth - 16) }}
            data-testid={`${testid}-panel`}
          >
            <span className={styles.section}>
              Widok
              <span className={styles.buttons}>
                {CAMERAS.filter((entry) => entry.id !== 'placed' || placedAvailable).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`${styles.button} ${camera === entry.id ? styles.on : ''}`}
                    aria-pressed={camera === entry.id}
                    data-testid={`${testid}-camera-${entry.id}`}
                    onClick={() => onCamera(entry.id)}
                  >
                    {entry.label}
                  </button>
                ))}
              </span>
            </span>

            {presets && (
              <span className={styles.section}>
                {presetsLabel}
                <span className={styles.buttons}>
                  {presets.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`${styles.button} ${preset === option.id ? styles.on : ''}`}
                      aria-pressed={preset === option.id}
                      data-testid={`${testid}-preset-${option.id}`}
                      onClick={() => onPreset?.(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </span>
              </span>
            )}

            <span className={styles.section}>
              Uderzenie
              <span className={styles.buttons}>
                {TRIGGERS.map((trigger) => (
                  <button
                    key={trigger.id}
                    type="button"
                    className={`${styles.button} ${controls.trigger === trigger.id ? styles.on : ''}`}
                    aria-pressed={controls.trigger === trigger.id}
                    data-testid={`${testid}-trigger-${trigger.id}`}
                    onClick={() => onTrigger(trigger.id)}
                  >
                    {trigger.label}
                  </button>
                ))}
              </span>
            </span>

            {children}

            {hint && (
              <p className={styles.hint} data-testid={`${testid}-hint`}>
                {hint}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
