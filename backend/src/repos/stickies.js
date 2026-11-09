import { keywordFilter, orderBySql } from '../domain/query.js';
import { assertUserId } from '../domain/scope.js';

const nowIso = () => new Date().toISOString();
const toRow = (row) => row && { ...row, pinned: Boolean(row.pinned) };

/**
 * Stickies table access — always scoped to one account.
 * `pinned` is stored 0/1 and exposed as a boolean.
 */

export function listStickies(
  db,
  userId,
  { q, sort = 'updated_desc', limit = 50, offset = 0, onlyPinned = false } = {},
) {
  const owner = assertUserId(userId);
  const { clause, params } = keywordFilter(q, ['body']);
  const parts = ['user_id = @userId'];
  if (clause) parts.push(clause);
  if (onlyPinned) parts.push('pinned = 1');
  const where = `WHERE ${parts.join(' AND ')}`;

  const items = db
    .prepare(
      `SELECT * FROM stickies ${where}
        ORDER BY pinned DESC, ${orderBySql(sort, { titleColumn: 'body' })}
        LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, userId: owner, limit, offset }).map(toRow);

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM stickies ${where}`).get({
    ...params,
    userId: owner,
  });
  return { items, total };
}

export function getSticky(db, userId, id) {
  return toRow(
    db.prepare('SELECT * FROM stickies WHERE id = ? AND user_id = ?').get(id, assertUserId(userId)),
  );
}

export function createSticky(
  db,
  userId,
  { body = '', color = 'yellow', pinned = false, now = nowIso() } = {},
) {
  const info = db
    .prepare(
      `INSERT INTO stickies (user_id, body, color, pinned, created_at, updated_at)
       VALUES (@user, @body, @color, @pinned, @created, @updated)`,
    )
    .run({
      user: assertUserId(userId),
      body,
      color,
      pinned: pinned ? 1 : 0,
      created: now,
      updated: now,
    });
  return getSticky(db, userId, info.lastInsertRowid);
}

/** @returns {object|null} updated row or null when the id is not this user's */
export function updateSticky(db, userId, id, { body, color, pinned, now = nowIso() }) {
  const current = getSticky(db, userId, id);
  if (!current) return null;

  const next = {
    body: body !== undefined ? body : current.body,
    color: color !== undefined ? color : current.color,
    pinned: pinned !== undefined ? pinned : current.pinned,
  };

  db.prepare(
    `UPDATE stickies SET body = @body, color = @color, pinned = @pinned, updated_at = @updated
     WHERE id = @id AND user_id = @user`,
  ).run({ id, user: current.user_id, ...next, pinned: next.pinned ? 1 : 0, updated: now });

  return getSticky(db, userId, id);
}

export function deleteSticky(db, userId, id) {
  return (
    db.prepare('DELETE FROM stickies WHERE id = ? AND user_id = ?').run(id, assertUserId(userId))
      .changes > 0
  );
}
