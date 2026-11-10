# CHANGELOG

## 2026-11-10 — 413 przy wrzucaniu png (naprawa na serwerze)

Zgłoszone: wysłanie zdjęcia daje 413. W logach nic nie ma, bo **żądanie nie dochodziło do aplikacji** —
`location /` w nginx nie ma `client_max_body_size`, więc obowiązuje domyślne 1 MB i nginx sam odrzucał
każdy kadr z telefonu (odpowiedź HTML, nie JSON).

- Dodane `location ~ ^/api/chat/conversations/[0-9]+/attachments$` z `client_max_body_size 12m`
  (limit aplikacji to 8 MB, więc to aplikacja mówi „zdjęcie jest za duże" po polsku), `proxy_request_buffering off`
  i własnym limitem prób; konfiguracja w repo `deploy/nginx/note.wincyj.pl.conf` = to, co na serwerze.
  Sprawdzono: 1,5 MB → 201, 9 MB → 413 `file_too_large`, 13,6 MB → 413 od nginx (powyżej zapasu).
- Interfejs nie wysyła już nic, co z góry wiadomo, że odpornione: `Composer` odrzuca plik powyżej
  limitu i mówi który, dobre zdjęcia zostają w liście (+2 testy).
- Poprawione w dokumentach: limit to 8 MB (`CHAT_ATTACHMENT_MAX_MB`), nie 4.

## 2026-11-10 — czat ma życie: emotikonki i zdjęcia

- **Emotikonki** (`apps/chat/emoji.ts`, `EmojiPicker.tsx`): panel z sześcioma grupami, wstawia w
  miejscu kursora i zostawia kursor za sobą; panel nie zamyka się po wyborze, bo nikt nie wysyła
  jednego emoji. To zwykłe znaki w treści — zero zmian w bazie.
- **Zdjęcia w wiadomościach**: migracja `009_chat_media.sql` (tabela `message_attachments`),
  `POST /api/chat/conversations/:id/attachments` (surowe bajty → `data/files/chat/<rozmowa>/<uuid>`),
  `GET /api/chat/attachments/:id` tylko dla osób z rozmowy, `attachment_ids` przy zapisie wiadomości.
  Wiadomość może być samym zdjęciem; pasek boczny pokazuje wtedy „zdjęcie".
- **Tylko obrazy**: `domain/media.js` (`.png/.jpg/.gif/.webp`, rozszerzenie i `Content-Type` muszą się
  zgadzać) → 415 `not_an_image`; 8 MB na plik, 4 na wiadomość; pusty upload → 400, za duży → 413.
- **Cykl życia**: zdjęcie należy do rozmowy (`ON DELETE CASCADE`, autor `SET NULL`), usunięcie
  wiadomości usuwa pliki z dysku, `prune` sprząta wrzucone-a-niewysłane po 24 h.
- **Interfejs**: spinacz w polu pisania, miniatury przed wysłaniem (można zdjąć), miniatury w bańce,
  kliknięcie powiększa w oknie (lightbox, Escape zamyka). `uploadRaw` w `api/client.ts` — wspólny
  surowy POST z progresem, z którego korzysta też aplikacja Pliki.
- Testy: backend 173 (+16), frontend 303 (+20); `npm run lint` i build czyste.

## 2026-11-10 — czat: stan rozchodzi się, rozmowa ma kilkoro ludzi, ikona pokazuje ile czeka

Trzy rzeczy naraz, bo były o siebie oparte:

- **Poprawka dociera do rozmówcy.** Odpytywanie pytało `?after=<id wiadomości>`, więc zmiana
  istniejącego wiersza nigdy nie wracała — okno rozmówcy pokazywało stary tekst, dopóki ktoś nie
  otworzył czatu od nowa. Teraz `?since=<watermark>`: serwer odpowiada tym, co **napisane, poprawione
  albo usunięte** od tamtej chwili, i zwraca `watermark` do odesłania. Granica `>=` (wiersz graniczny
  przychodzi dwa razy, okno scala po `id`) — po to, żeby wiadomość z tej samej milisekundy nie zginęła.
- **Usunięcie zostawia nagrobek.** `messages.deleted_at` (migracja `008_chat_sync.sql`) + pusta treść;
  rozmówca dostaje `deleted: true` i widzi „wiadomość usunięta", a nie wiersz, który zapadł się pod
  ziemię. `unread` nagrobków nie liczy, edycja nagrobka to `410 message_gone`.
- **Rozmowa z kilkoma osobami.** `conversations.title` + grupy bez `pair_key` (unikalność pary zostaje
  przy 1:1,SQLite lubi wielokrotne NULL w UNIQUE, więc zero przebudowy tabeli). `POST
  /conversations/group { title?, member_ids[] }`, `POST /conversations/:id/members`, `GET
  /conversations/:id` z listą członków. Dopisanie osoby do rozmowy 1:1 → `409 direct_conversation`.
  Zapytania o rozmowę bez mnożenia wierszy: same podzapytania skalarne zamiast JOIN-a „innego
  uczestnika", który przy trzeciej osobie duplikował listę.
- **Znak na ikonie** — `GET /api/chat/unread` + `shell/badgeStore.ts` (pulpit pyta co `BADGE_POLL_MS`,
  tylko gdy karta jest widoczna; błąd sieci nie gasi znaku, tylko zostawia ostatnią liczbę). Liczba w
  rogu ikony w doku, na launcherze, w „wszystkie aplikacje" i na pulpicie; nazwa ikony dla czytnika
  ekranu to „Czaty, 3 nieprzeczytane wiadomości". Pulpit nie importuje aplikacji, więc pyta sam.
- Naprawione przy okazji: `merge()` w store czatu sortował po `a.id - a.id`, czyli wcale.
- Testy: 440 (backend 157, frontend 283). Backend: sync poprawki/usunięcia za pomocą prawdziwego zegara
  (wiersz „postarzany" o 2 minuty, żeby granica nie zdecydowała za test), grupy, `unread`. Frontend:
  6 testów `badgeStore`, 3 znaku na ikonie w pulpicie, grup w oknie czatu.

## 2026-11-10 — czat przestaje być sztywny: bańki, awatary, luźny pasek pisania

- Wiadomości to teraz bańki, nie karty: swoje niebieskie (`.me`), obce szare (`.them`), usunięte —
  ramka przerywana. Szerokość bańki `min(78%, 640px)`, tekst zawija się tam, gdzie trzeba.
- Awatar: koło z pierwszą literą nicku, kolor liczony z nicku (`chatView.ts: avatarHue` — paleta ośmiu
  spokojnych barw, ten sam człowiek zawsze tak samo). Usunięte konto dostaje „?".
- Grupowanie: kolejne wiadomości tej samej osoby w ciągu 5 minut tworzą jeden blok — imię i godzina przy
  pierwszym, przy następnych sama bańka (i `srOnly` z imieniem dla czytnika ekranu). Przerwa > 5 min
  otwiera nowy blok (`startsGroup`). Odstęp między blokami 10 px, w bloku 2 px.
- Licznik czasu na poprawkę + trzy kropki: chip po prawej stronie wiersza, zawsze widoczny (przygaszony),
  na hover/focus dostaje tło. Wcześniej licznik i menu zajmowały nagłówek każdej wiadomości.
- Pasek pisania: pill z autorskim rozrostem (1 linia → do 160 px, potem scroll), okrągły przycisk
  wysyłania z ikoną samolotu (`aria-label="Wyślij"`), licznik znaków tylko od 80% limitu.
- Wąskie okno (≤ 620 px): lista rozmów schowa się za przyciskiem „Rozmowy" (`data-side` na kontenerze),
  otwarcie rozmowy ją zamyka. `useNarrow()` pyta o `matchMedia` przez `typeof` — w jsdomie go nie ma.
- Backend: `MessageSchema` dostaje `from_me` (`shapeMessage` — serwer mówi, czyja bańka), dzięki czemu
  aplikacja czatu nie importuje store'a logowania i trzyma kierunek zależności `apps → shared`.
- Testy: 407 (backend 147, frontend 260) — +8 `chatView` (awatar, grupowanie), +5 kształtu wątku
  (blok, pauza, „moje", zwijanie listy, licznik znaków), +1 kontrakt `from_me` po drugiej stronie.

## 2026-11-10 — notatnik bez historii: kasujemy `note_revisions`

- Historia notatek wyszła z aplikacji: zniknęła panel „Historia” z okna, endpointy
  `GET /api/notes/:id/revisions` i `POST /api/notes/:id/revisions/:revId/restore`, `listRevisions`
  i `restoreRevision` w repozytorium oraz zapisywanie wersji w `updateNote` — zapis to teraz jeden
  `UPDATE`, autozapis nie produkuje już wpisów.
- Migracja `007_drop_note_revisions.sql` (`DROP TABLE IF EXISTS note_revisions`) — **kasuje dane**,
  jako jedyna w projekcie. Przed nią kopia bazy; po niej w bazie zostaje to, co widoczne w notatniku.
- Frontend: `revisions`/`restoreRevision` ze `notepadStore`, `revisions`+`restore` z `notesApi`,
  `NoteRevisionSchema` ze `shared/schemas.js`, typ `NoteRevision` z `api/types.ts`; siatka okna
  dwukolumnowa (260px lista + editor), CSS `.history*` usunięty.
- `.status` w stopce notatnika dostał wreszcie własną regułę CSS — klasa była używana, ale nigdy
  niezdefiniowana (historycznie — span bez stylu).
- Testy: 394 (backend 147, frontend 247). Zostały testy „nie ma już endpointu historii” i
  „tabela `note_revisions` nie istnieje po migracjach”, żeby nikt jej odtworzył bez decyzji.

## 2026-11-10 — akcje wiersza chowają się pod trzy kropki

- Nowy `frontend/src/shared/RowMenu.tsx`: akcje wiersza po prawej stronie, pod przyciskiem z trzema
  kropkami (`aria-haspopup="menu"`, `role="menu"`, Escape i klik obok zamykają). Menu jest `position:
  fixed` prostokąta przycisku — jako dziecko wiersza zostałoby obcięte na krawędzi przewijanego panelu.
- Zastosowane wszędzie, gdzie wiersz miał kilka przycisków: **wiadomości czatu** (Popraw, Usuń),
  **pliki** (Zmień nazwę, Usuń), **zasoby** na pasku bocznym (Zmień nazwę, Udostępnij, Usuń zasób —
  nazwa edytowana teraz w miejscu, bez osobnego formularza w nagłówku), **karteczki** (Przypnij/Odepnij,
  Usuń — kolory zostały na wierzchu), **notatnik** (ze stopki zniknął czerwony „Usuń notatkę”).
- Karteczka pokazuje napis „przypięta\": jej stan nie może zależeć tylko od etykiety przycisku,
  którego już nie ma.
- Pozostało jawne: tworzenie (Nowa notatka / Dodaj zasób / Nowy czat) i pojedyncze akcje wiersza
  (Otwórz, Przywróć, Zamknij zakładkę) — kropki na jedną pozycję byłyby gorzej, nie lepiej.
- Licznik czasu na poprawkę przesunięty do nagłówka wiadomości jako `m:ss` (`formatCountdown`).
- Testy: 396 przechodzi (backend 148, frontend 248 — +10 `RowMenu`, +4 `formatSize`/`formatCountdown`).
  Wsparcie: `frontend/src/test/rowMenu.ts` (`openRowMenu`, `pickRowAction`).

## 2026-11-10 — aplikacja Czaty: rozmowy i pięć minut na poprawkę

- Nowa aplikacja **Czaty**: rozmowy jeden-na-jeden z dowolnym kontem, lista rozmów z podglądem
  ostatniej wiadomości i licznikiem nieprzeczytanych, pisanie Enterem (Shift+Enter = nowa linia).
- **Edycja wiadomości do 5 minut** (`MESSAGE_EDIT_MINUTES`) — okno liczone od napisania, więc poprawka
  nie przedłuża sobie czasu. Po upływie: `403 edit_window_closed`. Własną wiadomość można usunąć zawsze.
  Serwer decyduje (`can_edit`), interfejs tylko rysuje i odlicza sekundy do tej samej chwili.
- Rozmowa dla pary jest jedna: `conversations.pair_key` (`minId:maxId`, UNIQUE) rozstrzyga wyścig bez
  sprawdzania wprzód — druga strona wczytuje ten sam wątek.
- Wiadomość należy do rozmowy, nie do autora (`author_id ON DELETE SET NULL`): skasowanie konta nie
  wymazuje tego, co zostało komuś powiedziane; znika tylko członkostwo.
- Brak websocketów: okno odpytuje co 3 s (`?after=<id>` niesie tylko nowości), dopóki jest widoczne.
  Przeczytanie = pobranie, stąd licznik nieprzeczytanych liczony jest w bazie.
- `merge()` w store **zastępuje** znane id zamiast je wyrzucać — inaczej odświeżona wiadomość z
  `can_edit: false` nigdy nie docierałaby do ekranu.
- Błąd widoczny dla człowieka: `403 edit_window_closed` nie może być przełknięty przez odświeżenie,
  które czyści `error` — inaczej „Popraw" znika bez słowa.
- Rozmowa przeżywa odejście jednego rozmówcy (wiadomości zostają, autor jako „—"), ale gdy odejdzie
  ostatni, znika razem z nimi — `pruneEmptyConversations` przy `remove` i nowe `npm run cli -- prune`.
  Wcześniejsze zachowanie zostawiało w bazie wątki, których już nic nie mogło wyświetlić.
- Migracja `006_chat_icon.sql` dokłada ikonę „Czaty" do istniejących pulpitów i slot w obu paskach.
- Testy: 148 backend (+18 czatu: okno edycji, wyścig pary, izolacja, odejście konta, sieroty) +
  238 frontend (+30) = 386. Migracje sprawdzone na kopii produkcyjnej bazy.

## 2026-11-10 — aplikacja Pliki: zasoby, wysyłanie, współdzielenie

- Nowa aplikacja **Pliki**: zasoby (nazwane foldery) tworzone bez limitu i ze zmienną nazwą,
  pliki wrzucane drag & drop albo przyciskiem „wybierz z dysku", pobieranie, zmiana nazwy pliku.
- Współdzielenie zasobu z wybranymi kontami: `read` (ogląda i pobiera) albo `edit` (także wrzuca,
  nazywa, usuwa). Sam zasób zmienia nazwę, współdzieli i usuwa wyłącznie właściciel.
  Rola liczona jest z bazy przy każdym żądaniu; cudzy zasób daje 404, nie 403.
- Bity leżą w `data/files/<id zasobu>/<uuid>` — nazwa dyskowa generowana, ścieżka sprawdzana
  `path.resolve`, więc `../../etc/passwd` nie zapisze się ani nie wyczyta poza zasobem.
  Nazwa dla człowieka jest osobną kolumną i można ją zmieniać bez ruszania pliku.
- Upload strumieniowo na dysk (`req.pipe`), limit 100 MB liczony w chunkach. `express.raw`
  trzymałby cały plik w pamięci, a serwer nie ma swapu i dzieli RAM z innymi usługami.
- `files.created_by` → `ON DELETE SET NULL`: usunięcie konta nie kasuje plików wrzuconych do
  cudzego zasobu (zostaje autor „—"). `adopt` przenosi zasoby i współdzielenia, `remove`
  czyści foldery na dysku.
- Migracja `004_files_icon.sql` dokłada ikonę „Pliki" do **istniejących** pulpitów i slot w doku
  oraz launcherze — bez niej nikt, kto już ma pulpit, nie miałby czym otworzyć nowej aplikacji.
- nginx: osobny blok `/api/files/` z `client_max_body_size 105m` i `proxy_request_buffering off`.
- Testy: 130 backend (+27: pliki, udostępnianie, izolacja, migracje, CLI) + 208 frontend (+34) = 338.
- Migracje sprawdzone na kopii produkcyjnej bazy przed wdrożeniem.

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
