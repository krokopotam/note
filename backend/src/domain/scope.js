/**
 * Every repository query is scoped to one account.
 *
 * Rather than trusting callers to remember, the repositories call this first: a
 * missing or bogus user id stops here instead of quietly reading everybody's rows.
 */
import { HttpError } from './errors.js';

/** @param {unknown} userId @returns {number} the id, when it is a real signed-in user */
export function assertUserId(userId) {
  if (!Number.isInteger(userId) || userId < 1) {
    throw new HttpError(401, 'unauthorized', 'signed-in user required');
  }
  return userId;
}
