-- Schema version tracker. Present in every database from migration 0 onwards.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- Notepad documents. `updated_at` drives the default sort in the UI.
CREATE TABLE notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Full snapshots taken on every effective save, so history is browsable and a
-- previous version can be restored verbatim.
CREATE TABLE note_revisions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id    INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_note_revisions_note ON note_revisions (note_id, id DESC);

-- Persisted notepad session: which tabs are open and in which order.
CREATE TABLE notepad_tabs (
  note_id  INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL
);

-- Pinned tab order is part of the session, not of a note, so it lives on its own.
CREATE TABLE notepad_state (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  active_note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL
);
INSERT INTO notepad_state (id, active_note_id) VALUES (1, NULL);

-- Stickies (karteczkowy board).
CREATE TABLE stickies (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  body       TEXT NOT NULL DEFAULT '',
  color      TEXT NOT NULL DEFAULT 'yellow',
  pinned     INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Desktop icons and folders. parent_id IS NULL means "on the desktop".
-- Folders hold shortcuts only, so deleting a folder never touches app data.
CREATE TABLE desktop_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL CHECK (kind IN ('app', 'folder')),
  name       TEXT NOT NULL,
  app_id     TEXT,
  parent_id  INTEGER REFERENCES desktop_items(id) ON DELETE CASCADE,
  x          INTEGER NOT NULL DEFAULT 0,
  y          INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_desktop_items_parent ON desktop_items (parent_id);

-- Pinned apps per shell slot (bottom dock, left launcher).
CREATE TABLE favorites (
  slot     TEXT NOT NULL CHECK (slot IN ('dock', 'launcher')),
  app_id   TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (slot, app_id)
);
