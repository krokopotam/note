# note

Pulpit w przeglądarce: okna, dock, launcher, kalkulator, notatnik z zakładkami i historią, karteczki,
pliki (drag & drop do zasobów, współdzielonych z innymi kontami) oraz czaty — rozmowy z innymi
kontami, ze zmianą wiadomości przez 5 minut od jej napisania.
Konta z własną przestrzenią: każdy widzi tylko swoje notatki, karteczki, pliki i układ pulpitu.
Backend Node + SQLite w pliku, jeden proces, jeden port.

## Jak to działa

```
przeglądarka
   └── nginx (note.wincyj.pl, HTTPS) ───────┐
          backend (Express, 127.0.0.1:8120) │
              ├── /api/auth/* → sesja       │
              ├── /api/*      → repos → SQLite  data/note.db  (plik w folderze aplikacji)
              ├── /api/chat/* → rozmowy i wiadomości (API ankiety, bez gniazd)
              ├── /api/files/*→ strumień na dysk  data/files/<zasób>/<uuid>
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
npm test                  # backend (145) + frontend (238)
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
| GET | `/api/chat/people` | do kogo można napisać |
| GET/POST | `/api/chat/conversations` | moje rozmowy / otwarcie rozmowy z `{ user_id }` |
| GET | `/api/chat/conversations/:id/messages?after=` | wiadomości (od najstarszej; `after` = tylko nowsze) |
| POST | `/api/chat/conversations/:id/messages` | `{ body }` — zapisanie wiadomości |
| PATCH/DELETE | `/api/chat/messages/:id` | zmiana (tylko 5 minut) / usunięcie własnej wiadomości |
| GET/POST | `/api/files/resources` | lista zasobów / nowy zasób |
| GET/PATCH/DELETE | `/api/files/resources/:id` | zagląd (z listą osób), zmiana nazwy, usunięcie |
| GET | `/api/files/resources/:id/files?q=` | pliki w zasobie, szukanie po nazwie |
| PUT | `/api/files/resources/:id/files/<nazwa>` | wysłanie pliku — ciało to surowe bajty |
| GET | `/api/files/:id` | pobranie pliku |
| PATCH/DELETE | `/api/files/:id` | zmiana nazwy / usunięcie pliku |
| GET | `/api/files/users` | komu można współdzielić (tylko loginy) |
| PUT | `/api/files/resources/:id/members` | `{ user_id, permission: "read" \| "edit" \| null }` |

Błędy zawsze w jednym kształcie: `{ "error": { "code", "message", "details"? } }`.
Wszystko poza `/api/health` i `/api/auth/*` wymaga ciasteczka sesji — bez niego 401
(`code: "unauthorized"`), a frontend pokazuje wtedy ekran logowania.

Hasła: scrypt z solą (`scrypt$N$r$p$sól$hash`), porównanie stałoczasowe; w bazie nie ma
hasła w jakiejkolwiek postaci. Sesja to losowy token w ciasteczku, a w bazie jego SHA-256.
Logowanie i rejestracja mają limit prób (w procesie + `limit_req` w nginx).

## Czaty

Rozmowy są jeden-na-jeden z dowolnym kontem w serwisie. Para ma jeden wątek (unikalny klucz
`pair_key`), więc kliknięcie „nowy czat" dwa razy nie rozdwaja rozmowy.

**Wiadomość można zmienić przez 5 minut od jej napisania** (`MESSAGE_EDIT_MINUTES`). Okno liczy się od
chwili wysłania, więc poprawka w czwartej minucie nie dokłada kolejnych pięciu. Po upływie czasu
serwer odpowiada `403 edit_window_closed`; interfejs pokazuje przycisk „Popraw" tylko dopóki czas nie
minął (licznik sekund odświeża się co sekundę). Usunąć własną wiadomość można zawsze.

Nowe wiadomości przychodzą przez **odpytywanie co 3 s**, dopóki okno jest otwarte i widoczne w karcie —
aplikacja nie ma procesów w tle ani gniazd websocket, więc da się ją zrestartować w każdej chwili.
Samo pobranie rozmowy zeruje licznik nieprzeczytanych w liście po lewej. Rozmowa przeżywa odejście
jednej osoby (wiadomości zostają, autor wyświetla się jako „—"), a znika dopiero wtedy, gdy odejdzie
ostatnia — `npm run cli -- prune` sprząta takie przypadki.

## Pliki i zasoby

Plik zawsze leży w **zasobie** (nazwany folder, np. „Paragony 2026”). Zasób ma właściciela i może być
udostępniony innym kontom:

| Rola | zobaczy i pobierze | wyśle, zmieni nazwę, usunie | zmieni nazwę zasobu, współdzieli, usunie zasób |
|---|---|---|---|
| właściciel | tak | tak | tak |
| `edit` | tak | tak | nie |
| `read` | tak | nie | nie |

Rola jest liczona z bazy przy każdym żądaniu — nigdy z tego, co wyśle przeglądarka. Cudzy zasób
daje 404 tak samo jak notatki.

Bajty mieszkają w `data/files/<id zasobu>/<uuid>.<rozszerzenie>`: nazwa na dysku jest generowana,
więc żadna nazwa z zewnątrz nie ma wpływu na ścieżkę (`../../etc/passwd` ląduje jako plik o nazwie
`passwd` wewnątrz zasobu). Nazwa, którą widzi człowiek, jest tylko w bazie i można ją zmieniać.

Limit pliku to 100 MB (`MAX_UPLOAD_MB`). Upload idzie strumieniowo na dysk — ciało żądania nie jest
buforowane w pamięci procesu, więc kilka dużych wysłań naraz nie podnosi RAM-u. W nginx blok
`/api/files/` ma osobno `client_max_body_size 105m` i `proxy_request_buffering off`.

## Konta

```bash
npm run cli -- list                          # kto jest
npm run cli -- set-password ala <hasło>      # reset (i odblokowanie) — wygasza sesje
npm run cli -- lock ala                      # zablokuj konto i wszystkie sesje
npm run cli -- remove ala                     # usuń konto, jego dane i foldery plików na dysku
npm run cli -- adopt ala ola                 # przenieś CAŁE dane między kontami
npm run cli -- seed ala                      # daj kontu startowy pulpit
npm run cli -- sessions ala                  # otwarte sesje
npm run cli -- prune                         # posprzątaj rozmowy, z których odszedł ostatni członek
```

Konto `wincyj` tworzy migracja `002` i przejmuje wszystko, co powstało przed kontami.
Jest zablokowane, dopóki nikt nie ustawi mu hasła na serwerze — to jedyny sposób, żeby
odzetnieć dawne notatki bez logowania się "w czyjeś konto".

## Dodanie aplikacji

1. wpis w `shared/manifest.js` (`APPS`),
2. folder `frontend/src/apps/<id>/` z komponentem i własnym `*.test.tsx`,
3. jedna linia w `APP_VIEWS` (i jedna w ikonie) w `frontend/src/shell/registry.tsx`,
4. migracja dokładająca ikonę na **istniejące** pulpity — inaczej nikt, kto już sobie poukładał
   pulpit, nie miałby czym otworzyć nowej aplikacji (patrz `004_files_icon.sql`).

Ikona wskazująca na usuniętą aplikację nie wywali pulpitu — dostajesz okno z komunikatem.

## Wdrożenie

`deploy/` zawiera jednostkę systemd, vhost nginx i `install.sh`. Podstawowe hasło nginxa
zostało wyłączone razem z wprowadzeniem kont — bramką jest teraz ekran logowania.
Patrz `deploy/README.md`.
