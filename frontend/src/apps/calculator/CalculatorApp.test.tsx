import { screen } from '@testing-library/dom';
import { act, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CalculatorApp } from './CalculatorApp';

const press = async (name: string) => {
  await userEvent.click(screen.getByRole('button', { name }));
};

const display = () => screen.getByRole('status');

describe('calculator window', () => {
  it('adds two numbers typed on the keypad', async () => {
    render(<CalculatorApp />);

    await press('7');
    await press('dodaj');
    await press('3');
    expect(display()).toHaveTextContent('3');
    expect(screen.getByText('7 +')).toBeInTheDocument();

    await press('równa się');
    expect(display()).toHaveTextContent('10');
  });

  it('shows the pending operation above the result line', async () => {
    render(<CalculatorApp />);
    await press('9');
    await press('podziel');
    expect(screen.getByText('9 ÷')).toBeInTheDocument();
  });

  it('reports division by zero and clears on C', async () => {
    render(<CalculatorApp />);

    await press('8');
    await press('podziel');
    await press('0');
    await press('równa się');

    expect(display()).toHaveTextContent('Błąd');
    expect(screen.getByRole('alert')).toHaveTextContent('Dzielenie przez zero');

    await press('wyczyść');
    expect(display()).toHaveTextContent('0');
    expect(screen.getByRole('alert')).toHaveTextContent('');
  });

  it('reacts to the keyboard', async () => {
    render(<CalculatorApp />);

    // Keyboard events reach the app through a window listener, so they are
    // dispatched the way a browser would: outside React's own event system.
    await act(async () => {
      for (const key of ['2', '*', '5', 'Enter']) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key }));
        await Promise.resolve();
      }
    });

    expect(display()).toHaveTextContent('10');
  });

  it('ignores keystrokes typed into another app', async () => {
    const { container } = render(
      <>
        <input aria-label="obce pole" />
        <CalculatorApp />
      </>,
    );

    await userEvent.type(container.querySelector('input') as HTMLInputElement, '2+2=');

    expect(display()).toHaveTextContent('0');
  });

  it('handles decimals and the sign', async () => {
    render(<CalculatorApp />);

    await press('1');
    await press('kropka');
    await press('5');
    await press('zmień znak');
    expect(display()).toHaveTextContent('-1.5');
  });
});
