import { describe, expect, it } from 'vitest';
import { vec } from './geometry';
import { createWorld, liveBalls, plungerSpeed, spawnBall, stepWorld } from './physics';
import type { Body, Hit, Input } from './physics';
import {
  FLIPPER_LENGTH,
  LANE_TAGS,
  LEFT_FLIPPER_PIVOT,
  PLUNGER,
  SAUCER,
  SCORE_TAGS,
  TABLE_H,
  TABLE_W,
  bodiesOf,
  buildTable,
} from './table';
import { createEngine } from './engine';
import { rngFrom } from '../shared/random';

const NONE: Input = { left: false, right: false };

/** Końce odcinka jako para punktów bez kolejności. */
const endpoints = (body: { a: { x: number; y: number }; b: { x: number; y: number } }) =>
  [body.a, body.b]
    .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .sort();

/** Lustro całego odcinka. */
const mirrorOf = (body: { a: { x: number; y: number }; b: { x: number; y: number } }) => ({
  a: { x: TABLE_W - body.a.x, y: body.a.y },
  b: { x: TABLE_W - body.b.x, y: body.b.y },
});
const bodies = buildTable();
const world = () => createWorld(buildTable(), rngFrom(2024));

interface Fate {
  kind: Hit['kind'] | 'czas';
  stuck: number;
  seconds: number;
  escaped: boolean;
  nan: boolean;
}

/**
 * Rzuć kulą i czekaj, aż skończy się na czymś: otwór, kielich albo upływ czasu.
 * Zapisujemy po drodze każdy przypadek ucieczki z pola i każdy kopniak dla kuli,
 * która stanęła — to jedyne uczciwe sposoby sprawdzenia, czy stół jest szczelny.
 */
function drop(x: number, y: number, vel = vec(0, 0), limit = 24): Fate {
  const w = world();
  spawnBall(w, vec(x, y), vel);
  let stuck = 0;
  let elapsed = 0;
  let escaped = false;
  let nan = false;
  const step = 1 / 120;
  while (elapsed < limit) {
    const hits = stepWorld(w, step, NONE);
    elapsed += step;
    for (const hit of hits) {
      if (hit.kind === 'drain') return { kind: 'drain', stuck, seconds: elapsed, escaped, nan };
      if (hit.kind === 'kicker') return { kind: 'kicker', stuck, seconds: elapsed, escaped, nan };
      if (hit.kind === 'stuck') stuck += 1;
    }
    for (const ball of liveBalls(w)) {
      if (!Number.isFinite(ball.pos.x + ball.pos.y + ball.vel.x + ball.vel.y)) nan = true;
      if (ball.pos.x < -1 || ball.pos.x > TABLE_W + 1 || ball.pos.y > TABLE_H + 40) escaped = true;
    }
    if (liveBalls(w).length === 0) return { kind: 'drain', stuck, seconds: elapsed, escaped, nan };
  }
  return { kind: 'czas', stuck, seconds: elapsed, escaped, nan };
}

describe('geometria stołu', () => {
  it('ma wszystkie elementy, na które patzą zasady', () => {
    const tags = new Set(bodies.map((body) => body.tag));
    for (const lane of SCORE_TAGS.lanes) expect(tags.has(lane)).toBe(true);
    for (const bumper of SCORE_TAGS.bumpers) expect(tags.has(bumper)).toBe(true);
    for (const target of [...SCORE_TAGS.bank, ...SCORE_TAGS.standups]) expect(tags.has(target)).toBe(true);
    for (const inlane of SCORE_TAGS.inlanes) expect(tags.has(inlane)).toBe(true);
    for (const sling of SCORE_TAGS.slings) expect(tags.has(sling)).toBe(true);
    expect(tags.has(SCORE_TAGS.saucer)).toBe(true);
    expect(tags.has('klapka.l')).toBe(true);
    expect(tags.has('klapka.p')).toBe(true);
  });

  it('lewa i prawa strona są swoimi lustrami', () => {
    const walls = bodiesOf('wall', bodies);
    // Parę mają tylko bandy budowane parami; zewnętrzna lewa i ściany toru są z
    // natury jednostronne.
    const left = walls.filter((wall) => wall.tag.endsWith('.l') && !wall.tag.startsWith('ściana zewnętrzna'));
    expect(left.length).toBeGreaterThan(4);
    for (const wall of left) {
      const twin = walls.find((candidate) => candidate.tag === `${wall.tag.slice(0, -2)}.p`);
      expect(twin, `brak lustrzanej ściany dla ${wall.tag}`).toBeDefined();
      // Końce porównuję jako zbiór: kierunek biegu odcinka nie ma znaczenia dla
      // fizyki, liczy się tylko to, żeby oba brzegi były swoimi lustrami.
      expect(endpoints(twin!)).toEqual(endpoints(mirrorOf(wall)));
    }
  });

  it('klapki są tej samej długości i patrzą na siebie', () => {
    const klapy = bodiesOf('flipper', bodies);
    expect(klapy).toHaveLength(3);
    const [l, r] = ['left', 'right'].map((strona) => klapy.find((f) => f.side === strona)!);
    expect(l.length).toBe(r.length);
    expect(l.length).toBe(FLIPPER_LENGTH);
    const leftTip = l.pivot.x + Math.cos(l.rest) * l.length;
    const rightTip = r.pivot.x + Math.cos(r.rest) * r.length;
    const free = rightTip - leftTip - 2 * l.tipRadius;
    // Między czubkami zamkniętych klapiek musi się zmieścić kula (9.2 px) —
    // inaczej kula siada w widełkach i patrzy na gracza. Bez przerwy zaś
    // środek stołu byłby darmowy.
    expect(free).toBeGreaterThan(9.2);
    expect(free).toBeLessThan(13);
  });

  it('obie główne klapy mają ten sam zakres i obie idą do góry', () => {
    const klapy = bodiesOf('flipper', bodies);
    const [l, r] = ['left', 'right'].map((strona) => klapy.find((f) => f.side === strona)!);
    const zakres = (f: Extract<Body, { kind: 'flipper' }>) => Math.abs(f.up - f.rest);
    const czubek = (f: Extract<Body, { kind: 'flipper' }>, kat: number) => ({
      x: f.pivot.x + Math.cos(kat) * f.length,
      y: f.pivot.y + Math.sin(kat) * f.length,
    });

    expect(zakres(r)).toBeCloseTo(zakres(l), 6);
    // Klapka o zakresie mniejszym niż pół kąta prostego to ozdoba, nie klapka.
    expect(zakres(l)).toBeGreaterThan(1);
    for (const f of [l, r]) {
      // „Góra" musi znaczyć wyżej po obu stronach i czubek musi wracać do środka.
      expect(czubek(f, f.up).y).toBeLessThan(czubek(f, f.rest).y);
      const doŚrodka = f.side === 'left' ? czubek(f, f.rest).x > f.pivot.x : czubek(f, f.rest).x < f.pivot.x;
      expect(doŚrodka, `klapka ${f.side} patrzy nie tam, gdzie trzeba`).toBe(true);
    }
  });

  it('prawa klapka podbija kulę tak samo jak lewa', () => {
    // Testy fizyki od pierwszej wersji budowały klapkę lewą i tylko lewą —
    // dlatego lustrzany znak przy „up" przeżył tyle wydań: prawa klapka miała
    // zakres 4,6° i ruszała się w dół, w stronę odpływu.
    const podbite = (strona: 'left' | 'right') => {
      const w = world();
      // Środek lemiesza jest na wysokości 458, kula siada na nim własnym
      // ciężarem i dostaje zamach — niżej byłaby już nad odpływem.
      spawnBall(w, vec(strona === 'left' ? 104 : 152, 449), vec(0, 0));
      let wGórę = 0;
      const input = strona === 'left' ? { left: true, right: false } : { left: false, right: true };
      for (let i = 0; i < 60; i += 1) {
        stepWorld(w, 1 / 120, input);
        const kula = liveBalls(w)[0];
        if (kula) wGórę = Math.min(wGórę, kula.vel.y);
      }
      return wGórę;
    };

    const lewa = podbite('left');
    const prawa = podbite('right');
    expect(lewa).toBeLessThan(-250);
    expect(prawa).toBeLessThan(-250);
    expect(Math.abs(prawa - lewa)).toBeLessThan(160);
  });

  it('mini-klapka stoi na lewej orbicie i robi pełny zamach', () => {
    const mini = bodiesOf('flipper', bodies).find((f) => f.side === 'mini');
    expect(mini).toBeDefined();
    const f = mini as Extract<Body, { kind: 'flipper' }>;
    expect(f.tag).toBe('klapka.mini');
    expect(Math.abs(f.up - f.rest)).toBeGreaterThan(1);
    expect(f.pivot.y).toBeLessThan(LEFT_FLIPPER_PIVOT.y - 100);
    // Kula zjeżdżająca lewą burtą musi w nią trafić, a nie minąć prawą stroną.
    expect(f.pivot.x + f.length).toBeGreaterThan(28);
  });

  it('mini-klapka nie robi kieszonki przy burcie', () => {
    // Przy lewej burcie kula ma tyle miejsca, ile potrzebuje, by minąć oś obrotu:
    // bez tego wisi tam w nieskończoność, a partia bez klapek nigdy się nie kończy.
    for (const y of [244, 250, 256]) {
      const fate = drop(14, y, vec(0, 60), 8);
      expect(fate.stuck, `kula uwięzła przy burcie na wysokości ${y}`).toBeLessThan(2);
    }
  });

  it('wszystko, co ma być na polu, mieści się w buforze', () => {
    for (const body of bodies) {
      const points =
        body.kind === 'wall' || body.kind === 'sling' || body.kind === 'drain'
          ? [body.a, body.b]
          : 'at' in body
            ? [body.at]
            : body.kind === 'flipper'
              ? [body.pivot]
              : [];
      for (const point of points) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(TABLE_W);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(TABLE_H);
      }
    }
  });

  it('każdy pas ma swój próg i jest pod łukiem', () => {
    const sensors = bodiesOf('sensor', bodies).filter((sensor) => sensor.tag.startsWith('pas.'));
    expect(sensors).toHaveLength(LANE_TAGS.length);
    for (const sensor of sensors) {
      expect(sensor.at.y).toBeGreaterThan(60);
      expect(sensor.at.y).toBeLessThan(110);
      expect(sensor.at.x).toBeGreaterThan(40);
      expect(sensor.at.x).toBeLessThan(TABLE_W - 40);
    }
    // Przegrody między pasami: o jeden mniej niż pasów.
    const walls = bodiesOf('wall', bodies).filter((wall) => wall.tag === 'przegroda');
    expect(walls).toHaveLength(LANE_TAGS.length - 1);
  });

  it('każdy punkt jest do osiągnięcia — nie ma martwych celów', () => {
    // Przewody pasów leżą na drodze kuli i mogą dotykać bandy — tak jest w istocie.
    // Prawdziwe pytanie brzmi: czy cokolwiek kiedykolwiek w nie wpada.
    const reached = new Set<string>();
    for (let x = 30; x <= 226; x += 6) {
      for (const y of [96, 150, 200, 260, 330]) {
        const w = world();
        spawnBall(w, vec(x, y), vec(((x % 7) - 3) * 26, 0));
        for (let i = 0; i < 24 * 120 && liveBalls(w).length; i += 1) {
          for (const hit of stepWorld(w, 1 / 120, NONE)) {
            if (hit.kind !== 'wall') reached.add(hit.tag);
          }
        }
      }
    }
    const wanted = [
      ...SCORE_TAGS.lanes,
      ...SCORE_TAGS.bumpers,
      ...SCORE_TAGS.bank,
      ...SCORE_TAGS.standups,
      ...SCORE_TAGS.inlanes,
      ...SCORE_TAGS.slings,
      SCORE_TAGS.saucer,
    ];
    expect(wanted.filter((tag) => !reached.has(tag))).toEqual([]);
  });

  it('kielich i wyrzutnik stoją tam, gdzie je rysuję', () => {
    const kicker = bodiesOf('kicker', bodies)[0];
    expect(kicker.at.x).toBe(SAUCER.x);
    expect(kicker.at.y).toBe(SAUCER.y);
    // Kula na wyrzutniku opiera się o dno kanału i nie wchodzi w żadną ścianę.
    const w = world();
    const ball = spawnBall(w, PLUNGER);
    const hits = stepWorld(w, 1 / 60, NONE);
    expect(hits.filter((hit) => hit.kind === 'drain' || hit.kind === 'kicker')).toHaveLength(0);
    expect(ball.pos.x).toBeCloseTo(PLUNGER.x, 3);
  });
});

describe('stół jest szczelny', () => {
  const grid: Array<[number, number]> = [];
  for (let x = 44; x <= 212; x += 14) grid.push([x, 96]);
  for (let x = 34; x <= 224; x += 10) grid.push([x, 200]);
  for (let x = 30; x <= 226; x += 16) grid.push([x, 330]);

  it('kula zrzucona z każdego miejsca kończy na otworze albo w kielichu', () => {
    const fates = grid.map(([x, y]) => ({ at: [x, y], fate: drop(x, y) }));
    const stuck = fates.filter((entry) => entry.fate.kind === 'czas');
    expect(stuck.map((entry) => `${entry.at[0]},${entry.at[1]}`)).toEqual([]);
  });

  it('żadna kula nie ucieka z pola ani nie rodzi NaN', () => {
    for (const [x, y] of grid) {
      const fate = drop(x, y);
      expect(fate.escaped, `ucieczka z ${x},${y}`).toBe(false);
      expect(fate.nan, `NaN z ${x},${y}`).toBe(false);
    }
  });

  it('kula wprawiona w tarpana dostaje kopniaka, ale rzadko', () => {
    let stuck = 0;
    let drops = 0;
    for (let x = 40; x <= 216; x += 8) {
      for (const y of [110, 240]) {
        drops += 1;
        stuck += drop(x, y).stuck;
      }
    }
    expect(stuck / drops).toBeLessThan(0.08);
  });

  it('kula wpuszczona w lewy nalot dojeżdża do klapki, nie do kanału', () => {
    const w = world();
    const ball = spawnBall(w, vec(52, 372), vec(-10, 160));
    let reachedFlipper = false;
    for (let i = 0; i < 300; i += 1) {
      stepWorld(w, 1 / 120, NONE);
      if (liveBalls(w).length === 0) break;
      if (ball.pos.y > 430 && ball.pos.x > 60) reachedFlipper = true;
    }
    expect(reachedFlipper).toBe(true);
  });

  it('pełne wciśnięcie wyrzutnika prowadzi kulę przez punkty, nie burtą w dół', () => {
    // Geometria rogu nad torem robi całą partię: jeśli kula odbija się z powrotem
    // na prawą burtę, schodzi na dół nie trącając niczego i wynik stoi.
    const engine = createEngine(1);
    engine.launch(1);
    let lewaPołowa = false;
    for (let i = 0; i < 140 * 12; i += 1) {
      engine.step(1 / 120, NONE);
      const ball = liveBalls(engine.swiat())[0];
      if (ball && ball.pos.x < TABLE_W / 2 && ball.pos.y < 300) lewaPołowa = true;
      if (engine.faza() === 'ładowanie') break;
    }
    expect(engine.zasady().score).toBeGreaterThan(0);
    expect(lewaPołowa).toBe(true);
  });

  it('pełne wciśnięcie wyrzutnika wyprowadza kulę na pole', () => {
    const w = world();
    const ball = spawnBall(w, PLUNGER, vec(0, -plungerSpeed(1)));
    let entered = false;
    for (let i = 0; i < 400; i += 1) {
      stepWorld(w, 1 / 120, NONE);
      if (liveBalls(w).length === 0) break;
      if (ball.pos.x < 224 && ball.pos.y < 110) entered = true;
    }
    expect(entered).toBe(true);
  });

  it('kula po wpadnięciu do kanału bocznego wypada na dół', () => {
    const w = world();
    spawnBall(w, vec(16, 390), vec(0, 60));
    let drained = false;
    for (let i = 0; i < 600 && !drained; i += 1) {
      for (const hit of stepWorld(w, 1 / 120, NONE)) if (hit.kind === 'drain') drained = true;
    }
    expect(drained).toBe(true);
  });

  it('sto sekund dzikiej gry nie zostawia kuli w nieskończoność bez zdarzeń', () => {
    const w = world();
    spawnBall(w, vec(128, 120), vec(60, 0));
    let lastEvent = 0;
    let worstGap = 0;
    const rng = rngFrom(5);
    for (let i = 0; i < 120 * 100; i += 1) {
      const t = i / 120;
      const hits = stepWorld(w, 1 / 120, { left: rng() < 0.06, right: rng() < 0.06 });
      if (hits.length > 0) {
        worstGap = Math.max(worstGap, t - lastEvent);
        lastEvent = t;
      }
      if (liveBalls(w).length === 0) spawnBall(w, vec(128, 120), vec(60, 0));
    }
    // Dłuższa niż 6 s cisza znaczy, że kula leży gdzieś bezużytecznie.
    expect(worstGap).toBeLessThan(6);
  });
});

describe('ciała stołu', () => {
  it('zbijaki mają ten sam promień i kopnięcie', () => {
    const bumpers = bodiesOf('bumper', bodies);
    expect(bumpers).toHaveLength(3);
    const kicks = new Set(bumpers.map((bumper) => bumper.kick));
    const radii = new Set(bumpers.map((bumper) => bumper.r));
    expect(kicks.size).toBe(1);
    expect(radii.size).toBe(1);
  });

  it('razemarks patrzą na siebie', () => {
    const slings = bodiesOf('sling', bodies);
    expect(slings).toHaveLength(2);
    expect(endpoints(slings[1])).toEqual(endpoints(mirrorOf(slings[0])));
    // Twarz razemka musi patrzeć na środek pola, inaczej kopie w ścianę.
    expect(slings[0].a.x).toBeLessThan(TABLE_W / 2);
    expect(slings[1].b.x).toBeGreaterThan(TABLE_W / 2);
  });

  it('brama toru przepuszcza tylko w górę', () => {
    const gate = bodiesOf('wall', bodies).find((wall) => wall.tag === 'brama.tor') as Body & {
      normal?: { x: number; y: number };
    };
    expect(gate.normal).toBeDefined();
    expect(gate.normal!.y).toBeLessThan(0);
  });

  it('lista ciał nie zmienia się między wywołaniami', () => {
    expect(buildTable()).toHaveLength(bodies.length);
  });
});
