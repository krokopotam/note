-- Numery, które już były w użyciu, nie mogą zostać wydane powtórnie.

--
-- `INTEGER PRIMARY KEY` to rowid: po skasowaniu najnowszego wiersza SQLite oddaje
-- ten sam numer następnemu. A oba te tabele mają adresy, które przeglądarka trzyma
-- w cache — `/api/files/:id` (public, max-age=31536000) i `/api/chat/attachments/:id`
-- (private, max-age=86400). Efekt, który zgłosił użytkownik: kasuje się zdjęcie,
-- wrzuca następne, dostaje ten sam numer, a przeglądarka rysuje **poprzednie** zdjęcie
-- z pamięci. aplikacja w tym czasie odpowiadała poprawnie — cache jest przed nią.
--
-- AUTOINCREMENT pilnuje tego po stronie serwera: numer jest wydawany raz w życiu bazy.
-- (Wiadomości zostają jak były — usunięta wiadomość to nagrobek, więc jej numer i tak
-- nigdy nie wraca, a w adresach ni_cached'owanych numer powtórzony nie szkodzi.)

-- Pliki w zasobach.
CREATE TABLE files_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id INTEGER NOT NULL REFERENCES file_resources(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  size INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

INSERT INTO files_new (id, resource_id, name, stored_name, size, content_type, created_by, created_at)
  SELECT id, resource_id, name, stored_name, size, content_type, created_by, created_at FROM files;

DROP TABLE files;
ALTER TABLE files_new RENAME TO files;
CREATE INDEX idx_files_resource ON files (resource_id, created_at DESC);

-- Zdjęcia w wiadomościach.
CREATE TABLE message_attachments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  uploader_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  stored_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

INSERT INTO message_attachments_new
  (id, conversation_id, uploader_id, stored_name, file_name, mime, size, message_id, created_at)
  SELECT id, conversation_id, uploader_id, stored_name, file_name, mime, size, message_id, created_at
    FROM message_attachments;

DROP TABLE message_attachments;
ALTER TABLE message_attachments_new RENAME TO message_attachments;
CREATE INDEX idx_attachments_message ON message_attachments (message_id);
CREATE INDEX idx_attachments_conversation ON message_attachments (conversation_id, id DESC);

-- Zapas za dotychczasowymi numerami: wiersze skasowane przed migracją mogły mieć
-- numery wyższe niż maksymalny zostały, a ich adresy wciąż leżą w czyichś
-- przeglądarkach. Przeskok nic nie kosztuje, a zamyka stary cache na zawsze.
UPDATE sqlite_sequence SET seq = seq + 100 WHERE name IN ('files', 'message_attachments');
