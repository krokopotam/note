import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDb } from './db/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '..', '..');

/**
 * Configuration comes from the environment only, so the systemd unit and
 * /etc/default/<domain> stay the single place to look when something is off.
 */
const config = {
  port: Number(process.env.PORT ?? 8120),
  host: process.env.HOST ?? '127.0.0.1',
  dbFile: process.env.DB_FILE ?? path.join(PROJECT_ROOT, 'data', 'note.db'),
  filesDir: process.env.FILES_DIR ?? path.join(PROJECT_ROOT, 'data', 'files'),
  staticDir: process.env.STATIC_DIR ?? path.join(PROJECT_ROOT, 'frontend', 'dist'),
};

const db = openDb(config.dbFile);

// New accounts are seeded with their own desktop when they register, so booting
// the server changes nobody's data.
createApp({ db, staticDir: config.staticDir, filesDir: config.filesDir }).listen(
  config.port,
  config.host,
  () => {
    console.log(
      `[note] http://${config.host}:${config.port} db=${config.dbFile} files=${config.filesDir}`,
    );
  },
);
