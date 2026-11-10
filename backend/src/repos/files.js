import { HttpError } from '../domain/errors.js';
import { canEdit, canRead, roleFor } from '../domain/access.js';
import { FILE_NAME_MAX } from '@note/shared';

const nowIso = () => new Date().toISOString();

/**
 * Files inside a resource.
 *
 * A file is readable only through a resource the user can read, and writable only
 * through one they can edit — the role is looked up per request, never taken from
 * the client.
 */

/**
 * Resource ids owned by an account — the folders on disk that go with them.
 *
 * The one files query without a session check: it is for the CLI, which reads the
 * id out of the users table itself and is allowed to speak about anyone.
 */
export function ownedResourceIds(db, userId) {
  return db
    .prepare('SELECT id FROM file_resources WHERE owner_id = ?')
    .all(userId)
    .map((row) => row.id);
}

/** Role of this user for the resource holding `fileId`, plus the row itself. */
function joinAccess(db, userId, fileId) {
  const row = db
    .prepare(
      `SELECT f.*, r.owner_id, r.name AS resource_name, m.permission
         FROM files f
         JOIN file_resources r ON r.id = f.resource_id
         LEFT JOIN file_resource_members m ON m.resource_id = r.id AND m.user_id = @user
        WHERE f.id = @id`,
    )
    .get({ user: userId, id: fileId });
  if (!row) return null;

  const role = roleFor(row.owner_id === userId, row.permission);
  return role ? { ...row, role } : null;
}

/** Files of one resource, newest first, optional keyword in the name. */
export function listFiles(db, userId, resourceId, { q } = {}) {
  const resource = resourceAccess(db, userId, resourceId);
  if (!resource) return null;
  if (!canRead(resource.role)) return null;

  const keyword = q ? `%${String(q).replace(/[%_]/g, (c) => `\\${c}`)}%` : null;
  const rows = db
    .prepare(
      `SELECT f.*, COALESCE(u.username, '—') AS created_by_name
         FROM files f LEFT JOIN users u ON u.id = f.created_by
        WHERE f.resource_id = @resource ${keyword ? "AND f.name LIKE @keyword ESCAPE '\\'" : ''}
        ORDER BY f.created_at DESC, f.id DESC`,
    )
    .all({ resource: resourceId, keyword });

  return { items: rows.map(toDto) };
}

function resourceAccess(db, userId, resourceId) {
  const row = db
    .prepare(
      `SELECT r.id, r.owner_id, m.permission
         FROM file_resources r
         LEFT JOIN file_resource_members m ON m.resource_id = r.id AND m.user_id = @user
        WHERE r.id = @id`,
    )
    .get({ user: userId, id: resourceId });
  if (!row) return null;
  const role = roleFor(row.owner_id === userId, row.permission);
  return role ? { ...row, role } : null;
}

/**
 * Record an upload that is already on disk.
 *
 * @param {{name: string, storedName: string, size: number, contentType: string}} input
 */
export function addFile(db, userId, resourceId, { name, storedName, size, contentType, now = nowIso() }) {
  const resource = resourceAccess(db, userId, resourceId);
  if (!resource) return { error: 'resource' };
  if (!canEdit(resource.role)) return { error: 'permission' };

  const info = db
    .prepare(
      `INSERT INTO files (resource_id, name, stored_name, size, content_type, created_by, created_at)
       VALUES (@resource, @name, @stored, @size, @type, @by, @created)`,
    )
    .run({
      resource: resourceId,
      name: displayName(name),
      stored: storedName,
      size,
      type: contentType || 'application/octet-stream',
      by: userId,
      created: now,
    });

  db.prepare('UPDATE file_resources SET updated_at = ? WHERE id = ?').run(now, resourceId);
  return { file: getFile(db, userId, info.lastInsertRowid) };
}

export function getFile(db, userId, fileId) {
  const found = getFileForDownload(db, userId, fileId);
  if (!found) return null;
  return { ...found.file, role: found.role, resource_name: found.resource_name };
}

/**
 * Same lookup, but handing over the disk name for the download. Kept apart from
 * `getFile` so the generated name can never leak into a JSON response by accident.
 */
export function getFileForDownload(db, userId, fileId) {
  const row = joinAccess(db, userId, fileId);
  if (!row || !canRead(row.role)) return null;
  const author = db.prepare('SELECT username FROM users WHERE id = ?').get(row.created_by);
  return {
    // '—' when the account that uploaded it no longer exists; the file stays.
    file: { ...toDto(row), created_by_name: author?.username ?? '—' },
    storedName: row.stored_name,
    role: row.role,
    resource_name: row.resource_name,
  };
}

/** Raw row for the route to delete the bytes with; access checked. */
export function renameFile(db, userId, fileId, name) {
  const row = joinAccess(db, userId, fileId);
  if (!row) return null;
  if (!canEdit(row.role)) {
    throw new HttpError(403, 'read_only', 'ten zasób jest tylko do odczytu');
  }

  db.prepare('UPDATE files SET name = ? WHERE id = ?').run(displayName(name), fileId);
  return getFile(db, userId, fileId);
}

export function deleteFile(db, userId, fileId) {
  const row = joinAccess(db, userId, fileId);
  if (!row) return null;
  if (!canEdit(row.role)) {
    throw new HttpError(403, 'read_only', 'ten zasób jest tylko do odczytu');
  }

  db.prepare('DELETE FROM files WHERE id = ?').run(fileId);
  return row;
}

function toDto(row) {
  return {
    id: row.id,
    resource_id: row.resource_id,
    name: row.name,
    size: row.size,
    content_type: row.content_type,
    created_by: row.created_by,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
  };
}

/**
 * A name is a label, not a path. Requests can bring anything ("..", "a/b.txt",
 * 300 spaces); the stored path is generated separately, so this only has to make
 * the label sane and bounded.
 */
export function displayName(raw) {
  const base = String(raw ?? '')
    .split(/[\\/]/)
    .pop()
    .replace(/\s+/g, ' ')
    .trim();
  const clean = base || 'plik';
  return clean.length > FILE_NAME_MAX ? clean.slice(0, FILE_NAME_MAX) : clean;
}
