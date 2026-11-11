import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Input } from './physics';

/**
 * Test samego okablowania: który klawisz i który guzik dociera do której klapki.
 *
 * Silnik jest prawdziwy, tylko podglądamy `step`. Martwa prawa klapka nie
 * wymagała zepsucia fizyki — wystarczyło, że nikt nie sprawdził, co naprawdę
 * trafia do symulacji, a testy fizyki budowały zawsze klapkę lewą.
 */
const kroki: Input[] = [];

vi.mock('./engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./engine')>();
  return {
    ...actual,
    createEngine: (...args: Parameters<typeof actual.createEngine>) => {
      const engine = actual.createEngine(...args);
      const krok = engine.step.bind(engine);
      engine.step = (dt, input) => {
        kroki.push({ ...input });
        krok(dt, input);
      };
      return engine;
    },
  };
});

let klatki: Array<(czas: number) => void>;
let zegar = 0;

function klatka(sekund = 0.05): void {
  act(() => {
    for (let i = 0; i < Math.round((sekund * 1000) / 16); i += 1) {
      zegar += 16;
      for (const cb of klatki.splice(0, klatki.length)) cb(zegar);
    }
  });
}

const ostatni = (): Input => kroki.at(-1) ?? { left: false, right: false, mini: false };

beforeEach(() => {
  kroki.length = 0;
  klatki = [];
  HTMLCanvasElement.prototype.getContext = (() => ({
    createImageData: (width: number, height: number) => ({
      data: new Uint8Array(width * height * 4),
      width,
      height,
    }),
    putImageData: () => undefined,
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  vi.stubGlobal('requestAnimationFrame', (cb: (czas: number) => void) => klatki.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  zegar = performance.now();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sterowanie', () => {
  it('strzałka w prawo daje prawej klapce, lewa zostaje w spokoju', async () => {
    const mod = await import('./PinballApp');
    render(<mod.PinballApp />);
    klatka();

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })));
    klatka();
    expect(ostatni()).toMatchObject({ left: false, right: true });

    act(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' })));
    klatka();
    expect(ostatni()).toMatchObject({ right: false });
  });

  it('strzałka w górę to mini-klapka', async () => {
    const mod = await import('./PinballApp');
    render(<mod.PinballApp />);
    klatka();

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' })));
    klatka();
    expect(ostatni()).toMatchObject({ mini: true, left: false, right: false });

    act(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp' })));
    klatka();
    expect(ostatni()).toMatchObject({ mini: false });
  });

  it('guzik mini-klapki trzyma ją tak długo, jak palec', async () => {
    const mod = await import('./PinballApp');
    render(<mod.PinballApp />);
    klatka();
    const guzik = screen.getByTestId('pinball-mini');

    fireEvent.pointerDown(guzik);
    klatka();
    expect(ostatni()).toMatchObject({ mini: true });

    fireEvent.pointerUp(guzik);
    klatka();
    expect(ostatni()).toMatchObject({ mini: false });
  });

  it('guziki klapek główne nie mylą stron', async () => {
    const mod = await import('./PinballApp');
    render(<mod.PinballApp />);
    klatka();

    fireEvent.pointerDown(screen.getByTestId('pinball-prawa'));
    klatka();
    expect(ostatni()).toMatchObject({ left: false, right: true, mini: false });
    fireEvent.pointerUp(screen.getByTestId('pinball-prawa'));

    fireEvent.pointerDown(screen.getByTestId('pinball-lewa'));
    klatka();
    expect(ostatni()).toMatchObject({ left: true, right: false });
  });
});
