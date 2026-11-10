import { AIM_MODES, CAMERAS, TRIGGERS } from './controls';
import type { AimMode, CameraWanted, Controls } from './controls';
import styles from './ControlStrip.module.css';

/**
 * Every switch a billiard player wants, in one place: what the finger steers
 * (the cue or the table), what strikes, and where the camera is allowed to go.
 * Shared by 2D and 3D so both tables speak the same words.
 *
 * `cameraSlot` lets 3D add its own presets next to the view switch; 2D has no
 * camera to preset and simply leaves it empty.
 */
export function ControlStrip({
  controls,
  onChange,
  onAim,
  camera,
  onCamera,
  onStrike,
  disabled = false,
  placedAvailable = false,
  presets,
  preset = null,
  onPreset,
  presetsDisabled = false,
  presetsLabel = 'Kamera',
  testid,
}: {
  controls: Controls;
  onChange: (next: Controls) => void;
  /** Tapping an aiming option: wakes the cue up even if the mode was already on. */
  onAim: (mode: AimMode) => void;
  camera: CameraWanted;
  onCamera: (next: CameraWanted) => void;
  onStrike: () => void;
  disabled?: boolean;
  placedAvailable?: boolean;
  /** Extra picker (the 3D camera presets) rendered in the same rhythm. */
  presets?: { id: string; label: string }[];
  preset?: string | null;
  onPreset?: (id: string) => void;
  presetsDisabled?: boolean;
  presetsLabel?: string;
  testid: string;
}) {
  const aiming = camera !== 'free';
  const aimHint = AIM_MODES.find((mode) => mode.id === controls.aim)?.hint ?? '';
  const triggerHint = TRIGGERS.find((trigger) => trigger.id === controls.trigger)?.hint ?? '';
  const cameraHint = CAMERAS.find((entry) => entry.id === camera)?.hint ?? '';

  return (
    <div className={styles.strip}>
      <span className={styles.group}>
        Celowanie
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

      <span className={styles.group}>
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
        <span className={styles.group}>
          {presetsLabel}
          <span className={styles.buttons}>
            {presets.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`${styles.button} ${preset === option.id ? styles.on : ''}`}
                aria-pressed={preset === option.id}
                disabled={presetsDisabled}
                data-testid={`${testid}-preset-${option.id}`}
                onClick={() => onPreset?.(option.id)}
              >
                {option.label}
              </button>
            ))}
          </span>
        </span>
      )}

      <span className={styles.group}>
        Uderzenie
        <span className={styles.buttons}>
          {TRIGGERS.map((trigger) => (
            <button
              key={trigger.id}
              type="button"
              className={`${styles.button} ${controls.trigger === trigger.id ? styles.on : ''}`}
              aria-pressed={controls.trigger === trigger.id}
              data-testid={`${testid}-trigger-${trigger.id}`}
              onClick={() => onChange({ ...controls, trigger: trigger.id })}
            >
              {trigger.label}
            </button>
          ))}
        </span>
      </span>

      <span className={styles.hint} data-testid={`${testid}-hint`}>
        {aiming ? `${aimHint}; ${triggerHint}.` : `${cameraHint}.`}
      </span>

      <button
        type="button"
        className={styles.strike}
        onClick={onStrike}
        disabled={disabled || !aiming}
        data-testid={`${testid}-strike`}
      >
        Uderz
      </button>
    </div>
  );
}
