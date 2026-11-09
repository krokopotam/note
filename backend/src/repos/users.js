/**
 * Accounts.
 *
 * Usernames are stored normalised (lowercase, trimmed) and the UNIQUE index is what
 * makes registration race-safe — the API turns the constraint violation into 409
 * instead of checking first and hoping.
 */
import { HttpError } from '../domain/errors.js';

const nowIso = () => new Date().toISOString();

/** SQLite's "UNIQUE constraint failed" for a specific column. */
const isUniqueViolation = (error) =>
  error instanceof Error && String(error.message).includes('users.username');

/**
 * @param {{username: string, passwordHash: string, now?: string}} input
 * @returns {object} the stored user, without the hash
 */
export function createUser(db, { username, passwordHash, now = nowIso() }) {
  let info;
  try {
    info = db
      .prepare(
        `INSERT INTO users (username, password_hash, created_at)
         VALUES (@username, @hash, @created)`,
      )
      .run({ username, hash: passwordHash, created: now });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, 'username_taken', `konto ${username} już istnieje`);
    }
    throw error;
  }
  return getUser(db, info.lastInsertRowid);
}

/** @param {number} id */
export function getUser(db, id) {
  return db.prepare('SELECT id, username, created_at, last_login_at FROM users WHERE id = ?').get(id);
}

/** Includes the hash: for authentication and the CLI only, never for a response body. */
export function getUserWithSecret(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

/** @param {string} username already normalised */
export function findByUsername(db, username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

export function listUsers(db) {
  return db
    .prepare('SELECT id, username, created_at, last_login_at FROM users ORDER BY id ASC')
    .all();
}

/** Sets a password, which is also what unlocks an account created by the migration. */
export function setPassword(db, userId, passwordHash) {
  const info = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
  if (info.changes === 0) throw new HttpError(404, 'not_found', `user ${userId} does not exist`);
  return getUser(db, userId);
}

export function touchLogin(db, userId, now = nowIso()) {
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, userId);
  return getUser(db, userId);
}

/**
 * Move every piece of content from one account to another (CLI: "adopt the data
 * that predates accounts"). Notes come with their revisions because revisions are
 * reached through their note.
 */
export function adoptDataFrom(db, fromUserId, toUserId) {
  const move = (table) => db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id = ?`);
  const counts = {};

  db.transaction(() => {
    // A pinned app the receiver already pinned would collide with their own row;
    // the giver's copy is the one that can go.
    counts.duplicates_dropped = db
      .prepare(
        `DELETE FROM favorites
          WHERE user_id = ?
            AND EXISTS (SELECT 1 FROM favorites mine
                         WHERE mine.user_id = ? AND mine.slot = favorites.slot
                           AND mine.app_id = favorites.app_id)`,
      )
      .run(fromUserId, toUserId).changes;

    for (const table of ['notes', 'stickies', 'desktop_items', 'favorites', 'notepad_tabs']) {
      counts[table] = move(table).run(toUserId, fromUserId).changes;
    }
    // Only one row may hold the active note per user, so the giver's is dropped.
    db.prepare('DELETE FROM notepad_state WHERE user_id = ?').run(fromUserId);
    const noteIds = db
      .prepare('SELECT id FROM notes WHERE user_id = ?')
      .all(toUserId)
      .map((row) => row.id);
    const active = db
      .prepare('SELECT active_note_id FROM notepad_state WHERE user_id = ?')
      .get(toUserId);
    const kept = active && noteIds.includes(active.active_note_id) ? active.active_note_id : null;
    db.prepare(
      `INSERT INTO notepad_state (user_id, active_note_id) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET active_note_id = excluded.active_note_id`,
    ).run(toUserId, kept);
  })();

  return counts;
}
