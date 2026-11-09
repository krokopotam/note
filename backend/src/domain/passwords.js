/**
 * Password hashing with node's built-in scrypt — no native dependency to build on
 * the server, and the parameters travel inside the stored string, so raising them
 * later does not invalidate existing accounts.
 *
 * Format: scrypt$N$r$p$<salt base64>$<key base64>
 * A hash starting with '!' means the account exists but nobody set its password yet
 * (the migration creates the owner's row before any password is known).
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 32;
const PARAMS = { N: 16384, r: 8, p: 1 };

export const LOCKED_HASH = '!locked';

/** @param {string} password @returns {string} storable hash */
export function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(String(password), salt, KEY_LENGTH, PARAMS);
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

/** @param {string} stored @returns {boolean} true until somebody sets a password */
export const isLocked = (stored) =>
  typeof stored !== 'string' || stored.startsWith('!') || !stored.startsWith('scrypt$');

/**
 * @param {string} password
 * @param {string} stored
 * @returns {boolean} whether they match; never throws, whatever is in the database
 */
export function verifyPassword(password, stored) {
  if (isLocked(stored)) return false;

  const [, n, r, p, saltPart, keyPart] = stored.split('$');
  const expected = Buffer.from(keyPart ?? '', 'base64');
  if (expected.length !== KEY_LENGTH) return false;

  let actual;
  try {
    actual = scryptSync(String(password), Buffer.from(saltPart ?? '', 'base64'), KEY_LENGTH, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
  } catch {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

/**
 * Spend the same milliseconds a real check would, so a failed login cannot be told
 * apart by timing — otherwise the login form answers faster for usernames that do
 * not exist.
 */
export function pretendToVerify() {
  try {
    scryptSync('does-not-exist', Buffer.alloc(16, 7), KEY_LENGTH, PARAMS);
  } catch {
    /* the point is the time spent, not the result */
  }
}
