-- Pliki: zasoby (foldery z nazwą), pliki w nich i uprawnienia do udostępniania.
--
-- Bity leżą na dysku w data/files/<id zasobu>/<wygenerowana nazwa>, a ta tabela jest
-- jedynym źródłem prawdy o tym, jak plik nazywa się dla człowieka. Nazwa dyskowa jest
-- generowana (uuid), więc żadna nazwa z zewnątrz nie ma wpływu na ścieżkę.

CREATE TABLE file_resources (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_file_resources_owner ON file_resources (owner_id);

-- Kto poza właścicielem widzi zasób. Właściciel nie potrzebuje wpisu: ma wszystko.
CREATE TABLE file_resource_members (
  resource_id INTEGER NOT NULL REFERENCES file_resources(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('read', 'edit')),
  granted_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (resource_id, user_id)
);

CREATE INDEX idx_file_resource_members_user ON file_resource_members (user_id);

CREATE TABLE files (
  id INTEGER PRIMARY KEY,
  resource_id INTEGER NOT NULL REFERENCES file_resources(id) ON DELETE CASCADE,
  -- nazwa, którą widzi człowiek; może się powtarzać w zasobie
  name TEXT NOT NULL,
  -- nazwa na dysku, generowana, unikalna
  stored_name TEXT NOT NULL UNIQUE,
  size INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  -- Autor jest informacją, nie właścicielem: plik wrzucony do cudzego zasobu
  -- należy do tego zasobu, więc usunięcie konta go nie kasuje (zostaje "—").
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_files_resource ON files (resource_id, created_at DESC);
