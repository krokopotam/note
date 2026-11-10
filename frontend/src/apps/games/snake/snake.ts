import { pick } from '../shared/random';
import type { Rng } from '../shared/random';

/**
 * Wężyk as data: a body, a direction, one apple.
 *
 * `turn` only remembers the wanted direction — the body may be three segments
 * long, so reversing into yourself has to be judged at the step, not at the key.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Cell {
  x: number;
  y: number;
}

export interface SnakeGame {
  cols: number;
  rows: number;
  body: Cell[];
  dir: Direction;
  wanted: Direction;
  food: Cell;
  score: number;
  over: boolean;
}

const VECTORS: Record<Direction, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

export function createGame(cols: number, rows: number, rng: Rng): SnakeGame {
  const y = Math.floor(rows / 2);
  const body = [
    { x: 2, y },
    { x: 1, y },
    { x: 0, y },
  ];
  return {
    cols,
    rows,
    body,
    dir: 'right',
    wanted: 'right',
    food: freeCell(cols, rows, body, rng),
    score: 0,
    over: false,
  };
}

/** A key press. Running straight into your own tail is ignored, not fatal. */
export function turn(state: SnakeGame, wanted: Direction): SnakeGame {
  if (state.over || (wanted === OPPOSITE[state.dir] && state.body.length > 1)) return state;
  return { ...state, wanted };
}

export function step(state: SnakeGame, rng: Rng): SnakeGame {
  if (state.over) return state;

  const dir = state.wanted;
  const head = {
    x: state.body[0].x + VECTORS[dir].x,
    y: state.body[0].y + VECTORS[dir].y,
  };

  const hitsWall = head.x < 0 || head.y < 0 || head.x >= state.cols || head.y >= state.rows;
  // The tail cell is about to move away, so it is only a wall when the apple is eaten.
  const eats = same(head, state.food);
  const body = eats ? state.body : state.body.slice(0, -1);
  const hitsSelf = body.some((cell) => same(cell, head));

  if (hitsWall || hitsSelf) {
    return { ...state, dir, over: true };
  }

  const nextBody = [head, ...body];
  if (!eats) return { ...state, dir, body: nextBody };

  if (nextBody.length === state.cols * state.rows) {
    return { ...state, dir, body: nextBody, score: state.score + 1, over: true };
  }

  return {
    ...state,
    dir,
    body: nextBody,
    score: state.score + 1,
    food: freeCell(state.cols, state.rows, nextBody, rng),
  };
}

function freeCell(cols: number, rows: number, taken: Cell[], rng: Rng): Cell {
  const busy = new Set(taken.map((cell) => `${cell.x},${cell.y}`));
  const open: Cell[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (!busy.has(`${x},${y}`)) open.push({ x, y });
    }
  }
  return pick(open, rng);
}
