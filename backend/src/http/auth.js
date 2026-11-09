/**
 * Session plumbing for the HTTP layer: read the cookie, resolve it into
 * `req.userId` / `req.user`, and a small throttle so the login form cannot be
 * used to brute-force passwords.
 */
import { HttpError } from '../domain/errors.js';
import { clearCookie, parseCookies, serializeCookie } from './cookies.js';
import { resolveSession } from '../repos/sessions.js';

export const SESSION_COOKIE = 'note_session';

/** @returns {string|undefined} raw token from the request cookie */
export function readSessionToken(req) {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE];
}

/** Put the session cookie on the response. Max-Age is only set for "10 days". */
export function writeSessionCookie(res, token, { maxAgeSeconds = null, secure = true }) {
  res.append('Set-Cookie', serializeCookie(SESSION_COOKIE, token, { maxAgeSeconds, secure }));
}

export function clearSessionCookie(res, { secure = true } = {}) {
  res.append('Set-Cookie', clearCookie(SESSION_COOKIE, { secure }));
}

/**
 * Guard for everything that belongs to somebody.
 *
 * Sets req.userId, which every repository insists on. An expired or forged cookie
 * is indistinguishable from a missing one: 401, and the shell shows the login form.
 */
export function requireAuth(db, { now = () => new Date() } = {}) {
  return function authMiddleware(req, res, next) {
    const token = readSessionToken(req);
    const resolved = token ? resolveSession(db, token, now()) : null;
    if (!resolved) {
      next(new HttpError(401, 'unauthorized', 'zaloguj się, żeby kontynuować'));
      return;
    }

    req.userId = resolved.user.id;
    req.user = resolved.user;
    req.sessionToken = token;
    next();
  };
}

/**
 * Fixed-window attempt counter per IP, kept in memory.
 *
 * One process serves the whole desktop, so an in-process map is enough to make
 * password guessing expensive; it deliberately does not lock anybody out of a
 * legitimate session, only the auth endpoints.
 *
 * @param {{windowMs?: number, max?: number, now?: () => number}} [options]
 */
export function authThrottle({ windowMs = 10 * 60_000, max = 20, now = () => Date.now() } = {}) {
  const attempts = new Map();

  return function throttle(req, res, next) {
    const moment = now();
    const key = req.ip ?? 'unknown';
    const entry = attempts.get(key);

    if (!entry || entry.resetAt <= moment) {
      // Cheap housekeeping: windows die on their own, but a scan can create many.
      if (attempts.size > 1000) {
        for (const [ip, record] of attempts) {
          if (record.resetAt <= moment) attempts.delete(ip);
        }
      }
      attempts.set(key, { count: 1, resetAt: moment + windowMs });
      next();
      return;
    }

    entry.count += 1;
    if (entry.count > max) {
      const retrySeconds = Math.max(1, Math.ceil((entry.resetAt - moment) / 1000));
      res.set('Retry-After', String(retrySeconds));
      next(
        new HttpError(
          429,
          'too_many_attempts',
          `za dużo prób — spróbuj ponownie za ${retrySeconds} s`,
        ),
      );
      return;
    }

    next();
  };
}
