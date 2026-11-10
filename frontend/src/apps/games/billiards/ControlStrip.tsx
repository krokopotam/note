import { AIM_MODES, TRIGGERS } from './controls';
import type { Controls } from './controls';
import styles from './ControlStrip.module.css';

/**
 * The two switches every billiard player wants, next to the strike button:
 * whether the finger steers the cue or turns the table, and whether letting go
 * strikes or only the button does.
 */
export function ControlStrip({
  controls,
  onChange,
  onStrike,
  disabled = false,
  testid,
}: {
  controls: Controls;
  onChange: (next: Controls) => void;
  onStrike: () => void;
  disabled?: boolean;
  testid: string;
}) {
  const aimHint = AIM_MODES.find((mode) => mode.id === controls.aim)?.hint ?? '';
  const triggerHint = TRIGGERS.find((trigger) => trigger.id === controls.trigger)?.hint ?? '';

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
              onClick={() => onChange({ ...controls, aim: mode.id })}
            >
              {mode.label}
            </button>
          ))}
        </span>
      </span>

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
        {aimHint}; {triggerHint}.
      </span>

      <button
        type="button"
        className={styles.strike}
        onClick={onStrike}
        disabled={disabled}
        data-testid={`${testid}-strike`}
      >
        Uderz
      </button>
    </div>
  );
}
