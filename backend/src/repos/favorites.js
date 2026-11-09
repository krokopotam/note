import { FAVORITE_SLOTS } from '@note/shared';
import { assertUserId } from '../domain/scope.js';

/**
 * Pinned apps for the two shell slots (bottom dock, left launcher) — per account.
 *
 * Order is meaningful and stored as `position`; the API exchanges it as a plain
 * array of app ids so the client never has to manage indices.
 */

/** @returns {Array<{slot: string, app_ids: string[]}>} one entry per slot, always both */
export function getFavorites(db, userId) {
  const rows = db
    .prepare('SELECT slot, app_id FROM favorites WHERE user_id = ? ORDER BY slot, position, app_id')
    .all(assertUserId(userId));
  return FAVORITE_SLOTS.map((slot) => ({
    slot,
    app_ids: rows.filter((row) => row.slot === slot).map((row) => row.app_id),
  }));
}

/**
 * Replace the whole list of one slot.
 *
 * @param {string} slot - 'dock' | 'launcher'
 * @param {string[]} appIds - order becomes the on-screen order
 */
export function putFavorites(db, userId, slot, appIds) {
  const owner = assertUserId(userId);
  const unique = [...new Set(appIds)];
  db.transaction(() => {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND slot = ?').run(owner, slot);
    const insert = db.prepare(
      'INSERT INTO favorites (user_id, slot, app_id, position) VALUES (?, ?, ?, ?)',
    );
    unique.forEach((appId, index) => insert.run(owner, slot, appId, index));
  })();
  return getFavorites(db, owner).find((entry) => entry.slot === slot);
}
