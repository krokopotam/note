import type { Message } from '../../api/types';

/**
 * Small decisions the chat view makes about a pile of messages.
 *
 * Kept out of the component so they can be tested without a DOM and so the
 * component only ever asks "do I draw the name here?".
 */

/** Consecutive messages closer together than this read as one block. */
export const GROUP_WINDOW_MS = 5 * 60_000;

/** Calm hues only — an avatar should mark a person, not shout. */
const HUES = [210, 258, 322, 352, 22, 46, 152, 182];

/** A person keeps the same colour in every window and on every device. */
export function avatarHue(name: string): number {
  let hash = 0;
  for (const char of name.trim().toLowerCase()) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360;
  }
  return HUES[hash % HUES.length];
}

/** First letter of the nickname; a deleted account has nothing to show. */
export function avatarInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === '—') return '?';
  return [...trimmed][0].toUpperCase();
}

/**
 * Does this message start a new block, or is it a continuation of the one above?
 *
 * The author decides, and a long pause breaks the block — "ola wrote three things
 * this morning and one thing at noon" should not read as one breath.
 */
export function startsGroup(previous: Message | undefined, message: Message): boolean {
  if (!previous) return true;
  if (previous.author_id !== message.author_id) return true;
  return Date.parse(message.created_at) - Date.parse(previous.created_at) > GROUP_WINDOW_MS;
}
