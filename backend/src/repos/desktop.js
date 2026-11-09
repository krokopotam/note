import { HttpError } from '../domain/errors.js';

const nowIso = () => new Date().toISOString();

/**
 * Desktop items (app shortcuts and folders).
 *
 * Coordinates are grid units, not pixels: the shell decides cell size, so the
 * same stored layout survives a window resize or a different screen.
 * A folder only ever holds shortcuts, which is why deleting one cascades without
 * touching notes or stickies.
 */

export function listItems(db) {
  return db.prepare('SELECT * FROM desktop_items ORDER BY id ASC').all();
}

export function getItem(db, id) {
  return db.prepare('SELECT * FROM desktop_items WHERE id = ?').get(id);
}

export function createItem(
  db,
  { kind, name, app_id = null, parent_id = null, x = 0, y = 0, now = nowIso() },
) {
  if (parent_id !== null) assertPlacement(db, { parentId: parent_id });

  const info = db
    .prepare(
      `INSERT INTO desktop_items (kind, name, app_id, parent_id, x, y, created_at)
       VALUES (@kind, @name, @app_id, @parent_id, @x, @y, @created)`,
    )
    .run({ kind, name, app_id, parent_id, x, y, created: now });

  return getItem(db, info.lastInsertRowid);
}

/**
 * Rename and/or move an item.
 *
 * @param {object} patch - {name?, x?, y?, parent_id?}; parent_id: null means "to the desktop"
 * @returns {object|null} updated row, or null when the id is unknown
 * @throws {HttpError} 409 when the move would create a cycle or target a non-folder
 */
export function updateItem(db, id, patch) {
  const current = getItem(db, id);
  if (!current) return null;

  const wantsParent = Object.prototype.hasOwnProperty.call(patch, 'parent_id');
  const nextParent = wantsParent ? patch.parent_id : current.parent_id;

  if (wantsParent) assertPlacement(db, { parentId: nextParent, movingId: id });

  db.prepare(
    `UPDATE desktop_items
        SET name = @name, x = @x, y = @y, parent_id = @parent_id
      WHERE id = @id`,
  ).run({
    id,
    name: patch.name !== undefined ? patch.name : current.name,
    x: patch.x !== undefined ? patch.x : current.x,
    y: patch.y !== undefined ? patch.y : current.y,
    parent_id: nextParent,
  });

  return getItem(db, id);
}

export function deleteItem(db, id) {
  return db.prepare('DELETE FROM desktop_items WHERE id = ?').run(id).changes > 0;
}

/**
 * A parent must be an existing folder, and moving a folder into its own subtree
 * is rejected: it would make the desktop unreachable from the shell.
 */
function assertPlacement(db, { parentId, movingId = null }) {
  if (parentId === null || parentId === undefined) return;

  if (movingId !== null && parentId === movingId) {
    throw new HttpError(409, 'cycle_detected', 'cannot move an item into itself');
  }

  const parent = getItem(db, parentId);
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
    cursor = getItem(db, cursor)?.parent_id ?? null;
  }
}
