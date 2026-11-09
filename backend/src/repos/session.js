/**
 * Persisted notepad session (the "zakładki" the requirement asks for).
 *
 * The whole session is replaced on every PUT because the client owns tab order;
 * that keeps the contract trivial and idempotent. Note ids that no longer exist
 * are dropped rather than rejected, so a session saved after a note was deleted
 * elsewhere still loads.
 */

export function getSession(db) {
  const rows = db
    .prepare('SELECT note_id FROM notepad_tabs ORDER BY position ASC, note_id ASC')
    .all();
  const state = db.prepare('SELECT active_note_id FROM notepad_state WHERE id = 1').get();
  return { tabs: rows.map((row) => row.note_id), active_note_id: state?.active_note_id ?? null };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{tabs: number[], active_note_id: number|null}} session
 * @returns {{tabs: number[], active_note_id: number|null}} what was actually stored
 */
export function putSession(db, { tabs, active_note_id = null }) {
  const unique = [...new Set(tabs)];
  const existing = new Set(
    unique.length
      ? db
          .prepare(
            `SELECT id FROM notes WHERE id IN (${unique.map(() => '?').join(',')})`,
          )
          .all(...unique).map((row) => row.id)
      : [],
  );

  const kept = unique.filter((id) => existing.has(id));
  const active = kept.includes(active_note_id) ? active_note_id : null;

  db.transaction(() => {
    db.prepare('DELETE FROM notepad_tabs').run();
    const insert = db.prepare('INSERT INTO notepad_tabs (note_id, position) VALUES (?, ?)');
    kept.forEach((noteId, index) => insert.run(noteId, index));
    db.prepare('UPDATE notepad_state SET active_note_id = ? WHERE id = 1').run(active);
  })();

  return { tabs: kept, active_note_id: active };
}
