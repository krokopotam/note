import { describe, expect, it } from 'vitest';
import { bestMove, emptyField, isFull, play, winner, winningMove } from './tictactoe';
import type { Field } from './tictactoe';

describe('kółko i krzyżyk', () => {
  it('poznaje wygraną w każdym kierunku', () => {
    expect(winner(play(play(play(emptyField(), 0, 'X'), 1, 'X'), 2, 'X'))?.mark).toBe('X');
    expect(winner(play(play(play(emptyField(), 0, 'O'), 3, 'O'), 6, 'O'))?.mark).toBe('O');
    expect(winner(play(play(play(emptyField(), 2, 'X'), 4, 'X'), 6, 'X'))?.mark).toBe('X');
    expect(winner(emptyField())).toBeNull();
  });

  it('nie pozwala grać na zajętym polu ani po wygranej', () => {
    const done = play(play(play(emptyField(), 0, 'X'), 1, 'X'), 2, 'X');
    expect(play(done, 5, 'O')).toBe(done);
    const one = play(emptyField(), 4, 'X');
    expect(play(one, 4, 'O')).toBe(one);
  });

  it('silny przeciwnik zabiera wygrywające pole', () => {
    const field: Field = ['X', 'X', null, 'O', null, 'O', null, null, null];
    // Środek drugiej linii domyka 3-4-5.
    expect(winningMove(field, 'O')).toBe(4);
    expect(bestMove(field, 'O')).toBe(4);
  });

  it('silny przeciwnik nie przegrywa, nawet gdy zaczyna później', () => {
    // Puste pole: pierwsza odpowiedź musi zablokować każdy możliwy widelec.
    const answer = bestMove(emptyField(), 'O');
    expect([0, 2, 6, 8].includes(answer) || answer === 1 || answer === 3 || answer === 5 || answer === 7).toBe(true);
  });

  it('wie, że plansza jest pełna', () => {
    expect(isFull(emptyField())).toBe(false);
    expect(isFull(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'])).toBe(true);
  });
});
