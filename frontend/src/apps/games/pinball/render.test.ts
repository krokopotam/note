import { describe, expect, it } from 'vitest';
import { vec } from './geometry';
import { createWorld, spawnBall } from './physics';
import type { World } from './physics';
import { buildTable } from './table';
import { startGame } from './rules';
import type { Rules } from './rules';
import {
  Buf,
  FB_H,
  FB_W,
  PAL,
  CANVAS_H,
  DMD_H,
  LED_Y,
  blit,
  createPlastic,
  WIERSZ_MAX,
  dmdText,
  zmieść,
  ledText,
  paint,
  paintDmd,
  compose,
  rgba,
  setPlastic,
  text,
  textCentered,
} from './render';
import type { DmdView, Frame } from './render';

const kanal = (buf: Buf, x: number, y: number): [number, number, number] => {
  const color = buf.px[y * buf.w + x];
  return [color & 255, (color >> 8) & 255, (color >> 16) & 255];
};
const jasny = (buf: Buf, x: number, y: number): number => {
  const [r, g, b] = kanal(buf, x, y);
  return r + g + b;
};

const empty = (): Frame => ({
  world: createWorld([]),
  rules: startGame(),
  glow: {},
  floats: [],
  sparks: [],
  rings: [],
  balls: [],
  plunger: 0,
  loaded: false,
  time: 0,
  shake: { x: 0, y: 0 },
  bankDown: 0,
});

describe('pakowanie pikseli', () => {
  it('rgba układa kanały tak, jak ich chce ImageData', () => {
    // Little-endian: w słowa wchodzą od B do A.
    expect(rgba(1, 2, 3, 4) >>> 0).toBe(((4 << 24) | (3 << 16) | (2 << 8) | 1) >>> 0);
  });

  it('set nie wychodzi poza bufor', () => {
    const buf = new Buf(4, 4);
    buf.clear(PAL.noc);
    buf.set(-1, 0, PAL.biel);
    buf.set(0, 9, PAL.biel);
    buf.set(2, 2, PAL.biel);
    expect(buf.px[0]).toBe(PAL.noc);
    expect(kanal(buf, 2, 2)).toEqual([238, 232, 255]);
  });

  it('blend z pełną alphą nadpisuje, zerowa nic nie robi', () => {
    const buf = new Buf(4, 4);
    buf.clear(PAL.noc);
    const before = buf.px[0];
    buf.blend(1, 1, PAL.czerwony, 0);
    expect(buf.px[5]).toBe(before);
    buf.blend(1, 1, PAL.czerwony, 255);
    expect(buf.px[5]).toBe(PAL.czerwony);
  });

  it('blend po połowie kładzie kolor pomiędzy', () => {
    const buf = new Buf(4, 4);
    buf.clear(rgba(0, 0, 0, 255));
    buf.blend(1, 1, rgba(200, 200, 200, 255), 128);
    const [r] = kanal(buf, 1, 1);
    expect(r).toBeGreaterThan(80);
    expect(r).toBeLessThan(140);
  });

  it('tarcza wypełnia środek i nie sięga narożników', () => {
    const buf = new Buf(16, 16);
    buf.clear(PAL.noc);
    buf.disc(8, 8, 4, PAL.biel);
    expect(jasny(buf, 8, 8)).toBeGreaterThan(jasny(buf, 4, 4));
    expect(jasny(buf, 4, 4)).toBe(jasny(new Buf(16, 16).clear(PAL.noc), 4, 4));
  });

  it('poświata gaśnie wraz z odległością', () => {
    const buf = new Buf(32, 32);
    buf.clear(PAL.noc);
    buf.glow(16, 16, 12, PAL.biel, 200);
    expect(jasny(buf, 16, 16)).toBeGreaterThan(jasny(buf, 16, 24));
    expect(jasny(buf, 16, 24)).toBeGreaterThan(jasny(buf, 16, 31));
  });

  it('pierscień nie rysuje niczego w środku', () => {
    const buf = new Buf(16, 16);
    buf.clear(PAL.noc);
    buf.ring(8, 8, 5, 2, PAL.biel, 255);
    const empty = new Buf(16, 16).clear(PAL.noc);
    expect(jasny(buf, 8, 8)).toBe(jasny(empty, 8, 8));
    expect(jasny(buf, 8, 3)).toBeGreaterThan(jasny(empty, 8, 3));
  });
});

describe('stopka 5 × 7', () => {
  it('zamienia ogonki na to, co zmieści się na matrycy', () => {
    expect(dmdText('Gorączka')).toBe('GORACZKA');
    expect(dmdText('mnożnik ×6')).toBe('MNOZNIK ×6');
  });

  it('rysuje literę w oczekiwanych pikselach i zwraca postęp', () => {
    const buf = new Buf(32, 16);
    buf.clear(PAL.noc);
    const end = text(buf, 'A', 2, 2, PAL.biel);
    expect(end).toBe(2 + 6);
    // Pierwszy rząd litery A to `.###.` — więc kolumna 2 pusta, 3 i 4 zapełnione.
    expect(jasny(buf, 2, 2)).toBe(jasny(new Buf(32, 16).clear(PAL.noc), 2, 2));
    expect(jasny(buf, 3, 2)).toBeGreaterThan(200);
    expect(jasny(buf, 5, 2)).toBeGreaterThan(200);
    // Nogawki ostatniego rzędu.
    expect(jasny(buf, 2, 8)).toBeGreaterThan(200);
    expect(jasny(buf, 6, 8)).toBeGreaterThan(200);
  });

  it('nieznany znak nie wywodzi rysownika z równowagi', () => {
    const buf = new Buf(16, 16);
    buf.clear(PAL.noc);
    expect(() => text(buf, '‽', 1, 1, PAL.biel)).not.toThrow();
  });

  it('wyśrodkowany tekst stoi w środku, nie na lewo', () => {
    const buf = new Buf(64, 16);
    buf.clear(PAL.noc);
    textCentered(buf, 'OK', 8, PAL.biel);
    let left = 64;
    let right = -1;
    const empty = new Buf(64, 16).clear(PAL.noc);
    for (let x = 0; x < 64; x += 1) {
      if (jasny(buf, x, 8) > jasny(empty, x, 8)) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    expect(right).toBeGreaterThan(left);
    expect(Math.abs((left + right) / 2 - 32)).toBeLessThanOrEqual(2);
  });
});

describe('wydruk stołu', () => {
  it('jest zawsze taki sam — piecze się od geometrii, nie od zegara', () => {
    const a = createPlastic(buildTable());
    const b = createPlastic(buildTable());
    expect(Array.from(a.px)).toEqual(Array.from(b.px));
  });

  it('nie jest pusty i nie jest jednolity', () => {
    const plastic = createPlastic(buildTable());
    const seen = new Set<number>();
    for (let i = 0; i < plastic.px.length; i += 997) seen.add(plastic.px[i]);
    expect(seen.size).toBeGreaterThan(20);
  });

  it('poświata trzyma się tam, gdzie stoją reflektory', () => {
    const plastic = createPlastic(buildTable());
    expect(jasny(plastic, 128, 150)).toBeGreaterThan(jasny(plastic, 128, 470));
  });
});

describe('malowanie klatki', () => {
  setPlastic(buildTable());

  const frameWith = (over: Partial<Frame> = {}): Frame => ({ ...empty(), ...over });

  const worldWith = (): World => {
    const world = createWorld(buildTable());
    spawnBall(world, vec(128, 200), vec(0, 0));
    return world;
  };

  it('kula zostawia jasny korpus i cień pod sobą', () => {
    const plain = new Buf();
    paint(plain, frameWith({ world: worldWith() }));
    const withBall = new Buf();
    paint(withBall, frameWith({
      world: worldWith(),
      balls: [{ x: 128, y: 200, trail: [] }],
    }));
    // Odblask na kuli musi być jaśniejszy od tła, cień — ciemniejszy.
    expect(jasny(withBall, 126, 198)).toBeGreaterThan(jasny(plain, 126, 198));
    expect(jasny(withBall, 131, 205)).toBeLessThan(jasny(plain, 131, 205));
  });

  it('zbijak w blasku jest jaśniejszy niż w spoczynku', () => {
    const calm = new Buf();
    paint(calm, frameWith({ world: worldWith() }));
    const hot = new Buf();
    paint(hot, frameWith({ world: worldWith(), glow: { 'zbijak.1': 1 } }));
    expect(jasny(hot, 100, 152)).toBeGreaterThan(jasny(calm, 100, 152));
  });

  it('tryb koloruje cały stół', () => {
    const calm = new Buf();
    paint(calm, frameWith({ world: worldWith() }));
    const fever = new Buf();
    const rules: Rules = { ...startGame(), mode: 'gorączka', modeTime: 5 };
    paint(fever, frameWith({ world: worldWith(), rules, time: 0.17 }));
    const [rCalm, , bCalm] = kanal(calm, 20, 468);
    const [rFever, , bFever] = kanal(fever, 20, 468);
    expect(rFever).toBeGreaterThan(rCalm);
    expect(bFever).toBeLessThanOrEqual(bCalm + 8);
  });

  it('wstrząs przesuwa wydruk', () => {
    const still = new Buf();
    paint(still, frameWith({ world: worldWith() }));
    const shaken = new Buf();
    paint(shaken, frameWith({ world: worldWith(), shake: { x: 0, y: 12 } }));
    // Porównuję dwa wiersze tego samego bufora: wstrząśnięty musi mieć ruch.
    expect(jasny(shaken, 128, 200)).not.toBe(jasny(still, 128, 200));
  });

  it('napis punktowanych jest czytelny, bo zajmuje piksele', () => {
    const plain = new Buf();
    paint(plain, frameWith({ world: worldWith() }));
    const withFloat = new Buf();
    paint(withFloat, frameWith({
      world: worldWith(),
      floats: [{ text: '+100', x: 60, y: 300, age: 0, tone: 'zwykły' }],
    }));
    let różnica = 0;
    for (let y = 292; y < 312; y += 1) {
      for (let x = 48; x < 84; x += 1) if (withFloat.px[y * FB_W + x] !== plain.px[y * FB_W + x]) różnica += 1;
    }
    expect(różnica).toBeGreaterThan(30);
  });

  it('gaśnięcie efektu po starzeniu nie dopisuje niczego', () => {
    const młody = new Buf();
    paint(młody, frameWith({ sparks: [{ x: 100, y: 200, vx: 0, vy: 0, age: 0, color: PAL.żółty }] }));
    const stary = new Buf();
    paint(stary, frameWith({ sparks: [{ x: 100, y: 200, vx: 0, vy: 0, age: 1, color: PAL.żółty }] }));
    expect(jasny(młody, 100, 200)).toBeGreaterThan(jasny(stary, 100, 200));
  });

  it('zaproszenie do strzału majaczy w torze wyrzutnika', () => {
    const pusty = new Buf();
    paint(pusty, frameWith({ loaded: false, time: 0 }));
    const zaproszenie = new Buf();
    paint(zaproszenie, frameWith({ loaded: true, time: 0 }));
    expect(zaproszenie.px).not.toEqual(pusty.px);
  });

  it('malowanie nie zmienia świata ani zasad', () => {
    const world = worldWith();
    const rules = startGame();
    const przed = JSON.stringify({ balls: world.balls, rules });
    const buf = new Buf();
    paint(buf, frameWith({ world, rules, balls: [{ x: 128, y: 200, trail: [{ x: 127, y: 190 }] }] }));
    expect(JSON.stringify({ balls: world.balls, rules })).toBe(przed);
  });

  it('każda klatka kończy się pełnym buforem, bez dziur', () => {
    const buf = new Buf();
    paint(buf, frameWith({ world: worldWith() }));
    for (let i = 0; i < buf.px.length; i += 4013) {
      const [, , , a] = [0, 0, 0, (buf.px[i] >> 24) & 255];
      expect(a).toBe(255);
    }
  });

  it('rozmiar klatki to rozmiar bufora', () => {
    expect(FB_W).toBe(256);
    expect(FB_H).toBe(512);
  });
});

describe('matryca DMD', () => {
  const widok = (over: Partial<DmdView> = {}): DmdView => ({
    score: 0,
    line2: 'WRZUC KULE',
    line3: 'KULE 3  x1',
    ballsLeft: 3,
    multiplier: 1,
    letters: [],
    jackpotLit: false,
    mode: null,
    over: false,
    ...over,
  });

  it('między diodami zostaje luka — inaczej to nie LED', () => {
    const buf = new Buf(FB_W, DMD_H);
    ledText(buf, 'A', 8, 8, PAL.żółty);
    // Wiersz litery A to `.###.`: pierwsza kolumna ciemna, druga świeci, a potem przerwa.
    expect(jasny(buf, 8, 8)).toBe(0);
    expect(jasny(buf, 11, 8)).toBeGreaterThan(200);
    expect(jasny(buf, 13, 8)).toBe(0);
  });

  it('wynik stoi po prawej i ma ciemne zera z przodu', () => {
    const zero = new Buf(FB_W, DMD_H);
    paintDmd(zero, widok({ score: 0 }), 0);
    const duzy = new Buf(FB_W, DMD_H);
    paintDmd(duzy, widok({ score: 1234 }), 0);

    // Prawa strona musi się różnić, lewa przy małej liczbie — nie.
    let prawyRuch = 0;
    for (let y = LED_Y; y < LED_Y + 21; y += 1) {
      for (let x = 150; x < FB_W; x += 1) if (duzy.px[y * FB_W + x] !== zero.px[y * FB_W + x]) prawyRuch += 1;
    }
    expect(prawyRuch).toBeGreaterThan(20);
  });

  it('tryb multiball barwi matrycę na czerwono', () => {
    const zwyczajna = new Buf(FB_W, DMD_H);
    paintDmd(zwyczajna, widok({ line2: 'SERIA 5' }), 0);
    const multi = new Buf(FB_W, DMD_H);
    paintDmd(multi, widok({ line2: 'MULTIBALL!', mode: 'multiball' }), 0);
    expect(multi.px).not.toEqual(zwyczajna.px);
  });

  it('najdłuższy status mieści się w matrycy', () => {
    // «ZBIERAJ JACKPOT» to najdłuższe zdanie, jakie automat wypisuje w środkowym
    // wierszu. Za szeroko rozstawione znaki wyrzucają ostatnią literę za ramkę i
    // na ekranie zostaje «ZBIERAJ JACKPO».
    const pusty = new Buf(FB_W, DMD_H);
    paintDmd(pusty, widok({ line2: '' }), 0);
    const buf = new Buf(FB_W, DMD_H);
    paintDmd(buf, widok({ line2: 'ZBIERAJ JACKPOT' }), 0);
    // Osiem kolumn przy prawej krawędzi musi zostać nietknięte — światło matrycy
    // kończy się przed ramką, a nie pod nią.
    for (let y = LED_Y; y < LED_Y + 65; y += 1) {
      for (let x = FB_W - 8; x < FB_W; x += 1) expect(buf.px[y * FB_W + x]).toBe(pusty.px[y * FB_W + x]);
    }
  });

  it('dłuższy niż matryca napis dostaje kropkę, nie urwaną literę', () => {
    expect(zmieść('ZA DLUGI NAPIS NA MATRYCE').length).toBe(WIERSZ_MAX);
    expect(zmieść('ZA DLUGI NAPIS NA MATRYCE').endsWith('.')).toBe(true);
    expect(zmieść('GORĄCZKA')).toBe('GORACZKA');
  });

  it('koniec gry mówi to wprost', () => {
    const buf = new Buf(FB_W, DMD_H);
    paintDmd(buf, widok({ over: true, line2: 'COCHCESZ' }), 0);
    let zapalone = 0;
    for (let y = LED_Y + 22; y < LED_Y + 43; y += 1) {
      for (let x = 8; x < FB_W - 8; x += 1) if (jasny(buf, x, y) > 100) zapalone += 1;
    }
    expect(zapalone).toBeGreaterThan(40);
  });
});

describe('składanie płótna', () => {
  it('matryca jest nad stołem, a nie pod nim', () => {
    const into = new Buf(FB_W, CANVAS_H);
    const dmd = new Buf(FB_W, DMD_H).clear(PAL.czerwony);
    const table = new Buf(FB_W, FB_H).clear(PAL.cyjan);
    compose(into, dmd, table);
    const [dr, dg, db] = [into.px[0] & 255, (into.px[0] >> 8) & 255, (into.px[0] >> 16) & 255];
    expect([dr, dg, db]).toEqual([226, 60, 28]);
    const po = (DMD_H + 10) * FB_W + 5;
    expect([into.px[po] & 255, (into.px[po] >> 8) & 255, (into.px[po] >> 16) & 255]).toEqual([32, 178, 200]);
  });
});

describe('przenoszenie na płótno', () => {
  it('kopiuje bajt w bajt do ImageData', () => {
    const source = new Buf(8, 8);
    source.clear(PAL.cyjan);
    const image = { data: new Uint8Array(8 * 8 * 4), width: 8, height: 8 };
    blit(image as unknown as ImageData, source);
    expect(image.data[0]).toBe(32);
    expect(image.data[1]).toBe(178);
    expect(image.data[2]).toBe(200);
    expect(image.data[3]).toBe(255);
  });
});
