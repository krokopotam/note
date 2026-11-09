import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPS } from '@note/shared';
import { createApp } from './app.js';
import { openDb } from './db/index.js';
import { seedIfEmpty } from './repos/seed.js';

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
  staticDir: process.env.STATIC_DIR ?? path.join(PROJECT_ROOT, 'frontend', 'dist'),
};

const db = openDb(config.dbFile);
seedIfEmpty(db, APPS);

createApp({ db, staticDir: config.staticDir }).listen(config.port, config.host, () => {
  console.log(`[note] http://${config.host}:${config.port} db=${config.dbFile}`);
});
