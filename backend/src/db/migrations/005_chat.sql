-- Czaty: rozmowy jeden-na-jeden i ich wiadomości.
--
-- Rozmowa sama w sobie prawie nic nie trzyma — jest only po to, żeby członkowie
-- (`conversation_members`) mieli do czego dopiąć wiadomości i własny znacznik
-- przeczytania. Dzięki niemu „nieprzeczytane\" są liczone w bazie, a nie w głowie
-- przeglądarki, więc drugi okienko też widzi stan.
--
-- Para `user_a:user_b` (mniejsze id pierwsze) ma unikalny klucz, więc dwa konta
-- nie mogą mieć dwóch równoległych rozmów — nawet gdy klikną „nowy czat\" w tej
-- samej sekundzie.

CREATE TABLE conversations (
  id INTEGER PRIMARY KEY,
  -- klucz pary dla rozmów 1:1; NULL dla rozmów założonych w przyszłości inaczej
  pair_key TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE conversation_members (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- wszystko nowsze niż ten znacznik to dla tej osoby nieprzeczytane
  last_read_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_conversation_members_user ON conversation_members (user_id);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  -- autor jest informacją, nie właścicielem: usunięcie konta nie wymazuje
  -- wiadomości z czyjejś rozmowy (zostaje „—\")
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  -- okno edycji liczy się od created_at, więc edycja go nie przedłuża
  edited_at TEXT
);

CREATE INDEX idx_messages_conversation ON messages (conversation_id, id DESC);
