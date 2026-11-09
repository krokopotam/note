/**
 * Accounts: register, log in, log out, "who am I".
 *
 * Registration is open — the requirement is that anybody who reaches the site can
 * create an account (typing the password twice). The only gate is the throttle in
 * front of these routes plus the password length rule.
 */
import { Router } from 'express';
import { LoginSchema, RegisterSchema, parseOrThrow } from '@note/shared';
import { HttpError } from '../../domain/errors.js';
import {
  hashPassword,
  isLocked,
  pretendToVerify,
  verifyPassword,
} from '../../domain/passwords.js';
import { newSessionToken, sessionLifetime } from '../../domain/tokens.js';
import { seedUser } from '../../repos/seed.js';
import { createSession, destroy, purgeExpired } from '../../repos/sessions.js';
import { createUser, findByUsername, getUser, touchLogin } from '../../repos/users.js';
import { clearSessionCookie, readSessionToken, writeSessionCookie } from '../auth.js';

/** Both branches answer with the same shape, so the response never differs. */
const INVALID_CREDENTIALS = () =>
  new HttpError(401, 'invalid_credentials', 'zły login lub hasło');

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{apps?: Array<{id: string, title: string}>, throttle?: Function}} options
 */
export function authRouter(
  db,
  {
    apps = [],
    throttle = (_req, _res, next) => next(),
    seed = seedUser,
  } = {},
) {
  const router = Router();

  /** Open an account and sign straight into it: one click from arrival to desktop. */
  router.post('/register', throttle, (req, res) => {
    const input = parseOrThrow(RegisterSchema, req.body, 'validation_error');
    purgeExpired(db);

    const user = createUser(db, { username: input.username, passwordHash: hashPassword(input.password) });
    seed(db, user.id, apps);

    const { expiresAt, maxAgeSeconds } = sessionLifetime({ remember: input.remember });
    const token = newSessionToken();
    createSession(db, {
      userId: user.id,
      token,
      expiresAt,
      remember: input.remember,
    });
    writeSessionCookie(res, token, { maxAgeSeconds, secure: req.secure });

    res.status(201).json({ user: getUser(db, user.id) });
  });

  router.post('/login', throttle, (req, res) => {
    const input = parseOrThrow(LoginSchema, req.body, 'validation_error');
    purgeExpired(db);

    const account = findByUsername(db, input.username);

    if (!account || isLocked(account.password_hash)) {
      // Same cost either way: the form must not answer faster for a username that
      // does not exist.
      pretendToVerify();
      throw INVALID_CREDENTIALS();
    }
    if (!verifyPassword(input.password, account.password_hash)) {
      throw INVALID_CREDENTIALS();
    }

    const { expiresAt, maxAgeSeconds } = sessionLifetime({ remember: input.remember });
    const token = newSessionToken();
    createSession(db, {
      userId: account.id,
      token,
      expiresAt,
      remember: input.remember,
    });
    writeSessionCookie(res, token, { maxAgeSeconds, secure: req.secure });

    res.json({ user: touchLogin(db, account.id) });
  });

  /** Always 204 — an anonymous visitor is already signed out. */
  router.post('/logout', (req, res) => {
    destroy(db, readSessionToken(req));
    clearSessionCookie(res, { secure: req.secure });
    res.status(204).end();
  });

  return router;
}

/** Mounted behind requireAuth: the shell calls this on boot to decide what to show. */
export function accountRouter(db) {
  const router = Router();

  router.get('/auth/me', (req, res) => {
    res.json({ user: getUser(db, req.userId) });
  });

  return router;
}
