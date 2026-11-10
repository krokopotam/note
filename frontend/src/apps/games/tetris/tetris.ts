import { pick } from '../shared/random';
import type { Rng } from '../shared/random';

/**
 * Tetris: a board of numbers and one falling piece.
 *
 * Shapes are square matrices, so a rotation is a transpose plus a reverse — no
 * table of 28 rotation states to keep in sync. A rotation that does not fit is
 * pushed one cell left or right (a wall kick); if neither fits, it just does not
 * happen, which is what a player expects from a nudge against a wall.
 */

export const COLS = 10;
export const ROWS = 20;

/** 0 is an empty cell; 1-7 name the piece that coloured it. */
export type Board = number[][];

export interface Piece {
  kind: number;
  shape: number[][];
  x: number;
  y: number;
}

export interface TetrisGame {
  board: Board;
  piece: Piece;
  next: number;
  score: number;
  lines: number;
  over: boolean;
}

const SHAPES: number[][][] = [
  [],
  [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], // I
  [[2, 2], [2, 2]], // O
  [[0, 3, 0], [3, 3, 3], [0, 0, 0]], // T
  [[0, 4, 4], [4, 4, 0], [0, 0, 0]], // S
  [[5, 5, 0], [0, 5, 5], [0, 0, 0]], // Z
  [[6, 0, 0], [6, 6, 6], [0, 0, 0]], // J
  [[0, 0, 7], [7, 7, 7], [0, 0, 0]], // L
];

/** One colour per piece, so a cleared row never changes the look of the others. */
export const PIECE_COLORS = ['', '#4cc3ff', '#ffd83d', '#c07bff', '#4ec97f', '#ff6b6b', '#ff9f43', '#5c7cff'];

export const emptyBoard = (): Board =>
  Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 0));

export function createGame(rng: Rng): TetrisGame {
  const kind = pick([1, 2, 3, 4, 5, 6, 7], rng);
  return {
    board: emptyBoard(),
    piece: spawn(kind),
    next: pick([1, 2, 3, 4, 5, 6, 7], rng),
    score: 0,
    lines: 0,
    over: false,
  };
}

function spawn(kind: number): Piece {
  const shape = SHAPES[kind].map((row) => [...row]);
  return { kind, shape, x: Math.floor((COLS - shape[0].length) / 2), y: 0 };
}

export function rotateLeft(shape: number[][]): number[][] {
  const size = shape.length;
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => shape[x][size - 1 - y]),
  );
}

export function fits(board: Board, piece: Piece): boolean {
  for (let y = 0; y < piece.shape.length; y += 1) {
    for (let x = 0; x < piece.shape[y].length; x += 1) {
      if (!piece.shape[y][x]) continue;
      const boardX = piece.x + x;
      const boardY = piece.y + y;
      if (boardX < 0 || boardX >= COLS || boardY >= ROWS) return false;
      if (boardY >= 0 && board[boardY][boardX]) return false;
    }
  }
  return true;
}

export function move(state: TetrisGame, dx: number): TetrisGame {
  if (state.over) return state;
  const shifted = { ...state.piece, x: state.piece.x + dx };
  return fits(state.board, shifted) ? { ...state, piece: shifted } : state;
}

export function rotate(state: TetrisGame): TetrisGame {
  if (state.over) return state;
  const turned = { ...state.piece, shape: rotateLeft(state.piece.shape) };
  for (const kick of [0, -1, 1, -2, 2]) {
    const tried = { ...turned, x: turned.x + kick };
    if (fits(state.board, tried)) return { ...state, piece: tried };
  }
  return state;
}

/** One row of gravity. When the piece cannot fall, it locks and a new one appears. */
export function tick(state: TetrisGame, rng: Rng): TetrisGame {
  if (state.over) return state;
  const fallen = { ...state.piece, y: state.piece.y + 1 };
  if (fits(state.board, fallen)) return { ...state, piece: fallen };
  return lock(state, rng);
}

function lock(state: TetrisGame, rng: Rng): TetrisGame {
  const board = state.board.map((row) => [...row]);
  state.piece.shape.forEach((row, dy) => {
    row.forEach((value, dx) => {
      const y = state.piece.y + dy;
      const x = state.piece.x + dx;
      if (value && y >= 0 && y < ROWS) board[y][x] = state.piece.kind;
    });
  });

  const kept = board.filter((row) => row.some((value) => !value));
  const cleared = ROWS - kept.length;
  while (kept.length < ROWS) kept.unshift(Array.from({ length: COLS }, () => 0));

  const piece = spawn(state.next);
  return {
    board: kept,
    piece,
    next: pick([1, 2, 3, 4, 5, 6, 7], rng),
    score: state.score + (LINES_SCORE[Math.min(cleared, 4)] ?? 0) * (state.lines + cleared),
    lines: state.lines + cleared,
    over: !fits(kept, piece),
  };
}

const LINES_SCORE = [0, 40, 100, 300, 1200];

/** Straight to the bottom — the piece locks where it lands. */
export function hardDrop(state: TetrisGame, rng: Rng): TetrisGame {
  if (state.over) return state;
  let piece = state.piece;
  while (fits(state.board, { ...piece, y: piece.y + 1 })) piece = { ...piece, y: piece.y + 1 };
  return lock({ ...state, piece }, rng);
}

/** Where the piece would land — the ghost the player aims with. */
export function ghostY(state: TetrisGame): number {
  let y = state.piece.y;
  while (fits(state.board, { ...state.piece, y: y + 1 })) y += 1;
  return y;
}
