/**
 * Tic-tac-toe with an opponent that can be beaten — or not.
 *
 * The strong opponent is plain minimax: with nine squares the whole tree is small
 * enough to walk on every move, so there is no reason to pretend. The weak one
 * takes a random square, because nobody wants to lose their first game.
 */

export type Mark = 'X' | 'O';
export type Square = Mark | null;
export type Field = Square[];

export const LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export const emptyField = (): Field => Array.from({ length: 9 }, () => null);

export function winner(field: Field): { mark: Mark; line: number[] } | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (field[a] && field[a] === field[b] && field[a] === field[c]) {
      return { mark: field[a] as Mark, line };
    }
  }
  return null;
}

export const isFull = (field: Field): boolean => field.every((square) => square !== null);

export function play(field: Field, index: number, mark: Mark): Field {
  if (field[index] || winner(field)) return field;
  return field.map((square, i) => (i === index ? mark : square));
}

/** Best square for `mark`, scored by how the game ends if both play perfectly. */
export function bestMove(field: Field, mark: Mark): number {
  const other: Mark = mark === 'X' ? 'O' : 'X';
  let best = -Infinity;
  let choice = -1;

  field.forEach((square, index) => {
    if (square) return;
    const score = -search(play(field, index, mark), other, 1);
    if (score > best) {
      best = score;
      choice = index;
    }
  });

  return choice;
}

function search(field: Field, turn: Mark, depth: number): number {
  const done = winner(field);
  if (done) return done.mark === turn ? 10 - depth : depth - 10;
  if (isFull(field)) return 0;

  let best = -Infinity;
  const other: Mark = turn === 'X' ? 'O' : 'X';
  field.forEach((square, index) => {
    if (square) return;
    // Negamax: what the child scores for the opponent is our loss.
    best = Math.max(best, -search(play(field, index, turn), other, depth + 1));
  });
  return best;
}

/** A square that wins now, if there is one — the "easy" opponent is not helpless. */
export function winningMove(field: Field, mark: Mark): number {
  for (let index = 0; index < field.length; index += 1) {
    if (!field[index] && winner(play(field, index, mark))?.mark === mark) return index;
  }
  return -1;
}
