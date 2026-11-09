import { describe, expect, it } from 'vitest';
import {
  applyOperator,
  backspace,
  calculatorKeyMap,
  clearAll,
  decimalPoint,
  digit,
  DIVISION_BY_ZERO,
  equals,
  formatResult,
  initialState,
  negate,
  percent,
  type CalcState,
} from './calculator';

/** Build a state from a key sequence so tests read like using the calculator. */
const from = (keys: string): CalcState =>
  [...keys].reduce((state, key) => {
    const action = calculatorKeyMap(key);
    if (!action) return state;
    if (action.type === 'digit') return digit(state, action.value);
    if (action.type === 'operator') return applyOperator(state, action.value);
    if (action.type === 'equals') return equals(state);
    if (action.type === 'decimal') return decimalPoint(state);
    if (action.type === 'percent') return percent(state);
    if (action.type === 'backspace') return backspace(state);
    return clearAll();
  }, initialState);

describe('entering numbers', () => {
  it('replaces the leading zero instead of producing 007', () => {
    expect(from('007').display).toBe('7');
  });

  it('appends digits', () => {
    expect(from('1234').display).toBe('1234');
  });

  it('stops at the display width', () => {
    const state = from('9'.repeat(30));
    expect(state.display).toHaveLength(15);
  });

  it('adds at most one decimal separator', () => {
    expect(from('1..2').display).toBe('1.2');
    expect(from('.5').display).toBe('0.5');
  });

  it('starts a new number after an operator', () => {
    expect(from('12+34').display).toBe('34');
  });
});

describe('operations', () => {
  it('computes the four basic operations', () => {
    expect(from('7+3').display).toBe('3');
    expect(equals(from('7+3')).display).toBe('10');
    expect(equals(from('7-3')).display).toBe('4');
    expect(equals(from('7*3')).display).toBe('21');
    expect(equals(from('7/2')).display).toBe('3.5');
  });

  it('chains operations, evaluating the pending one', () => {
    const state = from('2+3*');
    expect(state.display).toBe('5');
    expect(state.accumulator).toBe(5);
    expect(equals(from('2+3*4')).display).toBe('20');
  });

  it('replaces an operator pressed twice instead of recomputing', () => {
    const state = from('8+*');
    expect(state.operator).toBe('multiply');
    expect(state.accumulator).toBe(8);
    expect(equals(from('8*2')).display).toBe('16');
  });

  it('keeps pressing equals from the last operation', () => {
    expect(from('5+3=').display).toBe('8');
  });

  it('shows an error for division by zero and recovers on the next digit', () => {
    const broken = from('9/0=');
    expect(broken).toMatchObject({ display: 'Błąd', error: DIVISION_BY_ZERO });

    // The error must not stick: typing starts from scratch.
    expect(digit(broken, '4')).toMatchObject({ display: '4', error: null });
    expect(from('9/0=7').display).toBe('7');
  });

  it('ignores equals with no pending operation', () => {
    expect(equals(from('5')).display).toBe('5');
  });
});

describe('editing helpers', () => {
  it('clears everything', () => {
    expect(clearAll()).toEqual(initialState);
  });

  it('removes the last digit and lands back on zero', () => {
    expect(backspace(from('123')).display).toBe('12');
    expect(backspace(from('1')).display).toBe('0');
    expect(backspace(from('1')).overwrite).toBe(true);
  });

  it('does nothing right after an operator, matching a desk calculator', () => {
    expect(backspace(from('12+'))).toMatchObject({ display: '12', overwrite: true });
  });

  it('toggles the sign and leaves zero alone', () => {
    expect(negate(from('5')).display).toBe('-5');
    expect(negate(negate(from('5'))).display).toBe('5');
    expect(negate(initialState).display).toBe('0');
  });

  it('divides by 100 for percent', () => {
    expect(percent(from('7')).display).toBe('0.07');
  });
});

describe('formatResult', () => {
  it('hides binary floating point noise', () => {
    expect(formatResult(0.1 + 0.2)).toBe('0.3');
    expect(formatResult(1 / 3)).toBe('0.3333333333');
  });

  it('switches to exponential notation outside the display range', () => {
    expect(formatResult(1e21)).toBe('1.000000e+21');
    expect(formatResult(1e-12)).toBe('1.000000e-12');
  });

  it('reports a non-finite value as an error string', () => {
    expect(formatResult(Number.POSITIVE_INFINITY)).toBe('Błąd');
  });
});

describe('calculatorKeyMap', () => {
  it('maps the documented keys', () => {
    expect(calculatorKeyMap('7')).toEqual({ type: 'digit', value: '7' });
    expect(calculatorKeyMap('*')).toEqual({ type: 'operator', value: 'multiply' });
    expect(calculatorKeyMap('Enter')).toEqual({ type: 'equals' });
    expect(calculatorKeyMap('Escape')).toEqual({ type: 'clear' });
  });

  it('ignores keys the calculator does not use', () => {
    expect(calculatorKeyMap('#')).toBeNull();
    expect(calculatorKeyMap('Shift')).toBeNull();
  });
});
