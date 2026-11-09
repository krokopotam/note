import { HttpError } from '../domain/errors.js';
import { assertUserId } from '../domain/scope.js';

const nowIso = () => new Date().toISOString();

/**
 * Desktop items (app shortcuts and folders) — always scoped to one account.
 *
 * Coordinates are grid units, not pixels: the shell decides cell size, so the
 * same stored layout survives a window resize or a different screen.
 * A folder only ever holds shortcuts, which is why deleting one cascades without
 * touching notes or stickies.
 *
 * `assertPlacement` is user-scoped too: dropping an icon into somebody else's
 * folder would hide it, so it is rejected like a folder that does not exist.
 */

export function listItems(db, userId) {
  return db
    .prepare('SELECT * FROM desktop_items WHERE user_id = ? ORDER BY id ASC')
    .all(assertUserId(userId));
}

export function getItem(db, userId, id) {
  return db
    .prepare('SELECT * FROM desktop_items WHERE id = ? AND user_id = ?')
    .get(id, assertUserId(userId));
}

export function createItem(
  db,
  userId,
  { kind, name, app_id = null, parent_id = null, x = 0, y = 0, now = nowIso() },
) {
  const owner = assertUserId(userId);
  if (parent_id !== null) assertPlacement(db, owner, { parentId: parent_id });

  const info = db
    .prepare(
      `INSERT INTO desktop_items (user_id, kind, name, app_id, parent_id, x, y, created_at)
       VALUES (@user, @kind, @name, @app_id, @parent_id, @x, @y, @created)`,
    )
    .run({ user: owner, kind, name, app_id, parent_id, x, y, created: now });

  return getItem(db, owner, info.lastInsertRowid);
}

/**
 * Rename and/or move an item.
 *
 * @param {object} patch - {name?, x?, y?, parent_id?}; parent_id: null means "to the desktop"
 * @returns {object|null} updated row, or null when the id is not this user's
 * @throws {HttpError} 409 when the move would create a cycle or target a non-folder
 */
export function updateItem(db, userId, id, patch) {
  const owner = assertUserId(userId);
  const current = getItem(db, owner, id);
  if (!current) return null;

  const wantsParent = Object.prototype.hasOwnProperty.call(patch, 'parent_id');
  const nextParent = wantsParent ? patch.parent_id : current.parent_id;

  if (wantsParent) assertPlacement(db, owner, { parentId: nextParent, movingId: id });

  db.prepare(
    `UPDATE desktop_items
        SET name = @name, x = @x, y = @y, parent_id = @parent_id
      WHERE id = @id AND user_id = @user`,
  ).run({
    id,
    user: owner,
    name: patch.name !== undefined ? patch.name : current.name,
    x: patch.x !== undefined ? patch.x : current.x,
    y: patch.y !== undefined ? patch.y : current.y,
    parent_id: nextParent,
  });

  return getItem(db, owner, id);
}

export function deleteItem(db, userId, id) {
  return (
    db
      .prepare('DELETE FROM desktop_items WHERE id = ? AND user_id = ?')
      .run(id, assertUserId(userId)).changes > 0
  );
}

/**
 * A parent must be an existing folder of the same account, and moving a folder into
 * its own subtree is rejected: it would make the desktop unreachable from the shell.
 */
function assertPlacement(db, userId, { parentId, movingId = null }) {
  if (parentId === null || parentId === undefined) return;

  if (movingId !== null && parentId === movingId) {
    throw new HttpError(409, 'cycle_detected', 'cannot move an item into itself');
  }

  const parent = getItem(db, userId, parentId);
  if (!parent) {
    throw new HttpError(409, 'invalid_parent', `folder ${parentId} does not exist`);
  }
  if (parent.kind !== 'folder') {
    throw new HttpError(409, 'invalid_parent', `item ${parentId} is not a folder`);
  }

  let cursor = parent.parent_id;
  while (cursor !== null) {
    if (cursor === movingId) {
      throw new HttpError(409, 'cycle_detected', 'cannot move a folder into its own subtree');
    }
    cursor = getItem(db, userId, cursor)?.parent_id ?? null;
  }
}
