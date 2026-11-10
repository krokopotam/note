/**
 * The one rule a chat lives or dies by: how long a message stays editable.
 *
 * It is written down once, here, because both sides have to agree exactly: the
 * server refuses with 403 when the window has passed, and the client shows a
 * countdown computed from the same number. A drift between them would look like
 * a UI bug ("the button was there a second ago").
 */
import { MESSAGE_EDIT_MINUTES } from '@note/shared';

export const EDIT_WINDOW_MS = MESSAGE_EDIT_MINUTES * 60_000;

/** ISO moment when a message written at `createdAt` stops being editable. */
export function editableUntil(createdAt) {
  const written = Date.parse(createdAt);
  if (Number.isNaN(written)) return null;
  return new Date(written + EDIT_WINDOW_MS).toISOString();
}

/**
 * Only the author, only inside the window — and the window is measured from the
 * moment of writing, so editing once does not buy time for a second edit.
 *
 * @param {number|null|undefined} authorId null once the account is gone
 * @param {number} userId who is asking
 * @param {string} createdAt
 * @param {Date} now
 */
export function isEditable(authorId, userId, createdAt, now = new Date()) {
  if (authorId === null || authorId === undefined || authorId !== userId) return false;
  const written = Date.parse(createdAt);
  if (Number.isNaN(written)) return false;
  return now.getTime() - written < EDIT_WINDOW_MS;
}

/** `minmax:maxmin` — the pair that may own exactly one conversation. */
export function pairKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}
