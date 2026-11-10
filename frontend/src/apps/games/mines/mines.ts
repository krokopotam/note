import type { Rng } from '../shared/random';

/**
 * Minesweeper where the first click never kills you.
 *
 * The field is empty until that click, which is when the mines are placed — away
 * from the clicked cell and its neighbours, so the opening move always opens a
 * region instead of a grave.
 */

export interface MinesGame {
  cols: number;
  rows: number;
  mines: number;
  bombs: boolean[];
  open: boolean[];
  flag: boolean[];
  state: 'ready' | 'running' | 'won' | 'lost';
  opened: number;
}

export function createGame(cols: number, rows: number, mines: number): MinesGame {
  const size = cols * rows;
  return {
    cols,
    rows,
    // PlaceMines keeps the first click and its ring clear, so a field cannot be
    // asked to hold more mines than that leaves room for.
    mines: Math.max(0, Math.min(mines, size - 1)),
    bombs: Array.from({ length: size }, () => false),
    open: Array.from({ length: size }, () => false),
    flag: Array.from({ length: size }, () => false),
    state: 'ready',
    opened: 0,
  };
}

export function neighbours(state: MinesGame, index: number): number[] {
  const x = index % state.cols;
  const y = Math.floor(index / state.cols);
  const found: number[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= state.cols || ny >= state.rows) continue;
      found.push(ny * state.cols + nx);
    }
  }
  return found;
}

export function adjacent(state: MinesGame, index: number): number {
  return neighbours(state, index).filter((cell) => state.bombs[cell]).length;
}

export function reveal(state: MinesGame, index: number, rng: Rng): MinesGame {
  if (state.state === 'won' || state.state === 'lost') return state;
  if (state.flag[index] || state.open[index]) return state;

  const current = state.state === 'ready' ? placeMines(state, index, rng) : state;
  if (current.bombs[index]) {
    return { ...current, open: current.open.map((cell, i) => (i === index ? true : cell)), state: 'lost' };
  }

  const open = [...current.open];
  const queue = [index];
  while (queue.length > 0) {
    const cell = queue.pop() as number;
    if (open[cell] || current.flag[cell]) continue;
    open[cell] = true;
    if (adjacent(current, cell) === 0) {
      neighbours(current, cell).forEach((next) => {
        if (!open[next] && !current.flag[next]) queue.push(next);
      });
    }
  }

  const opened = open.filter(Boolean).length;
  const solved = opened === current.cols * current.rows - current.mines;
  return {
    ...current,
    open,
    // A solved field has nothing left to mark.
    flag: solved ? current.flag.map((cell, i) => (current.bombs[i] ? true : cell)) : current.flag,
    opened,
    state: solved ? 'won' : 'running',
  };
}

export function toggleFlag(state: MinesGame, index: number): MinesGame {
  if (state.state === 'won' || state.state === 'lost' || state.open[index]) return state;
  return { ...state, flag: state.flag.map((cell, i) => (i === index ? !cell : cell)) };
}

export function flagsUsed(state: MinesGame): number {
  return state.flag.filter(Boolean).length;
}

function placeMines(state: MinesGame, safe: number, rng: Rng): MinesGame {
  const forbidden = new Set([safe, ...neighbours(state, safe)]);
  const spots = state.bombs
    .map((_, index) => index)
    .filter((index) => !forbidden.has(index));

  const bombs = [...state.bombs];
  for (let placed = 0; placed < state.mines && spots.length > 0; placed += 1) {
    const take = Math.floor(rng() * spots.length);
    bombs[spots.splice(take, 1)[0]] = true;
  }
  return { ...state, bombs, state: 'running' };
}
