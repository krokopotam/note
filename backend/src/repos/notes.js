import { keywordFilter, orderBySql } from '../domain/query.js';
import { deriveTitle } from '../domain/noteTitle.js';
import { assertUserId } from '../domain/scope.js';
import { NOTE_TITLE_MAX } from '@note/shared';

const nowIso = () => new Date().toISOString();

/**
 * Notes table access — always scoped to one account.
 *
 * Every function takes the open database and the owning user id, and every
 * statement filters by that id, so "note 7" on another account is simply not
 * found (404, not 403: the API does not confirm that somebody else's id exists).
 */

/** @returns {{items: object[], total: number}} */
export function listNotes(db, userId, { q, sort = 'updated_desc', limit = 50, offset = 0 } = {}) {
  const owner = assertUserId(userId);
  const { clause, params } = keywordFilter(q, ['title', 'body']);
  const where = clause ? `WHERE user_id = @userId AND ${clause}` : 'WHERE user_id = @userId';
  const all = { ...params, userId: owner };

  const items = db
    .prepare(
      `SELECT * FROM notes ${where} ORDER BY ${orderBySql(sort)} LIMIT @limit OFFSET @offset`,
    )
    .all({ ...all, limit, offset });
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM notes ${where}`).get(all);

  return { items, total };
}

export function getNote(db, userId, id) {
  return db
    .prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?')
    .get(id, assertUserId(userId));
}

export function createNote(db, userId, { title, body = '', now = nowIso() } = {}) {
  const finalTitle = title && title.trim() ? title.trim() : deriveTitle(body, NOTE_TITLE_MAX);
  const info = db
    .prepare(
      `INSERT INTO notes (user_id, title, body, created_at, updated_at)
       VALUES (@user, @t, @b, @c, @u)`,
    )
    .run({ user: assertUserId(userId), t: finalTitle, b: body, c: now, u: now });
  return getNote(db, userId, info.lastInsertRowid);
}

/**
 * Save a note. What is written replaces what was there — the notepad keeps no
 * history, so a save is one UPDATE and nothing else.
 *
 * A save of unchanged text is a no-op: autosave fires on a timer, and it must not
 * pretend the note moved.
 *
 * @returns {object|null} updated row, or null when the id is not this user's
 */
export function updateNote(db, userId, id, { title, body, now = nowIso() }) {
  const current = getNote(db, userId, id);
  if (!current) return null;

  const nextTitle = title !== undefined ? title.trim() : current.title;
  const nextBody = body !== undefined ? body : current.body;
  if (nextTitle === current.title && nextBody === current.body) return current;

  db.prepare(
    'UPDATE notes SET title = @t, body = @b, updated_at = @u WHERE id = @id AND user_id = @user',
  ).run({ id, user: current.user_id, t: nextTitle, b: nextBody, u: now });
  return getNote(db, userId, id);
}

export function deleteNote(db, userId, id) {
  return (
    db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, assertUserId(userId))
      .changes > 0
  );
}


