import { HttpError } from '../domain/errors.js';
import { roleFor } from '../domain/access.js';
import { assertUserId } from '../domain/scope.js';

const nowIso = () => new Date().toISOString();

/**
 * Resources ("zasoby"): named folders of files, owned by one account and
 * optionally shared with others for reading or editing.
 *
 * Every read goes through `getResource`, which resolves the role of the *asking*
 * user in one query — so a resource somebody else forgot to share is simply not
 * there (404), the same rule the rest of the API follows.
 */

/** Own resources plus everything shared in, with the role for this user. */
export function listResources(db, userId) {
  const owner = assertUserId(userId);
  const rows = db
    .prepare(
      `SELECT r.id, r.name, r.owner_id, r.created_at, r.updated_at,
              m.permission,
              (SELECT COUNT(*) FROM files f WHERE f.resource_id = r.id) AS file_count
         FROM file_resources r
         LEFT JOIN file_resource_members m ON m.resource_id = r.id AND m.user_id = @user
        WHERE r.owner_id = @user OR m.user_id IS NOT NULL
        ORDER BY r.name COLLATE NOCASE ASC`,
    )
    .all({ user: owner });

  return {
    items: rows
      .map((row) => shape(row, owner))
      .filter((resource) => resource !== null),
  };
}

/** One resource as this user sees it, or null when they may not see it. */
export function getResource(db, userId, resourceId) {
  const owner = assertUserId(userId);
  const row = db
    .prepare(
      `SELECT r.id, r.name, r.owner_id, r.created_at, r.updated_at, m.permission,
              (SELECT COUNT(*) FROM files f WHERE f.resource_id = r.id) AS file_count
         FROM file_resources r
         LEFT JOIN file_resource_members m ON m.resource_id = r.id AND m.user_id = @user
        WHERE r.id = @id`,
    )
    .get({ user: owner, id: resourceId });

  return row ? shape(row, owner) : null;
}

function shape(row, userId) {
  const role = roleFor(row.owner_id === userId, row.permission);
  if (!role) return null;
  return {
    id: row.id,
    name: row.name,
    role,
    file_count: row.file_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createResource(db, userId, { name, now = nowIso() }) {
  const owner = assertUserId(userId);
  const info = db
    .prepare(
      `INSERT INTO file_resources (owner_id, name, created_at, updated_at)
       VALUES (@owner, @name, @created, @updated)`,
    )
    .run({ owner, name, created: now, updated: now });
  return getResource(db, owner, info.lastInsertRowid);
}

/** Owner only. Returns the resource, or null when it is not visible at all. */
export function renameResource(db, userId, resourceId, name, now = nowIso()) {
  const resource = getResource(db, userId, resourceId);
  if (!resource) return null;
  if (resource.role !== 'owner') {
    throw new HttpError(403, 'not_owner', 'tylko właściciel zmienia nazwę zasobu');
  }

  db.prepare('UPDATE file_resources SET name = @name, updated_at = @updated WHERE id = @id').run({
    id: resourceId,
    name,
    updated: now,
  });
  return getResource(db, userId, resourceId);
}

/**
 * Owner only. Returns the row so the route can delete the folder on disk —
 * the database row is gone with its files through the cascade.
 */
export function deleteResource(db, userId, resourceId) {
  const resource = getResource(db, userId, resourceId);
  if (!resource) return null;
  if (resource.role !== 'owner') {
    throw new HttpError(403, 'not_owner', 'tylko właściciel usuwa zasób');
  }

  const row = db.prepare('SELECT * FROM file_resources WHERE id = ?').get(resourceId);
  db.prepare('DELETE FROM file_resources WHERE id = ?').run(resourceId);
  return row;
}

// --- udostępnianie -----------------------------------------------------------

/** Accounts the resource is shared with (the owner is not a member of their own). */
export function listMembers(db, resourceId) {
  return db
    .prepare(
      `SELECT m.user_id, u.username, m.permission
         FROM file_resource_members m JOIN users u ON u.id = m.user_id
        WHERE m.resource_id = ?
        ORDER BY u.username COLLATE NOCASE ASC`,
    )
    .all(resourceId);
}

/** Everyone who could be picked in the sharing dialog, except the asking user. */
export function shareableUsers(db, userId) {
  return db
    .prepare('SELECT id, username FROM users WHERE id <> ? ORDER BY username COLLATE NOCASE ASC')
    .all(assertUserId(userId));
}

/**
 * Grant, change or revoke (permission: null) access for one account. Owner only:
 * sharing is the one thing an `edit` friend must not be able to do.
 */
export function setMember(db, userId, resourceId, { user_id: targetId, permission }, now = nowIso()) {
  const resource = getResource(db, userId, resourceId);
  if (!resource) return null;
  if (resource.role !== 'owner') {
    throw new HttpError(403, 'not_owner', 'tylko właściciel udostępnia zasób');
  }
  if (targetId === userId) {
    throw new HttpError(400, 'self_share', 'własny zasób masz zawsze pełny dostęp');
  }
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(targetId)) {
    throw new HttpError(404, 'not_found', `konto ${targetId} nie istnieje`);
  }

  if (permission === null) {
    db.prepare('DELETE FROM file_resource_members WHERE resource_id = ? AND user_id = ?').run(
      resourceId,
      targetId,
    );
  } else {
    db.prepare(
      `INSERT INTO file_resource_members (resource_id, user_id, permission, granted_by, created_at)
       VALUES (@resource, @user, @permission, @granted, @created)
       ON CONFLICT(resource_id, user_id) DO UPDATE SET permission = excluded.permission`,
    ).run({ resource: resourceId, user: targetId, permission, granted: userId, created: now });
  }

  return { resource: getResource(db, userId, resourceId), members: listMembers(db, resourceId) };
}
