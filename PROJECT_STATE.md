# PROJECT_STATE

Projekt: **note** — pulpit w przeglądarce (okna, dock, launcher) z aplikacjami: kalkulator,
notatnik (wiele zakładek + historia + wyszukiwarka) i karteczki.

## Stan

| Element | Status |
|---|---|
| Backend (Express + SQLite, migracje, API) | gotowy, 100 testów |
| Konta: rejestracja, logowanie, sesja 10 dni, dane oddzielone po `user_id` | gotowy, działa |
| Shell pulpitu (siatka ikon, foldery, okna, dock, launcher, menu) | gotowy, testy jednostkowe i integracyjne |
| Kalkulator | gotowy (logika jako czyste funkcje + klawiatura) |
| Notatnik (zakładki, autosave, historia, szukanie, sortowanie) | gotowy |
| Karteczki (CRUD, kolory, przypinanie, szukanie, sortowanie) | gotowy |
| Build produkcyjny (`frontend/dist`, 181 kB / 59 kB gzip) | przechodzi |
| Wdrożenie `https://note.wincyj.pl` | **działa**, certyfikat do 2027-02-07 |

Testy: `npm test` → 270 przechodzi (backend 100, frontend 170). `npm run lint` → czysto.

Serwer: `/home/ubuntu/src/note`, backend `127.0.0.1:8120` (systemd `note.wincyj.pl.service`),
baza `data/note.db`, nginx + letsencrypt. SSH poszło przez publiczny adres, bo `wg0` stał.

## Decyzje

- **SQLite w pliku** `data/note.db` w folderze aplikacji; migracje `backend/src/db/migrations/NNN_*.sql`,
  rejestrowane w `schema_migrations`. Kopia zapasowa = skopiowanie pliku.
- **Bez ORM.** Repozytoria to surowy SQL; testy działają na prawdziwej bazie (pamięciowej), nie na mockach.
- **Kontrakt w `shared/`**: `manifest.js` (dane: lista aplikacji, kolory, limity) osobno,
  `schemas.js` (zod) osobno. Frontend importuje schematy **tylko jako typy**, więc zod nie wchodzi
  do bundla (271 kB → 181 kB).
- **Jeden proces, jeden port**: backend obsługuje `/api/*` i wydaje `frontend/dist`.
- **Rejestr aplikacji** (`frontend/src/shell/registry.tsx`) to jedyne powiązanie shella z aplikacjami.
- **Pozycje ikon w jednostkach siatki**, nie w pikselach — układ przeżywa zmianę rozmiaru okna/ekranu.
- **Stan okien nietrwały** (zamknięcie przeglądarki = czysty pulpit), a to co cenne (zakładki notatnika,
  ikony, karteczki) leży w bazie.
- **Konta w aplikacji, nie w nginx.** Rejestracja otwarta (hasło dwa razy), logowanie po jednym
  haśle, „Zaloguj na 10 dni” = `Max-Age` ciasteczka. `auth_basic` został wyłączony, bo stałby
  przed ekranem logowania i odcinał nowych użytkowników.
- **Hasła**: scrypt + sól, format `scrypt$N$r$p$sól$hash` (parametry w środku → można podnieść bez
  utraty kont), `timingSafeEqual`, pozorowana weryfikacja gdy login nie istnieje (brak odpowiedzi
  „ten login istnieje, tylko hasło złe”).
- **Sesje**: losowy token w ciasteczku, w bazie wyłącznie jego SHA-256; wygasanie sprawdzane przy
  odczycie + `purgeExpired` przy logowaniach — bez schedulerów.
- **Własność danych**: `user_id` w każdej tabeli z treścią, filtr w każdym zapytaniu repozytorium,
  `assertUserId` jako strażnik. Cudzy id → 404 (nie potwierdzamy istnienia). Sesja notatnika i
  ulubione mają klucz główny per konto.
- **Konto `wincyj`** tworzy migracja i przejmuje dane sprzed kontów; hash `!locked` dopóki ktoś nie
  ustawi hasła przez `npm run cli` — jedyny uczciwy sposób na przejęcie cudzych starych danych.
- **Limit prób logowania** w procesie (okno 10 min) + osobny `limit_req` dla `/api/auth/` w nginx —
  rejestracja jest publiczna, więc zgadywanie hasła musi być drogie.

## Konwencje

- Zależności jednokierunkowe: `http → repos → domain`, `shell → registry → apps → shared`.
- Logika poza komponentami: komponent React renderuje i przekazuje zdarzenia, reszta to czyste funkcje.
- Testy frontendu pytają o role i etykiety (`getByRole('button', { name: 'dodaj' })`), nie o klasy CSS.
- Każde okno aplikacji ma jeden klucz (`appId`), foldery `folder:<id>` — stąd aplikacje są singletonami,
  a foldery można otworzyć wiele razy.

## Znane ograniczenia / następne kroki

- Kolejność aplikacji w doku i launcherze zapisuje baza, ale nie ma jeszcze interfejsu do przeciągania
  po samych paskach.
- Notatnik nie ma autoformatowania ani markerdownu — czysty tekst.
- Brak odzyskiwania hasła (jest `npm run cli -- set-password`), brak zmiany hasła z poziomu
  interfejsu i brak widoku „ moje aktywne sesje”.
- Limit prób logowania żyje w pamięci procesu — po restarcie licznik startuje od zera.
