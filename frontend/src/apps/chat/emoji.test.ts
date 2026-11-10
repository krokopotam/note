import { describe, expect, it } from 'vitest';
import { EMOJI_GROUPS, insertAtCaret } from './emoji';

describe('emotikonki', () => {
  it('groups them so a person can find one without searching', () => {
    expect(EMOJI_GROUPS.map((group) => group.id)).toEqual([
      'buzie',
      'geesty',
      'serca',
      'zwierzeta',
      'jedzenie',
      'swiat',
    ]);
    EMOJI_GROUPS.forEach((group) => {
      expect(group.emojis.length).toBeGreaterThanOrEqual(20);
      // A duplicated emoji in a grid looks like a bug even when it is only a typo.
      expect(new Set(group.emojis).size).toBe(group.emojis.length);
    });
  });
});

describe('wstawianie w tekst', () => {
  it('puts one at the end when that is where the caret is', () => {
    expect(insertAtCaret('cześć', { start: 5, end: 5 }, '😀')).toEqual({ text: 'cześć😀', caret: 7 });
  });

  it('puts one where the caret sits in the middle of a word', () => {
    expect(insertAtCaret('super sprawa', { start: 5, end: 5 }, '😀')).toEqual({
      text: 'super😀 sprawa',
      caret: 7,
    });
  });

  it('replaces what is selected, like any character would', () => {
    expect(insertAtCaret('stare słowo', { start: 0, end: 5 }, '❤️')).toEqual({ text: '❤️ słowo', caret: 2 });
  });

  it('counts the pieces an emoji really takes, not the letters it appears to', () => {
    // '❤️' is two code units; a caret placed by characters would land inside it.
    const first = insertAtCaret('', { start: 0, end: 0 }, '❤️');
    expect(insertAtCaret(first.text, { start: first.caret, end: first.caret }, '!')).toEqual({
      text: '❤️!',
      caret: 3,
    });
  });

  it('survives a caret beyond the text, which a stale selection can hand over', () => {
    expect(insertAtCaret('abc', { start: 99, end: 99 }, '😀')).toEqual({ text: 'abc😀', caret: 5 });
  });
});
