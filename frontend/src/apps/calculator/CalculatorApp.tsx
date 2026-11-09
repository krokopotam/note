import { useCallback, useEffect, useState } from 'react';
import {
  applyOperator,
  backspace,
  calculatorKeyMap,
  clearAll,
  decimalPoint,
  digit,
  equals,
  initialState,
  negate,
  percent,
  OPERATOR_SYMBOL,
  type CalcState,
  type Operator,
} from './calculator';
import styles from './CalculatorApp.module.css';

/**
 * Calculator UI: renders the state machine and forwards presses.
 *
 * Every handler is a one-line call into calculator.ts, so a layout change can
 * never alter arithmetic behaviour (and the arithmetic tests keep proving the
 * behaviour after such a change).
 */
export function CalculatorApp() {
  const [state, setState] = useState<CalcState>(initialState);

  const pressDigit = useCallback((value: string) => setState((s) => digit(s, value)), []);
  const pressOperator = useCallback((op: Operator) => setState((s) => applyOperator(s, op)), []);
  const pressEquals = useCallback(() => setState((s) => equals(s)), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Another app is typing; the calculator must not eat those keys.
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      const action = calculatorKeyMap(event.key);
      if (!action) return;
      event.preventDefault();

      if (action.type === 'digit') pressDigit(action.value);
      else if (action.type === 'operator') pressOperator(action.value);
      else if (action.type === 'equals') pressEquals();
      else if (action.type === 'clear') setState(clearAll());
      else if (action.type === 'backspace') setState((s) => backspace(s));
      else if (action.type === 'decimal') setState((s) => decimalPoint(s));
      else if (action.type === 'percent') setState((s) => percent(s));
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pressDigit, pressOperator, pressEquals]);

  const pending =
    state.accumulator !== null && state.operator
      ? `${state.accumulator} ${OPERATOR_SYMBOL[state.operator]}`
      : '';

  return (
    <div className={styles.calc} data-testid="calculator">
      <div className={styles.screen}>
        <span className={styles.expression}>{pending}</span>
        <output className={styles.display} aria-live="polite">
          {state.display}
        </output>
        <span className={state.error ? styles.error : styles.hidden} role="alert">
          {state.error ?? ''}
        </span>
      </div>

      <div className={styles.pad}>
        <Key label="C" kind="fn" ariaLabel="wyczyść" onClick={() => setState(clearAll())} />
        <Key label="⌫" kind="fn" ariaLabel="usuń cyfrę" onClick={() => setState((s) => backspace(s))} />
        <Key label="%" kind="fn" ariaLabel="procent" onClick={() => setState((s) => percent(s))} />
        <Key label="÷" kind="op" ariaLabel="podziel" onClick={() => pressOperator('divide')} />

        {['7', '8', '9'].map((value) => (
          <Key key={value} label={value} onClick={() => pressDigit(value)} />
        ))}
        <Key label="×" kind="op" ariaLabel="pomnóż" onClick={() => pressOperator('multiply')} />

        {['4', '5', '6'].map((value) => (
          <Key key={value} label={value} onClick={() => pressDigit(value)} />
        ))}
        <Key label="−" kind="op" ariaLabel="odejmij" onClick={() => pressOperator('subtract')} />

        {['1', '2', '3'].map((value) => (
          <Key key={value} label={value} onClick={() => pressDigit(value)} />
        ))}
        <Key label="+" kind="op" ariaLabel="dodaj" onClick={() => pressOperator('add')} />

        <Key label="±" ariaLabel="zmień znak" onClick={() => setState((s) => negate(s))} />
        <Key label="0" onClick={() => pressDigit('0')} />
        <Key label="." ariaLabel="kropka" onClick={() => setState((s) => decimalPoint(s))} />
        <Key label="=" kind="equals" ariaLabel="równa się" onClick={pressEquals} />
      </div>
    </div>
  );
}

interface KeyProps {
  label: string;
  ariaLabel?: string;
  kind?: 'fn' | 'op' | 'equals';
  onClick: () => void;
}

function Key({ label, ariaLabel, kind, onClick }: KeyProps) {
  const className = kind ? `${styles.key} ${styles[kind]}` : styles.key;
  return (
    <button type="button" className={className} aria-label={ariaLabel ?? label} onClick={onClick}>
      {label}
    </button>
  );
}
