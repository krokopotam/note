import { describe, expect, it } from 'vitest';
import {
  BALL_R,
  CUE_ID,
  HEAD,
  POCKETS,
  TABLE,
  bookShot,
  createRack,
  cueBall,
  leftToPot,
  powerFromDrag,
  predict,
  resting,
  simulate,
  step,
  strike,
} from './billiards';
import type { StepEvents, World } from './billiards';

/** Two balls only, so a collision test is about the collision and nothing else. */
const twoBalls = (cue: { x: number; y: number }, other: { x: number; y: number }) => {
  const world = createRack();
  world.balls = [
    { ...cueBall(world), x: cue.x, y: cue.y },
    { ...world.balls[1], x: other.x, y: other.y },
  ];
  return world;
};

/** Steps the table for a while and gathers everything that happened on the way. */
const run = (world: World, seconds: number, dt = 1 / 240) => {
  let current = world;
  const potted: StepEvents['potted'] = [];
  const cushions: StepEvents['cushions'] = [];
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    const next = step(current, dt);
    current = next.world;
    potted.push(...next.events.potted);
    cushions.push(...next.events.cushions);
  }
  return { world: current, events: { potted, cushions } };
};

describe('bilard: ustawienie', () => {
  it('rozkłada biały kamy i dziesięć kul w trójkąt', () => {
    const world = createRack();

    expect(world.balls).toHaveLength(11);
    expect(leftToPot(world)).toBe(10);
    expect(cueBall(world)).toMatchObject({ x: HEAD.x, y: HEAD.y, cue: true, potted: false });
    expect(resting(world)).toBe(true);
  });

  it('żadna kula nie zachodzi na inną ani na łuzę', () => {
    const { balls } = createRack();

    for (const ball of balls) {
      expect(ball.x).toBeGreaterThan(BALL_R);
      expect(ball.x).toBeLessThan(TABLE.width - BALL_R);
      expect(ball.y).toBeGreaterThan(BALL_R);
      expect(ball.y).toBeLessThan(TABLE.height - BALL_R);
      for (const other of balls) {
        if (other.id === ball.id) continue;
        expect(Math.hypot(ball.x - other.x, ball.y - other.y)).toBeGreaterThan(BALL_R * 1.98);
      }
      for (const pocket of POCKETS) {
        expect(Math.hypot(ball.x - pocket.x, ball.y - pocket.y)).toBeGreaterThan(BALL_R * 2);
      }
    }
  });
});

describe('bilard: fizyka', () => {
  it('uderzenie czołe przenosi prawie cały pęd na drugą kulę', () => {
    const world = twoBalls({ x: 100, y: 55 }, { x: 140, y: 55 });
    world.balls[0].vx = 200;

    const { world: after } = run(world, 0.3);

    const [cue, object] = after.balls;
    expect(object.vx).toBeGreaterThan(150);
    expect(Math.abs(cue.vx)).toBeLessThan(25);
  });

  it('kula odbija się od bandy i zostaje na stole', () => {
    const world = twoBalls({ x: 60, y: 55 }, { x: 20, y: 20 });
    world.balls[0].vx = -240;

    const { world: after, events } = run(world, 0.5);

    expect(after.balls[0].vx).toBeGreaterThan(100); // wróciła, ale już słabiej
    expect(after.balls[0].vx).toBeLessThan(240);
    expect(after.balls[0].x).toBeGreaterThanOrEqual(BALL_R - 0.01);
    expect(events.cushions.length).toBeGreaterThan(0);
  });

  it('kula wpada do łuzys i nie wyskakuje z powrotem', () => {
    const world = twoBalls({ x: 200, y: 100 }, { x: 12, y: 12 });
    world.balls[1].vx = -180;
    world.balls[1].vy = -180;

    const { world: after, events } = run(world, 0.2);

    expect(after.balls[1].potted).toBe(true);
    expect(after.balls[1].vx).toBe(0);
    expect(events.potted[0].ball.id).toBe(1);
  });

  it('tarcie zatrzymuje kulę w skończonym czasie', () => {
    const world = twoBalls({ x: 40, y: 55 }, { x: 20, y: 20 });
    world.balls[0].vx = 120;

    const { world: after } = run(world, 4);

    expect(resting(after)).toBe(true);
  });

  it('bardzo szybka kula nie przelatuje na wylot przez inną', () => {
    const world = twoBalls({ x: 20, y: 55 }, { x: 120, y: 55 });
    world.balls[0].vx = 330;

    const { world: after } = run(world, 0.6);

    expect(after.balls[1].vx).toBeGreaterThan(100);
    expect(after.balls[0].x).toBeLessThan(after.balls[1].x);
  });
});

describe('bilard: uderzenie', () => {
  it('za mocne szturchnięcie nie jest strzałem', () => {
    const world = createRack();

    expect(strike(world, 0, 0.02).shots).toBe(0);
    expect(resting(strike(world, 0, 0.02))).toBe(true);
  });

  it('nie strzela się, dopóki kule się kręcą', () => {
    const world = createRack();
    world.balls[0].vx = 40;

    expect(strike(world, 0, 1).shots).toBe(0);
  });

  it('strzał liczy się raz i nadaje białej prędkość', () => {
    const world = strike(createRack(), 0, 1);

    expect(world.shots).toBe(1);
    expect(cueBall(world).vx).toBeGreaterThan(300);
    expect(cueBall(world).vy).toBeCloseTo(0, 6);
  });

  it('siła rośnie z odległością i zamyka się w jedynce', () => {
    expect(powerFromDrag(BALL_R)).toBe(0);
    expect(powerFromDrag(BALL_R * 12)).toBeCloseTo(0.5, 1);
    expect(powerFromDrag(9999)).toBe(1);
  });
});

describe('bilard: liczenie', () => {
  const potted = (id: number) => ({ id, color: '#fff', pocket: 0, at: { x: 0, y: 0 } });

  it('druga kulka w tym samym strzale jest warta podwójnie', () => {
    const world = bookShot(createRack(), [potted(1), potted(2)], 0);

    expect(world.score).toBe(30);
    expect(world.last?.potted).toHaveLength(2);
    expect(world.last?.foul).toBe(false);
  });

  it('wpadnięcie białej to fał: minus dwadzieścia i wraca na stół', () => {
    const start = createRack();
    start.balls[0].potted = true;

    const world = bookShot(start, [potted(CUE_ID), potted(3)], 0);

    expect(world.fouls).toBe(1);
    expect(world.last?.foul).toBe(true);
    expect(world.score).toBe(0); // punktów nie ma od czego odjąć, więc zostaje zero
    expect(cueBall(world).potted).toBe(false);
    expect(cueBall(world).vx).toBe(0);
  });

  it('zbicie wszystkich kuli kończy partię', () => {
    let world = createRack();
    world.balls = [world.balls[0], world.balls[1]];
    // Kula tuż przy łuzie, biały pędzi w jej stronę.
    world.balls[1].x = POCKETS[5].x - 3;
    world.balls[1].y = POCKETS[5].y - 3;

    world = simulate(strike(world, 0.2, 0.5));

    expect(world.won).toBe(true);
    expect(world.score).toBe(10);
    expect(world.shots).toBe(1);
  });

  it('symulacja prowadzi stół do zatrzymania', () => {
    const world = simulate(strike(createRack(), 0.2, 0.8));

    expect(resting(world)).toBe(true);
    expect(world.last).not.toBeNull();
  });
});

describe('bilard: przymiar', () => {
  it('pokazuje kulę-ducha w miejscu spotkania', () => {
    const world = twoBalls({ x: 50, y: 55 }, { x: 100, y: 55 });

    const plan = predict(world, 0);

    expect(plan.hit).toBe('ball');
    expect(plan.target?.id).toBe(1);
    expect(Math.hypot((plan.ghost?.x ?? 0) - 93.8, (plan.ghost?.y ?? 0) - 55)).toBeLessThan(BALL_R);
  });

  it('liczy odbicie od bandy', () => {
    const world = twoBalls({ x: 30, y: 40 }, { x: 200, y: 100 });

    const plan = predict(world, -Math.PI / 4);

    expect(plan.path.length).toBeGreaterThanOrEqual(2);
    expect(plan.path[1].y).toBeCloseTo(BALL_R, 1);
    expect(plan.hit).not.toBe('ball');
  });

  it('wróży wpadnięcie do łuzys', () => {
    const world = twoBalls({ x: 60, y: 60 }, { x: 200, y: 100 });

    const plan = predict(world, Math.atan2(-60, -60));

    expect(plan.hit).toBe('pocket');
  });

  it('nie widzi kul już wbitych', () => {
    const world = twoBalls({ x: 50, y: 55 }, { x: 100, y: 55 });
    world.balls[1].potted = true;

    const plan = predict(world, 0);

    expect(plan.target).toBeNull();
  });
});
