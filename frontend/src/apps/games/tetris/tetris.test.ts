import { describe, expect, it } from 'vitest';
import { rngFrom } from '../shared/random';
import { COLS, ROWS, createGame, fits, hardDrop, move, rotate, rotateLeft, tick } from './tetris';

const rng = () => rngFrom(7);

/** Board with everything empty except the bottom row, minus one column. */
function almostFull() {
  const state = createGame(rng());
  const board = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 0));
  board[ROWS - 1] = [2, 2, 2, 2, 2, 2, 2, 2, 2, 0];
  return { ...state, board };
}

describe('tetris', () => {
  it('starts with a piece that fits at the top', () => {
    const state = createGame(rng());
    expect(fits(state.board, state.piece)).toBe(true);
  });

  it('turns a shape by a quarter turn', () => {
    expect(rotateLeft([[1, 2], [3, 4]])).toEqual([[2, 4], [1, 3]]);
  });

  it('slides until the wall stops it', () => {
    let state = createGame(rng());
    for (let i = 0; i < 20; i += 1) state = move(state, 1);
    expect(state.piece.x + state.piece.shape[0].length).toBeLessThanOrEqual(COLS);
  });

  it('clears a full row and counts it', () => {
    const state = almostFull();
    // One loose cell closes the bottom row; that single row is what disappears.
    const dropped = hardDrop({ ...state, piece: { kind: 9, shape: [[3]], x: COLS - 1, y: 0 } }, rng());
    expect(dropped.lines).toBe(1);
    expect(dropped.score).toBe(40);
    expect(dropped.board[ROWS - 1].every((cell) => !cell)).toBe(true);
  });

  it('locks the piece when it cannot fall', () => {
    const state = createGame(rng());
    let next = state;
    for (let i = 0; i < ROWS + 2; i += 1) next = tick(next, rng());
    expect(next.piece.y).toBeLessThan(ROWS);
    expect(next.board.flat().some(Boolean)).toBe(true);
  });

  it('ends when a new piece has nowhere to go', () => {
    const board = Array.from({ length: ROWS }, (_, row) =>
      Array.from({ length: COLS }, (_, col) => (row < 2 && col >= 3 && col <= 6 ? 1 : 0)),
    );
    // The next piece is the square one and it drops straight into the wall.
    const state = {
      ...createGame(rng()),
      board,
      next: 2,
      piece: { kind: 9, shape: [[3]], x: 0, y: 0 },
    };
    expect(hardDrop(state, rng()).over).toBe(true);
  });

  it('never lets a rotation leave the board', () => {
    let state = createGame(rng());
    for (let i = 0; i < 30; i += 1) {
      state = rotate(move(state, i % 2 ? 1 : -1));
      expect(fits(state.board, state.piece)).toBe(true);
    }
  });
});
