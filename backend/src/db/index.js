import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Open (creating if needed) the SQLite database backing the app and run all
 * pending migrations. The database is a plain file inside the app folder, which
 * makes a backup a file copy.
 *
 * @param {string} file - path to the .db file, or ':memory:' for tests
 * @returns {import('better-sqlite3').Database}
 */
export function openDb(file) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }

  const db = new Database(file);
  // Foreign keys are off by default in SQLite; every invariant here relies on them.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  migrate(db);
  return db;
}

/**
 * Apply every migration file not registered yet, oldest first, each in its own
 * transaction so a failed file never leaves the database half-upgraded.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {string[]} versions applied by this call
 */
export function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const done = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    // better-sqlite3 returns a wrapper that has to be called to run the tx.
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        file,
        new Date().toISOString(),
      );
    })();
    done.push(file);
  }
  return done;
}
