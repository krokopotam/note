/**
 * Bilard: fizyka stołu, bez rysowania.
 *
 * Zarówno widok 2D (SVG z góry), jak i 3D (three.js) liczą to samo: kula biała w
 * ruch, reszta zderzeń, tarcie, łuzy. Trzymanie tego w jednym miejscu znaczy, że
 * wbita kulka w 3D wpada do tej samej łuzys, co w 2D, a test uderzenia czołowego
 * wystarczy napisać raz.
 *
 * Jednostki: długość stołu to 220, szerokość 110 (mniej więcej centymetry),
 * prędkość w jednostkach na sekundę. Czas podaje widok, więc symulacja może iść
 * na stopklatce w teście i na klatkach animacji w przeglądarce.
 */

export const TABLE = { width: 220, height: 110 };
/** Wooden frame around the playing area — the view draws it, the physics does not. */
export const RAIL = 9;

export const BALL_R = 3.1;
/** A ball whose centre gets this close to a pocket drops in. */
export const POCKET_R = 6.6;

/** Rolling resistance, in units per second squared. */
export const FRICTION = 42;
/** Below this speed a ball is treated as stopped, otherwise it would crawl forever. */
export const STOP_SPEED = 2.4;
/** Ball on ball: a real ball keeps most of its energy. */
export const RESTITUTION = 0.94;
/** Band is not a trampoline. */
export const CUSHION_KEEP = 0.78;
/** Speed of the cue ball at full power. */
export const MAX_SPEED = 330;
/** Shortest drag that counts as a strike. */
export const MIN_POWER = 0.06;

export const CUE_ID = 0;
export const CUE_COLOR = '#f7f3e8';
export const BALL_COLORS = [
  '#f2c744', // 1
  '#2f5fd0', // 2
  '#d93a3a', // 3
  '#7a3fbf', // 4
  '#e8762d', // 5
  '#1f9d6b', // 6
  '#8b2f3f', // 7
  '#1b2436', // 8
  '#f2c744', // 9 (pasek)
  '#2f5fd0', // 10
];

export interface Point {
  x: number;
  y: number;
}

export interface Ball extends Point {
  id: number;
  color: string;
  /** `true` for the cue ball, so the views can light it differently. */
  cue: boolean;
  striped: boolean;
  vx: number;
  vy: number;
  potted: boolean;
  /** Which pocket it fell into, so the view can drop it there. */
  pocket: number;
}

export interface World {
  balls: Ball[];
  shots: number;
  score: number;
  fouls: number;
  /** What the shot that just finished did — the view animates exactly this. */
  last: ShotReport | null;
  won: boolean;
}

export interface ShotReport {
  seq: number;
  /** Balls that went down, in the order they fell, with the pocket they fell into. */
  potted: { id: number; color: string; pocket: number; at: Point }[];
  cushions: number;
  gained: number;
  foul: boolean;
}

/** Events of one physics step; the view turns them into sparks and sounds. */
export interface StepEvents {
  potted: { ball: Ball; pocket: number; at: Point }[];
  cushions: { at: Point }[];
  clicks: { a: Point; energy: number }[];
}

/** Six pockets: four corners and two in the middle of the long rails. */
export const POCKETS: Point[] = [
  { x: 0, y: 0 },
  { x: TABLE.width / 2, y: -2.5 },
  { x: TABLE.width, y: 0 },
  { x: 0, y: TABLE.height },
  { x: TABLE.width / 2, y: TABLE.height + 2.5 },
  { x: TABLE.width, y: TABLE.height },
];

/** Where the cue ball starts and where it comes back after a foul. */
export const HEAD: Point = { x: TABLE.width * 0.22, y: TABLE.height / 2 };
const RACK_APEX: Point = { x: TABLE.width * 0.68, y: TABLE.height / 2 };

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

function makeBall(id: number, x: number, y: number): Ball {
  return {
    id,
    x,
    y,
    color: id === CUE_ID ? CUE_COLOR : BALL_COLORS[id - 1],
    cue: id === CUE_ID,
    striped: id >= 9,
    vx: 0,
    vy: 0,
    potted: false,
    pocket: -1,
  };
}

/**
 * Start position: cue ball on the head spot, ten balls in a triangle.
 *
 * Deliberately not random — a rack is a rack, and a layout that never moves is a
 * layout a test can reason about.
 */
export function createRack(): World {
  const balls: Ball[] = [makeBall(CUE_ID, HEAD.x, HEAD.y)];
  const gap = BALL_R * 2 + 0.35;
  let id = 1;
  for (let row = 0; row < 4 && id <= BALL_COLORS.length; row += 1) {
    for (let n = 0; n <= row && id <= BALL_COLORS.length; n += 1) {
      const y = RACK_APEX.y + (n - row / 2) * gap;
      balls.push(makeBall(id, RACK_APEX.x + row * gap * 0.87, y));
      id += 1;
    }
  }
  return { balls, shots: 0, score: 0, fouls: 0, last: null, won: false };
}

export const cueBall = (world: World): Ball => world.balls.find((ball) => ball.cue) as Ball;

/** Number of object balls still on the cloth. */
export const leftToPot = (world: World): number =>
  world.balls.filter((ball) => !ball.cue && !ball.potted).length;

export const resting = (world: World): boolean =>
  world.balls.every((ball) => ball.potted || (ball.vx === 0 && ball.vy === 0));

/**
 * Strike: `angle` in radians (0 points along +x), `power` in 0..1.
 *
 * A shot that is too soft to move the cue ball is ignored, so a stray tap does not
 * burn a shot.
 */
export function strike(world: World, angle: number, power: number): World {
  const cue = cueBall(world);
  const strength = Math.max(0, Math.min(1, power));
  if (cue.potted || strength < MIN_POWER || !resting(world)) return world;

  const balls = world.balls.map((ball) =>
    ball.cue
      ? {
          ...ball,
          vx: Math.cos(angle) * MAX_SPEED * strength,
          vy: Math.sin(angle) * MAX_SPEED * strength,
        }
      : ball,
  );
  return { ...world, balls, shots: world.shots + 1 };
}

/** The mouth of a pocket swallows the cushion next to it, or nothing would go in. */
function nearMouth(point: Point): boolean {
  return POCKETS.some((pocket) => distance(point, pocket) < POCKET_R * 1.25);
}

function pocketOf(ball: Ball): number {
  for (let index = 0; index < POCKETS.length; index += 1) {
    if (distance(ball, POCKETS[index]) < POCKET_R) return index;
  }
  return -1;
}

/**
 * Advance one slice of time.
 *
 * The step is split so that no ball moves more than a fraction of its radius at a
 * time — that is what keeps a fast cue ball from tunnelling through another one.
 */
export function step(world: World, dt: number): { world: World; events: StepEvents } {
  const events: StepEvents = { potted: [], cushions: [], clicks: [] };
  const balls = world.balls.map((ball) => ({ ...ball }));
  const fastest = Math.max(...balls.map((ball) => Math.hypot(ball.vx, ball.vy)), 0);
  const subSteps = Math.min(12, Math.max(1, Math.ceil((fastest * dt) / (BALL_R * 0.35))));
  const h = dt / subSteps;

  for (let s = 0; s < subSteps; s += 1) {
    for (const ball of balls) {
      if (ball.potted) continue;
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;

      const pocket = pocketOf(ball);
      if (pocket >= 0) {
        ball.potted = true;
        ball.pocket = pocket;
        ball.vx = 0;
        ball.vy = 0;
        ball.x = POCKETS[pocket].x;
        ball.y = POCKETS[pocket].y;
        events.potted.push({ ball, pocket, at: { ...POCKETS[pocket] } });
        continue;
      }

      // Cushions, except where a pocket mouth opens the rail.
      let bounced: Point | null = null;
      if (ball.x < BALL_R && ball.vx < 0 && !nearMouth(ball)) {
        ball.x = BALL_R;
        ball.vx = -ball.vx * CUSHION_KEEP;
        bounced = { x: 0, y: ball.y };
      } else if (ball.x > TABLE.width - BALL_R && ball.vx > 0 && !nearMouth(ball)) {
        ball.x = TABLE.width - BALL_R;
        ball.vx = -ball.vx * CUSHION_KEEP;
        bounced = { x: TABLE.width, y: ball.y };
      }
      if (ball.y < BALL_R && ball.vy < 0 && !nearMouth(ball)) {
        ball.y = BALL_R;
        ball.vy = -ball.vy * CUSHION_KEEP;
        bounced = bounced ?? { x: ball.x, y: 0 };
      } else if (ball.y > TABLE.height - BALL_R && ball.vy > 0 && !nearMouth(ball)) {
        ball.y = TABLE.height - BALL_R;
        ball.vy = -ball.vy * CUSHION_KEEP;
        bounced = bounced ?? { x: ball.x, y: TABLE.height };
      }
      if (bounced) events.cushions.push({ at: bounced });

      // Rolling resistance: a constant pull, so balls glide to a halt the way
      // cloth does, rather than slowing exponentially forever.
      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed > 0) {
        const dragged = speed - FRICTION * h;
        if (dragged <= STOP_SPEED) {
          ball.vx = 0;
          ball.vy = 0;
        } else {
          ball.vx = (ball.vx / speed) * dragged;
          ball.vy = (ball.vy / speed) * dragged;
        }
      }
    }

    // Ball on ball. Equal masses: the two normal components trade places.
    for (let i = 0; i < balls.length; i += 1) {
      for (let j = i + 1; j < balls.length; j += 1) {
        const a = balls[i];
        const b = balls[j];
        if (a.potted || b.potted) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0 || dist >= BALL_R * 2) continue;

        const nx = dx / dist;
        const ny = dy / dist;
        // Push them apart so they stop overlapping.
        const overlap = (BALL_R * 2 - dist) / 2;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;

        const along = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (along >= 0) continue; // already moving apart
        const impulse = (-(1 + RESTITUTION) * along) / 2;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
        events.clicks.push({ a: { x: a.x + nx * BALL_R, y: a.y + ny * BALL_R }, energy: Math.abs(along) });
      }
    }
  }

  return { world: { ...world, balls }, events };
}

/**
 * Run the table until every ball has stopped, collecting what happened.
 *
 * Tests use it for a whole shot; the view runs `step` frame by frame instead.
 */
export function simulate(world: World, dt = 1 / 120, limit = 1200): World {
  let current = world;
  const potted: ShotReport['potted'] = [];
  let cushions = 0;
  for (let i = 0; i < limit && !resting(current); i += 1) {
    const next = step(current, dt);
    current = next.world;
    potted.push(
      ...next.events.potted.map((entry) => ({
        id: entry.ball.id,
        color: entry.ball.color,
        pocket: entry.pocket,
        at: entry.at,
      })),
    );
    cushions += next.events.cushions.length;
  }
  return bookShot(current, potted, cushions);
}

/** Turn the balls that fell into points, fouls and the end of the game. */
export function bookShot(world: World, potted: ShotReport['potted'], cushions: number): World {
  const cue = potted.find((entry) => entry.id === CUE_ID);
  const balls = potted.filter((entry) => entry.id !== CUE_ID);
  const gained = balls.reduce((sum, _entry, index) => sum + 10 * (index + 1), 0) - (cue ? 20 : 0);

  // A scratch puts the cue ball back on the head spot — or on the first free
  // place next to it, because a ball might be standing there now.
  const respot = cue ? findFreeSpot(world.balls) : null;
  const balls2 = world.balls.map((ball) =>
    ball.cue && cue ? { ...ball, potted: false, pocket: -1, ...respot, vx: 0, vy: 0 } : ball,
  );

  const stillOn = balls2.filter((ball) => !ball.cue && !ball.potted).length;

  return {
    ...world,
    balls: balls2,
    score: Math.max(0, world.score + gained),
    fouls: world.fouls + (cue ? 1 : 0),
    won: stillOn === 0,
    last: {
      seq: (world.last?.seq ?? 0) + 1,
      potted,
      cushions,
      gained,
      foul: Boolean(cue),
    },
  };
}

/** First place on the head line where a respotted cue ball would not overlap. */
function findFreeSpot(balls: Ball[]): Point {
  for (let offset = 0; offset < TABLE.width; offset += BALL_R) {
    for (const x of [HEAD.x + offset, HEAD.x - offset]) {
      if (x < BALL_R || x > TABLE.width - BALL_R) continue;
      const spot = { x, y: HEAD.y };
      if (balls.every((ball) => ball.cue || ball.potted || distance(ball, spot) > BALL_R * 2.1)) {
        return spot;
      }
    }
  }
  return { ...HEAD };
}

export interface Prediction {
  /** Polyline of the cue ball's centre. */
  path: Point[];
  /** Where the cue ball stops: on a ball, on a cushion or in a pocket. */
  hit: 'ball' | 'rail' | 'pocket' | 'none';
  /** Centre of the ghost ball at the moment of contact. */
  ghost: Point | null;
  /** The ball that would be hit first. */
  target: Ball | null;
}

/**
 * Where the shot would go: the guide line, the ghost ball and the first victim.
 *
 * Marches the centre of the cue ball in small steps, reflecting off cushions (up
 * to `bounces` of them) and stopping on the first ball it would touch. It is a
 * preview only — the real shot is `step` — but it uses the same table, so what
 * the player sees is what happens.
 */
export function predict(world: World, angle: number, bounces = 2): Prediction {
  const cue = cueBall(world);
  const start = { x: cue.x, y: cue.y };
  let x = start.x;
  let y = start.y;
  let vx = Math.cos(angle);
  let vy = Math.sin(angle);
  const path: Point[] = [start];
  const others = world.balls.filter((ball) => !ball.cue && !ball.potted);
  let hit: Prediction['hit'] = 'none';
  let ghost: Point | null = null;
  let target: Ball | null = null;
  let railHits = 0;

  const stepSize = BALL_R / 2;
  for (let i = 0; i < 900; i += 1) {
    x += vx * stepSize;
    y += vy * stepSize;

    if (POCKETS.some((pocket) => distance({ x, y }, pocket) < POCKET_R)) {
      hit = 'pocket';
      path.push({ x, y });
      break;
    }

    const struck = others.find((ball) => distance(ball, { x, y }) < BALL_R * 2);
    if (struck) {
      hit = 'ball';
      ghost = { x, y };
      target = struck;
      path.push({ x, y });
      break;
    }

    let reflected = false;
    if (x < BALL_R && vx < 0 && !nearMouth({ x, y })) {
      x = BALL_R;
      vx = -vx;
      reflected = true;
    } else if (x > TABLE.width - BALL_R && vx > 0 && !nearMouth({ x, y })) {
      x = TABLE.width - BALL_R;
      vx = -vx;
      reflected = true;
    }
    if (y < BALL_R && vy < 0 && !nearMouth({ x, y })) {
      y = BALL_R;
      vy = -vy;
      reflected = true;
    } else if (y > TABLE.height - BALL_R && vy > 0 && !nearMouth({ x, y })) {
      y = TABLE.height - BALL_R;
      vy = -vy;
      reflected = true;
    }
    if (reflected) {
      path.push({ x, y });
      railHits += 1;
      if (railHits > bounces) break;
    }
  }

  if (hit === 'none') path.push({ x, y });
  return { path, hit, ghost, target };
}

/** Power from how far the pointer was pulled away from the cue ball. */
export function powerFromDrag(drag: number): number {
  const from = BALL_R * 2;
  const to = BALL_R * 22;
  return Math.max(0, Math.min(1, (drag - from) / (to - from)));
}

/** How hard the cue ball is moving — the view uses it for streaks and sound. */
export const speedOf = (ball: Ball): number => Math.hypot(ball.vx, ball.vy);
