import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SnakeApp } from './SnakeApp';

const COLS = 15;

const head = (container: HTMLElement) =>
  Number(container.querySelector('[data-head]')?.getAttribute('data-head'));

afterEach(() => {
  vi.useRealTimers();
});

describe('wężyk na ekranie', () => {
  it('rusza się po starcie i słucha strzałek', () => {
    vi.useFakeTimers();
    const { container } = render(<SnakeApp />);
    const board = screen.getByTestId('snake-board');
    const before = head(container);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => void vi.advanceTimersByTime(200));
    expect(head(container)).not.toBe(before);

    fireEvent.keyDown(board, { key: 'ArrowUp' });
    act(() => void vi.advanceTimersByTime(200));
    expect(Math.floor(head(container) / COLS)).toBeLessThan(Math.floor(before / COLS));
  });

  it('przyjmuje kierunek z krzyża pod planszą', () => {
    vi.useFakeTimers();
    const { container } = render(<SnakeApp />);
    const before = head(container);

    // Krzyż reaguje na dotyk, nie na kliknięcie — tak samo jak na telefonie.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'up' }));
    act(() => void vi.advanceTimersByTime(200));

    expect(Math.floor(head(container) / COLS)).toBeLessThan(Math.floor(before / COLS));
  });

  it('pokazuje koniec gry i pozwala zacząć od nowa', () => {
    vi.useFakeTimers();
    render(<SnakeApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => void vi.advanceTimersByTime(5000));

    // Tarcza po koniec gry mówi „Nowy rekord!", gdy wąż zdążył coś zjeść.
    expect(screen.getByRole('button', { name: 'Jeszcze raz' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Jeszcze raz' }));
    expect(screen.queryByRole('button', { name: 'Jeszcze raz' })).toBeNull();
  });
});
