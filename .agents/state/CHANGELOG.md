# CHANGELOG

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
