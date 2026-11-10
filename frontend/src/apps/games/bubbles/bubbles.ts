import { pick } from '../shared/random';
import type { Rng } from '../shared/random';

/**
 * Bubble shooter on a hex grid.
 *
 * Rows alternate between 11 and 10 bubbles, each row shifted by one radius — that
 * is what makes every bubble have six neighbours instead of four, and it is the
 * whole reason popping feels right.
 *
 * The shot is simulated as a moving point (walls mirror it), and where it stops it
 * snaps to the closest free cell that touches the ceiling or another bubble. No
 * physics engine, but the trajectory in `aimPath` is the very same one the shot
 * later follows, so the guide line never lies.
 */

export const R = 16;
export const COLS = 11;
export const ROWS = 13;
/** Vertical distance between hex rows. */
export const ROW_H = Math.round(R * 1.74);

export const WIDTH = COLS * R * 2;
export const HEIGHT = ROWS * ROW_H;

export const COLORS = ['#ff5d5d', '#4cc3ff', '#ffd83d', '#5ddc7f', '#c07bff'];

/** A bubble may hang this many rows down before the game is lost. */
export const DANGER_ROW = ROWS - 2;

export type Bubble = string | null;
export type Grid = Bubble[][];

export interface ShooterGame {
  grid: Grid;
  /**
   * Which rows are the wide ones: row `r` is wide when `(r + parity) % 2 === 0`.
   *
   * Pushing a new row under the ceiling moves every existing row one place down,
   * which would flip the parity of the whole sheet — every bubble would jump
   * sideways, the last column of a wide row would fall outside the walls and the
   * lattice would tear so hard that almost everything counts as hanging. So the
   * sheet keeps its alignment and `parity` is what flips instead.
   */
  parity: number;
  current: string;
  next: string;
  shots: number;
  score: number;
  over: boolean;
  won: boolean;
  /** What the last shot did — the view animates exactly this and nothing else. */
  last: ShotOutcome | null;
}

export interface Gone {
  row: number;
  col: number;
  color: string;
}

/**
 * The story of one shot: where it landed, what burst, what lost its grip and how
 * many points it brought. `seq` numbers it, so a repeated shot still restarts the
 * animation instead of looking like the same frozen effect.
 */
export interface ShotOutcome {
  seq: number;
  landing: Point;
  popped: Gone[];
  dropped: Gone[];
  gained: number;
  /** The ceiling pushed a fresh row down with this shot. */
  pushed: boolean;
}

export interface Point {
  x: number;
  y: number;
}

/** Every other row is shifted by one radius and therefore holds one bubble less. */
export const colsIn = (row: number, parity = 0): number =>
  (row + parity) % 2 === 0 ? COLS : COLS - 1;

export function center(row: number, col: number, parity = 0): Point {
  return {
    x: col * R * 2 + R + ((row + parity) % 2 === 1 ? R : 0),
    y: row * ROW_H + R,
  };
}

/** Empty board of the right shape — tests and "only the top rows are filled" use it. */
export function emptyGrid(filledRows = 0, rng?: Rng): Grid {
  return Array.from({ length: ROWS }, (_, row) =>
    Array.from({ length: colsIn(row) }, () => (row < filledRows && rng ? pick(COLORS, rng) : null)),
  );
}

export const at = (state: Grid, row: number, col: number, parity = 0): Bubble =>
  row < 0 || row >= state.length || col < 0 || col >= colsIn(row, parity)
    ? null
    : state[row][col];

export function createGame(rng: Rng, filledRows = 5): ShooterGame {
  const grid = emptyGrid(filledRows, rng);
  const state: ShooterGame = {
    grid,
    parity: 0,
    current: '',
    next: '',
    shots: 0,
    score: 0,
    over: false,
    won: false,
    last: null,
  };
  return { ...state, current: pick(COLORS, rng), next: pick(COLORS, rng) };
}

/** Only colours still on the board are dealt — no bubble you can never pop. */
function liveColors(grid: Grid): string[] {
  const seen = new Set<string>();
  grid.forEach((row) => row.forEach((cell) => cell && seen.add(cell)));
  return [...seen];
}

export function nextShots(state: ShooterGame, rng: Rng): { current: string; next: string } {
  const live = liveColors(state.grid);
  if (live.length === 0) return { current: state.current, next: state.next };
  return { current: state.next || pick(live, rng), next: pick(live, rng) };
}

export function neighbours(row: number, col: number, parity = 0): [number, number][] {
  const even = (row + parity) % 2 === 0;
  const deltas: [number, number][] = even
    ? [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]]
    : [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]];
  return deltas.map(([dy, dx]) => [row + dy, col + dx]);
}

/**
 * Where a shot aimed at `target` travels until it hits something.
 *
 * Returns the stopping point and the polyline to draw. Used both for the guide and
 * for the shot itself, so aiming and flying cannot drift apart.
 */
export function aimPath(state: ShooterGame, origin: Point, target: Point, guide = true): { stop: Point; path: Point[] } {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const length = Math.hypot(dx, dy) || 1;
  let x = origin.x;
  let y = origin.y;
  let vx = dx / length;
  let vy = dy / length;
  if (vy > -0.12) vy = -0.12; // never shoot along the floor or downwards

  const step = R / 2;
  const path: Point[] = [{ x, y }];
  let stop: Point = { x, y };

  for (let i = 0; i < 2000; i += 1) {
    x += vx * step;
    y += vy * step;

    if (x < R || x > WIDTH - R) {
      // The bounce is a corner of the guide line, so it goes into the polyline.
      x = x < R ? R : WIDTH - R;
      vx = -vx;
      path.push({ x, y });
    }

    if (y <= R) {
      stop = { x, y: R };
      path.push(stop);
      return { stop, path };
    }

    if (touches(state.grid, { x, y }, state.parity)) {
      stop = { x, y };
      path.push(stop);
      return { stop, path };
    }

    // A guide that never ends is just noise; a real shot flies on.
    if (guide && y < HEIGHT * 0.25 && path.length > 120) {
      stop = { x, y };
      path.push(stop);
      return { stop, path };
    }
  }

  path.push(stop);
  return { stop, path };
}

/** How far a polyline is. */
export function pathLength(path: Point[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  return total;
}

/**
 * Point `distance` along a polyline — the shot flies along the very same line the
 * guide draws, so what the player saw is what the bubble takes.
 */
export function pointAlong(path: Point[], distance: number): Point {
  if (path.length === 0) return { x: 0, y: 0 };
  let left = Math.max(0, distance);
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= segment || i === path.length - 1) {
      const t = segment === 0 ? 0 : Math.min(1, left / segment);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= segment;
  }
  return path[path.length - 1];
}

function touches(grid: Grid, point: Point, parity: number): boolean {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < colsIn(row, parity); col += 1) {
      if (!grid[row][col]) continue;
      const here = center(row, col, parity);
      if (Math.hypot(here.x - point.x, here.y - point.y) < R * 1.75) return true;
    }
  }
  return false;
}

/** Closest free cell that touches the ceiling or another bubble. */
export function landingCell(state: ShooterGame, point: Point): [number, number] {
  let best: [number, number] | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < colsIn(row, state.parity); col += 1) {
      if (state.grid[row][col]) continue;
      const supported =
        row === 0 ||
        neighbours(row, col, state.parity).some(([ry, cx]) => at(state.grid, ry, cx, state.parity));
      if (!supported) continue;
      const here = center(row, col, state.parity);
      const distance = Math.hypot(here.x - point.x, here.y - point.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = [row, col];
      }
    }
  }

  return best ?? [0, 0];
}

/** Everything of the same colour connected to the landing spot. */
export function cluster(grid: Grid, row: number, col: number, parity = 0): [number, number][] {
  const color = at(grid, row, col, parity);
  if (!color) return [];
  const seen = new Set<string>([`${row},${col}`]);
  const found: [number, number][] = [[row, col]];
  const queue: [number, number][] = [[row, col]];

  while (queue.length > 0) {
    const [cy, cx] = queue.pop() as [number, number];
    for (const [ny, nx] of neighbours(cy, cx, parity)) {
      if (seen.has(`${ny},${nx}`)) continue;
      if (at(grid, ny, nx, parity) !== color) continue;
      seen.add(`${ny},${nx}`);
      found.push([ny, nx]);
      queue.push([ny, nx]);
    }
  }
  return found;
}

/** Bubbles cut off from the ceiling fall out of the board. */
export function hanging(grid: Grid, parity = 0): [number, number][] {
  const attached = new Set<string>();
  const queue: [number, number][] = [];

  for (let col = 0; col < colsIn(0, parity); col += 1) {
    if (grid[0][col]) {
      attached.add(`0,${col}`);
      queue.push([0, col]);
    }
  }

  while (queue.length > 0) {
    const [cy, cx] = queue.pop() as [number, number];
    for (const [ny, nx] of neighbours(cy, cx, parity)) {
      const key = `${ny},${nx}`;
      if (attached.has(key) || !at(grid, ny, nx, parity)) continue;
      attached.add(key);
      queue.push([ny, nx]);
    }
  }

  const loose: [number, number][] = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < colsIn(row, parity); col += 1) {
      if (grid[row][col] && !attached.has(`${row},${col}`)) loose.push([row, col]);
    }
  }
  return loose;
}

export const SHOTS_PER_ROW = 6;

export function shoot(state: ShooterGame, target: Point, rng: Rng): ShooterGame {
  if (state.over || !state.current) return state;

  const origin = { x: WIDTH / 2, y: HEIGHT + R };
  const { stop } = aimPath(state, origin, target, false);
  const [row, col] = landingCell(state, stop);
  const landing = center(row, col, state.parity);

  const grid = state.grid.map((entry) => [...entry]);
  grid[row][col] = state.current;

  const poppedCells = cluster(grid, row, col, state.parity);
  const popped: Gone[] = [];
  const dropped: Gone[] = [];
  let score = 0;
  if (poppedCells.length >= 3) {
    poppedCells.forEach(([py, px]) => {
      popped.push({ row: py, col: px, color: grid[py][px] as string });
      grid[py][px] = null;
    });
    score += poppedCells.length * 10;
    hanging(grid, state.parity).forEach(([ly, lx]) => {
      dropped.push({ row: ly, col: lx, color: grid[ly][lx] as string });
      grid[ly][lx] = null;
    });
    score += dropped.length * 20;
  }
  // One burst pays ten, the fifth and every later one double: the big chains are
  // the moment the game is playing for.
  if (poppedCells.length >= 5) score += poppedCells.length * 10;

  const shots = state.shots + 1;
  let parity = state.parity;
  let pushed = false;
  // The ceiling row only comes down while there is room for it: a sheet already
  // touching the last row has nowhere left to go, and that is the end of the game.
  if (shots % SHOTS_PER_ROW === 0 && !grid[ROWS - 1].some(Boolean)) {
    grid.pop();
    parity = 1 - parity;
    // The row that comes in is full of bubbles: the sheet hangs from the ceiling,
    // so an empty row here would cut it loose and the whole wall would fall out.
    const filler = liveColors(grid);
    grid.unshift(
      Array.from({ length: colsIn(0, parity) }, () => (filler.length > 0 ? pick(filler, rng) : null)),
    );
    pushed = true;
  }

  const empty = grid.every((entry) => entry.every((cell) => !cell));
  const reachedFloor = grid.some((entry, r) => r > DANGER_ROW && entry.some(Boolean));
  const dealt = nextShots({ ...state, grid, parity }, rng);

  return {
    grid,
    parity,
    current: dealt.current,
    next: dealt.next,
    shots,
    score: state.score + score,
    over: reachedFloor,
    won: empty,
    last: {
      seq: (state.last?.seq ?? 0) + 1,
      // The popped bubbles sit where they were; the pushed row moves the sheet,
      // so the effect layer keeps the coordinates of the shot that made them.
      landing,
      popped,
      dropped,
      gained: score,
      pushed,
    },
  };
}
