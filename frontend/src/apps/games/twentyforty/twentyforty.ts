/**
 * 2048: slide, merge once per tile per move, count what was gained.
 *
 * The board is stored in reading order and a move is expressed as "line up the
 * cells that travel, in the order they travel" — so one `slide` implements all
 * four directions instead of four copies of the same merge.
 */

export const SIZE = 4;

/** 0 is an empty square. */
export type TileBoard = number[];

export interface MoveResult {
  board: TileBoard;
  gained: number;
  moved: boolean;
}

export function createBoard(): TileBoard {
  return Array.from({ length: SIZE * SIZE }, () => 0);
}

/** Indices of each line in travel order for the given direction. */
function lineIndices(dir: Direction, line: number): number[] {
  const cells: number[] = [];
  for (let i = 0; i < SIZE; i += 1) {
    const x = dir === 'left' || dir === 'right' ? i : line;
    const y = dir === 'left' || dir === 'right' ? line : i;
    cells.push(y * SIZE + x);
  }
  return dir === 'right' || dir === 'down' ? cells.reverse() : cells;
}

export type Direction = 'left' | 'right' | 'up' | 'down';

/** Merge one row that travels towards index 0. */
function slide(line: number[]): { values: number[]; gained: number } {
  const tiles = line.filter((value) => value !== 0);
  const values: number[] = [];
  let gained = 0;

  for (let i = 0; i < tiles.length; i += 1) {
    if (tiles[i] === tiles[i + 1]) {
      const merged = tiles[i] * 2;
      values.push(merged);
      gained += merged;
      i += 1;
    } else {
      values.push(tiles[i]);
    }
  }
  while (values.length < SIZE) values.push(0);
  return { values, gained };
}

export function move(board: TileBoard, dir: Direction): MoveResult {
  const next = [...board];
  let gained = 0;
  let moved = false;

  for (let line = 0; line < SIZE; line += 1) {
    const indices = lineIndices(dir, line);
    const { values, gained: lineGained } = slide(indices.map((index) => board[index]));
    gained += lineGained;
    indices.forEach((index, position) => {
      if (next[index] !== values[position]) moved = true;
      next[index] = values[position];
    });
  }

  return { board: next, gained, moved };
}

/** First empty square from a random start, so the spawn does not always hit index 0. */
export function spawn(board: TileBoard, value: number, offset: number): TileBoard {
  const empty = board.map((cell, index) => (cell === 0 ? index : -1)).filter((index) => index >= 0);
  if (empty.length === 0) return board;
  const next = [...board];
  next[empty[offset % empty.length]] = value;
  return next;
}

export function hasMoveLeft(board: TileBoard): boolean {
  if (board.some((cell) => cell === 0)) return true;
  return (
    ['left', 'up'] as Direction[]).some((dir) => move(board, dir).moved);
}

export function highest(board: TileBoard): number {
  return board.reduce((best, cell) => Math.max(best, cell), 0);
}
