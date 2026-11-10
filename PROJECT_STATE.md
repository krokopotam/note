# PROJECT_STATE

Projekt: **note** — pulpit w przeglądarce (okna, dock, launcher) z aplikacjami: kalkulator,
notatnik (wiele zakładek + historia + wyszukiwarka), karteczki i pliki (wrzucanie, pobieranie,
współdzielenie zasobów między kontami).

## Stan

| Element | Status |
|---|---|
| Backend (Express + SQLite, migracje, API) | gotowy, 130 testów |
| Konta: rejestracja, logowanie, sesja 10 dni, dane oddzielone po `user_id` | gotowy, działa |
| Shell pulpitu (siatka ikon, foldery, okna, dock, launcher, menu) | gotowy, testy jednostkowe i integracyjne |
| Kalkulator | gotowy (logika jako czyste funkcje + klawiatura) |
| Notatnik (zakładki, autosave, historia, szukanie, sortowanie) | gotowy |
| Karteczki (CRUD, kolory, przypinanie, szukanie, sortowanie) | gotowy |
| Pliki (zasoby, drag & drop, pobieranie, zmiana nazw, udostępnianie read/edit) | gotowy, czeka na wdrożenie |
| Build produkcyjny (`frontend/dist`, 201 kB / 65 kB gzip) | przechodzi |
| Wdrożenie `https://note.wincyj.pl` | **działa**, certyfikat do 2027-02-07 |

Testy: `npm test` → 338 przechodzi (backend 130, frontend 208). `npm run lint` → czysto.

Migracje `003_files.sql` + `004_files_icon.sql` przećwiczone na **kopii produkcyjnej bazy**
(`db.backup()` na serwerze → ściągnięte → `openDb` lokalnie): dane nietknięte, każdy pulpit
dostał ikonę „Pliki", oba paski dostały slot.

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
- **Pliki: bity na dysku, nazwy w bazie.** `data/files/<id zasobu>/<uuid>.<rozszerzenie>`; ścieżka jest
  składana wyłącznie z wygenerowanej nazwy i sprawdzana `path.resolve`, więc nazwa z żądania nie ma
  wpływu na to, gdzie zapisujemy. Nazwa dla człowieka jest osobną kolumną i zmienia się bez ruszania bajtów.
- **Upload strumieniowo** (`req.pipe(writeStream)`) zamiast `express.raw`: limit (100 MB) jest liczony
  w chunkach, a nie przez bufor parsera. Serwer dzieli RAM z innymi usługami i nie ma swapu — 100 MB
  w pamięci na wysłanie to była dziura do wykorzystania przez każde nowo zarejestrowane konto.
- **Właściciel / `edit` / `read`** — rola wyliczana z bazy w każdym zapytaniu (`roleFor`), nigdy z ciała
  żądania. `edit` pozwala pracować na plikach, ale nie współdzielić ani nie ruszać samego zasobu;
  współdzielenie i usunięcie zasobu ma wyłącznie właściciel.
- **Plik należy do zasobu, nie do autora**: `files.created_by ON DELETE SET NULL` (pozostaje „—"),
  bo skasowanie konta nie może niszczyć czyichś dokumentów. Zasoby idą za właścicielem kaskadowo.
- **Nowa aplikacja = migracja z ikoną.** Pulpit jest jedynym wejściem do aplikacji, więc `004_files_icon.sql`
  dokłada „Pliki" pod ostatnią ikonę każdego istniejącego pulpitu i na koniec obu pasków.

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
- Pliki: brak pobierania wielu naraz (zip), brak podglądu w oknie, brak limitu miejsca na konto
  (liczy się tylko rozmiar pojedynczego pliku) — każdy może założyć dowolną liczbę zasobów.
- Usunięcie zasobu kasuje folder z dysku od razu; nie ma kosza ani odzyskiwania plików.
- Nazwa pliku jest etykietą w bazie — dwa pliki w zasobie mogą nazywać się tak samo (rozróżnia je data).
