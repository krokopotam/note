/**
 * Calculator arithmetic as a state machine over plain values.
 *
 * No React and no DOM here: the component only maps button presses to these
 * functions, which makes every rule below testable in a single line and reusable
 * if a second input method (voice, CLI-ish palette) ever shows up.
 */

export type Operator = 'add' | 'subtract' | 'multiply' | 'divide';

export interface CalcState {
  /** What the display shows, always a string. */
  display: string;
  /** Left operand of a pending operation. */
  accumulator: number | null;
  operator: Operator | null;
  /** Next digit replaces the display instead of appending (set after an operator). */
  overwrite: boolean;
  error: string | null;
}

export const DIVISION_BY_ZERO = 'Dzielenie przez zero';
export const MAX_DIGITS = 15;

export const initialState: CalcState = {
  display: '0',
  accumulator: null,
  operator: null,
  overwrite: true,
  error: null,
};

const APPLY: Record<Operator, (a: number, b: number) => number> = {
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
  divide: (a, b) => a / b,
};

export const OPERATOR_SYMBOL: Record<Operator, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
};

export function digit(state: CalcState, value: string): CalcState {
  if (state.error) return { ...initialState, display: value, overwrite: false };
  if (state.overwrite || state.display === '0') {
    return { ...state, display: value, overwrite: false };
  }
  if (state.display.replace(/[-.]/g, '').length >= MAX_DIGITS) return state;
  return { ...state, display: state.display + value };
}

export function decimalPoint(state: CalcState): CalcState {
  if (state.error) return { ...initialState, display: '0.', overwrite: false };
  if (state.overwrite) return { ...state, display: '0.', overwrite: false };
  if (state.display.includes('.')) return state;
  return { ...state, display: `${state.display}.` };
}

/**
 * Press an operator: a pending operation is resolved first, so `2 + 3 +` shows 5.
 *
 * Pressing an operator twice in a row replaces it instead of recomputing.
 */
export function applyOperator(state: CalcState, operator: Operator): CalcState {
  if (state.error) return state;

  const value = Number(state.display);
  const pending = state.operator;

  if (pending === null || state.overwrite) {
    return { ...state, accumulator: value, operator, overwrite: true };
  }

  const result = APPLY[pending](state.accumulator ?? 0, value);
  if (!Number.isFinite(result)) return errorState(DIVISION_BY_ZERO);

  return {
    display: formatResult(result),
    accumulator: result,
    operator,
    overwrite: true,
    error: null,
  };
}

export function equals(state: CalcState): CalcState {
  if (state.error || state.operator === null) return state;

  const value = Number(state.display);
  const result = APPLY[state.operator](state.accumulator ?? 0, value);
  if (!Number.isFinite(result)) return errorState(DIVISION_BY_ZERO);

  return { ...initialState, display: formatResult(result), overwrite: true };
}

export function clearAll(): CalcState {
  return initialState;
}

export function backspace(state: CalcState): CalcState {
  if (state.error) return initialState;
  if (state.overwrite) return state;

  const next = state.display.slice(0, -1);
  if (next === '' || next === '-') return { ...state, display: '0', overwrite: true };
  return { ...state, display: next };
}

export function negate(state: CalcState): CalcState {
  if (state.error) return state;
  if (state.display === '0') return state;
  return {
    ...state,
    display: state.display.startsWith('-') ? state.display.slice(1) : `-${state.display}`,
  };
}

/** Percent of the current entry (0.07 for 7), matching a simple desk calculator. */
export function percent(state: CalcState): CalcState {
  if (state.error) return state;
  return { ...state, display: formatResult(Number(state.display) / 100), overwrite: false };
}

/**
 * Trim binary noise so 0.1 + 0.2 shows 0.3, and switch to exponential notation
 * once the value stops fitting the display.
 */
export function formatResult(value: number): string {
  if (!Number.isFinite(value)) return 'Błąd';

  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e15 || magnitude < 1e-9)) {
    return value.toExponential(6);
  }
  if (Number.isInteger(value)) return String(value);

  return String(Number(value.toFixed(10)));
}

/** What a physical key means for the calculator, or null when it means nothing. */
export type KeyAction =
  | { type: 'digit'; value: string }
  | { type: 'operator'; value: Operator }
  | { type: 'equals' }
  | { type: 'clear' }
  | { type: 'backspace' }
  | { type: 'decimal' }
  | { type: 'percent' }
  | null;

export function calculatorKeyMap(key: string): KeyAction {
  if (/^[0-9]$/.test(key)) return { type: 'digit', value: key };

  switch (key) {
    case '+':
      return { type: 'operator', value: 'add' };
    case '-':
      return { type: 'operator', value: 'subtract' };
    case '*':
      return { type: 'operator', value: 'multiply' };
    case '/':
      return { type: 'operator', value: 'divide' };
    case '.':
    case ',':
      return { type: 'decimal' };
    case '=':
    case 'Enter':
      return { type: 'equals' };
    case 'c':
    case 'C':
    case 'Escape':
      return { type: 'clear' };
    case 'Backspace':
      return { type: 'backspace' };
    case '%':
      return { type: 'percent' };
    default:
      return null;
  }
}

function errorState(message: string): CalcState {
  return { ...initialState, display: 'Błąd', error: message, overwrite: true };
}
