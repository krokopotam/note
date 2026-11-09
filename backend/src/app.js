import express from 'express';
import { APPS } from '@note/shared';
import { notesRouter } from './http/routes/notes.js';
import { stickiesRouter } from './http/routes/stickies.js';
import { desktopRouter } from './http/routes/desktop.js';
import { sessionRouter } from './http/routes/session.js';
import { errorHandler, notFoundHandler } from './http/middleware.js';

/**
 * Build the HTTP application without starting a listener, so tests can drive the
 * exact object that runs in production (no duplicated wiring to keep in sync).
 *
 * @param {{db: import('better-sqlite3').Database, staticDir?: string|null, apps?: typeof APPS}} options
 * @returns {import('express').Express}
 */
export function createApp({ db, staticDir = null, apps = APPS }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

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

  return app;
}
