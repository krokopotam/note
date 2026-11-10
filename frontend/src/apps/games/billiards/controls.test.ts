import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTROLS,
  dragEffect,
  fitScale,
  formatControls,
  loadControls,
  parseControls,
  saveControls,
  strikesOnRelease,
  viewRotation,
} from './controls';

/** Podróbka localStorage: bez niej testy zależałyby od przeglądarki. */
const store = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    dump: data,
  };
};

describe('ustawienia sterowania', () => {
  it('bez zapisanego niczego zaczyna po swojemu', () => {
    expect(parseControls(null)).toEqual(DEFAULT_CONTROLS);
    expect(loadControls(store())).toEqual(DEFAULT_CONTROLS);
  });

  it('pamięta wybrany tryb między wejściami', () => {
    const box = store();
    saveControls({ aim: 'table', trigger: 'button' }, box);

    expect(loadControls(box)).toEqual({ aim: 'table', trigger: 'button' });
  });

  it('nie ufa śmieciom w pamięci', () => {
    expect(parseControls('{ to nie jest dziennik')).toEqual(DEFAULT_CONTROLS);
    expect(parseControls('{"aim":"spodek","trigger":"noga"}')).toEqual(DEFAULT_CONTROLS);
    expect(parseControls('{"aim":"table"}')).toEqual({ aim: 'table', trigger: 'pull' });
  });

  it('przeżywa skrzynkę, która nie pozwala pisać', () => {
    const broken = {
      getItem: () => {
        throw new Error('brak dostępu');
      },
      setItem: () => {
        throw new Error('brak dostępu');
      },
    };

    expect(loadControls(broken)).toEqual(DEFAULT_CONTROLS);
    expect(() => saveControls(DEFAULT_CONTROLS, broken)).not.toThrow();
  });

  it('zapisuje tylko to, co trzeba', () => {
    expect(JSON.parse(formatControls({ aim: 'table', trigger: 'pull' }))).toEqual({
      aim: 'table',
      trigger: 'pull',
    });
  });
});

describe('pociągnięcie', () => {
  it('wzdłuż kija ładuje siłę od zera do jedynki', () => {
    const start = { x: 100, y: 100 };

    expect(dragEffect(start, { x: 105, y: 100 }, 'cue').power).toBe(0); // drgnienie ręki
    expect(dragEffect(start, { x: 112, y: 100 }, 'cue').power).toBeCloseTo(0, 6);
    expect(dragEffect(start, { x: 212, y: 100 }, 'cue').power).toBeCloseTo(0.5, 2);
    expect(dragEffect(start, { x: 100 + 300, y: 100 }, 'cue').power).toBe(1);
  });

  it('przy obrocie stołem w bok kręci, a w dół ładuje', () => {
    const start = { x: 200, y: 100 };

    const turn = dragEffect(start, { x: 250, y: 100 }, 'table');
    expect(turn.aimDelta).toBeGreaterThan(0);
    expect(turn.power).toBe(0);

    const pull = dragEffect(start, { x: 200, y: 212 }, 'table');
    expect(pull.aimDelta).toBe(0);
    expect(pull.power).toBeCloseTo(0.5, 2);

    // Cofnięcie kuli nie daje ujemnej siły.
    expect(dragEffect(start, { x: 200, y: 20 }, 'table').power).toBe(0);
  });

  it('obrót w drugą stronę jest w drugą stronę', () => {
    const start = { x: 200, y: 100 };

    expect(dragEffect(start, { x: 150, y: 100 }, 'table').aimDelta).toBeLessThan(0);
  });
});

describe('uderzenie', () => {
  it('puszczenie palca odpala tylko przy „pociągnięciu”', () => {
    expect(strikesOnRelease('pull')).toBe(true);
    expect(strikesOnRelease('button')).toBe(false);
  });

  it('stół obraca się tak, żeby kij patrzył w górę ekranu', () => {
    // Kierunek 0 (w prawo) ma zostać obrócony o -90 stopni, czyli w górę.
    expect(viewRotation(0)).toBeCloseTo(-90, 6);
    expect(viewRotation(Math.PI / 2)).toBeCloseTo(-180, 6);
  });

  it('obrócony stół kurczy się tak, żeby cały został w kadrze', () => {
    // Prosto: bez zmiany rozmiaru.
    expect(fitScale(0, 238, 128)).toBeCloseTo(1, 6);
    expect(fitScale(360, 238, 128)).toBeCloseTo(1, 6);
    // O obrót: długa krawędź staje się pionowa, więc mieści się niższa.
    expect(fitScale(-90, 238, 128)).toBeCloseTo(128 / 238, 6);
    // Ukośnie: mieszczący Skalnik musi być mniejszy niż przy prostym.
    expect(fitScale(45, 238, 128)).toBeLessThan(1);
    // Odbicie w dół i obrót o pół obrotu to to samo.
    expect(fitScale(90, 238, 128)).toBeCloseTo(fitScale(-90, 238, 128), 6);
  });

  it('obrócony stół w pionowym kadrze mieści się bez kurczenia', () => {
    // Kadr odwrócony razem ze stołem: 146 × 238 dla stołu 238 × 128.
    expect(fitScale(-90, 238, 128, 146, 238)).toBeCloseTo(1, 6);
    expect(fitScale(90, 238, 128, 146, 238)).toBeCloseTo(1, 6);
    // Ukośnie dalej trzeba przymknąć.
    expect(fitScale(45, 238, 128, 146, 238)).toBeLessThan(0.6);
});
});
