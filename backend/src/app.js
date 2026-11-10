import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { APPS, MAX_UPLOAD_MB } from '@note/shared';
import { createFileStore } from './files/store.js';
import { accountRouter, authRouter } from './http/routes/auth.js';
import { filesRouter } from './http/routes/files.js';
import { notesRouter } from './http/routes/notes.js';
import { stickiesRouter } from './http/routes/stickies.js';
import { desktopRouter } from './http/routes/desktop.js';
import { sessionRouter } from './http/routes/session.js';
import { authThrottle, requireAuth } from './http/auth.js';
import { errorHandler, notFoundHandler } from './http/middleware.js';
import { purgeExpired } from './repos/sessions.js';

const DEFAULT_FILES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'data',
  'files',
);

/** Raw upload: `PUT /api/files/resources/:id/files/:name` carries bytes, not JSON. */
const isFileUpload = (req) =>
  req.method === 'PUT' && /^\/api\/files\/resources\/\d+\/files\//.test(req.path);

/**
 * Build the HTTP application without starting a listener, so tests can drive the
 * exact object that runs in production (no duplicated wiring to keep in sync).
 *
 * Order matters: health and the auth endpoints are open, everything else behind
 * /api belongs to an account and requires the session cookie.
 *
 * @param {{db: import('better-sqlite3').Database, staticDir?: string|null, apps?: typeof APPS,
 *   throttle?: Function, seed?: Function, filesDir?: string, maxUploadBytes?: number}} options
 * @returns {import('express').Express}
 */
export function createApp({
  db,
  staticDir = null,
  apps = APPS,
  throttle = authThrottle(),
  seed,
  filesDir = DEFAULT_FILES_DIR,
  maxUploadBytes = MAX_UPLOAD_MB * 1024 * 1024,
}) {
  const app = express();
  app.disable('x-powered-by');
  // nginx terminates TLS and forwards the protocol/client IP; without this req.secure
  // and req.ip would be wrong, which would break the cookie and the throttle.
  app.set('trust proxy', 1);
  // JSON everywhere, except on the upload route: a JSON file uploaded as bytes must
  // not be parsed into an object before the raw parser sees it.
  app.use(express.json({ limit: '1mb', type: (req) => !isFileUpload(req) }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter(db, { apps, throttle, seed }));

  // Everything below belongs to somebody.
  app.use('/api', requireAuth(db));
  app.use('/api', accountRouter(db));
  app.use('/api/files', filesRouter(db, { store: createFileStore(filesDir), maxUploadBytes }));
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
