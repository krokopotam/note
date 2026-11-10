import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TicTacToeApp } from './TicTacToeApp';

const square = (index: number) => screen.getByTestId(`square-${index}`);
const marks = (mark: string) =>
  [...Array(9).keys()].filter((index) => square(index).textContent === mark);

afterEach(() => {
  vi.useRealTimers();
});

describe('kółko i krzyżyk na ekranie', () => {
  it('komputer odpowiada jednym kołem', () => {
    vi.useFakeTimers();
    render(<TicTacToeApp />);

    fireEvent.click(square(0));
    expect(square(0)).toHaveTextContent('X');
    expect(marks('O')).toHaveLength(0);

    act(() => void vi.advanceTimersByTime(300));

    expect(marks('O')).toHaveLength(1);
  });

  it('nie otwiera partii sam przed sobą', () => {
    vi.useFakeTimers();
    render(<TicTacToeApp />);

    act(() => void vi.advanceTimersByTime(3000));

    expect(marks('O')).toHaveLength(0);
  });

  it('trudny przeciwnik zamyka linię, zanim się domknie', () => {
    vi.useFakeTimers();
    render(<TicTacToeApp />);

    fireEvent.click(square(0));
    act(() => void vi.advanceTimersByTime(300));
    // Dwa krzyżyki w słupku grożą trzecim polem na dole.
    fireEvent.click(square(3));
    act(() => void vi.advanceTimersByTime(300));

    expect(square(6).textContent).toBe('O');
  });

  it('nie dokłada drugiego koła bez nowego ruchu', () => {
    vi.useFakeTimers();
    render(<TicTacToeApp />);

    fireEvent.click(square(4));
    act(() => void vi.advanceTimersByTime(300));
    const before = [...Array(9).keys()].map((index) => square(index).textContent).join('');

    act(() => void vi.advanceTimersByTime(3000));

    expect([...Array(9).keys()].map((index) => square(index).textContent).join('')).toBe(before);
    expect(marks('O')).toHaveLength(1);
  });

  it('przełącza stopień trudności', () => {
    render(<TicTacToeApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Trudny przeciwnik' }));

    expect(screen.getByRole('button', { name: 'Łatwy przeciwnik' })).toBeInTheDocument();
  });
});
