import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TetrisApp } from './TetrisApp';

const piece = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-piece]')].map((el) => Number(el.getAttribute('data-piece')));

afterEach(() => {
  vi.useRealTimers();
});

describe('tetris na ekranie', () => {
  it('przesuwa klocka w prawo i w lewo', () => {
    const { container } = render(<TetrisApp />);
    const before = piece(container);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'right' }));
    expect(piece(container).map((cell) => cell - 1)).toEqual(before);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'left' }));
    expect(piece(container)).toEqual(before);
  });

  it('obraca klocka, nie zmieniając liczby pól', () => {
    const { container } = render(<TetrisApp />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'up' }));
    expect(piece(container)).toHaveLength(4);
  });

  it('każe klockowi spadać po starcie', () => {
    vi.useFakeTimers();
    const { container } = render(<TetrisApp />);
    const before = Math.min(...piece(container));

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => void vi.advanceTimersByTime(700));

    expect(Math.min(...piece(container))).toBeGreaterThan(before);
  });

  it('zgłasza koniec, gdy klocki urosły do sufitu', () => {
    vi.useFakeTimers();
    render(<TetrisApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    // Klocek leci w dół ~20 kroków, a stos musi urosnąć do sufitu.
    act(() => void vi.advanceTimersByTime(500_000));

    expect(screen.getByText('Kolumna urosła do sufitu')).toBeInTheDocument();
  });
});
