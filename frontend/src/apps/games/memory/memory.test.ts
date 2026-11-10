import { describe, expect, it } from 'vitest';
import { rngFrom } from '../shared/random';
import { createGame, pick, settle } from './memory';

const rng = () => rngFrom(5);

function indexOfPicture(game: ReturnType<typeof createGame>, picture: string): number[] {
  return game.cards.map((card, index) => (card.picture === picture ? index : -1)).filter((i) => i >= 0);
}

describe('pamięć', () => {
  it('rozkłada pary w pętli', () => {
    const game = createGame(8, rng());
    expect(game.cards).toHaveLength(16);
    const counts = new Map<string, number>();
    game.cards.forEach((card) => counts.set(card.picture, (counts.get(card.picture) ?? 0) + 1));
    expect([...counts.values()].every((count) => count === 2)).toBe(true);
  });

  it('dopasowana para zostaje odkryta', () => {
    let game = createGame(6, rng());
    const [a, b] = indexOfPicture(game, game.cards[0].picture);
    game = pick(pick(game, a), b);
    expect(game.cards[a].matched).toBe(true);
    expect(game.cards[b].matched).toBe(true);
    expect(game.moves).toBe(1);
  });

  it('niepasująca para wraca po odkładniu', () => {
    let game = createGame(8, rng());
    const first = game.cards[0].picture;
    const other = indexOfPicture(game, game.cards.find((card) => card.picture !== first)!.picture)[0];
    game = settle(pick(pick(game, 0), other));
    expect(game.cards[0].up).toBe(false);
    expect(game.cards[other].up).toBe(false);
  });

  it('trzecia karta nie wskakuje, gdy dwie są w górze', () => {
    const game = createGame(8, rng());
    const twice = pick(pick(game, 0), 1);
    expect(pick(twice, 2)).toBe(twice);
  });

  it('wygrywa po skompletowaniu par', () => {
    let game = createGame(2, rng());
    const pictures = [...new Set(game.cards.map((card) => card.picture))];
    pictures.forEach((picture) => {
      const [a, b] = indexOfPicture(game, picture);
      game = pick(pick(game, a), b);
    });
    expect(game.won).toBe(true);
  });
});
