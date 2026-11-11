import { describe, expect, it } from 'vitest';
import { vec } from './geometry';
import type { Hit } from './physics';
import {
  HAZLO,
  applyHits,
  multiplierOf,
  startBall,
  startFever,
  startGame,
  tick,
} from './rules';
import type { Effect, Rules } from './rules';

const at = vec(100, 150);

const hit = (kind: Hit['kind'], tag: string): Hit => ({ kind, tag, at, speed: 400, ball: 1 });
const run = (state: Rules, hits: Hit[], ballsInPlay = 1) => applyHits(state, hits, ballsInPlay);
const scoreOf = (state: Rules, hits: Hit[]): number => run(state, hits).state.score;
const banners = (effects: Effect[]): string[] =>
  effects.filter((effect): effect is Extract<Effect, { kind: 'banner' }> => effect.kind === 'banner').map((effect) => effect.text);
const sounds = (effects: Effect[]): string[] =>
  effects.filter((effect): effect is Extract<Effect, { kind: 'sound' }> => effect.kind === 'sound').map((effect) => effect.name);

/** Zamarza cały stan — każdej próby zapisu pilnuje samo JavaScript. */
function frozen(state: Rules): Rules {
  Object.freeze(state);
  Object.freeze(state.letters);
  Object.freeze(state.rollovers);
  Object.freeze(state.ticker);
  return state;
}

const withLetters = (state: Rules, letters: string[]): Rules => ({ ...state, letters, jackpotLit: true });

describe('początek gry', () => {
  it('daje trzy kule, zero punktów i nic nie jest otwarte', () => {
    const state = startGame();
    expect(state.ballsLeft).toBe(3);
    expect(state.score).toBe(0);
    expect(state.over).toBe(false);
    expect(state.jackpotLit).toBe(false);
    expect(state.multiplier).toBe(1);
    expect(state.mode).toBeNull();
    expect(state.ticker.length).toBeGreaterThan(0);
  });

  it('nowa gra nie dzieli stanu z poprzednią', () => {
    const a = startGame();
    const b = startGame();
    a.letters.push('J');
    expect(b.letters).toEqual([]);
  });
});

describe('zbijaki i razemarks', () => {
  it('zbijak płaci sto punktów pomnożone przez mnożnik', () => {
    const state = startGame();
    expect(scoreOf(state, [hit('bumper', 'zbijak.1')])).toBe(100);
    expect(scoreOf({ ...state, multiplier: 4 }, [hit('bumper', 'zbijak.1')])).toBe(400);
  });

  it('razemek płaci trochę więcej, bo trzeba w niego trafić', () => {
    expect(scoreOf(startGame(), [hit('sling', 'razemek.l')])).toBe(120);
  });

  it('seria liczy się od zera i co dziesiąte trafienie dokłada bonus', () => {
    let state = startGame();
    for (let i = 0; i < 9; i += 1) state = run(state, [hit('bumper', 'zbijak.1')]).state;
    expect(state.combo).toBe(9);
    expect(state.score).toBe(900);

    const step = run(state, [hit('bumper', 'zbijak.1')]);
    expect(step.state.combo).toBe(10);
    expect(step.state.score).toBe(1050);
    expect(banners(step.effects)).toContain('SERIA 10');
  });

  it('słupek w tle nie punktuje przy mnożniku jednym, ale punktuje w trybie', () => {
    expect(scoreOf(startGame(), [hit('post', 'słupek.1')])).toBe(0);
    expect(scoreOf({ ...startGame(), multiplier: 3 }, [hit('post', 'słupek.1')])).toBe(15);
  });

  it('trafiona ściana nie zmienia wyniku, klapka tylko dzwoni', () => {
    const step = run(startGame(), [hit('wall', 'lej.l'), hit('wall', 'klapka.l')]);
    expect(step.state.score).toBe(0);
    expect(sounds(step.effects)).toEqual(['klapka']);
  });
});

describe('litery i jackpot', () => {
  it('każda litera wchodzi raz, powtórka płaci ale nie dopisuje', () => {
    let state = run(startGame(), [hit('roll', 'pas.J')]).state;
    expect(state.letters).toEqual(['J']);
    expect(state.score).toBe(250);

    state = run(state, [hit('roll', 'pas.J')]).state;
    expect(state.letters).toEqual(['J']);
    expect(state.score).toBe(350);
  });

  it('zebranie hasła otwiera jackpot dokładnie raz', () => {
    let state = startGame();
    let opened = 0;
    for (const letter of HAZLO) {
      const step = run(state, [hit('roll', `pas.${letter}`)]);
      state = step.state;
      if (banners(step.effects).includes('JACKPOT OTWARTY')) opened += 1;
    }
    expect(state.letters.sort()).toEqual([...HAZLO].sort());
    expect(state.jackpotLit).toBe(true);
    expect(opened).toBe(1);
  });

  it('kielich bez otwartego jackpota płaci dwatysiące i nie mnoży kuli', () => {
    const step = run(startGame(), [hit('kicker', 'kielich')]);
    expect(step.state.score).toBe(2500);
    expect(step.effects.some((effect) => effect.kind === 'spawn')).toBe(false);
    expect(step.state.mode).toBeNull();
  });

  it('kielich z otwartym jackpotem wypłaca pięćdziesiąt tysięcy raz mnożnik', () => {
    const state = withLetters(startGame(), [...HAZLO]);
    const boosted = { ...state, multiplier: 3 };
    const step = run(boosted, [hit('kicker', 'kielich')]);
    expect(step.state.score).toBe(150000);
    expect(step.state.jackpotLit).toBe(false);
    expect(step.state.jackpotsHit).toBe(1);
    expect(step.state.letters).toEqual([]);
    expect(banners(step.effects)).toContain('JACKPOT!!!');
  });

  it('jackpot woła multiball tylko gdy na stole jest jedna kula', () => {
    const state = withLetters(startGame(), [...HAZLO]);
    const solo = run(state, [hit('kicker', 'kielich')], 1);
    expect(solo.effects.some((effect) => effect.kind === 'spawn' && effect.count === 2)).toBe(true);
    expect(solo.state.mode).toBe('multiball');

    const crowded = run(state, [hit('kicker', 'kielich')], 3);
    expect(crowded.effects.some((effect) => effect.kind === 'spawn')).toBe(false);
    expect(crowded.state.mode).toBeNull();
  });

  it('środek stołu w multiballu jest wart dwa tysiące', () => {
    const state: Rules = { ...startGame(), mode: 'multiball', multiplier: 2 };
    expect(scoreOf(state, [hit('roll', 'środek')])).toBe(4000);
    expect(scoreOf(startGame(), [hit('roll', 'środek')])).toBe(0);
  });
});

describe('bank i tryby', () => {
  it('trzy cele z banku odpalają tryb mnożnika', () => {
    let state = startGame();
    let step = run(state, [hit('target', 'bank.1')]);
    state = step.state;
    expect(state.bankDown).toBe(1);
    expect(state.mode).toBeNull();
    state = run(state, [hit('target', 'bank.2')]).state;
    expect(state.bankDown).toBe(2);

    step = run(state, [hit('target', 'bank.3')]);
    expect(step.state.mode).toBe('mnożnik');
    expect(step.state.bankDown).toBe(0);
    expect(banners(step.effects)).toContain('MNOŻNIK W GÓRĘ');
    // 3 × 500 plus 2500 za komplet.
    expect(step.state.score).toBeGreaterThanOrEqual(4000);
  });

  it('w trybie mnożnika zbijak podkręca mnożnik i staje na sześciu', () => {
    let state: Rules = { ...startGame(), mode: 'mnożnik', modeTime: 20, multiplier: 1 };
    for (let i = 0; i < 12; i += 1) state = run(state, [hit('bumper', 'zbijak.2')]).state;
    expect(multiplierOf(state)).toBe(6);
  });

  it('poza trybem mnożnik nie rośnie', () => {
    let state = startGame();
    for (let i = 0; i < 12; i += 1) state = run(state, [hit('bumper', 'zbijak.2')]).state;
    expect(multiplierOf(state)).toBe(1);
  });

  it('tryb odmierza czas i gaśnie z powrotem do mnożnika jednego', () => {
    let state: Rules = { ...startGame(), mode: 'mnożnik', modeTime: 1, multiplier: 4 };
    state = tick(state, 0.4).state;
    expect(state.modeTime).toBeCloseTo(0.6);
    expect(state.mode).toBe('mnożnik');

    const step = tick(state, 0.6);
    expect(step.state.mode).toBeNull();
    expect(step.state.multiplier).toBe(1);
    expect(banners(step.effects).length).toBe(1);
  });

  it('po dwudziestu zbijakach gorączka jest gotowa i wchodzi z kielicha', () => {
    let state = startGame();
    for (let i = 0; i < 20; i += 1) state = run(state, [hit('bumper', 'zbijak.1')]).state;
    expect(state.feverReady).toBe(true);

    const step = startFever(state);
    expect(step.state.mode).toBe('gorączka');
    expect(step.state.feverReady).toBe(false);
    expect(banners(step.effects)).toContain('GORĄCZKA!');
  });

  it('gorączka nie wejdzie, gdy inny tryb gra, i nie wejdzie dwa razy', () => {
    const ready = { ...startGame(), feverReady: true };
    expect(startFever({ ...ready, mode: 'multiball' }).state.mode).toBe('multiball');
    expect(startFever({ ...ready, feverReady: false }).effects).toEqual([]);
  });
});

describe('kupki i bilety', () => {
  it('zebranie obu kupek dokłada kulę i gasie', () => {
    let state = startGame();
    state = run(state, [hit('roll', 'sklep.l')]).state;
    expect(state.rollovers).toEqual([true, false]);
    const step = run(state, [hit('roll', 'sklep.p')]);
    expect(step.state.ballsLeft).toBe(4);
    expect(step.state.extraBalls).toBe(1);
    expect(step.state.rollovers).toEqual([false, false]);
    expect(banners(step.effects)).toContain('BILET!');
  });

  it('po wyczerpaniu limitu kupki płacą punktami, nie kulą', () => {
    let state = { ...startGame(), extraBalls: 2 };
    state = run(state, [hit('roll', 'sklep.l')]).state;
    const step = run(state, [hit('roll', 'sklep.p')]);
    expect(step.state.ballsLeft).toBe(3);
    expect(step.state.score).toBe(5600);
    expect(banners(step.effects).join()).toContain('KUPKI +5000');
  });

  it('powtórzona kupka płaci sto pięćdziesiąt', () => {
    const state = { ...startGame(), rollovers: [true, false] };
    expect(scoreOf(state, [hit('roll', 'sklep.l')])).toBe(150);
  });
});

describe('otwór i koniec gry', () => {
  it('otwór zdejmuje kulę, kasuje serię i gasi tryb', () => {
    const state: Rules = {
      ...startGame(),
      combo: 7,
      mode: 'mnożnik',
      modeTime: 5,
      multiplier: 4,
      bankDown: 2,
    };
    const step = run(state, [hit('drain', 'otwór')]);
    expect(step.state.ballsLeft).toBe(2);
    expect(step.state.combo).toBe(0);
    expect(step.state.mode).toBeNull();
    expect(step.state.multiplier).toBe(1);
    expect(step.state.over).toBe(false);
    expect(sounds(step.effects)).toContain('otwór');
  });

  it('ostatnia kula kończy grę i nic już nie punktuje', () => {
    let state = { ...startGame(), ballsLeft: 1, score: 1234 };
    state = run(state, [hit('drain', 'otwór')]).state;
    expect(state.over).toBe(true);
    expect(state.ballsLeft).toBe(0);
    expect(run(state, [hit('bumper', 'zbijak.1')]).state.score).toBe(1234);
  });

  it('nalot na klapkę zawsze coś płaci', () => {
    expect(scoreOf(startGame(), [hit('roll', 'nalot.l')])).toBe(500);
  });
});

describe('czystość', () => {
  it('reduktor nie rusza stanu wejściowego', () => {
    const state = frozen(startGame());
    const before = JSON.stringify(state);
    const step = run(state, [
      hit('bumper', 'zbijak.1'),
      hit('roll', 'pas.J'),
      hit('target', 'bank.1'),
      hit('roll', 'sklep.l'),
    ]);
    expect(JSON.stringify(state)).toBe(before);
    expect(step.state).not.toBe(state);
    expect(step.state.score).toBeGreaterThan(0);
  });

  it('lista zdarzeń z jednego kroku redukuje się po kolei', () => {
    const step = run(startGame(), [
      hit('roll', 'pas.J'),
      hit('roll', 'pas.A'),
      hit('roll', 'pas.C'),
      hit('roll', 'pas.K'),
      hit('roll', 'pas.P'),
      hit('kicker', 'kielich'),
    ]);
    expect(step.state.jackpotsHit).toBe(1);
    expect(step.state.jackpotLit).toBe(false);
    expect(step.state.score).toBe(250 * 5 + 50000);
  });

  it('wyrzutnik i wstrząśnięta kula mówią coś na bieżni', () => {
    const launch = run(startGame(), [hit('launch', 'wyrzutnik')]);
    expect(launch.state.ticker[0]).toBe('WYRZUCONO');
    expect(banners(run(startGame(), [hit('stuck', 'kula')]).effects)).toContain('KULA WOLNA');
  });
});

describe('obrona kuli', () => {
  it('strzał wiesza ją nad kulą na osiem sekund', () => {
    const state = startBall(startGame());
    expect(state.save).toBe(8);
  });

  it('tyka w dół i gaśnie', () => {
    let state = startBall(startGame());
    for (let i = 0; i < 100; i += 1) state = tick(state, 0.1).state;
    expect(state.save).toBe(0);
  });

  it('ratuje kulę bez utraty życia i bez utraty serii', () => {
    let state = startBall(startGame());
    ({ state } = run(state, [hit('bumper', 'zbijak.1')]));
    const combo = state.combo;
    const { state: po, effects } = run(state, [hit('drain', 'otwór')]);
    expect(po.ballsLeft).toBe(3);
    expect(po.save).toBe(0);
    expect(po.saveUsed).toBe(true);
    expect(po.combo).toBe(combo);
    expect(banners(effects)).toContain('RATUNEK!');
  });

  it('tej samej kuli nie ratuje dwa razy', () => {
    let state = startBall(startGame());
    ({ state } = run(state, [hit('drain', 'otwór')]));
    // Ratunek odkłada kulę na wyrzutnik — nowy strzał nie może dokupić obrony.
    state = startBall(state);
    expect(state.save).toBe(0);
    expect(run(state, [hit('drain', 'otwór')]).state.ballsLeft).toBe(2);
  });

  it('nowa litera hasła zapala ją na jedno odpłynięcie', () => {
    const { state } = run(startGame(), [hit('roll', 'pas.J')]);
    expect(state.saveLit).toBe(true);
    const po = run(state, [hit('drain', 'otwór')]).state;
    expect(po.ballsLeft).toBe(3);
    expect(po.saveLit).toBe(false);
  });

  it('nalot NIE zapala obrony — leży w drodze do dołka', () => {
    // To był błąd, przez który gra była nieskończona: kula wpadająca do kanału
    // zahaczała po drodze o nalot, zapalała obronę i była ratowana za każdym razem.
    const { state } = run(startGame(), [hit('roll', 'nalot.l')]);
    expect(state.saveLit).toBe(false);
    expect(state.ballsLeft).toBe(3);
    expect(run(state, [hit('drain', 'otwór')]).state.ballsLeft).toBe(2);
  });

  it('odpłynięcie bez obrony zdejmuje życie i czyści flagę następnej kuli', () => {
    const { state } = run({ ...startGame(), saveUsed: true }, [hit('drain', 'otwór')]);
    expect(state.ballsLeft).toBe(2);
    expect(state.saveUsed).toBe(false);
  });

  it('jackpot dokula obrony na dłużej', () => {
    const start = withLetters({ ...startBall(startGame()), save: 0 }, [...HAZLO]);
    const { state } = run(start, [hit('kicker', 'kielich')], 1);
    expect(state.jackpotsHit).toBe(1);
    expect(state.save).toBe(12);
  });
});
