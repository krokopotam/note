# note

Pulpit w przeglądarce: okna, dock, launcher, kalkulator, notatnik z zakładkami i historią, karteczki.
Backend Node + SQLite w pliku, jeden proces, jeden port.

## Jak to działa

```
przeglądarka
   └── nginx (note.wincyj.pl, basic auth) ──┐
          backend (Express, 127.0.0.1:8120) │
              ├── /api/*  → repos → SQLite  │  data/note.db  (plik w folderze aplikacji)
              └── /       → frontend/dist   ┘
```

```
shared/      manifest (APPS, kolory) + schematy zod — jedno źródło kontraktu
backend/     Express + better-sqlite3; src/db/migrations/*.sql, src/repos, src/http
frontend/    React + Vite; src/shell (pulpit, okna, dock, launcher), src/apps/<apka>
deploy/      systemd + nginx + podstawowy install
```

Zależności idą w jednym kierunku: `http → repos → domain`, `shell → registry → apps → shared`.
Aplikacje nie importują shella, shell nie importuje aplikacji (tylko rejestr).

## Uruchomienie lokalne

```bash
npm install
npm run build                  # frontend → frontend/dist
npm start --workspace backend  # http://127.0.0.1:8120  (DB: data/note.db)
```

Tryb deweloperski z przeładowaniem: `npm run dev` (backend 8120, Vite 5173 z proxy `/api`).

## Testy

```bash
npm test                  # backend (61) + frontend (133)
npm run lint              # tsc --noEmit dla frontendu
```

Backend testuje się na prawdziwym SQLite (pamięciowym), bez mocków. Frontend testuje zachowanie
przez role/etykiety, więc zmiana CSS albo markupu nie przewraca testów.

## API

| Metoda | Ścieżka | Co robi |
|---|---|---|
| GET | `/api/notes?q=&sort=&limit=&offset=` | szukaj słów kluczowych, sortuj po dacie/tytule |
| POST/PATCH/DELETE | `/api/notes[/:id]` | zapis notatki (każda zmiana = wpis w historii) |
| GET | `/api/notes/:id/revisions` | historia |
| POST | `/api/notes/:id/revisions/:revId/restore` | przywróć wersję (przywracanie też jest cofalne) |
| GET/PUT | `/api/session/notepad` | otwarte zakładki i aktywna notatka |
| GET/POST/PATCH/DELETE | `/api/stickies[/:id]` | karteczki, `?pinned=true`, `q`, `sort` |
| GET/POST/PATCH/DELETE | `/api/desktop/items[/:id]` | ikony i foldery wraz z pozycjami w siatce |
| GET/PUT | `/api/desktop/favorites` | co stoi w doku i w launcherze |

Błędy zawsze w jednym kształcie: `{ "error": { "code", "message", "details"? } }`.

## Dodanie aplikacji

1. wpis w `shared/manifest.js` (`APPS`),
2. folder `frontend/src/apps/<id>/` z komponentem i własnym `*.test.tsx`,
3. jedna linia w `APP_VIEWS` w `frontend/src/shell/registry.tsx`.

Ikona wskazująca na usuniętą aplikację nie wywali pulpitu — dostajesz okno z komunikatem.

## Wdrożenie

`deploy/` zawiera jednostkę systemd, vhost nginx (basic auth `test` / `milka`) i `install.sh`.
Patrz `deploy/README.md`.
