import { HttpError } from '../domain/errors.js';
import { keywordFilter, orderBySql } from '../domain/query.js';
import { deriveTitle } from '../domain/noteTitle.js';
import { NOTE_TITLE_MAX } from '@note/shared';

const nowIso = () => new Date().toISOString();

/**
 * Notes table access. Every function takes the open database as its first
 * argument and returns plain row objects shaped like NoteSchema, so the HTTP
 * layer adds no translation step.
 */

export function listNotes(db, { q, sort = 'updated_desc', limit = 50, offset = 0 } = {}) {
  const { clause, params } = keywordFilter(q, ['title', 'body']);
  const where = clause ? `WHERE ${clause}` : '';

  const items = db
    .prepare(
      `SELECT * FROM notes ${where} ORDER BY ${orderBySql(sort)} LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit, offset });
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM notes ${where}`).get(params);

  return { items, total };
}

export function getNote(db, id) {
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
}

export function createNote(db, { title, body = '', now = nowIso() } = {}) {
  const finalTitle = title && title.trim() ? title.trim() : deriveTitle(body, NOTE_TITLE_MAX);
  const info = db
    .prepare('INSERT INTO notes (title, body, created_at, updated_at) VALUES (@t, @b, @c, @u)')
    .run({ t: finalTitle, b: body, c: now, u: now });
  return getNote(db, info.lastInsertRowid);
}

/**
 * Save a note, snapshotting the state it replaces.
 *
 * History is written only when content actually changed, so an autosave firing
 * on an untouched note cannot add noise to the revision list.
 *
 * @returns {object|null} updated row, or null when the id is unknown
 */
export function updateNote(db, id, { title, body, now = nowIso() }) {
  const current = getNote(db, id);
  if (!current) return null;

  const nextTitle = title !== undefined ? title.trim() : current.title;
  const nextBody = body !== undefined ? body : current.body;
  const changed = nextTitle !== current.title || nextBody !== current.body;

  if (!changed) return current;

  return db.transaction(() => {
    db.prepare(
      `INSERT INTO note_revisions (note_id, title, body, created_at) VALUES (@id, @t, @b, @at)`,
    ).run({ id, t: current.title, b: current.body, at: current.updated_at });

    db.prepare('UPDATE notes SET title = @t, body = @b, updated_at = @u WHERE id = @id').run({
      id,
      t: nextTitle,
      b: nextBody,
      u: now,
    });
    return getNote(db, id);
  })();
}

export function deleteNote(db, id) {
  return db.prepare('DELETE FROM notes WHERE id = ?').run(id).changes > 0;
}

export function listRevisions(db, noteId, { limit = 50 } = {}) {
  if (!getNote(db, noteId)) return null;
  return db
    .prepare('SELECT * FROM note_revisions WHERE note_id = @noteId ORDER BY id DESC LIMIT @limit')
    .all({ noteId, limit });
}

/**
 * Roll a note back to one of its revisions. The version being replaced is
 * snapshotted first, so a restore is itself undoable.
 */
export function restoreRevision(db, noteId, revisionId, now = nowIso()) {
  const note = getNote(db, noteId);
  if (!note) return null;

  const revision = db
    .prepare('SELECT * FROM note_revisions WHERE id = ? AND note_id = ?')
    .get(revisionId, noteId);
  if (!revision) throw new HttpError(404, 'revision_not_found', `revision ${revisionId} not found`);

  return db.transaction(() => {
    db.prepare(
      `INSERT INTO note_revisions (note_id, title, body, created_at) VALUES (@id, @t, @b, @at)`,
    ).run({ id: noteId, t: note.title, b: note.body, at: note.updated_at });

    db.prepare('UPDATE notes SET title = @t, body = @b, updated_at = @u WHERE id = @id').run({
      id: noteId,
      t: revision.title,
      b: revision.body,
      u: now,
    });
    return getNote(db, noteId);
  })();
}
