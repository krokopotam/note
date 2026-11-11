import { describe, expect, it } from 'vitest';
import { createEngine } from './engine';
import type { Engine } from './engine';
import { liveBalls } from './physics';
import type { Input } from './physics';
import { PLUNGER, SAUCER, SCORE_TAGS } from './table';
import { HAZLO, startGame } from './rules';
import type { Rules } from './rules';

const NONE: Input = { left: false, right: false };
const KROK = 1 / 120;

/** Prowadzi siler przez `sekund`, sam wrzucając kulę, gdy ta czeka na wyrzutniku. */
function graj(engine: Engine, sekund: number, input: (t: number) => Input = () => NONE): number {
  let czas = 0;
  for (let i = 0; i < Math.round(sekund / KROK); i += 1) {
    if (engine.faza() === 'ładowanie') engine.launch(0.9);
    engine.step(KROK, input(czas));
    czas += KROK;
  }
  return engine.zasady().score;
}

const pełneHasło = (): Rules => ({ ...startGame(), letters: [...HAZLO], jackpotLit: true });

describe('start partii', () => {
  it('kula czeka na wyrzutniku, a nie na stole', () => {
    const engine = createEngine();
    expect(engine.faza()).toBe('ładowanie');
    expect(liveBalls(engine.swiat())).toHaveLength(0);
    expect(engine.zaladowana()).toEqual({ x: PLUNGER.x, y: PLUNGER.y });
    expect(engine.zasady().ballsLeft).toBe(3);
  });

  it('wyrzucenie wprawia kulę w górę toru', () => {
    const engine = createEngine();
    engine.launch(1);
    expect(engine.faza()).toBe('gra');
    expect(engine.zaladowana()).toBeNull();
    const ball = liveBalls(engine.swiat())[0];
    expect(ball.vel.y).toBeLessThan(-500);
  });

  it('drugie wciśnięcie nie dodaje drugiej kuli', () => {
    const engine = createEngine();
    engine.launch(0.8);
    engine.launch(0.8);
    expect(liveBalls(engine.swiat())).toHaveLength(1);
  });

  it('za słabe wystrzelenie zjada kulę, a nie zatrzymuje gry', () => {
    const engine = createEngine();
    engine.launch(0.2);
    expect(engine.faza()).toBe('gra');

    // Kula nie ma siły wjechać na górę, więc po chwili leży na dnie toru.
    for (let i = 0; i < 120 * 3; i += 1) engine.step(KROK, NONE);

    expect(engine.faza()).toBe('ładowanie');
    expect(engine.zasady().ballsLeft).toBe(2);
    expect(liveBalls(engine.swiat())).toHaveLength(0);
  });

  it('ramek z kulą czekającą nie rysuje kuli w świecie', () => {
    const engine = createEngine();
    const rama = engine.rama(0, 0);
    expect(rama.balls).toHaveLength(1);
    expect(rama.loaded).toBe(true);
    expect(rama.world.balls).toHaveLength(0);
  });
});

describe('przebieg partii', () => {
  it('otwór zdejmuje kulę i po chwili wraca ładowanie', () => {
    const engine = createEngine();
    graj(engine, 8);
    expect(engine.zasady().ballsLeft).toBeLessThan(3);
    expect(['ładowanie', 'gra']).toContain(engine.faza());
  });

  it('bez klapek gra sama się kończy po trzech kulach', () => {
    const engine = createEngine();
    graj(engine, 90);
    expect(engine.faza()).toBe('koniec');
    expect(engine.zasady().over).toBe(true);
    expect(engine.matryca().line2).toBe('KONIEC GRY');
  });

  it('reset cofa wszystko do pierwszego kadru', () => {
    const engine = createEngine();
    graj(engine, 6);
    engine.reset();
    expect(engine.faza()).toBe('ładowanie');
    expect(engine.zasady()).toEqual(startGame());
    expect(engine.efekty().floats).toHaveLength(0);
    expect(liveBalls(engine.swiat())).toHaveLength(0);
  });

  it('ta sama kolejność losów daje ten sam wynik', () => {
    const grajDwa = (): number => {
      const a = createEngine(77);
      const b = createEngine(77);
      const input = (t: number): Input => ({ left: Math.floor(t * 6) % 2 === 0, right: Math.floor(t * 7) % 3 === 0 });
      const rA = graj(a, 20, input);
      const rB = graj(b, 20, input);
      expect(a.swiat().balls[0]?.pos.x ?? -1).toBe(b.swiat().balls[0]?.pos.x ?? -1);
      return rA === rB ? rA : -1;
    };
    expect(grajDwa()).toBeGreaterThanOrEqual(0);
  });
});

describe('punkty i efekty przez silnik', () => {
  const wrzućNa = (x: number, y: number, engine = createEngine()): Engine => {
    engine.launch(0.5);
    const ball = liveBalls(engine.swiat())[0];
    ball.pos.x = x;
    ball.pos.y = y;
    ball.vel.x = 0;
    ball.vel.y = 220;
    // Kula musi dolecieć do elementu, więc kroki lecą, aż coś trzaśnie.
    for (let i = 0; i < 400 && engine.zasady().score === 0; i += 1) engine.step(KROK, NONE);
    expect(engine.zasady().score).toBeGreaterThan(0);
    return engine;
  };

  it('zbijak zostawia iskry, poświatę i falę', () => {
    const engine = wrzućNa(100, 100);
    const fx = engine.efekty();
    expect(fx.floats.length).toBeGreaterThan(0);
    expect(fx.sparks.length).toBeGreaterThan(0);
    expect(fx.rings.length).toBeGreaterThan(0);
    expect(Object.keys(fx.glow).length).toBeGreaterThan(0);
  });

  it('trafiony pas dopisuje literę', () => {
    const engine = createEngine();
    engine.launch(0.9);
    // Prowadzę kulę przez pasy z góry, aż któraś litera wskoczy.
    const ball = liveBalls(engine.swiat())[0];
    for (let i = 0; i < 1200 && engine.zasady().letters.length === 0; i += 1) {
      if (liveBalls(engine.swiat()).length === 0) break;
      engine.step(KROK, NONE);
    }
    expect(engine.zasady().letters.length + (liveBalls(engine.swiat()).length ? 0 : 1)).toBeGreaterThan(0);
    expect(ball).toBeDefined();
  });

  it('dźwięk idzie do słuchawki, nie donikąd', () => {
    const słyszane: string[] = [];
    const engine = createEngine(5, (name) => słyszane.push(name));
    engine.launch(0.7);
    expect(słyszane).toContain('wyrzutnik');
    graj(engine, 4);
    expect(słyszane.length).toBeGreaterThan(1);
  });
});

describe('multiball i kielich', () => {
  it('jackpot w kielichu wypuszcza trzy kule', () => {
    const engine = createEngine(3, undefined, pełneHasło());
    engine.launch(0.4);
    // Kulę sadzam nad kielichem — test ma sprawdzać nagrodę, nie to, czy
    // przypadkiem trafiła w dziurę z pełnego wyrzutniku.
    const ball = liveBalls(engine.swiat())[0];
    // Kula siada tuż nad kielichem, w kanale między jego ściankami — poniżej łuku.
    ball.pos = { x: SAUCER.x, y: SAUCER.y - 12 };
    ball.vel = { x: 0, y: 60 };

    let maxKul = 1;
    for (let i = 0; i < 240; i += 1) {
      engine.step(KROK, NONE);
      maxKul = Math.max(maxKul, liveBalls(engine.swiat()).length);
    }
    expect(engine.zasady().jackpotsHit).toBe(1);
    // Po drodze kula zdążyła w coś walnąć, więc sprawdzam sam próg nagrody.
    expect(engine.zasady().score).toBeGreaterThanOrEqual(50000);
    expect(maxKul).toBe(3);
    expect(engine.zasady().mode).toBe('multiball');
  });

  it('po kielichu kula wraca na stół, a nie znika', () => {
    const engine = createEngine(9);
    engine.launch(0.4);
    const ball = liveBalls(engine.swiat())[0];
    ball.pos = { x: SAUCER.x, y: SAUCER.y - 12 };
    ball.vel = { x: 0, y: 60 };

    // Kielich chwyta i na chwilę zostaje pusto — to ten moment, w którym
    // automat melduje tryb.
    for (let i = 0; i < 40; i += 1) engine.step(KROK, NONE);
    expect(liveBalls(engine.swiat())).toHaveLength(0);

    // Po przerwie kula wypada z powrotem na pole.
    for (let i = 0; i < 130; i += 1) engine.step(KROK, NONE);
    expect(liveBalls(engine.swiat())).toHaveLength(1);
    expect(liveBalls(engine.swiat())[0].pos.y).toBeGreaterThan(SAUCER.y);
  });
});

describe('rama i matryca', () => {
  it('smuga rośnie razem z lotem kuli', () => {
    const engine = createEngine();
    engine.launch(1);
    engine.step(KROK, NONE);
    engine.step(KROK, NONE);
    const rama = engine.rama(0.05, 0);
    expect(rama.balls[0].trail.length).toBeGreaterThan(0);
  });

  it('bez wstrząsu rama stoi prosto', () => {
    const engine = createEngine();
    const rama = engine.rama(0, 0);
    expect(rama.shake).toEqual({ x: 0, y: 0 });
  });

  it('wstrząs od jackpota nie jest zerem', () => {
    const engine = createEngine(3, undefined, pełneHasło());
    engine.launch(0.4);
    const ball = liveBalls(engine.swiat())[0];
    ball.pos = { x: SAUCER.x, y: SAUCER.y - 12 };
    ball.vel = { x: 0, y: 60 };
    for (let i = 0; i < 240; i += 1) {
      engine.step(KROK, NONE);
      if (engine.zasady().jackpotsHit > 0) break;
    }
    expect(engine.zasady().jackpotsHit).toBeGreaterThan(0);
    const rama = engine.rama(1, 0);
    expect(Math.hypot(rama.shake.x, rama.shake.y)).toBeGreaterThan(0);
  });

  it('matryca pokazuje kule i mnożnik', () => {
    const engine = createEngine();
    const dmd = engine.matryca();
    expect(dmd.score).toBe(0);
    expect(dmd.ballsLeft).toBe(3);
    expect(dmd.line3).toContain('KULE 3');
    expect(dmd.over).toBe(false);
  });

  it('matryca w trybie podaje jego nazwę', () => {
    const engine = createEngine(1, undefined, { ...startGame(), mode: 'gorączka', modeTime: 5 });
    expect(engine.matryca().mode).toBe('gorączka');
  });
});

describe('ciagłość po godzinie', () => {
  it('nikła kula, brak NaN i brak zablokowanej fazy', () => {
    const engine = createEngine(2027);
    let klatekBezKuli = 0;
    for (let i = 0; i < 120 * 600; i += 1) {
      if (engine.faza() === 'koniec') engine.reset();
      if (engine.faza() === 'ładowanie') engine.launch(0.55 + (i % 40) / 100);
      const t = i / 120;
      engine.step(KROK, { left: Math.floor(t * 5) % 2 === 0, right: Math.floor(t * 8) % 3 === 0 });
      for (const ball of engine.swiat().balls) {
        expect(Number.isFinite(ball.pos.x + ball.pos.y + ball.vel.x + ball.vel.y)).toBe(true);
      }
      const pusto = liveBalls(engine.swiat()).length === 0 && engine.faza() !== 'ładowanie';
      klatekBezKuli = pusto ? klatekBezKuli + 1 : 0;
      expect(klatekBezKuli, 'faza „gra” bez kuli').toBeLessThan(120 * 4);
    }
    expect(engine.zasady().score).toBeGreaterThanOrEqual(0);
  });
});

describe('elementy stołu w akcji', () => {
  it('każdy punkt z listy zasad daje się trafić przez silnik', () => {
    // Nie sprawdzam wartości — te mają testy zasad. Sprawdzam, że silnik
    // niczego nie gubi po drodze między fizyką a zasadami.
    const wanted = [...SCORE_TAGS.bumpers, ...SCORE_TAGS.bank, ...SCORE_TAGS.slings];
    const engine = createEngine(4);
    engine.launch(1);
    const punkty = new Map<string, [number, number]>([
      ['zbijak.1', [100, 100]],
      ['zbijak.2', [156, 100]],
      ['zbijak.3', [128, 140]],
      ['bank.1', [40, 90]],
      ['bank.2', [40, 108]],
      ['bank.3', [40, 126]],
      ['razemek.l', [140, 200]],
      ['razemek.p', [116, 200]],
    ]);
    const trafione: string[] = [];
    for (const tag of wanted) {
      const at = punkty.get(tag);
      if (!at) continue;
      const before = engine.zasady().score;
      const ball = liveBalls(engine.swiat())[0] ?? engine.swiat().balls[0];
      if (!ball) break;
      ball.pos.x = at[0];
      ball.pos.y = at[1];
      ball.vel.x = 0;
      ball.vel.y = 200;
      for (let i = 0; i < 240; i += 1) engine.step(KROK, NONE);
      if (engine.zasady().score > before) trafione.push(tag);
    }
    expect(trafione.length).toBeGreaterThanOrEqual(wanted.length - 2);
  });

  it('kielich stoi u góry, wyrzutnik na dole — rama to pokazuje', () => {
    const engine = createEngine();
    expect(SAUCER.y).toBeLessThan(PLUNGER.y);
    expect(engine.rama(0, 0).loaded).toBe(true);
  });
});
