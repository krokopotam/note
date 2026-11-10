/**
 * The little rules that decide how a pile of messages is drawn.
 */
import { describe, expect, it } from 'vitest';
import { avatarHue, avatarInitial, startsGroup } from './chatView';
import type { Message } from '../../api/types';

const message = (id: number, overrides: Partial<Message> = {}): Message => ({
  id,
  conversation_id: 1,
  author_id: 1,
  author_name: 'ala',
  body: `wiadomość ${id}`,
  created_at: '2026-01-05T10:00:00.000Z',
  edited_at: null,
  from_me: true,
  editable_until: null,
  can_edit: false,
  ...overrides,
});

describe('avatar', () => {
  it('gives a person the same colour every time', () => {
    expect(avatarHue('ola')).toBe(avatarHue('ola'));
    expect(avatarHue('Ola')).toBe(avatarHue('ola'));
  });

  it('stays inside a small set of calm hues', () => {
    const hues = new Set(['ala', 'ola', 'ivo', 'wincyj', 'pawel1'].map(avatarHue));
    for (const hue of hues) {
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it('takes the first letter and capitalises it', () => {
    expect(avatarInitial('ola')).toBe('O');
    expect(avatarInitial('  ivo  ')).toBe('I');
  });

  it('has no letter for an account that is gone', () => {
    expect(avatarInitial('—')).toBe('?');
    expect(avatarInitial('   ')).toBe('?');
  });
});

describe('grouping', () => {
  it('starts a block with the first message', () => {
    expect(startsGroup(undefined, message(1))).toBe(true);
  });

  it('keeps what the same person wrote right after', () => {
    const first = message(1, { created_at: '2026-01-05T10:00:00.000Z' });
    const next = message(2, { created_at: '2026-01-05T10:02:00.000Z' });

    expect(startsGroup(first, next)).toBe(false);
  });

  it('breaks the block for another speaker', () => {
    const mine = message(1, { author_id: 1 });
    const hers = message(2, { author_id: 11 });

    expect(startsGroup(mine, hers)).toBe(true);
  });

  it('breaks the block after a long pause', () => {
    const earlier = message(1, { created_at: '2026-01-05T10:00:00.000Z' });
    const later = message(2, { created_at: '2026-01-05T10:20:00.000Z' });

    expect(startsGroup(earlier, later)).toBe(true);
  });
});
