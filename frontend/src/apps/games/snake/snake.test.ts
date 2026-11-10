import { describe, expect, it } from 'vitest';
import { randomRng, rngFrom } from '../shared/random';
import { createGame, step, turn } from './snake';
import type { SnakeGame } from './snake';

describe('wężyk', () => {
  it('rośnie i zjada jabłko', () => {
    const rng = rngFrom(1);
    let game = createGame(10, 10, rng);
    const food = game.food;
    // Kierunek w stronę jabłka: prowadzimy węża w prawo, aż je trafi.
    let guard = 0;
    while (!game.body.some((cell) => cell.x === food.x && cell.y === food.y) && guard < 20) {
      game = step(game, rng);
      guard += 1;
    }
    const grown = step(game, rng);
    expect(grown.body.length).toBe(game.body.length + (grown.score > game.score ? 1 : 0));
  });

  it('nie zawraca o sto osiemdziesiąt stopni', () => {
    const game = createGame(10, 10, rngFrom(2));
    expect(turn(game, 'left').wanted).toBe('right');
    expect(turn(game, 'up').wanted).toBe('up');
  });

  it('ginie na ścianie', () => {
    const rng = rngFrom(3);
    let game = createGame(6, 6, rng);
    for (let i = 0; i < 10 && !game.over; i += 1) game = step(game, rng);
    expect(game.over).toBe(true);
  });

  it('ginie na własnym ogonie', () => {
    const rng = rngFrom(4);
    // Ciało zawinięte w literę U: ruch w lewo wjeżdża w drugi własny segment.
    let game: SnakeGame = { ...createGame(8, 8, rng), body: [
      { x: 4, y: 4 },
      { x: 3, y: 4 },
      { x: 3, y: 5 },
      { x: 4, y: 5 },
    ], dir: 'left', wanted: 'left' };
    game = step(game, rng);
    expect(game.over).toBe(true);
  });

  it('jabłko nigdy nie pojawia się na wężu', () => {
    const rng = randomRng();
    let game = createGame(6, 6, rng);
    for (let i = 0; i < 40 && !game.over; i += 1) {
      game = step(game, rng);
      expect(game.body.some((cell) => cell.x === game.food.x && cell.y === game.food.y)).toBe(false);
    }
  });
});
