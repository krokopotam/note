import { describe, expect, it } from 'vitest';
import { rngFrom } from '../shared/random';
import { adjacent, createGame, flagsUsed, neighbours, reveal, toggleFlag } from './mines';

const rng = () => rngFrom(11);

describe('saper', () => {
  it('pierwsze kliknięcie nigdy nie jest miną', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const game = reveal(createGame(9, 9, 12), 40, rngFrom(seed));
      expect(game.state).not.toBe('lost');
      expect(game.bombs[40]).toBe(false);
      neighbours(game, 40).forEach((cell) => expect(game.bombs[cell]).toBe(false));
    }
  });

  it('odsłania sąsiedztwo, gdy wokół jest pusto', () => {
    const game = reveal(createGame(9, 9, 1), 40, rng());
    expect(game.opened).toBeGreaterThan(1);
  });

  it('liczy miny wokoło', () => {
    const empty = createGame(3, 3, 0);
    const one = { ...empty, bombs: [true, ...Array.from({ length: 8 }, () => false)] };
    expect(adjacent(one, 0)).toBe(0);
    expect(adjacent(one, 1)).toBe(1);
    expect(adjacent(one, 4)).toBe(1);
  });

  it('flaga nie odsłania pola i da się ją zdjąć', () => {
    const started = reveal(createGame(6, 6, 3), 0, rng());
    const hidden = started.open.findIndex((cell) => !cell);
    const game = toggleFlag(started, hidden);
    expect(flagsUsed(game)).toBe(1);
    expect(game.open[hidden]).toBe(false);
    expect(flagsUsed(toggleFlag(game, hidden))).toBe(0);
  });

  it('trafienie kończy grę', () => {
    const started = reveal(createGame(5, 5, 4), 0, rng());
    const bomb = started.bombs.findIndex(Boolean);
    expect(reveal(started, bomb, rng()).state).toBe('lost');
  });

  it('po przegranej nic już nie da się zrobić', () => {
    const started = reveal(createGame(5, 5, 4), 0, rng());
    const lost = reveal(started, started.bombs.findIndex(Boolean), rng());
    expect(reveal(lost, 0, rng())).toBe(lost);
    expect(toggleFlag(lost, 24).flag[24]).toBe(false);
  });

  it('wygrywa, gdy wszystkie bezpieczne pola są otwarte', () => {
    let game = reveal(createGame(3, 3, 1), 0, rng());
    game.bombs.forEach((bomb, index) => {
      if (!bomb) game = reveal(game, index, rng());
    });
    expect(game.state).toBe('won');
  });
});
