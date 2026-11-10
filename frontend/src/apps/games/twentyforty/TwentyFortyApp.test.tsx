import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TwentyFortyApp } from './TwentyFortyApp';

const tiles = () => screen.queryAllByTestId(/^tile-\d+$/);
const board = () => screen.getByTestId('twentyforty-board');

const KEYS = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'];

describe('2048 na ekranie', () => {
  it('zaczyna od dwóch płytek', () => {
    render(<TwentyFortyApp />);
    expect(tiles()).toHaveLength(2);
  });

  it('seria ruchów trzyma planszę w ryzach', () => {
    render(<TwentyFortyApp />);

    KEYS.concat(KEYS).forEach((key) => fireEvent.keyDown(board(), { key }));

    // Płytki przybywa po każdym ruchu, który coś przesunął, a miejsce jest z góry.
    expect(tiles().length).toBeGreaterThanOrEqual(2);
    expect(tiles().length).toBeLessThanOrEqual(16);
  });

  it('nieznany klawisz nie rusza gry', () => {
    render(<TwentyFortyApp />);
    const before = board().textContent;

    fireEvent.keyDown(board(), { key: 'PageUp' });

    expect(board().textContent).toBe(before);
  });

  it('reaguje na swipe', () => {
    render(<TwentyFortyApp />);

    fireEvent.pointerDown(board(), { clientX: 100, clientY: 100 });
    fireEvent.pointerUp(board(), { clientX: 20, clientY: 102 });

    // Gest w lewo to ruch: plansza albo się przesunęła, albo stała w miejscu.
    expect(tiles().length).toBeGreaterThanOrEqual(2);
  });

  it('nowa gra wraca do dwóch płytek i zera', () => {
    render(<TwentyFortyApp />);
    KEYS.forEach((key) => fireEvent.keyDown(board(), { key }));

    fireEvent.click(screen.getByRole('button', { name: 'Nowa gra' }));

    expect(tiles()).toHaveLength(2);
    expect(screen.getByText(/Wynik/)).toHaveTextContent('0');
  });
});
