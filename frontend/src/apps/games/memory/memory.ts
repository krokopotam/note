import { shuffled } from '../shared/random';
import type { Rng } from '../shared/random';

/**
 * Memory: pairs of pictures, two cards up at a time.
 *
 * A wrong pair stays face up until the player has seen it — the component decides
 * when that is (a timeout) and calls `settle`. Keeping the delay out of the logic
 * means no fake clocks in the tests and no race when the game is restarted.
 */

export interface MemoryCard {
  picture: string;
  up: boolean;
  matched: boolean;
}

export interface MemoryGame {
  cards: MemoryCard[];
  /** Indices currently face up and not yet resolved. */
  showing: number[];
  moves: number;
  won: boolean;
}

export const PICTURES = ['🍄', '🐌', '⭐', '🍉', '🔑', '🐙', '🌵', '🎧'];

export function createGame(pairs: number, rng: Rng): MemoryGame {
  const chosen = PICTURES.slice(0, Math.min(pairs, PICTURES.length));
  const cards = shuffled([...chosen, ...chosen], rng).map((picture) => ({
    picture,
    up: false,
    matched: false,
  }));
  return { cards, showing: [], moves: 0, won: false };
}

export function pick(state: MemoryGame, index: number): MemoryGame {
  if (state.won) return state;
  const card = state.cards[index];
  if (!card || card.up || card.matched || state.showing.length >= 2) return state;

  const cards = state.cards.map((entry, i) => (i === index ? { ...entry, up: true } : entry));
  const showing = [...state.showing, index];

  if (showing.length < 2) return { ...state, cards, showing };

  const [a, b] = showing;
  const matched = cards[a].picture === cards[b].picture;
  const solved = matched && cards.every((entry, i) => entry.matched || i === a || i === b);
  return {
    cards: matched
      ? cards.map((entry, i) => (i === a || i === b ? { ...entry, matched: true } : entry))
      : cards,
    // A resolved pair frees the hand immediately; a wrong pair waits for `settle`.
    showing: matched ? [] : showing,
    moves: state.moves + 1,
    won: solved,
  };
}

/** Put an unresolved pair back face down. */
export function settle(state: MemoryGame): MemoryGame {
  if (state.showing.length < 2) return state;
  const [a, b] = state.showing;
  if (state.cards[a].matched) return { ...state, showing: [] };
  return {
    ...state,
    cards: state.cards.map((entry, i) => (i === a || i === b ? { ...entry, up: false } : entry)),
    showing: [],
  };
}
