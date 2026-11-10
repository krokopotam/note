import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BubblesApp } from './BubblesApp';

/** Let the bubble reach the wall (rAF and the clock are both faked). */
const fly = (ms = 900) => {
  act(() => void vi.advanceTimersByTime(ms));
};

afterEach(() => {
  vi.useRealTimers();
});

describe('bąbelki na ekranie', () => {
  it('pokazuje planszę pełną bąbelków i licznik strzałów', () => {
    render(<BubblesApp />);
    // Pięć wypełnionych wierszy: 11 + 10 + 11 + 10 + 11.
    expect(screen.getAllByTestId('bubble')).toHaveLength(53);
    expect(screen.getByText(/Strzały do nowego wiersza/)).toHaveTextContent('6');
  });

  it('kula leci, zamiast się teleportować', () => {
    vi.useFakeTimers();
    render(<BubblesApp />);
    const board = screen.getByTestId('bubbles-board');

    fireEvent.pointerUp(board);

    // W powietrzu: kula jest na planszy, licznik jeszcze nie drgnął, a linia
    // celowania zeszła z drogi.
    expect(screen.getByTestId('flying-bubble')).toBeInTheDocument();
    expect(screen.getByText(/Strzały do nowego wiersza/)).toHaveTextContent('6');
    expect(screen.queryByTestId('shot-fx')).toBeNull();

    act(() => void vi.advanceTimersByTime(60));
    expect(screen.getByTestId('flying-bubble')).toBeInTheDocument();

    fly();

    expect(screen.queryByTestId('flying-bubble')).toBeNull();
    expect(screen.getByText(/Strzały do nowego wiersza/)).toHaveTextContent('5');
    // Efekty strzału wchodzą dopiero, gdy kula doleci.
    expect(screen.getByTestId('shot-fx')).toBeInTheDocument();
  });

  it('nie puszcza drugiej kuli, dopóki pierwsza jest w powietrzu', () => {
    vi.useFakeTimers();
    render(<BubblesApp />);
    const board = screen.getByTestId('bubbles-board');

    fireEvent.pointerUp(board);
    fireEvent.pointerUp(board);
    fly();

    expect(screen.getByText(/Strzały do nowego wiersza/)).toHaveTextContent('5');
  });

  it('zaczyna nową grę od pełnej planszy', () => {
    vi.useFakeTimers();
    render(<BubblesApp />);
    fireEvent.pointerUp(screen.getByTestId('bubbles-board'));
    fly();
    expect(screen.getAllByTestId('bubble').length).toBeLessThanOrEqual(54);

    fireEvent.click(screen.getByRole('button', { name: 'Nowa gra' }));
    expect(screen.getAllByTestId('bubble')).toHaveLength(53);
  });
});
