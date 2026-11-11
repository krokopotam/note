# CHANGELOG

## 2026-11-11 — arkanoid: klocki, kapsułki i kąt zamiast celownika

Jedenasta gierka w „Gry", bez bibliotek: logika, rysowanie, dźwięk i widok w osobnych plikach.
55 testów: 32 logiki, 11 rysownika, 12 przeklikiwań ekranu.

- **Warstwy**: `logic.ts` (kula, klocki, kapsułki, serie, życia, plany), `draw.ts` (rysowanie z
  pliku i zdarzeń), `sound.ts` (siedem przepisów), `ArkanoidApp.tsx` (pętla klatek i wejście).
  Logika bierze `Rng` z zewnątrz, więc test rozgrywa dokładnie tę partię co gracz.
- **Trzy pułapki, dwie w fizyce.** (1) Po odbiciu kula dotykała krawędzi klocka z
  milimetra i następny podkrok liczył to jako nowe trafienie — klocek o trzech uderzeniach znikał w
  jednej klatce. Lekcja: `LUZ = 0,06` px przy wypychaniu. (2) Klocek ze zerową wytrzymałością
  zostawał w planie, więc warunek „plan zebrany" nigdy nie zachodził. Zbity klocek schodzi z listy,
  a plan z samych szynek jest zaliczony z definicji, bo nie ma w nim czego zbijać.
- **Trzecia była w zasadach, nie w kodzie.** Kula puszczona z klapki idealnie pionowo wracała
  w jej środek i odbijała idealnie pionowo — partia bez końca. `wyrzuć` daje teraz przechył co najmniej
  0,2 rad, a `prostuj` nie pozwala kuli opaść do lotu poziomego (|vy| ≥ 0,34 · prędkość).
- **Podkroki co 2 px**: klocek ma 8 px grubości, kula przy 240 px/s przeskakuje go w klatkę.
- **Sterowanie to kąt odbicia od klapki** (65° przy samej krawędzi), nie celownik; kapsułki: szeroko,
  wąsko, kule, zwolnij, życie — dwie ostatnie są kłopotem, o których wypadnięciu decyduje `Rng` przy
  budowie planu. Mnożnik z serii cegiełek bez dotknięcia klapki, sufit ×5.
- **Plany w ASCII 15 × 8** (`.`, `1`–`3`, `S`), pięć sztuk, potem od nowa z szybszą kulą (sufit 240 px/s).
- **Płótno 256 × 320 liczone z wysokości kontenera.** Na telefonie płótno stało we własnych 260 px,
  dopóki `.płótno` nie dostało `height: 100%` — teraz **384 × 624** na 390 × 844. Licznik wyniku to
  cyfry siedmiosegmentowe rysowane z siedmiu kawałków, bez czcionki i bez pliku z bitmapą; zera z
  przodu przygaszone.
- **`createSound` wyprowadzony do `games/shared/sound.ts`.** Był w pinballu, arkanoid miałby przepisywać
  granie; teraz gra podaje przepis, generator jest wspólny. API pinballa bez zmian.
- Migracja `014_arkanoid.sql` — pierwszy wolny slot foldera „Gry", tak jak przy pinballu. Testy
  migracji dokładaających gierkę zamienione w pętlę (013 i 014 robią to samo) i sprawdzały zbiór
  ikon, a nie ich kolejność: migracja dopisuje na końcu, a porządek w folderze trzyma siatka.
- Testy: 890 (backend 192, frontend 698). `npm run lint` czysto, build przechodzi.

## 2026-11-11 — pinball: dźwignia, która naprawdę ciągnie

Zgłoszenie: „prawa dźwignia słabo działa, prawie się nie podnosi”. Dwie przyczyny, obie w wyrzutniku.

- Kula czekająca na wyrzutniku jechała **do góry** (`loaded.y - plunger * 10`), czyli w stronę bramy,
  zamiast siadać ze sprężyną. Teraz `+ PULL_SAG` (14 px), a tę samą stałą rysuje sprężyna, więc kula
  i sprężyna nie mają jak się rozjechać. Kierunek pilnuje nowy test w `engine.test.ts` — wcześniej
  nic go nie pilnowało, dlatego błąd przeżył tyle wersji.
- Krzywa siły była kwadratowa z podłogą 0,35: `plungerSpeed(0.45)` dawało 693 px/s, a z toru
  (461 → 78 px) wynosi kulę dopiero ~771 px/s. Środkowe i krótkie wciśnięcia fizycznie nie mogły
  zacząć partii. Dziś `plungerSpeed` jest liniowa (300…1180 px/s), a `PRÓG_TORU` (830 px/s, z zapasem
  na tarcie) wyznacza `PULL_PEWNY`, od którego interfejs strzela zawsze — muśnięcie wprowadza kulę
  do gry. Samo muśnięcie może być za słabe tylko poniżej progu i to jest decyzja gracza.
- Pełne naciągnięcie trwa 0,45 s zamiast 0,85 s, sprężyna gęstnieje razem z naciągnięciem, a
  `WCIŚNIJ` nie nachodzi na razemek.
- Testy `wyrzutnik` mierzą najwyższy punkt kuli (`szczyt`), a nie jej położenie w ostatniej klatce:
  poprzednia wersja przechodziła tylko dlatego, że kula wciąż była w locie.
- Test rekordu przestał zakładać, że partia bez klapek nie zbija punktów — z działającym wyrzutnikiem
  zbija. Sprawdza teraz dwie rzeczy naprawdę ważne: gorsza partia rekordu nie nadpisuje, lepsza go podnosi.
- Pomiary w przeglądarce: przy 100% naciągnięcia kula siada 14 px, sprężyna się zwęża; muśnięcie
  (11% skali) wprowadza kulę do gry i licznik rośnie.

## 2026-11-11 — pinball: stół 256 × 512, matryca i fizyka od zera

Nowa dziesiąta gierka w folderze „Gry": stół flipperowy w stylistyce OCS. Żadnej biblioteki —
fizyka, reguły, rysownik, dźwięk i silnik partii są napisane wprost, każdy warstwa osobno.

- **Warstwy** (`frontend/src/apps/games/pinball/`): `geometry.ts` (wektory, odbicia, zamiatanie
  klapy), `physics.ts` (świat 256 × 512, `Hit`-y, `drain`, `stuck`), `table.ts` (druk stołu z ciał),
  `rules.ts` (czysty reduktor: J A C K P, mnożnik, kupki, gorączka, multiball), `render.ts`
  (bufor `Uint32Array`, plastik pieczony raz, matryca LED 5 × 7), `view.ts` (iskry, pierścienie,
  drżenie, spawy punktów), `sound.ts` (syntezowane odezwy), `engine.ts` (partia), `PinballApp.tsx`
  (pętla RAF i wejście).
- **Reguły**: trzy kule, serie po zbijakach budują bonus, pasy J A C K P otwierają jackpot w kielichu,
  bank trzech celów podbija mnożnik, kupki dają bilety (do dwóch), 20 trafień zbijaka ładowało
  gorączkę; odpływ kasuje serie, tryb i mnożnik.
- **Pułapka reduktora**: `next()` kopiował tablice (`letters`, `rollovers`, `ticker`) *po* włożeniu
  `patch`, więc każdy `patch` ruszający tablicę kasował poprzedni. Kopiowanie przed `patch`.
- **Pułapka wyrzutnika**: prędkość startowa 1180 wystrzeliwała kulę poza stół, a słabe wciśnięcie
  zostawiało kulę leżącą w kanale na wieczność. Dziś 300–940 px/s plus `drain` po 0,5 s bezruchu.
- **Matryca**: odstęp znaków 18 → 16 px, bo przy 240 px światła mieściło się 13 znaków i
  „ZBIERAJ JACKPOT" traciło ogon. Najdłuższy napis ma 15 znaków, dłuższe `zmieść()` skraca kropką.
- **Układ okna**: podpowiedź ma stałą wysokość, panel `flex: 1 1 0; min-width: 0`, stage `flex: 0 0 auto`.
  Wcześniej treść podpowiedzi sterowała szerokością panelu, a co za tym idzie wysokością płótna —
  przy pierwszym strzale stół zmieniał się z 245 × 571 na 175 × 408 i wracał po odpływie.
- **Telefon**: powtarzanie wyniku z matrycy pod stołem poszło w `display: none`, klapki i `strzał`
  zmieściły się w jednym rzędzie, `nowa`/`cisza` wskoczyły w róg nad odpływem. Płótno 194 × 452 →
  **256 × 596**, czyli pixel-perfect.
- **Geometria wejścia z toru**: przegroda pasów stała w korytarzu, którym kula wlatuje z wyrzutnika
  (`y ≈ 62`) i oddawała ją z powrotem na prawą burtę — cała partia toczyła się połową stołu. Pasy na
  `y = 84`, kupki na `y = 112`, róg `(206,44) → (248,78)`. Wynik pełnego wciśnięcia: 0 → 2350 punków,
  plus test pilnujący, że kula bywa w lewej połowie.
- Migracja `013_pinball.sql`: odłada ikonę do już istniejącego foldera „Gry" w **pierwszym wolnym**
  slocie (licznikowy slots % 4 z `012` kolidował, gdy folder był już pełniejszy) i nie ożywia foldera
  skasowanego przez użytkownika.
- Testy: 829 (backend 188, frontend 641; w tym 153 pinball). `npm run lint` czysto, build przechodzi.

## 2026-11-10 — bilard: stół ma być największy na ekranie

Mechanika była dobra, a gra maleńka: pasek sterowania zjadał na telefonie ~300 z 844 pikseli,
a kamera układała kadr pod okno, którego nikt nie miał.

- **Pasek dwupoziomowy** (`ControlStrip.tsx`): zostaje `Celowanie`, suwak siły, trzy kropki i
  `Uderz`; `Widok`, presety kamery, `Uderzenie`, `Dystans`, `Nowy bilard` i zdanie-podpowiedź
  schodzą do panelu `position: fixed` za kropkami (ten sam gest co menu wierszy, z tłem
  zamykającym). `Nowy bilard` zniknął znad liczników. Zdanie zmienia się razem z widełkami, więc w
  panelu czyta się to, czego się właśnie używa.
- **Telefon**: plansza 2D z ~200 px do **617 px** (stół obraca się wzdłuż pionu na `Auto`),
  płótno 3D z ~350 px do **610 px**, liczniki w jednym 15-pikselowym rzędzie, `hint` gier
  ukryty poniżej 760 px.
- **Kadr liczony z rogów stołu** (`fitFor` + `project` w czystym `camera.ts`, ten sam rzut co
  three.js): bisekcja cofa oko, aż najgorszy róg zmieści się z zapasem. Bez stałej zależnej od
  okna — monitor 1.7×, telefon 2.5×, obrót telefonu nic nie wycina. `fitFor` dostaje **funkcję**
  kadru: każda poza cofa się po swojemu, a dopasowanie czyjejś drogi cofania dawało stół
  wystający za ramę.
- **Pionowy ekran patrzy z góry** (`looksLengthwise`): szeroki stół w wąskim kadrze był znaczkiem
  w niebie; z tyłu i z góry (~60°) długi bok idzie w górę ekranu — **55%×21% → 81%×63%** płótna.
  Kadr z ręki zostaje nietknięty: jego dystans wybiera gracz.
- Testy: 667 (backend 184, frontend 488). Nowe: każdy róg stołu w kadrze dla sześciu proporcji
  okna i dla presetów, nienaruszalność kadru z ręki, panel zamknięty domyślnie (sterowanie strzału
  musi być pod ręką) i zamykany tłem, stromy kadr telefonu.

## 2026-11-10 — bilard: swobodny widok i kij, który słucha palca

Telefon pokazał, co nie gra: palec na stole celuje tam, gdzie przykrywa je opuszka, a kamera
robi co chce. Doszedł **Widok** jako trzecia, niezależna widełka sterowania.

- **`Widok: Auto | Swobodny | Własny`** (`controls.ts`, `ControlStrip.tsx`). W `Swobodnym` ekran
  należy do palca — obraca kadr i przybliża — a **celowanie śpi**: kij i przymiar znikają, „Uderz"
  jest zablokowany (`aimingActive`). Tapnięcie w celowanie nie wyrzuca ustawionego kadru
  (`afterAimTap`): kadr zostaje jako `Własny`, wraca tylko kij. W 3D presety `Za kulą / Z góry /
  Z boku` przeniosły się do tego samego paska i znikają na czas ustawiania widoku.
- **Kij rusza się płynnie** (`dragEffect`): od teraz oba tryby celowania czytają ten sam gest —
  w bok kręci, do gracza nabiera siły — różni się tylko to, co idzie za palcem (kij albo cały
  świat). Dawniej pociągnięcie zaginało wyłącznie siłę i liczyło ją od przebytej drogi, więc na
  telefonie nie dało się naprowadzać kija.
- **Kadr 2D liczony z obrotu** (`turnedBox`, `screenToTable`): `viewBox` to pudełko stołu po
  obrocie, więc stół wypełnia okno pod każdym kątem (na telefonie pionowym — długą krawędzią
  ekranu), a palec wraca na stół przez odwrotność przekształcenia. Naprawione po drodze: bez
  centrującego `translate` prosto ustawiony stół stał **poza własnym kadrem** — widać to było
  dopiero na zrzucie z telefonu, testy przeszły.
- **Kamera 3D ma trzy źródła** (`cameraFor(mode, cue, pose)`): kadr gracza (yaw, pochylenie,
  dystans — trzyma słowo), sam yaw, gdy gracz obraca stół, albo automat `za kulą`. Presety `z góry`
  i `z boku` nie dają się przestawiać; `FreePose` jest w czystym `camera.ts`, więc da się policzyć
  bez WebGL.
- **Telefon**: `Siła` i `Dystans` w jednym rzędzie, podpowiedź 3D schowana (jest w pasku), guziki
  40 px, „Uderz" na cały pas.
- Testy: 666 (backend 184, frontend 482), lint czysty. Nowe: gest w bok/do siebie, budzenie
  celowania, pudełko po obrocie, palec na stole przez obrócony i przybliżony kadr, pochylenie i
  dystans kamery, presets znikające przy swobodnym widoku.

## 2026-11-10 — bilard: własne sterowanie (kij albo obracany stół)

Do obu bilardów wszedł pasek przełączników: czym celujemy i co odpala uderzenie.

- **`games/billiards/controls.ts`** (czyste funkcje + testy): `AimMode` (`cue` | `table`),
  `Trigger` (`pull` | `button`), `dragEffect()`, `strikesOnRelease()`, `viewRotation()`, `fitScale()`
  oraz `loadControls()`/`saveControls()` na jednym kluczu `localStorage`. Odczyt i zapis są w
  `try/catch` — tryb prywatny nie ma prawa wywrócić gry, po prostu zacznie od domyślnych.
- **`ControlStrip.tsx`** wspólny dla 2D i 3D: `Celowanie [Kij][Stół]`, `Uderzenie
  [Pociągnięcie][Guzik]`, jedno zdanie podpowiedzi i guzik **Uderz** (ten sam w obu grach,
  `aria-pressed` na przełącznikach, na telefonie guziki 40 px a „Uderz" na cały pas).
- **Tryb „stół" w 2D**: grupa stołu obraca się wokół środka, a `viewBox` zmienia się na pionowy,
  więc cały stół zostaje w kadrze (`fitScale` liczy skalę z obrotu). Teksty rysowane poza grupą
  (biała w łuzie, koniec gry) liczą swoje środki od aktualnego kadru.
- **Tryb „stół" w 3D**: `cameraFor(mode, cue, orbit)` — tylko „za kulą" słucha obrotu, `top` i `side`
  zostają jak były. Kamera patrzy kawałek w stronę środka sukna, inaczej rack wypada z kadru.
  Orbit bierze się z przeciągnięcia, nigdy z kursora — dawniej kamera goniła mysz i stół wirował.
- **Siła w pikselach ekranu** (`dragEffect`): dawniej 2D liczył ją w jednostkach stołu, a 3D własnym
  wzorem, więc ten sam gest na telefonie znaczył co innego. Teraz 12 px to drgnienie, 212 px pełna.
- **Naprawione przy okazji**: w 3D przymiar bywało lustrzanym odbiciem strzału — kąt liczony z rzutu
  ekranowego szedł prosto do `strike()`, która myśli jednostkami stołu. Jeden kąt, te same jednostki.
- Testy: 648 (backend 184, frontend 464), lint czysty. Nowe: parsowanie ustawień, `dragEffect` w obu
  trybach, zapamiętywanie wyboru, „guzik nie uderza po puszczeniu", obrót stołu w 2D i w kamerze 3D.

## 2026-11-10 — folder z gierkami (7)

Siedem krótkich gierek w jednym folderze na pulpicie: Wężyk, Tetris, Bąbelki (bubble shooter), 2048,
Saper, Pamięć, Kółko i krzyżyk. Frontend tylko — bez tabel, endpointów i synchronizacji.

- **`frontend/src/apps/games/<gra>/`**: logika w czystych funkcjach (`snake.ts`, `tetris.ts`,
  `bubbles.ts`, `twentyforty.ts`, `mines.ts`, `memory.ts`, `tictactoe.ts`) + widok + test logiki
  i test klikania. Losowanie wchodzi z zewnątrz jako `Rng` (`shared/random.ts`, mulberry32), więc
  test odtwarza konkretną partię zamiast modlić się o szczęście.
- **`shared/Pad.tsx`**: krzyż kierunków (`onPointerDown`, nie `onClick` — przytrzymanie ma działać)
  i `useSwipe` (24 px progu, gest bez początku ignorowany). Klawiatura podsłuchuje tylko planszę
  (`tabIndex` na planszy), więc inne okna nie gubią klawiszy.
- **Plansze z CSS Grid i SVG** (`viewBox`), nie z canvasu: test widzi to samo co gracz, a plansza
  skaluje się do okna zamiast przewijać. Bąbelki rysują linię celowania z tej samej symulacji, z której
  leci strzał (`aimPath`), więc celownik nie kłamie.
- **Saper**: miny rozkładane po pierwszym kliknięciu, poza nim i jego sąsiedztwem; flaga prawym
  przyciskiem albo trybem „Flaga" (telefon). **Kółko i krzyżyk**: łatwy (losuje, wygrywa jeśli może)
  i trudny (minimax).
- **`shared/manifest.js`**: `GAMES`, `GAMES_FOLDER = 'Gry'`, `isGame()`; `APPS` zawiera je wszystkie,
  więc rejestr, szuflada aplikacji i walidacja ikon działają bez zmian. `seedUser` odkłada gry do
  foldera i **nie** wkłada ich na dock/launcher. Migracja `011_games.sql` dokłada folder „Gry"
  (w wolnym wierszu pod ostatnią rzeczą na pulpicie) i siedem ikon pod nim; oba wstawki pilnują
  `NOT EXISTS`, więc powtórka nic nie mnoży.
- Błędy złapane po drodze: minimax bez negacji na rekurencji (komputer maksimalizował wynik przeciwnika),
  `fits()` w tetrisie zaglądało w `board.board`, para w pamięci nie zwalniała ręki po dopasowaniu,
  numery wierszy migracji w `db.test.js` wypisane ręcznie.
- Testy: 580 (backend 180, frontend 400 → +80), lint czysty, build 263 kB / 85 kB gzip.


## 2026-11-10 — wersja na telefon

Ten sam kod, inne ułożenie: poniżej 760 px shell przestaje udawać desktop (`shell/viewport.ts`,
`usePhone()`), zamiast drugiej aplikacji w kodzie.

- **Ikony**: `IconGrid` tryb `flow` — kolejność czytania zamiast zapisanych komórek (kolumna ósma
  nie istnieje na ekranie, w którym są cztery), przeciąganie wyłączone, jedno tapnięcie otwiera.
  Siatka `auto-fill minmax(80px, 1fr)`.
- **Okna**: na telefonie renderowana jest tylko aplikacja na wierzchu (`Shell`), jako arkusz od
  górnego paska do dolnego; w nagłówku „Wróć do pulpitu" (`goHome()` — nic się nie zamyka, aplikacje
  czekają w tle) i „Zamknij". Brak przeciągania i brak kolorowych kółek.
- **Pasek na dole** (`Dock` → `PhoneBar`): Pulpit + ulubione (ikona, nazwa, znak nieprzeczytanych)
  + „Wszystkie aplikacje". Szuflada z listą to teraz osobny `AppDrawer` + `drawerStore`, z którego
  korzystają i launcher, i telefon.
- **Launcher**: na telefonie nie istnieje; tworzenie rzeczy dostaje wiersz przycisków na pulpicie,
  bo nie ma prawego przycisku myszy (długie przytrzymanie ikony dalej otwiera jej menu).
- **Reszta**: `dvh` zamiast `%` (pasek adresu), `viewport-fit=cover` + `env(safe-area-inset-bottom)`,
  `--launcher-w: 0`, `--dock-band: 64`, `--topbar-h: 40`, pola tekstu 16 px (Safari nie przybliża),
  zegar w górnym pasku znika (telefon ma swój), chip przy wiadomości widoczny stale przy `hover: none`,
  klawiatura kalkulatora i karteczki większe, notatnik i pliki układają się w jednej kolumnie.
- Testy: frontend 320 (+13: `viewport`, `goHome`, osiem scenariuszy telefonu w `Shell`),
  helper `test/viewport.ts` (fałszywy `matchMedia`, który reaguje na zmianę szerokości).

## 2026-11-10 — „wylałem zdjęcie, a pojawiła się miniatura poprzedniego"

Nie zniknęło nic po stronie danych: to przeglądarka pokazała stary obraz z własnej pamięci.

- **Przyczyna**: `message_attachments.id` (i `files.id`) były zwykłym `INTEGER PRIMARY KEY`, czyli
  rowidem. Po skasowaniu najnowszego wiersza numer wraca do obiegu i trafia do następnego zdjęcia,
  a `/api/chat/attachments/:id` jest cache'owany (`private, max-age=86400`; pliki: `public`, rok).
  Ten sam adres = stary obraz. Backend odpowiadał poprawnie — cache siedzi przed nim.
- **`010_no_reused_ids.sql`**: odbudowa `files` i `message_attachments` z `AUTOINCREMENT`
  (numery never reused), liczniki +100 za ewentualne skasowane wcześniej wyższe numery. Migracja
  przećwiczona na kopii produkcyjnej przed wdrożeniem.
- **`attachmentUrl(id, created_at)`** → `?v=<created_at>`: adres zdjęcia różni się między wrzuceniami,
  więc cache'y z czasów przed migracją przestają dokuczać od razu.
- **Miniatury przed wysłaniem**: adres obiektu robiony raz na plik w `useEffect` i `revokeObjectURL`
  przy usuwieniu; każda miniatura ma własny klucz (nie indeks). Wcześniej każdy render (a leci z co
  3 s z odpytywaniem) tworzył nowy adres obiektu — migotanie i wyciek.
- Testy: backend 176 (+3: numer nigdy nie wraca, odbudowa tabel bez straty wierszy, lista migracji),
  frontend 307 (+3: kursor za emotikonką, miniatura trzyma swój adres, tylko zdjęte znika).

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
