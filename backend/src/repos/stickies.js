import { keywordFilter, orderBySql } from '../domain/query.js';

const nowIso = () => new Date().toISOString();
const toRow = (row) => row && { ...row, pinned: Boolean(row.pinned) };

/** Stickies table access. `pinned` is stored 0/1 and exposed as a boolean. */

export function listStickies(
  db,
  { q, sort = 'updated_desc', limit = 50, offset = 0, onlyPinned = false } = {},
) {
  const { clause, params } = keywordFilter(q, ['body']);
  const parts = [];
  if (clause) parts.push(clause);
  if (onlyPinned) parts.push('pinned = 1');
  const where = parts.length ? `WHERE ${parts.join(' AND ')}` : '';

  const items = db
    .prepare(
      `SELECT * FROM stickies ${where}
        ORDER BY pinned DESC, ${orderBySql(sort, { titleColumn: 'body' })}
        LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit, offset }).map(toRow);

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM stickies ${where}`).get(params);
  return { items, total };
}

export function getSticky(db, id) {
  return toRow(db.prepare('SELECT * FROM stickies WHERE id = ?').get(id));
}

export function createSticky(db, { body = '', color = 'yellow', pinned = false, now = nowIso() } = {}) {
  const info = db
    .prepare(
      `INSERT INTO stickies (body, color, pinned, created_at, updated_at)
       VALUES (@body, @color, @pinned, @created, @updated)`,
    )
    .run({ body, color, pinned: pinned ? 1 : 0, created: now, updated: now });
  return getSticky(db, info.lastInsertRowid);
}

/** @returns {object|null} updated row or null when the id is unknown */
export function updateSticky(db, id, { body, color, pinned, now = nowIso() }) {
  const current = getSticky(db, id);
  if (!current) return null;

  const next = {
    body: body !== undefined ? body : current.body,
    color: color !== undefined ? color : current.color,
    pinned: pinned !== undefined ? pinned : current.pinned,
  };

  db.prepare(
    `UPDATE stickies SET body = @body, color = @color, pinned = @pinned, updated_at = @updated
     WHERE id = @id`,
  ).run({ id, ...next, pinned: next.pinned ? 1 : 0, updated: now });

  return getSticky(db, id);
}

export function deleteSticky(db, id) {
  return db.prepare('DELETE FROM stickies WHERE id = ?').run(id).changes > 0;
}
