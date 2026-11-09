import { FAVORITE_SLOTS } from '@note/shared';

/**
 * Pinned apps for the two shell slots (bottom dock, left launcher).
 *
 * Order is meaningful and stored as `position`; the API exchanges it as a plain
 * array of app ids so the client never has to manage indices.
 */

/** @returns {Array<{slot: string, app_ids: string[]}>} one entry per slot, always both */
export function getFavorites(db) {
  const rows = db.prepare('SELECT slot, app_id FROM favorites ORDER BY slot, position, app_id').all();
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
export function putFavorites(db, slot, appIds) {
  const unique = [...new Set(appIds)];
  db.transaction(() => {
    db.prepare('DELETE FROM favorites WHERE slot = ?').run(slot);
    const insert = db.prepare('INSERT INTO favorites (slot, app_id, position) VALUES (?, ?, ?)');
    unique.forEach((appId, index) => insert.run(slot, appId, index));
  })();
  return getFavorites(db).find((entry) => entry.slot === slot);
}
