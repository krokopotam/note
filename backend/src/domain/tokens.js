/**
 * Session tokens and their lifetimes.
 *
 * The cookie carries a random 32-byte token; the database only ever stores its
 * SHA-256, so a leaked database file does not hand over anybody's session.
 */
import { createHash, randomBytes } from 'node:crypto';
import { REMEMBER_DAYS, SESSION_HOURS } from '@note/shared';

/** @returns {string} url-safe token for the cookie */
export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

/** @param {string} token @returns {string} what goes into sessions.token_hash */
export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/**
 * When does this session die? "Remember me" buys REMEMBER_DAYS, everything else
 * SESSION_HOURS — the browser cookie is a session cookie in that case, but the
 * absolute expiry is enforced server side either way.
 *
 * @param {{remember?: boolean, now?: Date}} options
 * @returns {{expiresAt: string, maxAgeSeconds: number|null}}
 */
export function sessionLifetime({ remember = false, now = new Date() } = {}) {
  const ms = remember ? REMEMBER_DAYS * 24 * 60 * 60 * 1000 : SESSION_HOURS * 60 * 60 * 1000;
  return {
    expiresAt: new Date(now.getTime() + ms).toISOString(),
    maxAgeSeconds: remember ? Math.floor(ms / 1000) : null,
  };
}

/** @param {string} expiresAt @param {Date} [now] */
export const isExpired = (expiresAt, now = new Date()) =>
  new Date(expiresAt).getTime() <= now.getTime();
