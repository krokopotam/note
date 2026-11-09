import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APPS } from '@note/shared';
import { migrate, openDb } from '../src/db/index.js';
import { seedIfEmpty } from '../src/repos/seed.js';

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
    expect(second.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n).toBe(1);
    second.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('enforces foreign keys', () => {
    const db = openDb(':memory:');
    expect(() =>
      db.prepare('INSERT INTO notepad_tabs (note_id, position) VALUES (12345, 0)').run(),
    ).toThrow(/FOREIGN KEY/);
  });
});

describe('seedIfEmpty', () => {
  it('places one icon per app, a folder, and fills both favourite slots', () => {
    const db = openDb(':memory:');

    expect(seedIfEmpty(db, APPS)).toBe(true);

    const items = db.prepare('SELECT * FROM desktop_items ORDER BY id').all();
    const appIcons = items.filter((item) => item.kind === 'app' && item.parent_id === null);
    expect(appIcons.map((item) => item.app_id)).toEqual(APPS.map((app) => app.id));
    expect(appIcons.map((item) => item.name)).toEqual(APPS.map((app) => app.title));
    expect(items.some((item) => item.kind === 'folder')).toBe(true);

    const dock = db
      .prepare("SELECT app_id FROM favorites WHERE slot = 'dock' ORDER BY position")
      .all()
      .map((row) => row.app_id);
    expect(dock).toEqual(APPS.map((app) => app.id));
  });

  it('is a no-op on the second run, so a redeploy cannot duplicate icons', () => {
    const db = openDb(':memory:');
    seedIfEmpty(db, APPS);
    const before = db.prepare('SELECT COUNT(*) AS n FROM desktop_items').get().n;

    expect(seedIfEmpty(db, APPS)).toBe(false);
    expect(db.prepare('SELECT COUNT(*) AS n FROM desktop_items').get().n).toBe(before);
  });
});
