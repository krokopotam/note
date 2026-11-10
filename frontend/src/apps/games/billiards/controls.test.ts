import { describe, expect, it } from 'vitest';
import {
  AIM_MODES,
  ZOOM,
  DEFAULT_CAMERA,
  DEFAULT_CONTROLS,
  aimingActive,
  afterAimTap,
  clamp,
  DISTANCE,
  dragEffect,
  formatControls,
  loadControls,
  parseControls,
  saveControls,
  strikesOnRelease,
  TILT,
  screenToTable,
  turnedBox,
  viewDrag,
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

describe('pociągnięcie palca', () => {
  const start = { x: 200, y: 100 };

  it('w bok kręci, w dół nabiera siły', () => {
    const turn = dragEffect(start, { x: 250, y: 100 });
    expect(turn.spin).toBeGreaterThan(0);
    expect(turn.power).toBe(0);

    const pull = dragEffect(start, { x: 200, y: 212 });
    expect(pull.spin).toBe(0);
    expect(pull.power).toBeCloseTo(0.5, 2);

    // Ukośnie: jedno i drugie naraz, więc kij słucha palca płynnie.
    const diagonal = dragEffect(start, { x: 250, y: 312 });
    expect(diagonal.spin).toBeGreaterThan(0);
    expect(diagonal.power).toBe(1);
  });

  it('drgnięcie ręki nie jest naciągnięciem kija', () => {
    expect(dragEffect(start, { x: 204, y: 104 }).power).toBe(0);
    expect(dragEffect(start, { x: 200, y: 312 }).power).toBe(1);
  });

  it('pchnięcie od gracza nie daje ujemnej siły', () => {
    expect(dragEffect(start, { x: 200, y: 20 }).power).toBe(0);
  });

  it('kręci w obie strony', () => {
    expect(dragEffect(start, { x: 250, y: 100 }).spin).toBeGreaterThan(0);
    expect(dragEffect(start, { x: 150, y: 100 }).spin).toBeLessThan(0);
  });
});

describe('ustawianie widoku', () => {
  const start = { x: 300, y: 300 };

  it('w bok obraca, w górę i w dół podnosi albo przybliża', () => {
    const orbit = viewDrag(start, { x: 360, y: 300 });
    expect(orbit.spin).toBeGreaterThan(0);
    expect(orbit.lift).toBe(0);

    expect(viewDrag(start, { x: 300, y: 250 }).lift).toBeLessThan(0);
    expect(viewDrag(start, { x: 300, y: 350 }).lift).toBeGreaterThan(0);
  });

  it('celowanie prze przejmuje kadr, nie wyrzuca go', () => {
    // Po ustawieniu widoku tapnięcie w celowanie zamraża kamerę (»,własny«).
    expect(afterAimTap('free')).toBe('placed');
    // Auto i własny zostają tym, czym były.
    expect(afterAimTap('auto')).toBe('auto');
    expect(afterAimTap('placed')).toBe('placed');
    expect(DEFAULT_CAMERA).toBe('auto');
  });

  it('przy swobodnym widoku kij śpi', () => {
    expect(aimingActive('free')).toBe(false);
    expect(aimingActive('placed')).toBe(true);
    expect(aimingActive('auto')).toBe(true);
  });

  it('granice kamery trzymają się kupy', () => {
    expect(clamp(0, TILT.min, TILT.max)).toBe(TILT.min);
    expect(clamp(99, TILT.min, TILT.max)).toBe(TILT.max);
    expect(clamp(0.5, TILT.min, TILT.max)).toBe(0.5);
    // Baza mieści się w zakresie — inaczej pierwszy kadr byłby ścianą.
    expect(TILT.base).toBeGreaterThan(TILT.min);
    expect(TILT.base).toBeLessThan(TILT.max);
    expect(DISTANCE.base).toBeGreaterThan(DISTANCE.min);
    expect(DISTANCE.base).toBeLessThan(DISTANCE.max);
  });

  it('tryby mają polskie podpiski', () => {
    expect(AIM_MODES.map((mode) => mode.label)).toEqual(['Kij', 'Stół']);
  });

  it('zoom trzyma się widełek', () => {
    expect(clamp(9, ZOOM.min, ZOOM.max)).toBe(ZOOM.max);
    expect(clamp(0.01, ZOOM.min, ZOOM.max)).toBe(ZOOM.min);
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
});

describe('kadr 2D', () => {
  it('pudełko rośnie razem z obrotem stołu', () => {
    const straight = turnedBox(238, 128, 0);
    expect(straight.width).toBeCloseTo(238 * 1.04, 6);
    expect(straight.height).toBeCloseTo(128 * 1.04, 6);

    // O obrót: box jest wysoki, więc telefon w pionie dostaje cały stół.
    const turned = turnedBox(238, 128, -90);
    expect(turned.width).toBeCloseTo(straight.height, 6);
    expect(turned.height).toBeCloseTo(straight.width, 6);
    // Pudełko jest zawsze wyśrodkowane na origem.
    expect(straight.x).toBeCloseTo(-straight.width / 2, 6);
    expect(straight.y).toBeCloseTo(-straight.height / 2, 6);
  });

  it('palec wraca na stół bez obrotu i zoomu', () => {
    const box = turnedBox(200, 100, 0, 1);
    const screen = { left: 0, top: 0, width: 400, height: 200 };
    const centre = { x: 110, y: 55 };

    // Środek ekranu to środek stołu.
    expect(screenToTable({ x: 200, y: 100 }, screen, { box, angle: 0, zoom: 1, centre })).toEqual(centre);
    // Prawa krawędź ekranu: +100 w jednostkach stołu od środka.
    expect(screenToTable({ x: 400, y: 100 }, screen, { box, angle: 0, zoom: 1, centre })).toEqual({
      x: 210,
      y: 55,
    });
  });

  it('obrócony i przybliżony kadr nie myli palca', () => {
    const box = turnedBox(200, 100, 90, 1);
    const screen = { left: 0, top: 0, width: 200, height: 400 };
    const centre = { x: 100, y: 50 };

    // Kadr obrócony o +90 stopni: to, co na stole w prawo, ląduje na ekranie w dół.
    // Żeby więc palec po prawej znów trafił w to samo, musi wskoczyć nad środek.
    const right = screenToTable({ x: 150, y: 200 }, screen, { box, angle: 90, zoom: 1, centre });
    expect(right.x).toBeCloseTo(centre.x, 6);
    expect(right.y).toBeLessThan(centre.y);
    expect(centre.y - right.y).toBeCloseTo(25, 6);

    // Dwukrotny zoom: ten sam palec znaczy połowę drogi od środka stołu.
    const near = screenToTable({ x: 150, y: 200 }, screen, { box, angle: 90, zoom: 2, centre });
    expect(centre.y - near.y).toBeCloseTo((centre.y - right.y) / 2, 6);
  });

  it('ekran bez rozmiaru nie dzieli przez zero', () => {
    const box = turnedBox(200, 100, 0, 1);
    const centre = { x: 10, y: 20 };

    expect(
      screenToTable({ x: 5, y: 5 }, { left: 0, top: 0, width: 0, height: 0 }, { box, angle: 0, zoom: 1, centre }),
    ).toEqual(centre);
  });
});
