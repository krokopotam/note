import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BALL_R, TABLE } from '../billiards/billiards';
import { Billiards2dApp } from './Billiards2dApp';

const table = () => screen.getByTestId('billiard-table');

/** jsdom gives every element a zero-size box; the app needs a real one to aim. */
const stubTableBox = (width = 660, height = 348) => {
  const box = {
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
  vi.spyOn(table(), 'getBoundingClientRect').mockReturnValue(box);
};

/** Table units to client pixels. */
const px = (x: number, y: number) => ({
  clientX: ((x + 9) / (TABLE.width + 18)) * 660,
  clientY: ((y + 9) / (TABLE.height + 18)) * 348,
});

const roll = (ms: number) => {
  act(() => void vi.advanceTimersByTime(ms));
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('bilard 2D na ekranie', () => {
  it('kładzie stół: jedenaście kul, liczniki na zero', () => {
    render(<Billiards2dApp />);

    expect(screen.getAllByTestId(/^ball-\d+$/)).toHaveLength(11);
    expect(screen.getByText(/Do wbicia/)).toHaveTextContent('10');
    expect(screen.getByText(/Strzały/)).toHaveTextContent('0');
    expect(screen.getByTestId('cue-stick')).toBeInTheDocument();
  });

  it('rysuje przymiar z kulą-duchem, póki kule stoją', () => {
    render(<Billiards2dApp />);
    stubTableBox();

    fireEvent.pointerMove(table(), px(TABLE.width * 0.6, TABLE.height / 2));

    expect(screen.getByTestId('aim-guide')).toBeInTheDocument();
    expect(screen.getByTestId('ghost-ball')).toBeInTheDocument();
  });

  it('samo kliknięcie nie jest strzałem', () => {
    render(<Billiards2dApp />);
    stubTableBox();
    const node = table();

    fireEvent.pointerDown(node, px(100, 55));
    fireEvent.pointerUp(node, px(100, 55));

    expect(screen.getByText(/Strzały/)).toHaveTextContent('0');
  });

  it('pociągnięcie ładuje kij i puszczenie uderza', () => {
    vi.useFakeTimers();
    render(<Billiards2dApp />);
    stubTableBox();
    const node = table();

    fireEvent.pointerDown(node, px(60, 55));
    fireEvent.pointerMove(node, px(60 + BALL_R * 14, 55));
    expect(screen.getByTestId('power-fill')).toHaveStyle({ width: '67%' });

    fireEvent.pointerUp(node, px(60 + BALL_R * 14, 55));

    expect(screen.getByText(/Strzały/)).toHaveTextContent('1');
    // Kij znika, bo kula jest w ruchu.
    expect(screen.queryByTestId('cue-stick')).toBeNull();

    roll(6000);

    expect(screen.getByTestId('cue-stick')).toBeInTheDocument();
  });

  it('klawiatura obraca kij, dobiera siłę i uderza', () => {
    render(<Billiards2dApp />);
    const node = table();

    fireEvent.keyDown(node, { key: 'ArrowUp' });
    expect(screen.getByTestId('power-fill')).toHaveStyle({ width: '68%' });

    fireEvent.keyDown(node, { key: ' ' });

    expect(screen.getByText(/Strzały/)).toHaveTextContent('1');
  });

  it('po uderzeniu kule się zatrzymują same, bez restartu', () => {
    vi.useFakeTimers();
    render(<Billiards2dApp />);

    fireEvent.keyDown(table(), { key: ' ' });
    roll(8000);

    // Ruch minął: licznik zostaje na jednym, a kij wraca na stół.
    expect(screen.getByText(/Strzały/)).toHaveTextContent('1');
    expect(screen.getByTestId('cue-stick')).toBeInTheDocument();
  });

  it('nowy bilard kładzie kule od początku', () => {
    render(<Billiards2dApp />);
    fireEvent.keyDown(table(), { key: ' ' });
    expect(screen.getByText(/Strzały/)).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'Nowy bilard' }));

    expect(screen.getByText(/Strzały/)).toHaveTextContent('0');
    expect(screen.getByText(/Do wbicia/)).toHaveTextContent('10');
  });
});
