# PROJECT_STATE

Projekt: **note** — pulpit w przeglądarce (okna, dock, launcher) z aplikacjami: kalkulator,
notatnik (wiele zakładek + wyszukiwarka), karteczki, pliki (wrzucanie, pobieranie,
współdzielenie zasobów między kontami) i czaty (rozmowy 1:1 i grupy, edycja wiadomości do 5 minut,
zdjęcia w wiadomościach, emotikonki, znak na ikonie).

## Stan

| Element | Status |
|---|---|
| Backend (Express + SQLite, migracje, API) | gotowy, 130 testów |
| Konta: rejestracja, logowanie, sesja 10 dni, dane oddzielone po `user_id` | gotowy, działa |
| Shell pulpitu (siatka ikon, foldery, okna, dock, launcher, menu) | gotowy, testy jednostkowe i integracyjne |
| Kalkulator | gotowy (logika jako czyste funkcje + klawiatura) |
| Notatnik (zakładki, autosave, szukanie, sortowanie) | gotowy |
| Karteczki (CRUD, kolory, przypinanie, szukanie, sortowanie) | gotowy |
| Pliki (zasoby, drag & drop, pobieranie, zmiana nazw, udostępnianie read/edit) | gotowy, działa |
| Czaty (1:1 i grupy, wiadomości, okno edycji 5 min, nieprzeczytane, znak na ikonie) | gotowy, działa |
| Zdjęcia w czacie (wrzucanie, miniatury, powiększanie, sprzątanie) + emotikonki | gotowy, działa |
| Układ na telefon (ikony w przepływie, aplikacja na cały ekran, pasek na dole, safe area) | gotowy, testy |
| Notatnik na telefonie (osobny ekran listy i osobny ekran notatki) | gotowy, działa |
| Gry: Wężyk, Tetris, Bąbelki, 2048, Saper, Pamięć, Kółko i krzyżyk (folder „Gry") | gotowy, działa |
| Build produkcyjny (`frontend/dist`, 263 kB / 85 kB gzip) | przechodzi |
| Wdrożenie `https://note.wincyj.pl` | **działa**, certyfikat do 2027-02-07 |

Testy: `npm test` → 580 przechodzi (backend 180, frontend 400). `npm run lint` → czysto.

Migracje `009_chat_media.sql` (nowa tabela + indeksy) i `010_no_reused_ids.sql` (odbudowa `files`
i `message_attachments` z `AUTOINCREMENT`) przećwiczone na **kopii produkcyjnej bazy** przed wejściem:
wiersze i `stored_name` bez zmian, liczniki przesunięte o 100, `integrity_check: ok`.

Migracje `005_chat.sql` + `006_chat_icon.sql` przećwiczone na **kopii produkcyjnej bazy**
(`db.backup()` na serwerze → ściągnięte → `openDb` lokalnie): dane nietknięte, każde z trzech kont
dostało ikonę „Czaty" i slot w obu paskach.

Serwer: `/home/ubuntu/src/note`, backend `127.0.0.1:8120` (systemd `note.wincyj.pl.service`),
baza `data/note.db`, nginx + letsencrypt. SSH poszło przez publiczny adres, bo `wg0` stał.

## Decyzje (gry)

- **Frontend tylko, zero bazy.** Runda jest wortha tyle, ile trwa okno; nie ma tabeli `games` ani
  endpointów, więc nie ma też czego synchronizować ani co zepsuć migracją. `APPS` wystarczy, żeby
  istniały jako ikony i okna.
- **Folder „Gry", nie pasek.** Siedem ikon w `favorites` przykryłoby cztery aplikacje, dla których
  pulpit istnieje (`seedUser` odkłada gry do foldera, `011_games.sql` robi to samo na starych kontach).
- **Logika jako czyste funkcje z `Rng` podanym z zewnątrz** (`snake.ts`, `tetris.ts`, `bubbles.ts`,
  `twentyforty.ts`, `mines.ts`, `memory.ts`, `tictactoe.ts`). Test widzi dokładnie tę partię, a wideoki
  tylko przeklikują planszę — tak jak w notatniku i kalkulatorze.
- **Ruszt heksów ma `parity`, nie przesuwane indeksy** (`bubbles`): dokładany rząd zmienia parzystość
  wszystkich rzędów, a z nią offset i liczbę miejsc. Przesuwanie danych wynosi kulki za ścianę i tnie
  sąsiedztwo; przechylona parzystość zostawia je na miejscu. Wsuwany rząd musi być **pełny** — ściana
  czepia się sufitu.
- **Testy losowych gier nie zakładają układu planszy**: losuje logika, więc test wybiera pola według
  stanu („pierwsze zamknięte”, „para czy pomyłka”), a nie z góry nadanych numerów.
- **Dziewięć gierek w folderze „Gry"** (`snake`, `tetris`, `bubbles`, `twentyforty`, `mines`,
  `memory`, `tictactoe`, `billiard2d`, `billiard3d`). Logika czysta + test, widok + test. Zero bazy,
  zero endpointów: runda żyje w oknie. Migrują je `011_games.sql` (folder) i `012_billiards.sql`.
- **Fantazja jest w widoku, reguły w logice.** Logika mówi, co się stało (`ShotOutcome` w bąbelkach,
  `last` w bilardzie), widok z tego rysuje lot, pęknięcia, spadanie i liczby punktów. Nie ma więc
  drugiego stanu do rozjechania, a `prefers-reduced-motion` ścisza efekty do zera.
- **Bilard: jedna fizyka, dwa rysunki.** `games/billiards/billiards.ts` liczy zderzenia, tarcie,
  łuzy i przymiar; 2D rysuje to w SVG, 3D w three.js. Step dzieli się na podpikroki (kula nie
  przelatuje przez kulę), krok czasu podaje widok, więc test idzie na stopklatce.
- **three.js jest leniwe** (`registry.tsx`): `lazy` + `Suspense`, osobny chunk ~137 kB gzip.
  Kamera 3D (`camera.ts`, czyste funkcje) nie zależy od kierunku celowania — obracała stołem w
  pętli z rzutem ekranowym; widok z góry potrzebuje własnego `up`.
- **Plansze z DOM i SVG, bez canvasu** — to samo, co widzi test (jsdom nie ma `getContext`), i skalują
  się razem z oknem (`grid-template-columns`, `viewBox`) zamiast przewijać.
- **Wysokość okna jest w ramie** (`WindowFrame` → `height: win.height`). Wszystkie aplikacje są napisane
  `height: 100%`, więc bez tego okno miało tyle, ile wypadło z treści: gry bez treści znikały. Plansza
  bierze największe pudełko o swoim kształcie przez `--ratio` + `boardStyle()` (jednostki kontenera,
  z zapasem w `@supports`).
- **Saper rozkłada miny po pierwszym kliknięciu**, więc opening ruch nigdy nie jest miną i zawsze
  otwiera kawał pola.
- **Kółko i krzyżyk: minimax (negamax).** Test „trudny przeciwnik zamyka linię" złapał prawdziwy błąd —
  brak negacji na poziomie rekurencji sprawiał, że komputer maksymalizował wynik przeciwnika.
- **Klawisze słucha plansza**, nie `window`: okna nie podsłuchują się nawzajem. Kierunki ma też krzyż
  pod planszą (`shared/Pad.tsx`, `onPointerDown`), a 2048 i wężyk swipe.

## Decyzje (telefon)

- **Jeden kod, dwa układy.** `usePhone()` (`shell/viewport.ts`, 760 px) pyta `matchMedia`, a nie
  agenta. Nie ma osobnej aplikacji mobilnej ani drugiego drzewa komponentów: `Desktop`, `IconGrid`,
  `WindowFrame`, `Dock` i `Launcher` wiedzą o telefonie po jednej fladze.
- **Zapisane pozycje ikon zostają deskkopowe.** Na telefonie siatka jest przepływowa — numeruje te
  same ikony w tej samej kolejności. Próba wyświetlenia komórek `x/y` na 390 px oznaczała ikony,
  których nie da się dosiągnąć ani przewinąć.
- **Telefon ma jedną aplikację na ekranie, ale nic nie ginie.** `goHome()` minimalizuje wszystko
  zamiast zamykać: okno wraca tym samym przyciskiem na dole, z tym samym stanem w środku.
- **Szuflada „Wszystkie aplikacje" jest jedna** (`AppDrawer` + `drawerStore`) — launcher i pasek
  telefonu otwierają to samo okno, z tymi samymi test ids.
- **Wysokość w `dvh`, dolna krawędź w `env(safe-area-inset-bottom)`** — bez tego pole pisania w czacie
  lądowało pod paskiem przeglądarki albo pod gestem „home".

## Decyzje (poprawka: „miniatura poprzedniego zdjęcia")

- **Numer wiersza, który raz poszedł w świat, nie wraca** (`010_no_reused_ids.sql`: `AUTOINCREMENT`
  na `files.id` i `message_attachments.id`). `INTEGER PRIMARY KEY` to rowid — po skasowaniu najnowszego
  wiersza SQLite oddaje ten sam numer następnemu, a oba te adresy trzyma się w cache (pliki: rok,
  zdjęcia: doba). Stąd objaw: kasujesz zdjęcie, wrzucasz następne, przeglądarka rysuje **poprzednie**,
  choć serwer odpowiadał poprawnie. Przy kasowaniu przed migracją numery mogły być wyższe niż zostało
  `MAX(id)`, więc liczniki są dodatkowo przesunięte o 100.
- **Adres zdjęcia niesie moment wrzucenia**: `/api/chat/attachments/:id?v=<created_at>` (backend
  ignoruje zapytanie). To poduszka dla cache'y, które już zdążyły zapamiętać numery wydane przed
  migracją — bez niej musiałbyś czekać dobę albo czyścić pamięć przeglądarki.
- **Miniatura pliku, którego jeszcze nie wysłano, jest robiona raz** (`PendingThumb`: adres obiektu
  w `useEffect`, `revokeObjectURL` przy zniknięciu) i ma **własny klucz**, nie indeks. Wcześniejszy
  kod robił nowy adres obiektu przy każdym renderze — a render leci z każdym odpytywaniem rozmowy.

## Decyzje (ostatnia runda: życie w czacie)

- **Emotikonki to znaki, nie zasoby.** Panel (`apps/chat/EmojiPicker.tsx`) wkłada emoji w miejscu
  kursora (`emoji.ts: insertAtCaret` — liczy jednostki kodu, bo „❤️" to dwie), a treść wiadomości
  jedzie jak każdy inny tekst. W bazie nie ma nic nowego, historia rozmowy zostaje listą stringów.
  Lista jest krótka i pogrupowana (buzie, gesty, serca, zwierzęta, jedzenie, świat) — picker, którego
  trzeba szukać, to picker, którego się nie otwiera.
- **Zdjęcie idzie do rozmowy, nie do wiadomości.** Najpierw `POST /chat/conversations/:id/attachments`
  (surowe bajty, limit `CHAT_ATTACHMENT_MAX_MB` = 8 MB), potem `POST .../messages` z `attachment_ids`.
  Dzięki temu wiadomość może
  być **samym zdjęciem**, a upload, z którego nic nie wyszło, jest widoczny i zamiatany przez `prune`
  po 24 h. `message_attachments.conversation_id` + `ON DELETE CASCADE`: bajty przeżywają usunięcie
  konta, które je wrzuciło (`uploader_id SET NULL`), tak samo jak plik należy do zasobu, nie do osoby.
- **Czat to nie dysk.** `domain/media.js` przepuszcza tylko `.png/.jpg/.gif/.webp` i musi się zgadzać
  zarówno rozszerzenie, jak i `Content-Type`; reszta dostaje 415 `not_an_image`. Limit na wiadomość:
  4 zdjęcia (`CHAT_ATTACHMENTS_PER_MESSAGE`). Surowe pliki wykonywalne byłyby tu tym samym, czym
  śmieci w zasobach — tylko częściej wrzucanym.
- **Wiersz `message_id IS NULL` to upload, nie wiadomość.** Wiązanie z wiadomością dzieje się w
  transakcji i tylko wśród wierszy tego samego autora w tej samej rozmowie — stąd `400 invalid_attachment`,
  zamiast cichego podpięcia czyjegoś pliku.
- **Miniatury serwowane są z backentu** (`GET /api/chat/attachments/:id`, `Cache-Control: private`),
  więc `<img src>` działa na tej samej sesji co reszta API; przycisk powiększa w tym samym oknie
  (lightbox), bo przekierowanie do nowej karty w „systemie" byłoby pęknięciem iluzji.

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
  dokłada „Pliki" pod ostatnią ikonę każdego istniejącego pulpitu i na koniec obu pasków (004 jest na
  ikonę plików, a `006_chat_icon.sql` na ikonę czatu — ten sam zabieg).
- **Czat: para ma jeden wątek.** `conversations.pair_key` (`minId:maxId`, UNIQUE) rozstrzyga wyścig
  „dwoje kliknęło jednocześnie" bez sprawdzania wprzód; druga strona po prostu wczyta ten sam wątek.
- **Wiadomość należy do rozmowy, nie do autora** (`messages.author_id ON DELETE SET NULL`) — skasowanie
  konta nie wymazuje tego, co ktoś powiedział komuś innemu; znika tylko jego członkostwo w rozmowie.
- **Okno edycji liczy się od `created_at`, nie od ostatniej poprawki** (`domain/chat.js`: `isEditable`,
  `editable_until`). Serwer decyduje i wysyła `can_edit`; przeglądarka tylko to rysuje i odlicza sekundy
  do tej samej chwili.
- **Czat bez websocketów: odpytywanie co 3 s** (`CHAT_POLL_MS`), dopóki okno jest otwarte i widoczne.
  Jeden proces, jedno żądanie, nic do odtworzenia po restarcie; `?after=<id>` niesie tylko to, co nowe.
- **Przeczytane = pobrane.** Znacznik `conversation_members.last_read_at` aktualizuje się przy odczycie
  wiadomości, więc licznik nieprzeczytanych jest liczony w bazie i drugi okienko widzi to samo.
- **To, czyja jest wiadomość, mówi serwer** (`from_me` w `MessageSchema`) — okno czatu nie zagląda do
  store'a logowania, więc aplikacje nie zależą od `shell` i bańka wie, po której stronie stanąć.
- **Kształt wątku to czyste funkcje** (`apps/chat/chatView.ts`: `startsGroup`, `avatarHue`,
  `avatarInitial`): grupowanie po autorze i 5 minutach, kolor awatara z nicku. Komponent tylko pyta
  „rysować imię tutaj?" i ma to testowane bez renderowania.
- **Wąskie okno: lista rozmów za przyciskiem** (`@media (max-width: 620px)`, `data-side` na kontenerze).
  jsdom nie ma `matchMedia`, więc komponent pyta o niego przez `typeof` i bez niego przyjmuje „jest szeroko".
- **Stan czatu rozchodzi się po chwili `since`, nie po id wiadomości.** Odpytywanie pyta „co się zmieniło
  od tamtej chwili" i dostaje nowe + poprawione + usunięte, a w odpowiedzi `watermark`, które oddaje
  następny raz. Granica jest `>=`, więc wiersz graniczny przychodzi dwa razy — to cena za to, żeby
  wiadomość napisana w tej samej milisekundzie co znacznik nie zginęła; okno scala po `id`.
- **Usunięcie wiadomości to nagrobek** (`messages.deleted_at`, treść czyszczona). Wcześniejsze
  `DELETE FROM messages` znaczyło, że druga strona czytała wiadomość, której już nie ma, i nie miała jak
  się o tym dowiedzieć. `unread` nagrobków nie liczy.
- **Rozmowa wieloosobowa bez `pair_key`.** Grupa ma `title` (może być pusty — wtedy lista osób) i żadnych
  ograniczeń pary; `pair_key` zostaje tylko dla 1:1, więc unikalność pary dalej działa, a grupa niczego
  nie łamie (SQLite i na `ADD COLUMN`, i na wielokrotne NULL w UNIQUE). Dodanie osoby do rozmowy 1:1 to
  `409 direct_conversation` — klucz mówiłby dalej, że to para.
- **Znaki nieprzeczytanych należą do pulpitu** (`shell/badgeStore.ts`, `GET /chat/unread`,
  `BADGE_POLL_MS = 5 s`). Pulpit nie może importować aplikacji, więc sam pyta i sam rysuje liczbę w rogu
  ikony (dok, launcher, pulpit); aplikacja czatu o istnieniu znaku nie wie.
- **Notatnik nie ma historii** (migracja `007_drop_note_revisions.sql` kasuje tabelę `note_revisions`).
  Historia była zgadywanką: autozapis co 500 ms, każdy skuteczny zapis dodawał wpis, a lista „Historia”
  zapełniała się wersjami, których nikt nie otwierał. Notatka to teraz dokładnie to, co w polu tekstowym —
  jeden `UPDATE` i nic obok. Świadomie **nieodwracalne**: przed wdrożeniem kopia bazy ląduje w
  `/home/ubuntu/backups`, tam leży `note-*.db`.

## Konwencje

- Zależności jednokierunkowe: `http → repos → domain`, `shell → registry → apps → shared`.
- Logika poza komponentami: komponent React renderuje i przekazuje zdarzenia, reszta to czyste funkcje.
- Testy frontendu pytają o role i etykiety (`getByRole('button', { name: 'dodaj' })`), nie o klasy CSS.
- **Akcje wiersza idą pod trzy kropki** (`shared/RowMenu.tsx`): menu otwiera się przy krawędzi wiersza,
  pozycjonowane `fixed`, bo wiersze żyją w przewijanych panelach. Testy otwierają je przez
  `test/rowMenu.ts` (`pickRowAction`), więc wszędzie tak samo. Tworzenie ("Nowa notatka") zostaje
  widoczne — kropki są na to, co grozi zmianą albo stratą.
- Każde okno aplikacji ma jeden klucz (`appId`), foldery `folder:<id>` — stąd aplikacje są singletonami,
  a foldery można otworzyć wiele razy.

## Na serwerze: pliki a nginx (pułapka na przyszłość)

Każde miejsce, które przyjmuje ciało większe niż kilka kilobajtów, potrzebuje **własnego `location`
z `client_max_body_size`**. Domyślna setka nginx to 1 MB i nie pyta aplikacji o zdanie: pierwszy
telefonowy kadr wracał jako 413 ze strony HTML, a aplikacja nie widziała bajtów. Dlatego
`deploy/nginx/note.wincyj.pl.conf` ma `location /api/files/` (105 m) i teraz też
`location ~ ^/api/chat/conversations/[0-9]+/attachments$` (12 m przy limicie aplikacji 8 MB) —
nginx jest zawsze hojniejszy o zapas, żeby to aplikacja odpowiadała 413 po polsku (`file_too_large`).
Do tego `proxy_request_buffering off`, żeby wolne wrzucanie nie leżało buforem na dysku serwera.

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
- Zdjęcia w czacie nie mają miniatur w sensie rozmazywania (serwer oddaje oryginalne bajty) ani
  limitu miejsca na rozmowę — liczy się tylko limit na plik (8 MB) i 4 na wiadomość.
- Grupy istnieją, ale nie ma z nich wyjścia (tylko autor może dopisywać, nikt się nie wypisuje) ani
  szukania w wiadomościach; powiadomienie to liczba na ikonie, nie komunikat systemowy. Znak znika do
  5 s po przeczytaniu, bo pulpit pyta własnym rytmem — okno czatu mu o tym nie mówi.
- Usunięta wiadomość znika bez powrotu (brak kosza), a edytowana nie zachowuje poprzedniej wersji.
  Notatki też nie mają historii — patrz decyzja poniżej.
