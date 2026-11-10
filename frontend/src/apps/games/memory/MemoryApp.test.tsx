import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryApp } from './MemoryApp';

const card = (index: number) => screen.getByTestId(`memory-card-${index}`);
const label = (index: number) => card(index).getAttribute('aria-label') ?? '';
const faceUp = (index: number) => !label(index).includes('zakryta');
const moves = () => Number(screen.getByText(/Ruchy/).textContent?.match(/\d+/)?.[0] ?? -1);

afterEach(() => {
  vi.useRealTimers();
});

describe('pamięć na ekranie', () => {
  it('druga karta liczy się jako ruch, trzecia już nie', () => {
    // Tasowanie jest losowe, więc test nie może zakładać, że karty 0 i 1 to pomyłka:
    // trafiona para zwalnia dłoń od razu i trzecia karta zaczyna nową turę,
    // a pomyłka trzyma dwie karty odkryte do czasu `settle`.
    vi.useFakeTimers();
    render(<MemoryApp />);

    fireEvent.click(card(0));
    fireEvent.click(card(1));
    expect(moves()).toBe(1);

    const para = label(0) === label(1);
    fireEvent.click(card(2));

    expect(moves()).toBe(1); // trzeci krzyż nigdy nie jest ruchem
    expect(faceUp(2)).toBe(para); // w turę wchodzi tylko po trafionej parze
  });

  it('para zostaje odkryta, a pomyłka znika po chwili', () => {
    vi.useFakeTimers();
    render(<MemoryApp />);

    fireEvent.click(card(0));
    const wanted = label(0);
    expect(wanted).not.toContain('zakryta');

    let partner = -1;
    for (let index = 1; index < 16 && partner < 0; index += 1) {
      fireEvent.click(card(0));
      fireEvent.click(card(index));
      act(() => void vi.advanceTimersByTime(800));
      if (faceUp(index) && label(index) === wanted) partner = index;
    }

    expect(partner).toBeGreaterThan(0);
    expect(screen.getByText(/Pary/)).toHaveTextContent('1');
  });

  it('nowa gra zakrywa wszystko od początku', () => {
    render(<MemoryApp />);
    fireEvent.click(card(0));

    fireEvent.click(screen.getByRole('button', { name: 'Nowa gra' }));

    expect(faceUp(0)).toBe(false);
    expect(screen.getByText(/Ruchy/)).toHaveTextContent('0');
  });
});
