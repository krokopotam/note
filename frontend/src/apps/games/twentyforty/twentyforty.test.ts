import { describe, expect, it } from 'vitest';
import { createBoard, hasMoveLeft, highest, move, spawn } from './twentyforty';

describe('dwadzieścia czterdzieści osiem', () => {
  it('scala dwie takie same płytki w jedną', () => {
    const board = [2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const result = move(board, 'left');
    expect(result.board.slice(0, 4)).toEqual([4, 0, 0, 0]);
    expect(result.gained).toBe(4);
    expect(result.moved).toBe(true);
  });

  it('scala każdą płytkę tylko raz na ruch', () => {
    const board = [2, 2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(move(board, 'left').board.slice(0, 4)).toEqual([4, 4, 0, 0]);
  });

  it('przesuwa w prawo i w górę', () => {
    const board = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4];
    expect(move(board, 'right').board.slice(0, 4)).toEqual([0, 0, 0, 2]);

    const column = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0];
    expect(move(column, 'up').board[0]).toBe(2);
    expect(move(column, 'up').board[12]).toBe(0);
  });

  it('mówi, że ruch nie ruszył nic', () => {
    const board = [2, 4, 8, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(move(board, 'left').moved).toBe(false);
  });

  it('dokłada płytkę na wolne pole', () => {
    const board = createBoard();
    const next = spawn(board, 2, 0);
    expect(next.filter(Boolean)).toHaveLength(1);
    expect(spawn(next, 4, 1).filter(Boolean)).toHaveLength(2);
  });

  it('pozna koniec gry', () => {
    const stuck = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
    expect(hasMoveLeft(stuck)).toBe(false);
    expect(hasMoveLeft(createBoard())).toBe(true);
    expect(highest([2, 2048, 4])).toBe(2048);
  });
});
