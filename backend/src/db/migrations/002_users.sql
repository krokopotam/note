-- Accounts: users, their sessions, and per-user ownership of everything else.
--
-- The site predates accounts, so the rows already in here are backfilled to user 1
-- ("wincyj"), whose password stays locked until somebody claims it on the server:
--   npm run cli -- set-password wincyj <hasło>
-- Anyone can then register their own account; nobody sees anybody else's data.

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  -- '!locked' means "no password set"; see domain/passwords.js
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The token itself only ever lives in the cookie; the database keeps its hash.
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  remember INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_sessions_expires ON sessions (expires_at);

INSERT INTO users (id, username, password_hash, created_at)
VALUES (1, 'wincyj', '!locked', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Ownership of existing content. The column stays nullable in SQLite (adding a
-- NOT NULL column without a default is impossible), so the repositories insist on
-- a user id instead: repos/assertOwner.js throws before a query without one.
ALTER TABLE notes ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
UPDATE notes SET user_id = 1;
CREATE INDEX idx_notes_user ON notes (user_id, updated_at DESC);

ALTER TABLE stickies ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
UPDATE stickies SET user_id = 1;
CREATE INDEX idx_stickies_user ON stickies (user_id, updated_at DESC);

ALTER TABLE desktop_items ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
UPDATE desktop_items SET user_id = 1;
CREATE INDEX idx_desktop_items_user ON desktop_items (user_id);

-- Favourites: the old primary key was (slot, app_id), which is now per user.
CREATE TABLE favorites_v2 (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  app_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, slot, app_id)
);

INSERT INTO favorites_v2 (user_id, slot, app_id, position)
SELECT 1, slot, app_id, position FROM favorites;

DROP TABLE favorites;
ALTER TABLE favorites_v2 RENAME TO favorites;

-- Notepad session: one row per user instead of the single global row.
CREATE TABLE notepad_state_v2 (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  active_note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL
);

INSERT INTO notepad_state_v2 (user_id, active_note_id)
SELECT 1, active_note_id FROM notepad_state WHERE id = 1;

DROP TABLE notepad_state;
ALTER TABLE notepad_state_v2 RENAME TO notepad_state;

CREATE TABLE notepad_tabs_v2 (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, note_id)
);

-- Old tabs pointed at notes that are now owned by user 1, so they carry over.
INSERT INTO notepad_tabs_v2 (user_id, note_id, position)
SELECT 1, note_id, position FROM notepad_tabs;

DROP TABLE notepad_tabs;
ALTER TABLE notepad_tabs_v2 RENAME TO notepad_tabs;
