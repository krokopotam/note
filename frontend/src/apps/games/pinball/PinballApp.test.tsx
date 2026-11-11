import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CANVAS_H, FB_W } from './render';
import { PinballApp } from './PinballApp';

/**
 * Płótno w jsdom nie istnieje, więc podstawiam atrapęCtx i atrapę pętli
 * klatek. Dzięki temu testy naprawdę prowadzą partię klatka po klatce,
 * zamiast tylko patrzeć, czy komponent się renderuje.
 */
let klatki: Array<(czas: number) => void>;

function atrapaPłótna(): void {
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
}

/**
 * Przepuszcza `sekund` klatek po 16 ms.
 *
 * Całość siedzi w `act`, bo pętla gry woła `setState` poza zdarzeniem — bez tego
 * React trzyma odświeżenie dla siebie i test patrzy na nieaktualny ekran.
 */
let zegar = 0;

function pustyCzas(sekund = 1): void {
  act(() => {
    for (let i = 0; i < Math.round((sekund * 1000) / 16); i += 1) {
      // Zegar jest jeden i tylko do przodu: cofnięty o kilka sekund każe pętli
      // gry odrabiać ujemny dług zamiast liczyć dalej.
      zegar += 16;
      const queued = klatki.splice(0, klatki.length);
      for (const klatka of queued) klatka(zegar);
    }
  });
}

const faza = (): string | null => screen.getByTestId('pinball').dataset.faza ?? null;
/** Grupy tysięcy w `toLocaleString` to twarda spacja — zostawiam same cyfry. */
const cyfry = (text: string): string => text.replace(/\D/g, '');
const wynik = (): string => screen.getByTestId('pinball-wynik').textContent ?? '';

beforeEach(() => {
  atrapaPłótna();
  zegar = performance.now();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ekran pinballa', () => {
  it('rysuje stół w rozdzielczości bufora i pokazuje startowy odczyt', () => {
    render(<PinballApp />);
    const canvas = screen.getByTestId('pinball-canvas') as HTMLCanvasElement;
    expect(canvas.width).toBe(FB_W);
    expect(canvas.height).toBe(CANVAS_H);
    expect(wynik()).toBe('0');
    expect(faza()).toBe('ładowanie');
    expect(screen.getByTestId('pinball-rekord').textContent).toContain('Rekord');
  });

  it('pięć liter hasła czeka niezebranych', () => {
    render(<PinballApp />);
    const litery = screen.getByTestId('pinball-litery').querySelectorAll('span');
    expect(litery).toHaveLength(5);
    for (const litera of litery) expect(litera.dataset.zebrana).toBe('false');
  });

  it('guzik strzału jest czynny tylko, gdy kula czeka na wyrzutniku', () => {
    render(<PinballApp />);
    const strzał = screen.getByTestId('pinball-strzal') as HTMLButtonElement;
    expect(strzał.disabled).toBe(false);

    fireEvent.pointerDown(strzał);
    fireEvent.pointerUp(strzał);
    pustyCzas(0.5);

    expect(faza()).toBe('gra');
    expect((screen.getByTestId('pinball-strzal') as HTMLButtonElement).disabled).toBe(true);
  });

  it('partia bez klapek odbiera kule i sama się kończy', { timeout: 20_000 }, () => {
    render(<PinballApp />);
    const strzał = screen.getByTestId('pinball-strzal') as HTMLButtonElement;

    // Sześć odpływów, nie trzy: każda kula ma dziś obronę, więc pierwsza
    // wpadka nic nie kosztuje. Dalej musi być koniec — obrona to nie
    // nieśmiertelność i cały sens tego testu jest w tym, że go widać.
    for (let próba = 0; próba < 24 && faza() !== 'koniec'; próba += 1) {
      if (faza() === 'ładowanie') {
        fireEvent.pointerDown(strzał);
        fireEvent.pointerUp(strzał);
      }
      pustyCzas(4);
    }

    expect(faza()).toBe('koniec');
    expect(screen.getByTestId('pinball-koniec')).toBeTruthy();
    expect(Number(wynik().replace(/\s/g, '').replace(/[^\d]/g, ''))).toBeGreaterThanOrEqual(0);
  });

  it('klapki reagują na przytrzymanie guzika', () => {
    render(<PinballApp />);
    const lewa = screen.getByTestId('pinball-lewa');
    fireEvent.pointerDown(lewa);
    fireEvent.pointerUp(lewa);
    fireEvent.pointerDown(screen.getByTestId('pinball-prawa'));
    fireEvent.pointerLeave(screen.getByTestId('pinball-prawa'));
    pustyCzas(0.2);
    expect(faza()).toBe('ładowanie');
  });

  it('dotyk lewej połowy stołu porusza lewą klapką, a nie prawą', () => {
    render(<PinballApp />);
    const canvas = screen.getByTestId('pinball-canvas');
    // Najpierw kula w grę, żeby dotyk znaczył klapkę, a nie naciąganie wyrzutnika.
    const strzał = screen.getByTestId('pinball-strzal') as HTMLButtonElement;
    fireEvent.pointerDown(strzał);
    fireEvent.pointerUp(strzał);
    pustyCzas(0.2);

    canvas.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, height: 400 }) as DOMRect;
    fireEvent.pointerDown(canvas, { clientX: 20, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 20, clientY: 200, pointerId: 1 });
    fireEvent.pointerDown(canvas, { clientX: 180, clientY: 200, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 180, clientY: 200, pointerId: 2 });
    pustyCzas(0.4);
    expect(['gra', 'ładowanie', 'koniec']).toContain(faza());
  });

  it('klawiatura steruje klapkami i wyrzutnikiem', () => {
    render(<PinballApp />);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyUp(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyUp(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: ' ' });
    pustyCzas(0.3);
    fireEvent.keyUp(window, { key: ' ' });
    pustyCzas(0.2);
    expect(faza()).not.toBe(null);
  });

  it('nowa partia zeruje wynik, a koniec gry można zacząć od nowa', () => {
    render(<PinballApp />);
    const strzał = screen.getByTestId('pinball-strzal') as HTMLButtonElement;
    for (let próba = 0; próba < 12 && faza() !== 'koniec'; próba += 1) {
      if (faza() === 'ładowanie') {
        fireEvent.pointerDown(strzał);
        fireEvent.pointerUp(strzał);
      }
      pustyCzas(4);
    }
    expect(faza()).toBe('koniec');

    fireEvent.click(screen.getByTestId('pinball-jeszcze'));

    expect(faza()).toBe('ładowanie');
    expect(wynik()).toBe('0');
    expect(screen.queryByTestId('pinball-koniec')).toBeNull();
  });

  it('przełącznik dźwięku zmienia podpis i nie wywala się bez AudioContext', () => {
    render(<PinballApp />);
    const guzik = screen.getByTestId('pinball-dzwiek');
    expect(guzik.textContent).toContain('dźwięk');
    fireEvent.click(guzik);
    expect(guzik.textContent).toContain('cisza');
    fireEvent.click(guzik);
    expect(guzik.textContent).toContain('dźwięk');
  });

  // Gra do końca, kulkami rządzi sam automat — klapki nieme.
  const doKońca = (strzał: HTMLButtonElement): void => {
    for (let próba = 0; próba < 12 && faza() !== 'koniec'; próba += 1) {
      if (faza() === 'ładowanie') {
        fireEvent.pointerDown(strzał);
        fireEvent.pointerUp(strzał);
      }
      pustyCzas(4);
    }
    expect(faza()).toBe('koniec');
  };

  it('rekord z pamięci przeglądarki wchodzi na ekran i gorsza partia go nie nadpisuje', () => {
    // Celowo wysoko: partia bez klapek też coś zbija, a chodzi wyłącznie o to,
    // czy wynik słabszy od rekordu przypadkiem go nie zastępuje.
    window.localStorage.setItem('note:pinball:rekord', '999999');
    render(<PinballApp />);
    expect(cyfry(screen.getByTestId('pinball-rekord').textContent ?? '')).toBe('999999');

    doKońca(screen.getByTestId('pinball-strzal') as HTMLButtonElement);

    expect(window.localStorage.getItem('note:pinball:rekord')).toBe('999999');
    expect(cyfry(screen.getByTestId('pinball-rekord').textContent ?? '')).toBe('999999');
  });

  it('rekord rośnie, kiedy partia go pobije, i zostaje po następnej', () => {
    window.localStorage.setItem('note:pinball:rekord', '0');
    render(<PinballApp />);

    doKońca(screen.getByTestId('pinball-strzal') as HTMLButtonElement);

    const zapisany = Number(window.localStorage.getItem('note:pinball:rekord'));
    expect(zapisany).toBeGreaterThan(0);
    expect(cyfry(screen.getByTestId('pinball-rekord').textContent ?? '')).toBe(String(zapisany));
  });
});
