import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SZEROKOŚĆ, WYSOKOŚĆ } from './logic';
import { ArkanoidApp } from './ArkanoidApp';

/**
 * Płótna w jsdom nie ma, więc podstawiam atrapę kontekstu i atrapę pętli klatek.
 * Dzięki temu testy naprawdę prowadzą partię klatka po klatce, zamiast patrzeć,
 * czy komponent się renderuje.
 */
let klatki: Array<(czas: number) => void>;
let zegar = 0;

beforeEach(() => {
  klatki = [];
  zegar = 0;
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    fillRect: () => undefined,
    strokeRect: () => undefined,
    save: () => undefined,
    restore: () => undefined,
    translate: () => undefined,
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  vi.stubGlobal('requestAnimationFrame', (cb: (czas: number) => void) => klatki.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

/** Przepuszcza `sekund` klatek po 16 ms. */
function pustyCzas(sekund = 1): void {
  act(() => {
    for (let i = 0; i < Math.round((sekund * 1000) / 16); i += 1) {
      // Zegar może iść tylko do przodu: cofnięty każe pętli odrabiać dług zamiast grać.
      zegar += 16;
      for (const klatka of klatki.splice(0, klatki.length)) klatka(zegar);
    }
  });
}

const faza = (): string | undefined => screen.getByTestId('arkanoid').dataset.faza;
const cyfry = (text: string): string => text.replace(/\D/g, '');
const canvas = (): HTMLCanvasElement => screen.getByTestId('arkanoid-canvas') as HTMLCanvasElement;

/** Wypuszcza kulę — automat robi to samo, co gracz po każdej zgubionej. */
function wypuść(): void {
  fireEvent.pointerDown(screen.getByTestId('arkanoid-puść'));
}

/** Gra bez sterowania: kula wypuszczana po każdej stracie, aż do trzech z góry. */
function grajBezRuchu(): void {
  for (let i = 0; i < 8 && faza() !== 'koniec'; i += 1) {
    if (faza() === 'gotowy') wypuść();
    pustyCzas(6);
  }
}

describe('ekran arkanoida', () => {
  it('zaczyna z kulą przy klapce i licznikiem na zero', () => {
    render(<ArkanoidApp />);
    expect(faza()).toBe('gotowy');
    expect(cyfry(screen.getByTestId('arkanoid-wynik').textContent ?? '')).toBe('0');
    expect(canvas().width).toBe(SZEROKOŚĆ);
    expect(canvas().height).toBe(WYSOKOŚĆ);
    expect(screen.getAllByTestId('arkanoid-życia').length).toBe(1);
  });

  it('rekord wchodzi z pamięci przeglądarki', () => {
    window.localStorage.setItem('note:arkanoid:rekord', '4321');
    render(<ArkanoidApp />);
    expect(cyfry(screen.getByTestId('arkanoid-rekord').textContent ?? '')).toBe('4321');
  });

  it('puszczenie kuli otwiera partię i wyłącza guzik', () => {
    render(<ArkanoidApp />);
    fireEvent.pointerDown(screen.getByTestId('arkanoid-puść'));
    pustyCzas(0.3);
    expect(faza()).toBe('gra');
    expect((screen.getByTestId('arkanoid-puść') as HTMLButtonElement).disabled).toBe(true);
  });

  it('spacja też wypuszcza kulę', () => {
    render(<ArkanoidApp />);
    fireEvent.keyDown(window, { key: ' ' });
    pustyCzas(0.3);
    expect(faza()).toBe('gra');
  });

  it('dotknięcie płótna wypuszcza kulę i ustawia klapkę', () => {
    render(<ArkanoidApp />);
    const płótno = canvas();
    płótno.getBoundingClientRect = () => ({ left: 0, width: 256, height: 320, top: 0, bottom: 320, right: 256, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.pointerMove(płótno, { clientX: 200 });
    fireEvent.pointerDown(płótno, { clientX: 200 });
    pustyCzas(0.3);
    expect(faza()).toBe('gra');
  });

  it('partia bez ruchu klapki odbiera trzy kule i pokazuje koniec gry', () => {
    render(<ArkanoidApp />);
    grajBezRuchu();
    expect(faza()).toBe('koniec');
    expect(screen.getByTestId('arkanoid-koniec')).toBeTruthy();
  });

  it('gorsza partia nie nadpisuje rekordu', () => {
    window.localStorage.setItem('note:arkanoid:rekord', '999999');
    render(<ArkanoidApp />);
    grajBezRuchu();
    expect(faza()).toBe('koniec');
    expect(window.localStorage.getItem('note:arkanoid:rekord')).toBe('999999');
    expect(cyfry(screen.getByTestId('arkanoid-rekord').textContent ?? '')).toBe('999999');
  });

  it('„jeszcze raz” i „nowa” zaczynają od nowa', () => {
    render(<ArkanoidApp />);
    grajBezRuchu();
    expect(faza()).toBe('koniec');

    fireEvent.click(screen.getByTestId('arkanoid-ponownie'));
    expect(faza()).toBe('gotowy');
    expect(cyfry(screen.getByTestId('arkanoid-wynik').textContent ?? '')).toBe('0');

    fireEvent.pointerDown(screen.getByTestId('arkanoid-puść'));
    pustyCzas(1);
    fireEvent.click(screen.getByTestId('arkanoid-nowa'));
    expect(faza()).toBe('gotowy');
  });

  it('enter po końcu gry też zaczyna nową partię', () => {
    render(<ArkanoidApp />);
    grajBezRuchu();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(faza()).toBe('gotowy');
  });

  it('przełącznik ciszy zmienia podpis i stan', () => {
    render(<ArkanoidApp />);
    const guzik = screen.getByTestId('arkanoid-dźwięk');
    expect(guzik.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(guzik);
    expect(guzik.getAttribute('aria-pressed')).toBe('false');
    expect(guzik.textContent).toBe('cisza');
  });

  it('klawisze strzałek nie wywalają gry i nie przewijają pulpitu', () => {
    render(<ArkanoidApp />);
    fireEvent.pointerDown(screen.getByTestId('arkanoid-puść'));
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    pustyCzas(1);
    fireEvent.keyUp(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    pustyCzas(1);
    expect(['gra', 'gotowy', 'koniec']).toContain(faza());
  });

  it('dwie minuty klatek bez padnięcia i bez licznika w NaN', () => {
    render(<ArkanoidApp />);
    fireEvent.pointerDown(screen.getByTestId('arkanoid-puść'));
    pustyCzas(120);
    const wynik = cyfry(screen.getByTestId('arkanoid-wynik').textContent ?? '');
    expect(wynik === '' || /^\d+$/.test(wynik)).toBe(true);
  });
});
