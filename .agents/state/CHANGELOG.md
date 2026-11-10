# CHANGELOG

## 2026-11-10 — okna i ikony nie wchodzą pod paski

- Zmaksymalizowane okno brało `0,0` i `100vw`, a pasek górny ma `z-index: 960` — przykrywał
  własny pasek tytułu okna, więc nie było czym zminimalizować ani zamknąć. „Maksymalne"
  znaczy teraz cały **użyteczny** ekran: `--launcher-w` z lewej, `--topbar-h` od góry,
  `--dock-band` od dołu. Ramka w trybie maksymalnym nie wystawia własnej geometrii.
- Ikony: kontener pulpitu zaczyna się za paskami, więc początek siatki to bezpieczny obszar,
  a upuszczenie na pasek przycina się do pierwszej wolnej kolumny/wiersza.
- Nowe okna otwierają się w bezpiecznym obszarze, a przeciąganie trzyma kawałek paska tytułu
  na ekranie — okna nie da się już wyrzucić tak, żeby zniknęło.
- Wymiary pasków: `--topbar-h`, `--launcher-w`, `--dock-band` w `styles/global.css`
  i `SAFE_AREA` w `shell/grid.ts` (JS potrzebuje tych samych liczb).
- Testy: frontend 171 → 174 (razem 275).

## 2026-11-10 — konta: każdy widzi tylko swoje

- **Rejestracja jest otwarta**: login + hasło wpisane dwa razy; logowanie — hasło raz,
  z opcją „Zaloguj na 10 dni”. Sesję trzyma ciasteczko `note_session` (HttpOnly, SameSite=Lax,
  `Secure` tylko gdy żądanie przyszło po HTTPS — inaczej lokalny Vite by je odrzucił).
- **Własna przestrzeń**: `user_id` w `notes`, `stickies`, `desktop_items`, `favorites`,
  `notepad_tabs`, `notepad_state`. Każde zapytanie w repo ma filtr po właścicielu,
  `assertUserId` odrzuca wywołanie bez konta. Cudzy identyfikator daje 404, nie 403.
- **Migracja `002_users.sql`**: dane sprzed kontów idą do konta `wincyj` (hash `!locked`);
  przejmuje je `npm run cli -- set-password wincyj <hasło>`. Stare `favorites` i
  `notepad_*` przebudowane z kluczem głównym per konto — dane przeniesione w całości
  (test na kopii prawdziwej bazy).
- Bezpieczeństwo: scrypt + sól, `timingSafeEqual`, pozorowana weryfikacja, gdy login nie istnieje,
  w bazie tylko hash tokenu sesji, limit prób logowania w procesie + `limit_req` w nginx.
- **nginx bez `auth_basic`** — bramką jest ekran logowania; dawnego użytkownika `test`
  już nie ma (plik htpasswd został na dysku, nic go nie używa).
- Nowe: `backend/src/{domain/passwords,domain/tokens,domain/scope,http/cookies,http/auth}.js`,
  `repos/{users,sessions}.js`, `http/routes/auth.js`, `cli/users.js`,
  `frontend/src/{api/auth,shell/authStore,shell/LoginScreen}.*`.
- Testy: backend 92 → 100, frontend 142 → 170, razem **270**.

## 2026-11-09 — karteczka tworzona przez pomyłkę nie zostaje na pulpicie
- 'Nowa karteczka' klikana kilkakrotnie zostawiała puste karty; nowa karta dostaje kursor, a jeśli
  user kliknie obok nie wpisawszy nic — sama znika. Karta, do której coś wpisano, zostaje zawsze.
- Testy: frontend 138 → 142 (razem 203).

## 2026-11-09 — wdrożenie na note.wincyj.pl
- Serwer `10.8.0.1` (przez publiczny adres, VPN `wg0` wymaga hasła do klucza): Node 22.23.4 z oficjalnej
  paczki do `/usr/local`, aplikacja w `/home/ubuntu/src/note`, serwis systemd, nginx + letsencrypt,
  basic auth `test` w `/etc/nginx/note.wincyj.pl.htpasswd` (konwencja jak przy pozostałych domenach).
- Nowe: `deploy/install-node.sh`; vhost dostał `error_page 502 503 504` z komunikatem po polsku.
- Testy: frontend 133 → 138 (payload okna, menu kontekstowe), razem 199.

### Naprawione podczas wdrażania i audytu
- `frontend/src/shell/Desktop.tsx` — `run: () => void newSticky` podawało referencję zamiast wywołać
  funkcję: „Nowa karteczka” z menu pulpitu nie tworzyła nic.
- `frontend/src/shell/windowStore.ts` — ponowne otwarcie aplikacji nie odświeżało `payload`, więc
  „Nowa notatka” przy otwartym notatniku nie pokazywała nowej notatki.
- `deploy/install-https.sh` — `/etc/letsencrypt` jest tylko dla roota (sprawdzenie certu przez `sudo test`),
  `htpasswd` potrzebuje `-c` przy tworzeniu pliku domeny.

## 2026-11-09 — MVP: pulpit, kalkulator, notatnik, karteczki
- Nowy projekt: backend Express + SQLite (plik `data/note.db`, migracje w `backend/src/db/migrations`),
  shelf pulpitu (siatka ikon, foldery, okna, dock macOS-style, launcher Ubuntu-style, menu kontekstowe),
  aplikacje: kalkulator, notatnik z zakładkami/historią/wyszukiwarką, karteczki.
- `shared/` rozdzielone na `manifest.js` (dane współdzielone) i `schemas.js` (zod) — frontend importuje
  schematy jako typy, dzięki czemu zod nie trafia do bundla.
- Testy: 61 backend (prawdziwy SQLite, supertest) + 133 frontend (Testing Library, role/label) = 194.
- Pliki: `backend/**`, `frontend/**`, `shared/**`, `deploy/**`, `README.md`, `PROJECT_STATE.md`

### Naprawione w trakcie audytu
- `backend/src/db/index.js` — `db.transaction(fn)` zwraca funkcję; migracje nie były wywoływane,
  więc baza była pusta (test migracji wykrył błąd).
- `backend/src/http/middleware.js` — kolejność rozgałęzień: błąd JSON-a z express miał `status=400`
  i był raportowany jako `request_error` zamiast `invalid_json`.
- `frontend/src/apps/notepad/notepadStore.ts` — `save()` zerowało `dirty` także gdy tekst zmienił się
  w trakcie żądania, przez co ostatnie znaki nigdy nie były zapisywane.
