import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { APPS } from '@note/shared';
import { LOCKED_HASH, isLocked } from '../src/domain/passwords.js';
import { migrate, openDb } from '../src/db/index.js';
import { seedUser } from '../src/repos/seed.js';
import { createUser, findByUsername } from '../src/repos/users.js';
import { makeDbOwned } from './helpers.js';

const MIGRATIONS = new URL('../src/db/migrations/', import.meta.url);

const tables = (db) =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => row.name)
    .sort();

describe('database bootstrap', () => {
  it('creates every table the API relies on', () => {
    expect(tables(openDb(':memory:'))).toEqual(
      expect.arrayContaining([
        'desktop_items',
        'favorites',
        'note_revisions',
        'notes',
        'notepad_state',
        'notepad_tabs',
        'stickies',
      ]),
    );
  });

  it('creates the folder holding the database file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-db-'));
    const target = path.join(dir, 'data', 'note.db');

    openDb(target).close();

    expect(fs.existsSync(target)).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('applies each migration exactly once across restarts', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-db-'));
    const target = path.join(dir, 'note.db');

    const first = openDb(target);
    expect(migrate(first)).toEqual([]);
    first.close();

    const second = openDb(target);
    // 001_init.sql + 002_users.sql, and nothing re-runs.
    expect(second.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([
      { version: '001_init.sql' },
      { version: '002_users.sql' },
    ]);
    second.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('enforces foreign keys', () => {
    const db = openDb(':memory:');
    expect(() =>
      db
        .prepare('INSERT INTO notepad_tabs (user_id, note_id, position) VALUES (1, 12345, 0)')
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });
});

describe('upgrading a database that predates accounts', () => {
  /** Open the *old* schema the way the server had it, with content in it. */
  function legacyDb() {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(fs.readFileSync(new URL('001_init.sql', MIGRATIONS), 'utf8'));
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES ('001_init.sql', 'x')").run();

    db.prepare(
      `INSERT INTO notes (id, title, body, created_at, updated_at)
       VALUES (1, 'Start', 'stara notatka', 'a', 'b')`,
    ).run();
    db.prepare(
      `INSERT INTO stickies (id, body, color, pinned, created_at, updated_at)
       VALUES (1, 'stara karteczka', 'yellow', 0, 'a', 'b')`,
    ).run();
    db.prepare(
      `INSERT INTO desktop_items (id, kind, name, app_id, parent_id, x, y, created_at)
       VALUES (1, 'app', 'Kalkulator', 'calculator', NULL, 0, 0, 'a')`,
    ).run();
    db.prepare("INSERT INTO favorites (slot, app_id, position) VALUES ('dock', 'calculator', 0)").run();
    db.prepare('UPDATE notepad_state SET active_note_id = 1 WHERE id = 1').run();
    db.prepare('INSERT INTO notepad_tabs (note_id, position) VALUES (1, 0)').run();
    return db;
  }

  it('hands every existing row to the owner account', () => {
    const db = legacyDb();

    expect(migrate(db)).toEqual(['002_users.sql']);

    const owner = findByUsername(db, 'wincyj');
    expect(owner.id).toBe(1);
    // Nobody knows its password yet — it is claimed with `npm run cli -- set-password`.
    expect(isLocked(owner.password_hash)).toBe(true);

    const count = (sql) => db.prepare(sql).get().n;
    expect(count('SELECT COUNT(*) AS n FROM notes WHERE user_id = 1')).toBe(1);
    expect(count('SELECT COUNT(*) AS n FROM stickies WHERE user_id = 1')).toBe(1);
    expect(count('SELECT COUNT(*) AS n FROM desktop_items WHERE user_id = 1')).toBe(1);
    expect(count("SELECT COUNT(*) AS n FROM favorites WHERE user_id = 1 AND slot = 'dock'")).toBe(1);
    expect(count('SELECT COUNT(*) AS n FROM notepad_tabs WHERE user_id = 1')).toBe(1);
    expect(db.prepare('SELECT active_note_id FROM notepad_state WHERE user_id = 1').get()).toEqual({
      active_note_id: 1,
    });
  });

  it('deleting an account takes its content and sessions with it', () => {
    const db = legacyDb();
    migrate(db);
    db.prepare(
      `INSERT INTO sessions (user_id, token_hash, created_at, expires_at)
       VALUES (1, 'hash', 'a', 'b')`,
    ).run();

    db.prepare('DELETE FROM users WHERE id = 1').run();

    const count = (sql) => db.prepare(sql).get().n;
    expect(count('SELECT COUNT(*) AS n FROM notes')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM stickies')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM desktop_items')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM favorites')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM notepad_tabs')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM sessions')).toBe(0);
  });
});

describe('seedUser', () => {
  it('places one icon per app, a folder, and fills both favourite slots', () => {
    const { db, owner } = makeDbOwned();

    seedUser(db, owner, APPS);

    const items = db
      .prepare('SELECT * FROM desktop_items WHERE user_id = ? ORDER BY id')
      .all(owner);
    const appIcons = items.filter((item) => item.kind === 'app' && item.parent_id === null);
    expect(appIcons.map((item) => item.app_id)).toEqual(APPS.map((app) => app.id));
    expect(appIcons.map((item) => item.name)).toEqual(APPS.map((app) => app.title));
    expect(items.some((item) => item.kind === 'folder')).toBe(true);

    const dock = db
      .prepare(
        "SELECT app_id FROM favorites WHERE user_id = ? AND slot = 'dock' ORDER BY position",
      )
      .all(owner)
      .map((row) => row.app_id);
    expect(dock).toEqual(APPS.map((app) => app.id));

    // A starter desktop is useless without something to open.
    expect(db.prepare('SELECT COUNT(*) AS n FROM notes WHERE user_id = ?').get(owner).n).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM stickies WHERE user_id = ?').get(owner).n).toBe(1);
  });

  it('seeds each account separately, never a second time for the same one', () => {
    const { db, owner } = makeDbOwned();
    const other = createUser(db, { username: 'drugi', passwordHash: LOCKED_HASH }).id;

    seedUser(db, owner, APPS);
    const before = db.prepare('SELECT COUNT(*) AS n FROM desktop_items').get().n;

    seedUser(db, other, APPS);
    expect(db.prepare('SELECT COUNT(*) AS n FROM desktop_items').get().n).toBe(before * 2);
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM desktop_items WHERE user_id = ?').get(other).n,
    ).toBe(before);
  });
});
