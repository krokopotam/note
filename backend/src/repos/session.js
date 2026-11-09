import { assertUserId } from '../domain/scope.js';

/**
 * Persisted notepad session (the "zakładki" the requirement asks for) — one per account.
 *
 * The whole session is replaced on every PUT because the client owns tab order;
 * that keeps the contract trivial and idempotent. Note ids that do not belong to
 * this user or no longer exist are dropped rather than rejected, so a session
 * saved after a note was deleted elsewhere still loads.
 */

export function getSession(db, userId) {
  const owner = assertUserId(userId);
  const rows = db
    .prepare(
      `SELECT tabs.note_id FROM notepad_tabs tabs
        WHERE tabs.user_id = ?
        ORDER BY tabs.position ASC, tabs.note_id ASC`,
    )
    .all(owner);
  const state = db.prepare('SELECT active_note_id FROM notepad_state WHERE user_id = ?').get(owner);
  return { tabs: rows.map((row) => row.note_id), active_note_id: state?.active_note_id ?? null };
}

/**
 * @param {{tabs: number[], active_note_id: number|null}} session
 * @returns {{tabs: number[], active_note_id: number|null}} what was actually stored
 */
export function putSession(db, userId, { tabs, active_note_id = null }) {
  const owner = assertUserId(userId);
  const unique = [...new Set(tabs)];
  const existing = new Set(
    unique.length
      ? db
          .prepare(
            `SELECT id FROM notes WHERE user_id = ? AND id IN (${unique.map(() => '?').join(',')})`,
          )
          .all(owner, ...unique).map((row) => row.id)
      : [],
  );

  const kept = unique.filter((id) => existing.has(id));
  const active = kept.includes(active_note_id) ? active_note_id : null;

  db.transaction(() => {
    db.prepare('DELETE FROM notepad_tabs WHERE user_id = ?').run(owner);
    const insert = db.prepare(
      'INSERT INTO notepad_tabs (user_id, note_id, position) VALUES (?, ?, ?)',
    );
    kept.forEach((noteId, index) => insert.run(owner, noteId, index));
    db.prepare(
      `INSERT INTO notepad_state (user_id, active_note_id) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET active_note_id = excluded.active_note_id`,
    ).run(owner, active);
  })();

  return { tabs: kept, active_note_id: active };
}
