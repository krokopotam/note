-- Czaty: synchronizacja stanu i rozmowy wieloosobowe.
--
-- Dwie rzeczy, których brakowało:
--
-- 1. Usunięcie wiadomości było ciche. Druga strona nie miała jak się dowiedzieć,
--    że czegoś już nie ma — wiersz znikał z bazy i tyle. Zostaje więc nagrobek:
--    `deleted_at`, a treść wyczyszczona. rozmówca zobaczy „wiadomość usunięta".
--
-- 2. Rozmowa umiała trzymać tylko parę ludzi (`pair_key`). `title` pozwala grupie
--    mieć nazwę, a `pair_key` zostaje unikalny wyłącznie dla rozmów 1:1 — grupa ma
--    go NULL, więc unikalność pary nadal pilnuje, żeby dwie osoby nie miały dwóch
--    równoległych wątków. Kolumna już na to pozwalała (SQLite ignoruje NULL w UNIQUE),
--    więc żadnej przebudowy tabeli nie trzeba.

ALTER TABLE messages ADD COLUMN deleted_at TEXT;

ALTER TABLE conversations ADD COLUMN title TEXT;

-- Odpytywanie okna czatu pyta „co się zmieniło od chwili X" — stworzone, poprawione
-- albo usunięte. Ten indeks trzyma to przy jednej rozmowie, gdyby wątki urosły.
CREATE INDEX idx_messages_conversation_changed
  ON messages (conversation_id, created_at, edited_at, deleted_at);
