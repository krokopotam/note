# note

Pulpit w przeglądarce: okna, dock, launcher, kalkulator, notatnik z zakładkami i historią, karteczki.
Konta z własną przestrzenią: każdy widzi tylko swoje notatki, karteczki i układ pulpitu.
Backend Node + SQLite w pliku, jeden proces, jeden port.

## Jak to działa

```
przeglądarka
   └── nginx (note.wincyj.pl, HTTPS) ───────┐
          backend (Express, 127.0.0.1:8120) │
              ├── /api/auth/* → sesja       │
              ├── /api/*      → repos → SQLite  data/note.db  (plik w folderze aplikacji)
              └── /           → frontend/dist  ┘
```

Każde zapytanie o dane niesie `user_id` wyniku sesji (ciasteczko `note_session`, HttpOnly,
SameSite=Lax). Repository filterują po nim w każdym zleceniu — cudzy identyfikator daje 404,
nie 403, więc API nie potwierdza, że coś czyjegoś istnieje.

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
npm test                  # backend (100) + frontend (170)
npm run lint              # tsc --noEmit dla frontendu
```

Backend testuje się na prawdziwym SQLite (pamięciowym), bez mocków. Frontend testuje zachowanie
przez role/etykiety, więc zmiana CSS albo markupu nie przewraca testów.

## API

| Metoda | Ścieżka | Co robi |
|---|---|---|
| POST | `/api/auth/register` | nowe konto: login + hasło wpisane dwa razy; od razu loguje |
| POST | `/api/auth/login` | logowanie (jedno hasło), `remember: true` = sesja na 10 dni |
| POST | `/api/auth/logout` | wyloguj (zawsze 204) |
| GET | `/api/auth/me` | kto jest zalogowany (401 dla anonimowego) |
| GET | `/api/notes?q=&sort=&limit=&offset=` | szukaj słów kluczowych, sortuj po dacie/tytule |
| POST/PATCH/DELETE | `/api/notes[/:id]` | zapis notatki (każda zmiana = wpis w historii) |
| GET | `/api/notes/:id/revisions` | historia |
| POST | `/api/notes/:id/revisions/:revId/restore` | przywróć wersję (przywracanie też jest cofalne) |
| GET/PUT | `/api/session/notepad` | otwarte zakładki i aktywna notatka |
| GET/POST/PATCH/DELETE | `/api/stickies[/:id]` | karteczki, `?pinned=true`, `q`, `sort` |
| GET/POST/PATCH/DELETE | `/api/desktop/items[/:id]` | ikony i foldery wraz z pozycjami w siatce |
| GET/PUT | `/api/desktop/favorites` | co stoi w doku i w launcherze |

Błędy zawsze w jednym kształcie: `{ "error": { "code", "message", "details"? } }`.
Wszystko poza `/api/health` i `/api/auth/*` wymaga ciasteczka sesji — bez niego 401
(`code: "unauthorized"`), a frontend pokazuje wtedy ekran logowania.

Hasła: scrypt z solą (`scrypt$N$r$p$sól$hash`), porównanie stałoczasowe; w bazie nie ma
hasła w jakiejkolwiek postaci. Sesja to losowy token w ciasteczku, a w bazie jego SHA-256.
Logowanie i rejestracja mają limit prób (w procesie + `limit_req` w nginx).

## Konta

```bash
npm run cli -- list                          # kto jest
npm run cli -- set-password ala <hasło>      # reset (i odblokowanie) — wygasza sesje
npm run cli -- lock ala                      # zablokuj konto i wszystkie sesje
npm run cli -- remove ala                     # usuń konto razem z jego danymi (np. śmieciowe)
npm run cli -- adopt ala ola                 # przenieś CAŁE dane między kontami
npm run cli -- seed ala                      # daj kontu startowy pulpit
npm run cli -- sessions ala                  # otwarte sesje
```

Konto `wincyj` tworzy migracja `002` i przejmuje wszystko, co powstało przed kontami.
Jest zablokowane, dopóki nikt nie ustawi mu hasła na serwerze — to jedyny sposób, żeby
odzetnieć dawne notatki bez logowania się "w czyjeś konto".

## Dodanie aplikacji

1. wpis w `shared/manifest.js` (`APPS`),
2. folder `frontend/src/apps/<id>/` z komponentem i własnym `*.test.tsx`,
3. jedna linia w `APP_VIEWS` w `frontend/src/shell/registry.tsx`.

Ikona wskazująca na usuniętą aplikację nie wywali pulpitu — dostajesz okno z komunikatem.

## Wdrożenie

`deploy/` zawiera jednostkę systemd, vhost nginx i `install.sh`. Podstawowe hasło nginxa
zostało wyłączone razem z wprowadzeniem kont — bramką jest teraz ekran logowania.
Patrz `deploy/README.md`.
