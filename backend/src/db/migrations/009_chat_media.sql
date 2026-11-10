-- Zdjęcia w czacie.
--
-- Załącznik żyje przy rozmowie, a nie przy osobie, która go wrzuciła: usunięcie
-- konta nie może zabierać komuś zdjęcia, które dostał. Autor zostaje więc jako
-- informacja (ON DELETE SET NULL), tak samo jak przy wiadomościach.
--
-- `message_id` bywa pusty: zdjęcie jest wysyłane sekundę przed wiadomością, więc
-- między jednym a drugim chwilą wisi bez przydziału. Takie okazy sprząta CLI
-- (`npm run cli -- prune`) — są starsze niż dobę i nikt ich już nie dopnie.

CREATE TABLE message_attachments (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  uploader_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- nazwa na dysku to uuid; ta jest tylko etykietą do pokazania i do alt-u
  stored_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_attachments_message ON message_attachments (message_id);
CREATE INDEX idx_attachments_conversation ON message_attachments (conversation_id, id DESC);
