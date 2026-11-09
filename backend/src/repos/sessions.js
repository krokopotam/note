/**
 * Sessions: a random token in the cookie, its SHA-256 in the database.
 *
 * Lookups go by hash only, expired rows are dropped when they are touched (and in
 * bulk by purgeExpired on the auth endpoints), so there is no scheduler to run.
 */
import { hashToken, isExpired } from '../domain/tokens.js';

const nowIso = () => new Date().toISOString();

/**
 * @param {{userId: number, token: string, expiresAt: string, remember?: boolean, now?: string}} input
 * @returns {{token: string, expires_at: string, remember: boolean}} the caller keeps the token; it is never read back
 */
export function createSession(db, { userId, token, expiresAt, remember = false, now = nowIso() }) {
  db.prepare(
    `INSERT INTO sessions (user_id, token_hash, created_at, expires_at, remember)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(userId, hashToken(token), now, expiresAt, remember ? 1 : 0);
  return { token, expires_at: expiresAt, remember };
}

/**
 * Resolve a cookie into a user, or null. Expired rows delete themselves on the way.
 *
 * @param {string} token
 * @returns {{user: object, session: object}|null}
 */
export function resolveSession(db, token, now = new Date()) {
  if (typeof token !== 'string' || token.length === 0) return null;

  const row = db
    .prepare(
      `SELECT sessions.id AS session_id, sessions.expires_at, sessions.remember,
              users.id AS user_id, users.username, users.created_at, users.last_login_at
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ?`,
    )
    .get(hashToken(token));

  if (!row) return null;
  if (isExpired(row.expires_at, now)) {
    destroy(db, token);
    return null;
  }

  return {
    user: {
      id: row.user_id,
      username: row.username,
      created_at: row.created_at,
      last_login_at: row.last_login_at,
    },
    session: { id: row.session_id, expires_at: row.expires_at, remember: row.remember },
  };
}

/** Always succeeds: signing out with an unknown or broken cookie is still signed out. */
export function destroy(db, token) {
  if (typeof token !== 'string' || token.length === 0) return 0;
  return db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token)).changes;
}

/** Every session of one account (used when a password changes or an account is locked). */
export function destroyAllForUser(db, userId) {
  return db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId).changes;
}

/** @returns {number} rows deleted */
export function purgeExpired(db, now = new Date()) {
  return db
    .prepare('DELETE FROM sessions WHERE expires_at <= ?')
    .run(now.toISOString()).changes;
}

export function listSessions(db, userId) {
  return db
    .prepare(
      `SELECT id, created_at, expires_at, remember FROM sessions
       WHERE user_id = ? ORDER BY created_at DESC`,
    )
    .all(userId);
}
