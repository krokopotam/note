import { describe, expect, it } from 'vitest';
import { add, dot, len, norm, scale, sub, vec } from './geometry';
import { closestOnSegment, bounce } from './geometry';
import { BALL_R, collideCircle, collideFlipper, collideSegment, cool, createWorld, FLIPPER_UP, flipperTip, isDown, liveBalls, MAX_SPEED, plungerSpeed, pressKey, PRÓG_TORU, PULL_FULL_SPEED, PULL_MIN_SPEED, PULL_PEWNY, spawnBall, stepWorld, STUCK_AFTER } from './physics';
import type { Ball, Body, Input, World } from './physics';
import { rngFrom } from '../shared/random';

const NONE: Input = { left: false, right: false };
const FLOOR: Body = { kind: 'wall', a: vec(0, 300), b: vec(256, 300), tag: 'podłoga' };

const worldOf = (...bodies: Body[]): World => createWorld(bodies, rngFrom(7));

const ballAt = (world: World, at: { x: number; y: number }, vel = vec(0, 0)): Ball =>
  spawnBall(world, vec(at.x, at.y), vel);

/** Prowadzi świat przez `seconds` krokami 1/120 s. */
const run = (world: World, seconds: number, input: Input = NONE): void => {
  const steps = Math.round(seconds / (1 / 120));
  for (let i = 0; i < steps; i += 1) stepWorld(world, 1 / 120, input);
};

/** Najwyżej, jak kula podskoczy w tym czasie (najmniejsze `y`); po odpływie cisza. */
const szczyt = (world: World, seconds: number): number => {
  let highest = 9999;
  const steps = Math.round(seconds / (1 / 120));
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, 1 / 120, NONE);
    for (const ball of liveBalls(world)) highest = Math.min(highest, ball.pos.y);
  }
  return highest;
};

/** Jak wyżej, ale zwraca „rodzaj:tag” wszystkich zdarzeń po drodze. */
const play = (world: World, seconds: number, input: Input = NONE): string[] => {
  const log: string[] = [];
  const steps = Math.round(seconds / (1 / 120));
  for (let i = 0; i < steps; i += 1) {
    for (const hit of stepWorld(world, 1 / 120, input)) log.push(`${hit.kind}:${hit.tag}`);
  }
  return log;
};

/** Jak `run`, ale zbiera wartości `measure` w czasie — do szczytów prędkości. */
const peaks = (world: World, seconds: number, input: Input, measure: (w: World) => number): number[] => {
  const out: number[] = [];
  const steps = Math.round(seconds / (1 / 120));
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, 1 / 120, input);
    out.push(measure(world));
  }
  return out;
};

const flipper = (side: 'left' | 'right', over: Partial<Body & { kind: 'flipper' }> = {}): Body => ({
  kind: 'flipper',
  side,
  pivot: side === 'left' ? vec(80, 300) : vec(176, 300),
  length: 44,
  radius: 3,
  tipRadius: 2.2,
  rest: side === 'left' ? 0.5 : Math.PI - 0.5,
  up: side === 'left' ? -0.62 : Math.PI + 0.62,
  angle: side === 'left' ? 0.5 : Math.PI - 0.5,
  omega: 0,
  tag: `klapka.${side}`,
  ...over,
});

describe('geometria', () => {
  it('najbliższy punkt odcinka to rzut, a poza odcinkiem jego koniec', () => {
    const a = vec(0, 0);
    const b = vec(100, 0);

    expect(closestOnSegment(vec(40, 12), a, b).point).toEqual({ x: 40, y: 0 });
    expect(closestOnSegment(vec(-30, 5), a, b).point).toEqual({ x: 0, y: 0 });
    expect(closestOnSegment(vec(180, -5), a, b).point).toEqual({ x: 100, y: 0 });
    expect(closestOnSegment(vec(40, 12), a, b).distance).toBeCloseTo(12);
  });

  it('odcinek zerowy nie dzieli przez zero', () => {
    const near = closestOnSegment(vec(3, 4), vec(1, 1), vec(1, 1));
    expect(near.distance).toBeCloseTo(Math.hypot(2, 3));
    expect(near.point).toEqual({ x: 1, y: 1 });
  });

  it('odbicie zachowuje kąt przy pełnej sprężystości i zerowym tarciu', () => {
    const incoming = norm(vec(1, -1));
    const out = bounce(scale(incoming, 400), vec(0, 1), 1, 0);
    expect(out.x).toBeCloseTo(400 / Math.SQRT2, 3);
    expect(out.y).toBeCloseTo(400 / Math.SQRT2, 3);
  });

  it('kula, która już odjeżdża, nie dostaje drugiego odbicia', () => {
    // Normalna patrzy od przeszkody ku kuli, więc zgodny z nią pęd to odjazd.
    const leaving = vec(0, -200);
    expect(bounce(leaving, vec(0, -1), 0.5, 0.1)).toEqual(leaving);
  });
});

describe('grawitacja i swobodny lot', () => {
  it('kula bez przeszkód przyspiesza w dół ekranu', () => {
    const world = worldOf();
    const ball = ballAt(world, { x: 100, y: 40 });

    run(world, 0.5);

    expect(ball.vel.y).toBeGreaterThan(350);
    expect(ball.pos.y).toBeGreaterThan(130);
    expect(ball.vel.x).toBe(0);
  });

  it('pęd jest ograniczony, więc podkroki zawsze wystarczą', () => {
    const world = worldOf();
    const ball = ballAt(world, { x: 128, y: 10 }, vec(0, 9000));

    run(world, 0.1);

    expect(len(ball.vel)).toBeLessThanOrEqual(MAX_SPEED + 1);
  });
});

describe('banda', () => {
  it('kula leży na podłodze i przez nią nie przesiąka', () => {
    const world = worldOf(FLOOR);
    const ball = ballAt(world, { x: 128, y: 200 });

    run(world, 3);

    expect(ball.pos.y).toBeCloseTo(300 - BALL_R, 1);
    expect(Math.abs(ball.vel.y)).toBeLessThan(20);
  });

  it('kula traci energię na odbiciach', () => {
    const world = worldOf(FLOOR);
    const ball = ballAt(world, { x: 128, y: 100 }, vec(0, 300));
    const before = 0.5 * 300 * 300 + 760 * 200;

    run(world, 0.7);

    expect(0.5 * len(ball.vel) ** 2 + 760 * (300 - ball.pos.y)).toBeLessThan(before);
  });

  it('przy pełnej prędkości kula nie przeskakuje przez cienką bandę', () => {
    // Ściana 5 px na drodze kuli lecącej maksymalnie szybko: bez podziału na
    // podkroki taki test przechodzi tylko przez przypadek.
    const world = worldOf({ kind: 'wall', a: vec(0, 200), b: vec(256, 200), tag: 'ściana' });
    const ball = ballAt(world, { x: 128, y: 12 }, vec(0, MAX_SPEED));

    for (let i = 0; i < 12; i += 1) stepWorld(world, 1 / 60, NONE);

    expect(ball.pos.y).toBeLessThan(200);
    expect(ball.vel.y).toBeLessThan(0);
  });

  it('banda ukośna zawraca kulę w bok, a nie w siebie', () => {
    const world = worldOf({ kind: 'wall', a: vec(40, 120), b: vec(160, 240), tag: 'ukośna' });
    const ball = ballAt(world, { x: 60, y: 60 }, vec(150, 600));

    run(world, 0.6);

    expect(ball.pos.y).toBeGreaterThan(150);
    expect(len(ball.vel)).toBeGreaterThan(50);
  });

  it('koniec odcinka trzyma kulę jak wałek', () => {
    const world = worldOf({ kind: 'wall', a: vec(100, 100), b: vec(140, 100), tag: 'półka' });
    // Celnie w sam koniec: bez traktowania go jak wałka kula weszłaby w półkę.
    const ball = ballAt(world, { x: 100, y: 92 }, vec(0, 400));

    run(world, 0.12);

    expect(ball.pos.y).toBeLessThan(100);
    expect(ball.vel.y).toBeLessThan(0);
  });

  it('klapka jednokierunkowa przepuszcza od tyłu i trzyma od przodu', () => {
    const gate: Body = { kind: 'wall', a: vec(60, 200), b: vec(180, 200), tag: 'klapka', normal: vec(0, -1) };
    const up = worldOf(gate);
    const fromBelow = ballAt(up, { x: 120, y: 230 }, vec(0, -500));
    run(up, 0.25);
    expect(fromBelow.pos.y).toBeLessThan(200);

    const down = worldOf(gate);
    const fromAbove = ballAt(down, { x: 120, y: 170 }, vec(0, 500));
    run(down, 0.25);
    expect(fromAbove.pos.y).toBeLessThan(200);
  });
});

describe('słupki i zbijaki', () => {
  it('słupek odbija kulę po normalnej', () => {
    const world = worldOf({ kind: 'post', at: vec(128, 200), r: 6, tag: 'słupek' });
    const ball = ballAt(world, { x: 128, y: 150 }, vec(0, 400));

    run(world, 0.3);

    expect(ball.vel.y).toBeLessThan(0);
    expect(ball.pos.y).toBeLessThan(200);
  });

  it('zbijak dokłada kopnięcie i zgłasza trafienie', () => {
    const world = worldOf({ kind: 'bumper', at: vec(128, 200), r: 9, tag: 'zbijak', kick: 420 });
    ballAt(world, { x: 128, y: 168 }, vec(0, 120));

    const world2 = worldOf({ kind: 'bumper', at: vec(128, 200), r: 9, tag: 'zbijak', kick: 420 });
    ballAt(world2, { x: 128, y: 168 }, vec(0, 120));

    expect(play(world, 0.5)).toContain('bumper:zbijak');
    // Kopia musi być wyraźnie mocniejsza niż samo odbicie od krążka.
    const calm = worldOf({ kind: 'post', at: vec(128, 200), r: 9, tag: 'krążek' });
    ballAt(calm, { x: 128, y: 168 }, vec(0, 120));
    expect(Math.min(...peaks(world2, 0.5, NONE, (w) => w.balls[0].vel.y))).toBeLessThan(
      Math.min(...peaks(calm, 0.5, NONE, (w) => w.balls[0].vel.y)),
    );
  });

  it('zbijak po odpaleniu ma ułamek sekundy milczenia', () => {
    const world = worldOf({ kind: 'bumper', at: vec(128, 200), r: 9, tag: 'zbijak', kick: 420 });
    cool(world, 'zbijak', world.time + 0.09);
    ballAt(world, { x: 128, y: 168 }, vec(0, 120));

    expect(play(world, 0.08)).not.toContain('bumper:zbijak');
    expect(play(world, 0.3)).toContain('bumper:zbijak');
  });

  it('wyłączony zbijak jest tylko przeszkodą', () => {
    const world = worldOf({ kind: 'bumper', at: vec(128, 200), r: 9, tag: 'zbijak', kick: 420 });
    cool(world, 'zbijak', 10);
    ballAt(world, { x: 128, y: 168 }, vec(0, 120));

    const hits = play(world, 0.5);

    expect(hits).not.toContain('bumper:zbijak');
    expect(hits).toContain('post:zbijak.dead');
  });

  it('razemek wyrzuca kulę i na chwilę gaśnie', () => {
    const sling: Body = { kind: 'sling', a: vec(90, 250), b: vec(110, 290), tag: 'razemek', kick: 300 };
    const world = worldOf(sling);
    // Kula wpada od góry na twarz razemka — tak samo jak przy Flipperze po lewej.
    ballAt(world, { x: 140, y: 230 }, vec(-350, 100));

    const hits = play(world, 0.2);

    expect(hits).toContain('sling:razemek');
    expect(isDown(world, 'razemek')).toBe(true);
  });
});

describe('celki', () => {
  it('celka zgłasza trafienie, a przewrócona nie przeszkadza', () => {
    const target: Body = { kind: 'target', at: vec(60, 180), r: 4, tag: 'celka.1' };
    const world = worldOf(target);
    ballAt(world, { x: 60, y: 150 }, vec(0, 300));

    expect(play(world, 0.2)).toContain('target:celka.1');

    // Przewrócona: kula przelatuje obok i nie zgłasza celu.
    cool(world, 'celka.1', 999);
    const later = play(world, 0.6);
    expect(later).not.toContain('target:celka.1');
  });
});

describe('klapki', () => {
  it('spoczywają na dole i wracają, gdy puszczę', () => {
    const left = flipper('left');
    const world = worldOf(left);

    run(world, 0.4, { left: true, right: false });
    expect((left as Extract<Body, { kind: 'flipper' }>).angle).toBeCloseTo(-0.62, 2);

    run(world, 0.6);
    expect((left as Extract<Body, { kind: 'flipper' }>).angle).toBeCloseTo(0.5, 2);
  });

  it('kula na klapce stacza się ku końcowi, nie w studnię', () => {
    const left = flipper('left');
    const world = worldOf(left);
    const ball = ballAt(world, { x: 92, y: 296 });

    run(world, 1.2);

    expect(ball.pos.x).toBeGreaterThan(96);
    expect(ball.alive).toBe(true);
  });

  it('rąbnięcie klapką wyrzuca kulę w górę', () => {
    const left = flipper('left');
    const world = worldOf(left);
    ballAt(world, { x: 100, y: 305 }, vec(0, 120));

    const up = peaks(world, 0.4, { left: true, right: false }, (w) =>
      w.balls.length ? w.balls[0].vel.y : 0,
    );

    expect(Math.min(...up)).toBeLessThan(-320);
  });

  it('koniec klapki kopie mocniej niż środek', () => {
    const launch = (x: number): number => {
      const left = flipper('left');
      const world = worldOf(left);
      const body = left as Extract<Body, { kind: 'flipper' }>;
      const tip = flipperTip(body);
      const ball = ballAt(world, { x, y: body.pivot.y + (x - body.pivot.x) * 0.55 - 4 }, vec(0, 90));
      void tip;
      run(world, 0.35, { left: true, right: false });
      return len(ball.vel);
    };

    expect(launch(116)).toBeGreaterThan(launch(88));
  });

  it('trzymana w górze klapka nie kopie bez końca', () => {
    const left = flipper('left', { angle: -0.62 });
    const world = worldOf(left);
    const body = left as Extract<Body, { kind: 'flipper' }>;
    const ball = ballAt(world, { x: 100, y: 274 }, vec(0, 60));

    run(world, 0.5, { left: true, right: false });

    expect(body.omega).toBe(0);
    expect(len(ball.vel)).toBeLessThan(260);
  });

  it('prędkość powierzchni rośnie z odległością od obrotu', () => {
    const left = flipper('left', { angle: 0, omega: -FLIPPER_UP });
    const world = worldOf(left);
    const near = ballAt(world, { x: 88, y: 296 }, vec(0, 0));
    const far = ballAt(world, { x: 118, y: 296 }, vec(0, 0));

    collideFlipper(near, left as Extract<Body, { kind: 'flipper' }>);
    collideFlipper(far, left as Extract<Body, { kind: 'flipper' }>);

    expect(len(far.vel)).toBeGreaterThan(len(near.vel));
  });

  it('klapka nie przesuwa kuli, która jej nie dotyka', () => {
    const left = flipper('left');
    const world = worldOf(left);
    const ball = ballAt(world, { x: 200, y: 100 }, vec(0, 0));
    const before = { ...ball.pos };

    run(world, 0.4, { left: true, right: true });

    expect(ball.pos.x).toBeCloseTo(before.x);
  });

  it('kula wciśnięta w klapkę zostaje wypchnięta, nie zniknie w niej', () => {
    const left = flipper('left', { angle: -0.62, omega: 0 });
    const body = left as Extract<Body, { kind: 'flipper' }>;
    const world = worldOf(left);
    const tip = flipperTip(body);
    const ball = ballAt(world, { x: tip.x, y: tip.y }, vec(0, 0));

    run(world, 0.2);

    const near = closestOnSegment(ball.pos, body.pivot, tip);
    expect(near.distance).toBeGreaterThanOrEqual(ball.r + body.radius - 0.6);
  });
});

describe('czujniki, otwór, kicker', () => {
  it('rollover odpala się raz na wejście i zbroi po wyjściu', () => {
    const sensor: Body = { kind: 'sensor', at: vec(128, 100), r: 8, tag: 'pas' };
    const world = worldOf(sensor);
    const ball = ballAt(world, { x: 128, y: 98 }, vec(60, 0));

    const first = stepWorld(world, 1 / 60, NONE);
    const second = stepWorld(world, 1 / 60, NONE);

    expect(first.filter((h) => h.kind === 'roll')).toHaveLength(1);
    expect(second.filter((h) => h.kind === 'roll')).toHaveLength(0);

    ball.pos = vec(128, 60);
    ball.vel = vec(0, 300);
    run(world, 0.3);
    expect(world.balls[0]).toBeDefined();
  });

  it('kicker chwyta kulę i zgłasza zdarzenie', () => {
    const kicker: Body = { kind: 'kicker', at: vec(128, 60), r: 7, tag: 'koleś', shot: vec(0, 900) };
    const world = worldOf(kicker);
    ballAt(world, { x: 128, y: 60 }, vec(0, 200));

    const hits = stepWorld(world, 1 / 60, NONE);

    expect(hits.some((h) => h.kind === 'kicker' && h.tag === 'koleś')).toBe(true);
    expect(world.balls).toHaveLength(0);
  });

  it('spadek poza dół to otwór', () => {
    const world = worldOf();
    ballAt(world, { x: 128, y: 508 }, vec(0, 200));

    expect(play(world, 0.1)).toContain('drain:otwór');
    expect(world.balls).toHaveLength(0);
  });

  it('kilka kul liczy się osobno', () => {
    const world = worldOf(FLOOR);
    const a = ballAt(world, { x: 60, y: 200 }, vec(30, 0));
    const b = ballAt(world, { x: 200, y: 120 }, vec(-40, 0));

    run(world, 1.4);

    expect(a.pos.x).toBeLessThan(b.pos.x);
    expect(a.alive).toBe(true);
    expect(b.alive).toBe(true);
  });
});

describe('kula, która stanęła', () => {
  it('dostaje kopniaka zamiast stać w nieskończoność', () => {
    const noGravity = worldOf();
    noGravity.gravity = vec(0, 0);
    const ball = ballAt(noGravity, { x: 128, y: 256 }, vec(2, 0));

    const hits: string[] = [];
    for (let i = 0; i < Math.ceil((STUCK_AFTER + 0.4) * 120); i += 1) {
      for (const hit of stepWorld(noGravity, 1 / 120, NONE)) hits.push(hit.kind);
    }

    expect(hits).toContain('stuck');
    expect(len(ball.vel)).toBeGreaterThan(60);
  });
});

describe('wyrzutnik', () => {
  // Sam korytarz toru, bez reszty stołu — tu chodzi wyłącznie o to, czy kula
  // wylezie spod sprężyny na górę (y poniżej 60), czy nie.
  const korytarz = (): World =>
    worldOf(
      { kind: 'wall', a: vec(236, 40), b: vec(236, 470), tag: 'tor' },
      { kind: 'wall', a: vec(250, 40), b: vec(250, 470), tag: 'tor' },
    );

  const strzel = (pull: number): number => {
    const world = korytarz();
    ballAt(world, { x: 243, y: 460 }, vec(0, -plungerSpeed(pull)));
    return szczyt(world, 1.2);
  };

  it('prędkość rośnie wprost z naciągnięcia', () => {
    expect(plungerSpeed(0)).toBe(PULL_MIN_SPEED);
    expect(plungerSpeed(0.5)).toBeGreaterThan(plungerSpeed(0.2));
    expect(plungerSpeed(1)).toBeCloseTo(PULL_FULL_SPEED, 0);
  });

  it('pełne wciśnięcie wyprowadza kulę z prawego toru na górę stołu', () => {
    expect(strzel(1)).toBeLessThan(60);
  });

  // Całe „dźwignia prawie się nie podnosi” siedziało w krzywej siły: kwadratowa
  // zostawiała środek skali poniżej progu i kula wracała na sprężynę.
  it('próg pewny wynosi kulę z toru, muśnięcie zostawia ją w środku', () => {
    expect(plungerSpeed(PULL_PEWNY)).toBeGreaterThanOrEqual(PRÓG_TORU);
    expect(strzel(PULL_PEWNY)).toBeLessThan(60);
    expect(strzel(0)).toBeGreaterThan(60);
  });
});

describe('powtarzalność', () => {
  const play = (seed: number) => {
    const world = worldOf(
      { kind: 'bumper', at: vec(100, 180), r: 9, tag: 'a', kick: 380 },
      { kind: 'bumper', at: vec(150, 160), r: 9, tag: 'b', kick: 380 },
      { kind: 'post', at: vec(128, 260), r: 5, tag: 'p' },
      flipper('left'),
      flipper('right'),
    );
    spawnBall(world, vec(128, 40), vec(24, 120));
    const log: string[] = [];
    const rng = rngFrom(seed);
    for (let i = 0; i < 1200; i += 1) {
      const input = { left: rng() < 0.2, right: rng() < 0.2 };
      for (const hit of stepWorld(world, 1 / 120, input)) log.push(`${hit.kind}:${hit.tag}`);
      if (world.balls.length === 0) spawnBall(world, vec(128, 40), vec(24, 120));
    }
    return log.join('|');
  };

  it('ten sam seed daje dokładnie tę samą grę', () => {
    expect(play(11)).toBe(play(11));
  });

  it('wciskanie klapek change tor kuli', () => {
    const drop = (pattern: (i: number) => boolean) => {
      const world = worldOf(flipper('left'), flipper('right'));
      spawnBall(world, vec(96, 240), vec(6, 200));
      for (let i = 0; i < 260; i += 1) stepWorld(world, 1 / 120, { left: pattern(i), right: false });
      return world.balls.length ? vec(world.balls[0].pos.x, world.balls[0].pos.y) : vec(-1, -1);
    };

    const idle = drop(() => false);
    const beating = drop((i) => i % 24 < 6);

    expect(Math.hypot(idle.x - beating.x, idle.y - beating.y)).toBeGreaterThan(20);
  });

  it('fizyka nie rodzi NaN nawet po 10 sekundach bicia o wszystko', () => {
    const world = worldOf(
      { kind: 'bumper', at: vec(120, 200), r: 9, tag: 'a', kick: 380 },
      { kind: 'sling', a: vec(90, 250), b: vec(110, 290), tag: 'r', kick: 300 },
      flipper('left'),
      flipper('right'),
    );
    spawnBall(world, vec(124, 190), vec(0, 400));
    for (let i = 0; i < 1200; i += 1) {
      stepWorld(world, 1 / 120, { left: i % 37 === 0, right: i % 53 === 0 });
      for (const ball of world.balls) {
        expect(Number.isFinite(ball.pos.x + ball.pos.y + ball.vel.x + ball.vel.y)).toBe(true);
      }
    }
  });
});

describe('fizyka vs wektory', () => {
  it('wypchnięcie z okręgu stawia kulę dokładnie na jego powierzchni', () => {
    const world = worldOf();
    const ball = ballAt(world, { x: 128, y: 202 });
    const hit = collideCircle(ball, vec(128, 210), 10, { restitution: 0.5 });
    expect(hit).not.toBeNull();
    expect(len(sub(ball.pos, vec(128, 210)))).toBeCloseTo(10 + ball.r, 3);
  });

  it('kolizja z odcinkiem nie dodaje energii, gdy powierzchnia stoi', () => {
    const world = worldOf();
    const ball = ballAt(world, { x: 128, y: 103 }, vec(0, 200));
    collideSegment(ball, vec(0, 106), vec(256, 106), { restitution: 1, friction: 0 });
    expect(len(ball.vel)).toBeLessThanOrEqual(200.001);
    expect(dot(ball.vel, vec(0, 1))).toBeLessThan(0);
  });

  it('gdy środek kuli trafi dokładnie na odcinek, normalna jest przeciwna pędowi', () => {
    const world = worldOf();
    const ball = ballAt(world, { x: 128, y: 100 }, vec(0, 220));
    collideSegment(ball, vec(0, 100), vec(256, 100), { restitution: 0.8, friction: 0 });
    expect(ball.vel.y).toBeLessThan(0);
  });

  it('odbicie od ściany bocznej świata zawraca kulę do środka', () => {
    const world = worldOf();
    const ball = ballAt(world, { x: 1, y: 200 }, vec(-600, 0));
    run(world, 0.1);
    expect(ball.vel.x).toBeGreaterThan(0);
    expect(add(ball.pos, vec(0, 0)).x).toBeGreaterThanOrEqual(BALL_R);
  });

  it('norma zera to zero, bez NaN', () => {
    expect(norm(vec(0, 0))).toEqual({ x: 0, y: 0 });
    expect(scale(norm(vec(0, 0)), 5)).toEqual({ x: 0, y: 0 });
  });
});

describe('mapa klawiszy', () => {
  it('strzałka w prawo porusza prawą klapką, nie lewą', () => {
    // Martwa prawa klapka przeżyła tyle wydań, bo całe testy klapek budowały
    // lewą. Ta mapa jest teraz badana wprost, bez przeklikiwania ekranu.
    const input = { left: false, right: false, mini: false };
    expect(pressKey(input, 'ArrowRight', true)).toBe(true);
    expect(input).toEqual({ left: false, right: true, mini: false });
    pressKey(input, 'ArrowRight', false);
    expect(input.right).toBe(false);
  });

  it('klawiszy klapek jest sześć i trafiają tam, gdzie trzeba', () => {
    const sprawdź = (klawisz: string, strona: 'left' | 'right' | 'mini'): void => {
      const input = { left: false, right: false, mini: false };
      expect(pressKey(input, klawisz, true), klawisz).toBe(true);
      expect(input[strona], klawisz).toBe(true);
      expect([input.left, input.right, input.mini].filter(Boolean), `${klawisz} nie powinna zająć dwóch klapek`).toHaveLength(1);
    };
    for (const klawisz of ['ArrowLeft', 'z', 'Z']) sprawdź(klawisz, 'left');
    for (const klawisz of ['ArrowRight', '.', '/']) sprawdź(klawisz, 'right');
    for (const klawisz of ['ArrowUp', 'w', 'W']) sprawdź(klawisz, 'mini');
  });

  it('obca strzałka nie jest klapką', () => {
    const input = { left: false, right: false, mini: false };
    // Spacja i strzałka w dół należą do wyrzutnika — widok musi je obsłużyć sam.
    expect(pressKey(input, ' ', true)).toBe(false);
    expect(pressKey(input, 'ArrowDown', true)).toBe(false);
    expect(input).toEqual({ left: false, right: false, mini: false });
  });
});
