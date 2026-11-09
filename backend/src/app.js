import express from 'express';
import { APPS } from '@note/shared';
import { accountRouter, authRouter } from './http/routes/auth.js';
import { notesRouter } from './http/routes/notes.js';
import { stickiesRouter } from './http/routes/stickies.js';
import { desktopRouter } from './http/routes/desktop.js';
import { sessionRouter } from './http/routes/session.js';
import { authThrottle, requireAuth } from './http/auth.js';
import { errorHandler, notFoundHandler } from './http/middleware.js';
import { purgeExpired } from './repos/sessions.js';

/**
 * Build the HTTP application without starting a listener, so tests can drive the
 * exact object that runs in production (no duplicated wiring to keep in sync).
 *
 * Order matters: health and the auth endpoints are open, everything else behind
 * /api belongs to an account and requires the session cookie.
 *
 * @param {{db: import('better-sqlite3').Database, staticDir?: string|null, apps?: typeof APPS, throttle?: Function}} options
 * @returns {import('express').Express}
 */
export function createApp({ db, staticDir = null, apps = APPS, throttle = authThrottle(), seed }) {
  const app = express();
  app.disable('x-powered-by');
  // nginx terminates TLS and forwards the protocol/client IP; without this req.secure
  // and req.ip would be wrong, which would break the cookie and the throttle.
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter(db, { apps, throttle, seed }));

  // Everything below belongs to somebody.
  app.use('/api', requireAuth(db));
  app.use('/api', accountRouter(db));
  app.use('/api/notes', notesRouter(db));
  app.use('/api/stickies', stickiesRouter(db));
  app.use('/api/desktop', desktopRouter(db, { apps }));
  app.use('/api/session', sessionRouter(db));

  if (staticDir) {
    // Single process serves the built shell, so deployment is one port and one
    // systemd unit. Unknown paths fall through to index.html because the desktop
    // has no routes of its own, but /api/* must never be swallowed.
    app.use(express.static(staticDir, { index: 'index.html' }));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile('index.html', { root: staticDir }));
  }

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  // Sessions are swept when they are touched; this is the backstop for a quiet site.
  purgeExpired(db);

  return app;
}
