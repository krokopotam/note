import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { APPS, GAMES, GAMES_FOLDER, isGame } from '@note/shared';
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
        'conversation_members',
        'conversations',
        'desktop_items',
        'favorites',
        'file_resources',
        'file_resource_members',
        'files',
        'message_attachments',
        'messages',
        'notes',
        'notepad_state',
        'notepad_tabs',
        'stickies',
      ]),
    );
  });

  it('keeps a picture with the conversation, not with the person who sent it', () => {
    const db = openDb(':memory:');
    const columns = db.prepare('PRAGMA table_info(message_attachments)').all().map((c) => c.name);

    expect(columns).toEqual(
      expect.arrayContaining(['conversation_id', 'uploader_id', 'stored_name', 'message_id', 'mime', 'size']),
    );
    db.close();
  });

  it('never hands out a number that was already shown to a browser', () => {
    const db = openDb(':memory:');
    const stamp = '2026-01-05T10:00:00.000Z';
    const user = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)').run('ala', 'x', stamp).lastInsertRowid;
    const conversation = db.prepare('INSERT INTO conversations (created_at) VALUES (?)').run(stamp).lastInsertRowid;
    db
      .prepare('INSERT INTO conversation_members (conversation_id, user_id, last_read_at, created_at) VALUES (?, ?, ?, ?)')
      .run(conversation, user, stamp, stamp);

    const add = (name) =>
      db
        .prepare(
          'INSERT INTO message_attachments (conversation_id, stored_name, file_name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(conversation, `${name}.uuid`, `${name}.png`, 'image/png', 10, stamp).lastInsertRowid;

    const first = add('pierwsze');
    const second = add('drugie');
    db.prepare('DELETE FROM message_attachments WHERE id = ?').run(second);

    // Rowid would happily give `second` back; a browser holding the old picture
    // under that address would then paint it over the new one.
    expect(add('trzecie')).toBeGreaterThan(second);
    expect(db.prepare('SELECT COUNT(*) n FROM message_attachments').get().n).toBe(2);
    db.close();
  });

  it('rebuilds the tables without losing rows or the disk names', () => {
    // A database frozen at 009, with data and a deleted newest row: opened raw,
    // so the migrations below are the only ones that have ever touched it.
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    const files = fs
      .readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .filter((name) => name !== '010_no_reused_ids.sql' && name !== '011_games.sql');
    files.forEach((name) => {
      db.exec(fs.readFileSync(new URL(name, MIGRATIONS), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(name, 'kiedyś');
    });

    const stamp = '2026-01-05T10:00:00.000Z';
    const user = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)').run('ala', 'x', stamp).lastInsertRowid;
    const resource = db.prepare('INSERT INTO file_resources (owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(user, 'zdjęcia', stamp, stamp).lastInsertRowid;
    const put = (name) =>
      db
        .prepare(
          'INSERT INTO files (resource_id, name, stored_name, size, content_type, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(resource, name, `${name}.uuid`, 10, 'image/png', user, stamp).lastInsertRowid;
    put('a');
    const last = put('b');
    db.prepare('DELETE FROM files WHERE id = ?').run(last);

    expect(migrate(db)).toEqual(['010_no_reused_ids.sql', '011_games.sql']);

    const columns = db.prepare('PRAGMA table_info(files)').all().map((c) => c.name);
    expect(columns).toEqual(
      expect.arrayContaining(['resource_id', 'name', 'stored_name', 'size', 'content_type', 'created_by', 'created_at']),
    );
    expect(db.prepare('SELECT name, stored_name FROM files').all()).toEqual([{ name: 'a', stored_name: 'a.uuid' }]);
    expect(put('c')).toBeGreaterThan(last);
    // Index from the old definition still serves the listing query.
    expect(db.prepare('SELECT id FROM files WHERE resource_id = ?').all(resource)).toHaveLength(2);
    db.close();
  });

  it('gives messages a tombstone and groups a title', () => {
    const db = openDb(':memory:');
    const columns = (table) =>
      db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);

    expect(columns('messages')).toContain('deleted_at');
    expect(columns('conversations')).toContain('title');
    db.close();
  });

  it('drops the note history table', () => {
    // Historia notatek została wycofana (migracja 007); migracje wczesniej ją tworzyły,
    // więc sprawdzamy efekt na liscie tabel, nie na pliku migracji.
    expect(tables(openDb(':memory:'))).not.toContain('note_revisions');
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
    // Every migration once, and nothing re-runs on the next boot.
    expect(second.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([
      { version: '001_init.sql' },
      { version: '002_users.sql' },
      { version: '003_files.sql' },
      { version: '004_files_icon.sql' },
      { version: '005_chat.sql' },
      { version: '006_chat_icon.sql' },
      { version: '007_drop_note_revisions.sql' },
      { version: '008_chat_sync.sql' },
      { version: '009_chat_media.sql' },
      { version: '010_no_reused_ids.sql' },
      { version: '011_games.sql' },
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

    expect(migrate(db)).toEqual([
      '002_users.sql',
      '003_files.sql',
      '004_files_icon.sql',
      '005_chat.sql',
      '006_chat_icon.sql',
      '007_drop_note_revisions.sql',
      '008_chat_sync.sql',
      '009_chat_media.sql',
      '010_no_reused_ids.sql',
      '011_games.sql',
    ]);

    const owner = findByUsername(db, 'wincyj');
    expect(owner.id).toBe(1);
    // Nobody knows its password yet — it is claimed with `npm run cli -- set-password`.
    expect(isLocked(owner.password_hash)).toBe(true);

    const count = (sql) => db.prepare(sql).get().n;
    expect(count('SELECT COUNT(*) AS n FROM notes WHERE user_id = 1')).toBe(1);
    expect(count('SELECT COUNT(*) AS n FROM stickies WHERE user_id = 1')).toBe(1);
    // Two icons today: the legacy one that was claimed, plus Pliki added by 004.
    expect(count("SELECT COUNT(*) AS n FROM desktop_items WHERE user_id = 1 AND app_id = 'calculator'")).toBe(1);
    expect(
      count("SELECT COUNT(*) AS n FROM favorites WHERE user_id = 1 AND slot = 'dock' AND app_id = 'calculator'"),
    ).toBe(1);
    expect(count('SELECT COUNT(*) AS n FROM notepad_tabs WHERE user_id = 1')).toBe(1);
    expect(db.prepare('SELECT active_note_id FROM notepad_state WHERE user_id = 1').get()).toEqual({
      active_note_id: 1,
    });
  });

  it('gives an old desktop the icons of apps that arrived later', () => {
    const db = legacyDb();

    migrate(db);

    // Without an icon there is no way to open Pliki or Czaty: the desktop is the only door.
    const icons = db
      .prepare("SELECT app_id, name, x, y FROM desktop_items WHERE user_id = 1 AND app_id IN ('files','chat') ORDER BY y")
      .all();
    expect(icons).toEqual([
      { app_id: 'files', name: 'Pliki', x: 0, y: 1 },
      { app_id: 'chat', name: 'Czaty', x: 0, y: 2 },
    ]);

    const dock = db
      .prepare("SELECT app_id FROM favorites WHERE user_id = 1 AND slot = 'dock' ORDER BY position")
      .all()
      .map((row) => row.app_id);
    expect(dock).toEqual(['calculator', 'files', 'chat']);
  });

  it('does not hand an icon to an account that has no desktop yet', () => {
    const db = legacyDb();
    migrate(db);
    const fresh = createUser(db, { username: 'swiezy', passwordHash: LOCKED_HASH }).id;

    expect(
      db
        .prepare("SELECT COUNT(*) AS n FROM desktop_items WHERE user_id = ? AND app_id IN ('files','chat')")
        .get(fresh).n,
    ).toBe(0);
  });

  it('deleting an account takes its content, shares and sessions with it', () => {
    const db = legacyDb();
    migrate(db);
    const other = createUser(db, { username: 'drugi', passwordHash: LOCKED_HASH }).id;
    db.prepare(
      `INSERT INTO sessions (user_id, token_hash, created_at, expires_at)
       VALUES (1, 'hash', 'a', 'b')`,
    ).run();
    db.prepare(
      `INSERT INTO file_resources (id, owner_id, name, created_at, updated_at)
       VALUES (1, 1, 'Wrzutki', 'a', 'a')`,
    ).run();
    db.prepare(
      `INSERT INTO file_resource_members (resource_id, user_id, permission, granted_by, created_at)
       VALUES (1, ?, 'read', 1, 'a')`,
    ).run(other);
    db.prepare(
      `INSERT INTO files (id, resource_id, name, stored_name, size, content_type, created_by, created_at)
       VALUES (1, 1, 'a.txt', 'x.txt', 1, 'text/plain', 1, 'a')`,
    ).run();
    // A conversation the two accounts share, with one message from the owner.
    db.prepare(`INSERT INTO conversations (id, pair_key, created_at) VALUES (1, '1:2', 'a')`).run();
    db
      .prepare(
        `INSERT INTO conversation_members (conversation_id, user_id, last_read_at, created_at)
         VALUES (1, 1, 'a', 'a'), (1, ?, 'a', 'a')`,
      )
      .run(other);
    db.prepare(
      `INSERT INTO messages (id, conversation_id, author_id, body, created_at)
       VALUES (1, 1, 1, 'byłem', 'a')`,
    ).run();

    db.prepare('DELETE FROM users WHERE id = 1').run();

    const count = (sql) => db.prepare(sql).get().n;
    expect(count('SELECT COUNT(*) AS n FROM notes')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM stickies')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM desktop_items')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM favorites')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM notepad_tabs')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM sessions')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM file_resources')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM files')).toBe(0);
    // The friend's member row pointed at a resource that no longer exists.
    expect(count('SELECT COUNT(*) AS n FROM file_resource_members')).toBe(0);

    // Rozmowa zostaje przy tym, kto został; autorstwo wiadomości gaśnie do NULL.
    expect(count('SELECT COUNT(*) AS n FROM conversation_members')).toBe(1);
    expect(count('SELECT COUNT(*) AS n FROM messages')).toBe(1);
    expect(db.prepare('SELECT author_id FROM messages WHERE id = 1').get().author_id).toBeNull();
    expect(findByUsername(db, 'drugi')).toBeTruthy();
  });
});

describe('migracja 011 — folder z grami dla starych kont', () => {
  /** Cofa bazę do stanu sprzed migracji, nie ruszając reszty pulpitu. */
  function pretendNoGamesFolder(db, owner) {
    db.prepare('DELETE FROM desktop_items WHERE user_id = ? AND kind = ?').run(owner, 'folder');
    for (const game of GAMES) {
      db.prepare('DELETE FROM desktop_items WHERE user_id = ? AND app_id = ?').run(owner, game.id);
    }
    db.prepare("DELETE FROM schema_migrations WHERE version = '011_games.sql'").run();
  }

  it('adds the folder and all seven icons under it', () => {
    const { db, owner } = makeDbOwned();
    seedUser(db, owner, APPS.filter((app) => !isGame(app.id)));
    pretendNoGamesFolder(db, owner);

    expect(migrate(db)).toContain('011_games.sql');

    const folder = db
      .prepare("SELECT * FROM desktop_items WHERE user_id = ? AND kind = 'folder' AND name = ?")
      .get(owner, GAMES_FOLDER);
    expect(folder).toBeTruthy();
    expect(
      db
        .prepare('SELECT COUNT(*) AS n FROM desktop_items WHERE user_id = ? AND parent_id = ?')
        .get(owner, folder.id).n,
    ).toBe(GAMES.length);
  });

  it('lands in a free row, not on top of what the account already had', () => {
    const { db, owner } = makeDbOwned();
    seedUser(db, owner, APPS.filter((app) => !isGame(app.id)));
    pretendNoGamesFolder(db, owner);
    const taken = new Set(
      db
        .prepare('SELECT x, y FROM desktop_items WHERE user_id = ? AND parent_id IS NULL')
        .all(owner)
        .map((row) => `${row.x},${row.y}`),
    );

    migrate(db);

    const free = db
      .prepare('SELECT x, y FROM desktop_items WHERE user_id = ? AND kind = ? AND parent_id IS NULL')
      .all(owner, 'folder');
    expect(free).toHaveLength(1);
    expect(taken.has(`${free[0].x},${free[0].y}`)).toBe(false);
  });

  it('leaves an existing games folder alone when run again', () => {
    const { db, owner } = makeDbOwned();
    seedUser(db, owner, APPS);
    const before = db.prepare('SELECT COUNT(*) AS n FROM desktop_items WHERE user_id = ?').get(owner).n;
    // Folder jest na miejscu, a migracja udaje niedokończoną.
    db.prepare("DELETE FROM schema_migrations WHERE version = '011_games.sql'").run();

    migrate(db);

    expect(
      db
        .prepare("SELECT COUNT(*) AS n FROM desktop_items WHERE user_id = ? AND name = 'Gry'")
        .get(owner).n,
    ).toBe(1);
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM desktop_items WHERE user_id = ?').get(owner).n,
    ).toBe(before);
  });
});

describe('seedUser', () => {
  it('places one icon per app, a folder, and fills both favourite slots', () => {
    const { db, owner } = makeDbOwned();
    const work = APPS.filter((app) => !isGame(app.id));

    seedUser(db, owner, APPS);

    const items = db
      .prepare('SELECT * FROM desktop_items WHERE user_id = ? ORDER BY id')
      .all(owner);
    const appIcons = items.filter((item) => item.kind === 'app' && item.parent_id === null);
    expect(appIcons.map((item) => item.app_id)).toEqual(work.map((app) => app.id));
    expect(appIcons.map((item) => item.name)).toEqual(work.map((app) => app.title));
    expect(items.some((item) => item.kind === 'folder')).toBe(true);

    const dock = db
      .prepare(
        "SELECT app_id FROM favorites WHERE user_id = ? AND slot = 'dock' ORDER BY position",
      )
      .all(owner)
      .map((row) => row.app_id);
    expect(dock).toEqual(work.map((app) => app.id));

    // A starter desktop is useless without something to open.
    expect(db.prepare('SELECT COUNT(*) AS n FROM notes WHERE user_id = ?').get(owner).n).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM stickies WHERE user_id = ?').get(owner).n).toBe(1);
  });

  it('puts the games in their own folder, off the bars', () => {
    const { db, owner } = makeDbOwned();

    seedUser(db, owner, APPS);

    const folder = db
      .prepare("SELECT * FROM desktop_items WHERE user_id = ? AND kind = 'folder' AND name = ?")
      .get(owner, GAMES_FOLDER);
    expect(folder).toBeTruthy();

    const inside = db
      .prepare('SELECT app_id FROM desktop_items WHERE user_id = ? AND parent_id = ? ORDER BY id')
      .all(owner, folder.id)
      .map((row) => row.app_id);
    expect(inside).toEqual(GAMES.map((game) => game.id));

    // Seven more icons on the dock would bury the applications it is there for.
    for (const slot of ['dock', 'launcher']) {
      const bar = db
        .prepare('SELECT app_id FROM favorites WHERE user_id = ? AND slot = ?')
        .all(owner, slot)
        .map((row) => row.app_id);
      expect(bar.filter((id) => isGame(id))).toEqual([]);
    }
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
