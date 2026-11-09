# CHANGELOG

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
