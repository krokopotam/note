/**
 * Zasady.
 *
 * Czysty reducer: wchodzi stan i zdarzenia z fizyki, wychodzi nowy stan i lista
 * efektów dla rysownika. Żadnego `Math.random`, żadnego DOM-u, żadnego czasu
 * poza tym, co dostanie w argumentach — dzięki temu całe zasady dają się
 * przetestować w pętli bez zegara, a rysownik nie ma pojęcia, ile co jest warte.
 *
 * Układ jest amigowy, nie flipperowy: jeden stół, trzy kule, litery do zebrania,
 * jeden jackpot i trzy tryby, które wchodzą na kilkanaście sekund.
 */

import type { Vec } from './geometry';
import type { Hit } from './physics';

/** Nazwa trybu wraz z czasem, jaki jeszcze został. */
export type ModeName = 'mnożnik' | 'multiball' | 'gorączka';

export interface Rules {
  score: number;
  /** Kule, które jeszcze zostaną — ta w grze też jest tu policzona. */
  ballsLeft: number;
  /** Zebrane litery hasła JACKPOT, w kolejności zdobywania. */
  letters: string[];
  jackpotLit: boolean;
  jackpotsHit: number;
  multiplier: number;
  mode: ModeName | null;
  /** Sekundy do końca trybu. */
  modeTime: number;
  /** Trafienia z rzędu bez wpadnięcia do otworu. */
  combo: number;
  /** Ile razy zapalono obydwie kupki (bilet, limit na grę). */
  rollovers: boolean[];
  extraBalls: number;
  bankDown: number;
  bumperHits: number;
  feverReady: boolean;
  /**
   * Sekundy obrony: kula, która odpłynie w tym czasie, wraca na wyrzutnik
   * i nie kosztuje życia. Bez tego pierwsza kula partii potrafi zniknąć w
   * cztery sekundy i gracz nie zdąży niczego dotknąć.
   */
  save: number;
  /** Nowa litera hasła zapaliła obronę na jedno odpłynięcie. */
  saveLit: boolean;
  /**
   * Czy ta kula zużyła już swoją obronę. Bez tego flaga jest dziurawa: ratunek
   * odkłada kulę na wyrzutnik, nowy wystrzał uzbraja obronę od nowa i partia
   * nie może się skończyć. Obrona jest jedna na kulę, nalot do tego druga.
   */
  saveUsed: boolean;
  over: boolean;
  /** Ostatnie hasła do bieżni punktowej, najnowsze na wierzchu. */
  ticker: string[];
}

/** Co rysownik ma na ten kadr narysować poza samym stanem. */
export type Effect =
  | { kind: 'float'; text: string; at: Vec; tone: 'zwykły' | 'tryb' | 'jackpot' }
  | { kind: 'flash'; tag: string }
  | { kind: 'shake'; power: number }
  | { kind: 'sound'; name: 'banda' | 'zbijak' | 'klapka' | 'cel' | 'tryb' | 'jackpot' | 'otwór' | 'bilet' }
  | { kind: 'banner'; text: string }
  | { kind: 'spawn'; count: number };

export interface Step {
  state: Rules;
  effects: Effect[];
}

export const HAZLO = ['J', 'A', 'C', 'K', 'P'];
const MAX_MULTIPLIER = 6;
const EXTRA_BALL_LIMIT = 2;
const MODE_TIME: Record<ModeName, number> = { mnożnik: 20, multiball: 25, gorączka: 15 };
/** Ile sekund po wystrzale Automat trzyma kulę nad przepaścią. */
const START_SAVE = 8;
/** Tyle dostaje kula po jackpocie — gracz właśnie zapracował. */
const JACKPOT_SAVE = 12;

/**
 * Kula poszła z wyrzutnika — od tej chwili liczymy jej obronę. Fizyka nie zgłasza
 * wypadu z toru jako zdarzenia (pole `launch` w unii wisi od pierwszej wersji),
 * więc silnik woła to wprost w `launch()`.
 *
 * `saveUsed` jest tu po to, żeby ratunek nie dawał nieskończoności: ratowana kula
 * wraca na wyrzutnik, a bez tej flagi każdy nowy wystrzał uzbrajałby obronę od
 * nowa i gra nigdy by się nie kończyła.
 */
export function startBall(state: Rules): Rules {
  return next(state, {
    save: state.saveUsed ? state.save : START_SAVE,
    ticker: say(state, 'WYRZUCONO'),
  });
}

export function startGame(): Rules {
  return {
    score: 0,
    ballsLeft: 3,
    letters: [],
    jackpotLit: false,
    jackpotsHit: 0,
    multiplier: 1,
    mode: null,
    modeTime: 0,
    combo: 0,
    rollovers: [false, false],
    extraBalls: 0,
    bankDown: 0,
    bumperHits: 0,
    feverReady: false,
    save: 0,
    saveLit: false,
    saveUsed: false,
    over: false,
    ticker: ['WRZUĆ KULĘ'],
  };
}

/**
 * Kopia z nadpisanymi polami — jedyny sposób zmieniania stanu w tym pliku.
 * Kopie tablic muszą być ROZPISANE PRZED `patch`, nie po nim: postawione po
 * nadpisaniu cicho kasują to, co właśnie włożyłem (litery wracały puste).
 */
function next(state: Rules, patch: Partial<Rules>): Rules {
  return {
    ...state,
    letters: [...state.letters],
    rollovers: [...state.rollovers],
    ticker: [...state.ticker],
    ...patch,
  };
}

function say(state: Rules, text: string): string[] {
  return [text, ...state.ticker].slice(0, 4);
}

function addPoints(state: Rules, amount: number): Rules {
  return next(state, { score: state.score + Math.round(amount) });
}

/** Punktacja trafiająca do bieżni i jako latająca liczba nad miejscem trafienia. */
function score(
  state: Rules,
  hit: Hit,
  base: number,
  tone: 'zwykły' | 'tryb' | 'jackpot' = 'zwykły',
): { state: Rules; effects: Effect[] } {
  const gained = Math.round(base * state.multiplier);
  return {
    state: addPoints(state, gained),
    effects: [
      { kind: 'float', text: `+${gained}`, at: hit.at, tone },
      { kind: 'flash', tag: hit.tag },
    ],
  };
}

/** Czy to trafienie w ogóle coś znaczy dla zasad. */
const SCORING = new Set(['bumper', 'sling', 'target', 'roll', 'kicker', 'post']);

/**
 * Główna redukcja zdarzeń z jednego kroku symulacji.
 *
 * `ballsInPlay` mówi, ile kul naprawdę lata — bez tego nie da się zdecydować,
 * czy multiball wchodzi (nie chcę trzech kul, gdy dwie już są na stole).
 */
export function applyHits(state: Rules, hits: Hit[], ballsInPlay: number): Step {
  let current = state;
  const effects: Effect[] = [];
  for (const hit of hits) {
    if (current.over) break;
    const step = reduce(current, hit, ballsInPlay);
    current = step.state;
    effects.push(...step.effects);
  }
  return { state: current, effects };
}

function reduce(state: Rules, hit: Hit, ballsInPlay: number): Step {
  switch (hit.kind) {
    case 'bumper':
    case 'sling':
      return onBumper(state, hit);
    case 'post':
      return onPost(state, hit);
    case 'target':
      return onTarget(state, hit);
    case 'roll':
      return onRoll(state, hit);
    case 'kicker':
      return onSaucer(state, hit, ballsInPlay);
    case 'drain':
      return onDrain(state);
    case 'launch':
      return { state: startBall(state), effects: [{ kind: 'sound', name: 'zbijak' }] };
    case 'stuck':
      return { state, effects: [{ kind: 'banner', text: 'KULA WOLNA' }] };
    case 'wall':
      return onWall(state, hit);
    default:
      return { state, effects: [] };
  }
}

function onWall(state: Rules, hit: Hit): Step {
  if (!hit.tag.startsWith('klapka')) return { state, effects: [] };
  return {
    state,
    effects: [
      { kind: 'sound', name: 'klapka' },
      { kind: 'float', text: '', at: hit.at, tone: 'zwykły' },
    ],
  };
}

function onBumper(state: Rules, hit: Hit): Step {
  const bumper = hit.kind === 'bumper';
  const combo = state.combo + 1;
  const streakBonus = combo > 0 && combo % 10 === 0 ? 50 : 0;
  const bumperHits = state.bumperHits + (bumper ? 1 : 0);
  let current = addPoints(state, (bumper ? 100 : 120) * state.multiplier + streakBonus);
  current = next(current, {
    combo,
    bumperHits,
    ticker: streakBonus ? say(state, `SERIA ${combo}!`) : state.ticker,
  });

  const effects: Effect[] = [
    { kind: 'float', text: `+${Math.round((bumper ? 100 : 120) * state.multiplier + streakBonus)}`, at: hit.at, tone: 'zwykły' },
    { kind: 'flash', tag: hit.tag },
    { kind: 'sound', name: 'zbijak' },
  ];
  if (streakBonus) effects.push({ kind: 'banner', text: `SERIA ${combo}` });

  // W trybie mnożnika każdy zbijak podkręca mnożnik — to cała jego idea.
  if (bumper && current.mode === 'mnożnik' && current.multiplier < MAX_MULTIPLIER) {
    const multiplier = current.multiplier + 1;
    current = next(current, { multiplier, ticker: say(current, `MNOŻNIK ×${multiplier}`) });
    effects.push({ kind: 'banner', text: `MNOŻNIK ×${multiplier}` });
  }

  // Po dwudziestu zbijakach budzi się gorączka, jeśli nic głośniejszego nie gra.
  if (!bumper || current.feverReady || current.mode) return { state: current, effects };
  if (bumperHits >= 20) {
    return {
      state: next(current, { feverReady: true, ticker: say(current, 'GORĄCZKA GOTOWA') }),
      effects: [...effects, { kind: 'banner', text: 'GORĄCZKA GOTOWA' }],
    };
  }
  return { state: current, effects };
}

function onPost(state: Rules, hit: Hit): Step {
  // Słupki płacą grosze, ale muszą płacić — inaczej stół wygląda na martwy.
  if (state.multiplier === 1) return { state, effects: [{ kind: 'sound', name: 'banda' }] };
  const gained = 5 * state.multiplier;
  return {
    state: addPoints(state, gained),
    effects: [
      { kind: 'float', text: `+${gained}`, at: hit.at, tone: 'zwykły' },
      { kind: 'sound', name: 'banda' },
    ],
  };
}

function onTarget(state: Rules, hit: Hit): Step {
  const bank = hit.tag.startsWith('bank.');
  const base = bank ? 500 : 750;
  const done = score(state, hit, base, bank ? 'zwykły' : 'tryb');
  let current = done.state;
  const effects: Effect[] = [...done.effects, { kind: 'sound', name: 'cel' }];
  if (!bank) return { state: current, effects };

  const bankDown = Math.min(3, state.bankDown + 1);
  current = next(current, { bankDown });
  if (bankDown < 3) return { state: current, effects };

  current = addPoints(current, 2500);
  current = startMode(current, 'mnożnik');
  effects.push(
    { kind: 'float', text: '+2500', at: hit.at, tone: 'tryb' },
    { kind: 'banner', text: 'MNOŻNIK W GÓRĘ' },
    { kind: 'shake', power: 3 },
  );
  return { state: next(current, { bankDown: 0, ticker: say(current, 'BANK ZEBRANY') }), effects };
}

function onRoll(state: Rules, hit: Hit): Step {
  if (hit.tag.startsWith('pas.')) {
    const letter = hit.tag.slice(4);
    if (state.letters.includes(letter)) {
      return score(state, hit, 100);
    }
    const letters = [...state.letters, letter];
    let current = addPoints(state, 250 * state.multiplier);
    // Każda nowa litera zapala obronę na jedno odpłynięcie: to jedyne miejsce,
    // gdzie da się ją uczciwie rozświecić — wysoko, z doskoku, a nie w zjeździe
    // do dołka.
    current = next(current, { letters, saveLit: true, ticker: say(current, `LITERA ${letters.join('')}`) });
    const effects: Effect[] = [
      { kind: 'float', text: `LITERA ${letter}`, at: hit.at, tone: 'tryb' },
      { kind: 'flash', tag: hit.tag },
      { kind: 'sound', name: 'cel' },
    ];
    if (!state.saveLit && state.save <= 0) effects.push({ kind: 'banner', text: 'OBRONA ZAPALONA' });
    if (!state.jackpotLit && HAZLO.every((wanted) => letters.includes(wanted))) {
      current = next(current, { jackpotLit: true, ticker: say(current, 'JACKPOT OTWARTY') });
      effects.push({ kind: 'banner', text: 'JACKPOT OTWARTY' }, { kind: 'shake', power: 2 });
    }
    return { state: current, effects };
  }

  if (hit.tag.startsWith('nalot.')) {
    // Nalot: kula wróciła na klapkę — zawsze jakiś grosz, inaczej kary godzą.
    // Celowo BEZ zapalania obrony: nalot leży tuż nad odpływem, więc kula
    // zapalałaby ją w drodze do dołka i była ratowana za każdym razem. Partia
    // robiła się nieskończona — pierwsza wersja właśnie tak wyglądała.
    return score(state, hit, 500);
  }

  if (hit.tag.startsWith('sklep.')) {
    const index = hit.tag === 'sklep.l' ? 0 : 1;
    if (state.rollovers[index]) return score(state, hit, 150);
    const rollovers = [...state.rollovers];
    rollovers[index] = true;
    let current = addPoints(state, 300 * state.multiplier);
    current = next(current, { rollovers });
    const effects: Effect[] = [
      { kind: 'float', text: '+300', at: hit.at, tone: 'zwykły' },
      { kind: 'flash', tag: hit.tag },
      { kind: 'sound', name: 'cel' },
    ];
    if (rollovers.every(Boolean)) {
      current = next(current, { rollovers: [false, false] });
      if (current.extraBalls < EXTRA_BALL_LIMIT) {
        current = next(current, {
          extraBalls: current.extraBalls + 1,
          ballsLeft: current.ballsLeft + 1,
          ticker: say(current, 'BILET! JESZCZE JEDNA KULA'),
        });
        effects.push({ kind: 'banner', text: 'BILET!' }, { kind: 'sound', name: 'bilet' });
      } else {
        current = addPoints(current, 5000);
        effects.push({ kind: 'banner', text: 'KUPKI +5000' });
      }
    }
    return { state: current, effects };
  }

  if (hit.tag === 'środek' && state.mode === 'multiball') {
    return score(state, hit, 2000, 'tryb');
  }

  return { state, effects: [] };
}

function onSaucer(state: Rules, hit: Hit, ballsInPlay: number): Step {
  const effects: Effect[] = [{ kind: 'sound', name: 'cel' }];
  if (!state.jackpotLit) {
    const done = score(state, hit, 2500);
    return { state: next(done.state, { ticker: say(done.state, 'KIELICH +2500') }), effects: [...done.effects, ...effects] };
  }

  const gained = 50000 * state.multiplier;
  let current = addPoints(state, gained);
  current = next(current, {
    jackpotLit: false,
    // Po jackpocie Automat trzyma kulę dłużej: gracz właśnie zrobił najlepsze
    // zagranie na stole i nie powinien za nie zapłacić życiem w następnej sekundzie.
    save: Math.max(current.save, JACKPOT_SAVE),
    jackpotsHit: state.jackpotsHit + 1,
    // Hasło trzeba zebrać od nowa — jeden jackpot to nie darmowa maszynka.
    letters: [],
    ticker: say(current, `JACKPOT! ${gained}`),
  });
  effects.push(
    { kind: 'float', text: `JACKPOT ${gained}`, at: hit.at, tone: 'jackpot' },
    { kind: 'banner', text: 'JACKPOT!!!' },
    { kind: 'shake', power: 6 },
    { kind: 'sound', name: 'jackpot' },
  );

  // Trafiony jackpot otwiera multiball, o ile na stole jest jeszcze czego szukać.
  if (ballsInPlay < 2) {
    current = startMode(current, 'multiball');
    effects.push({ kind: 'spawn', count: 2 }, { kind: 'banner', text: 'MULTIBALL!' });
  }
  return { state: current, effects };
}

function onDrain(state: Rules): Step {
  if (state.save > 0 || state.saveLit) {
    // Ratunek: kula wraca na wyrzutnik, ale dorobek serii i tryby zostają —
    // gra jej nie zabiera, tylko wyciąga z dołka.
    return {
      state: next(state, { save: 0, saveLit: false, saveUsed: true, ticker: say(state, 'KULA RATOWANA') }),
      effects: [
        { kind: 'banner', text: 'RATUNEK!' },
        { kind: 'sound', name: 'tryb' },
        { kind: 'shake', power: 1 },
      ],
    };
  }
  const effects: Effect[] = [{ kind: 'sound', name: 'otwór' }, { kind: 'shake', power: 2 }];
  if (state.ballsLeft > 1) {
    const current = next(state, {
      ballsLeft: state.ballsLeft - 1,
      saveUsed: false,
      combo: 0,
      mode: null,
      modeTime: 0,
      multiplier: 1,
      bankDown: 0,
      ticker: say(state, `KULA ZOSTAŁA: ${state.ballsLeft - 1}`),
    });
    return { state: current, effects };
  }
  return {
    state: next(state, { ballsLeft: 0, over: true, combo: 0, mode: null, modeTime: 0, multiplier: 1, ticker: say(state, 'KONIEC GRY') }),
    effects: [...effects, { kind: 'banner', text: 'KONIEC GRY' }],
  };
}

function startMode(state: Rules, mode: ModeName): Rules {
  return next(state, {
    mode,
    modeTime: MODE_TIME[mode],
    multiplier: mode === 'mnożnik' ? Math.max(state.multiplier, 2) : state.multiplier,
    feverReady: false,
    ticker: say(state, mode.toUpperCase()),
  });
}

/** Odmierza tryby. Zwraca efekt dźwiękowy w chwili, gdy tryb gaśnie. */
export function tick(state: Rules, dt: number): Step {
  // Obrona tyka zawsze — tryb może nie trwać ani sekundy, a kula i tak wisi.
  const save = state.save > 0 ? Math.max(0, state.save - dt) : 0;
  if (save !== state.save) state = next(state, { save });

  if (!state.mode || state.over) return { state, effects: [] };
  const modeTime = state.modeTime - dt;
  if (modeTime > 0) return { state: next(state, { modeTime }), effects: [] };
  const mode = state.mode;
  return {
    state: next(state, { mode: null, modeTime: 0, multiplier: 1, ticker: say(state, `${mode.toUpperCase()} KONIEC`) }),
    effects: [{ kind: 'banner', text: `${mode.toUpperCase()} — KONIEC` }],
  };
}

/** Gorączka wchodzi ze strzałem w kielich, gdy jest gotowa. */
export function startFever(state: Rules): Step {
  if (!state.feverReady || state.mode) return { state, effects: [] };
  const current = next(state, { feverReady: false });
  return {
    state: startMode(current, 'gorączka'),
    effects: [{ kind: 'banner', text: 'GORĄCZKA!' }, { kind: 'sound', name: 'tryb' }, { kind: 'shake', power: 3 }],
  };
}

/** Ile mnożnik wyświetli bieżnia — nigdy mniej niż jeden, nigdy więcej niż sześć. */
export function multiplierOf(state: Rules): number {
  return Math.min(MAX_MULTIPLIER, Math.max(1, state.multiplier));
}

/** Czy dane trafienie w ogóle interesuje zasady — testy pilnują, że nic nie umknie. */
export function mattersTo(hit: Hit): boolean {
  return SCORING.has(hit.kind) || hit.kind === 'drain' || hit.kind === 'launch' || hit.tag.startsWith('klapka');
}
