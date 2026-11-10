# note

Pulpit w przeglądarce — i wersja na telefon (jedna aplikacja na ekranie, pasek na dole):
okna, dock, launcher, kalkulator, notatnik z zakładkami, karteczki,
pliki (drag & drop do zasobów, współdzielonych z innymi kontami) oraz czaty — rozmowy z innymi
kontami, ze zmianą wiadomości przez 5 minut, ze zdjęciami i emotikonkami.
Konta z własną przestrzenią: każdy widzi tylko swoje notatki, karteczki, pliki i układ pulpitu.
Backend Node + SQLite w pliku, jeden proces, jeden port.

## Jak to działa

```
przeglądarka
   └── nginx (note.wincyj.pl, HTTPS) ───────┐
          backend (Express, 127.0.0.1:8120) │
              ├── /api/auth/* → sesja       │
              ├── /api/*      → repos → SQLite  data/note.db  (plik w folderze aplikacji)
              ├── /api/chat/* → rozmowy, wiadomości i zdjęcia (API ankiety, bez gniazd)
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

Akcje wiersza — „Popraw", „Usuń", „Udostępnij" — chowają się pod **trzema kropkami** po prawej stronie
wiersza: wspólny `frontend/src/shared/RowMenu.tsx`, więc w pliku, karteczce, wiadomości i zasobie gest
jest ten sam. Na wierzchu zostaje tworzenie („Nowa notatka", „Dodaj zasób", „Nowy czat") i kolory
karteczek, czyli to, co wybiera się często.

## Telefon

Poniżej 760 px (`shell/viewport.ts`) to samo środowisko układa się inaczej, bez drugiego
rozkładu kodu:

- **ikony w kolejności czytania** — zapisane pozycje opisują pulpit kilka razy szerszy niż telefon,
  więc na telefonie są przepływowe (te same ikony, ten sam porządek, przeciąganie wyłączone,
  jedno tapnięcie otwiera);
- **aplikacja na cały ekran** — na wierzchu jest tylko ta otwarta, pozostałe czekają w tle
  (kropka na pasku), w nagłówku zamiast trzech kółek: „Wróć do pulpitu" i „Zamknij";
- **pasek na dole**: Pulpit, ulubione aplikacje i „Wszystkie" (szuflada z listą wszystkiego, ta
  sama co w launcherze); launchera po lewej nie ma w ogóle;
- **pulpit ma wiersz działań** („Nowa notatka", „Nowa karteczka", „Nowy folder", „Wszystkie
  aplikacje"), bo prawy przycisk myszy na telefonie nie istnieje;
- wysokość liczona w `dvh` (pasek adresu przeglądarki), `viewport-fit=cover` + `env(safe-area-inset-*)`,
  pola tekstu 16 px (inaczej Safari przybliża przy pisaniu), cele dotyku ≥ 40 px, a tam, gdzie
  coś pojawiało się po najechaniu — widać to stale przy `hover: none`.

## Zależności idą w jednym kierunku: `http → repos → domain`, `shell → registry → apps → shared`.
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
npm test                  # backend (173) + frontend (303)
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
| POST/PATCH/DELETE | `/api/notes[/:id]` | zapis notatki (nadpisuje bieżącą wersję — historii nie ma) |
| GET/PUT | `/api/session/notepad` | otwarte zakładki i aktywna notatka |
| GET/POST/PATCH/DELETE | `/api/stickies[/:id]` | karteczki, `?pinned=true`, `q`, `sort` |
| GET/POST/PATCH/DELETE | `/api/desktop/items[/:id]` | ikony i foldery wraz z pozycjami w siatce |
| GET/PUT | `/api/desktop/favorites` | co stoi w doku i w launcherze |
| GET | `/api/chat/people` | do kogo można napisać |
| GET | `/api/chat/unread` | ile czeka we wszystkich rozmowach (znak na ikonie) |
| GET/POST | `/api/chat/conversations` | moje rozmowy / otwarcie rozmowy 1:1 z `{ user_id }` |
| POST | `/api/chat/conversations/group` | `{ title?, member_ids[] }` — rozmowa z kilkoma osobami |
| GET | `/api/chat/conversations/:id` | rozmowa razem z listą członków |
| POST | `/api/chat/conversations/:id/members` | `{ user_id }` — dopisanie osoby do grupy |
| GET | `/api/chat/conversations/:id/messages?since=` | wiadomości (od najstarszej; `since` = wszystko, co zmieniło się od tamtej chwili: nowe, poprawione, usunięte) |
| POST | `/api/chat/conversations/:id/attachments` | wrzucenie zdjęcia do rozmowy — ciało to surowe bajty, nazwa w `?name=` |
| GET | `/api/chat/attachments/:id?v=` | pobranie zdjęcia (tylko dla osób z rozmowy); `v` to moment wrzucenia — adres nie może dwóch zdjęć znaczyć |
| POST | `/api/chat/conversations/:id/messages` | `{ body, attachment_ids? }` — zapisanie wiadomości (tekst, zdjęcia albo jedno i drugie) |
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

Rozmowa może być **jeden-na-jeden albo z kilkoma osobami**. Para 1:1 ma jeden wątek (unikalny klucz
`pair_key`), więc kliknięcie „nowy czat" dwa razy nie rozdwaja rozmowy. Grupa `pair_key` nie ma —
dzięki temu dwie osoby mogą mieć i swój osobny wątek, i grupę o czymś innym; grupę widać po nazwie
(brak nazwy = lista osób w środku) i można do niej dopisywać kolejne osoby. W drugą stronę się nie da:
rozmowy dwie-osoby nie da się „rozrostem" zamienić w grupę, bo jej klucz nadal twierdziłby, że to para.

**Każda zmiana dociera do drugiego okna.** Odpytywanie pyta „co się zmieniło od chwili X", a nie „co jest
nowsze niż wiadomość 12": wraca więc to, że ktoś **poprawił** swoją wcześniejszą wiadomość i to, że ją
**usunął**. Usunięcie zostawia w bazie nagrobek (`deleted_at`, pusta treść), a rozmówca widzi
“wiadomość usunięta" — inaczej nie miałby jak się dowiedzieć, że czegoś już nie ma.

**Znak na ikonie czatu** liczy nieprzeczytane we wszystkich rozmowach (`GET /api/chat/unread`) i zapala
się na ikonie w doku, na launcherze i na pulpicie, nawet przy zamkniętym oknie czatu — pulpit pyta co
5 s, dopóki karta jest widoczna. Otwarcie rozmowy zeruje licznik po stronie serwera.

**Emotikonki i zdjęcia — żeby miało życie.** W polu pisania jest uśmieszek (panel z grupami: buzie,
gesty, serca, zwierzęta, jedzenie, świat) i spinacz. Emotikonka to zwykły znak: wstawia się w miejscu
kursora i jedzie w treści wiadomości jak każda inna litera, nic osobnego nie leży w bazie. Zdjęcie robi
dwie rzeczy: najpierw leci jako surowe bajty do rozmowy (`POST .../attachments`), a potem wiadomość
wymienia jego identyfikator (`attachment_ids`) — dlatego **wiadomość może być samym zdjęciem**, a
pasek boczny pokazuje wtedy „zdjęcie". Pliki należą do **rozmowy**, nie do osoby, więc zostają, kiedy
konto wysyłającego zniknie; usunięcie wiadomości usuwa jej zdjęcia, a `prune` zamiata te wrzucone i
nigdy niewysłane (po 24 h). Czat to nie dysk: tylko `.png`, `.jpg`, `.gif`, `.webp`, do
`CHAT_ATTACHMENT_MAX_MB` (8) każde i do 4 na wiadomość — a pole pisania odrzuca za duży plik, zanim
wogóle wyruszy z przeglądarki. Kliknięcie zdjęcia powiększa je w tym samym oknie.

**Wiadomość można zmienić przez 5 minut od jej napisania** (`MESSAGE_EDIT_MINUTES`). Okno liczy się od
chwili wysłania, więc poprawka w czwartej minucie nie dokłada kolejnych pięciu. Po upływie czasu
serwer odpowiada `403 edit_window_closed`; interfejs pokazuje przycisk „Popraw" tylko dopóki czas nie
minął. Akcje wiadomości — podobnie jak gdzie indziej — siedzą pod trzema kropkami obok bańki;
pojawiają się, gdy najedzie się na wiadomość, a licznik czasu widać cały czas. Usunąć własną wiadomość
można zawsze.

Wiadomości układają się w **bańki**: swoje są niebieskie, obce szare, awatar z pierwszą literą nicku
koloruje się na stałe po nicku. Następujące jedna po drugiej wiadomości tej samej osoby spinają się w
blok — imię i godzina są przy pierwszej, przy następnych tylko bańka (przerwa dłuższa niż 5 minut
otwiera nowy blok). Na wąskim oknie lista rozmów chowa się za przyciskiem „Rozmowy".

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

## Gry

Siedem krótkich gierek mieszka w folderze **Gry** na pulpicie: Wężyk, Tetris, Bąbelki, 2048,
Saper, Pamięć i Kółko i krzyżyk.

```
frontend/src/apps/games/<gra>/
   ├── <gra>.ts          czyste funkcje: plansza, ruch, koniec gry (bez Reacta)
   ├── <gra>.test.ts     logika na sztywno, z ziarnem losowości podanym z zewnątrz
   ├── <Gra>App.tsx      widok: plansza, wynik, sterowanie
   └── <Gra>App.module.css
```

- **Nic nie idzie do bazy.** Runda żyje w oknie i tyle — brak tabel, endpointów i rzeczy,
  które można by zepsuć albo zgubić. `shared/manifest.js` zna je tylko po to, żeby istniały
  jako aplikacje i ikony.
- **Losowanie z zewnątrz.** Każda gra dostaje `Rng` (`shared/random.ts`, mulberry32), więc test
  odtwarza dokładnie tę partię, a nie „jakoś tak wyszło".
- **Sterowanie pod klawiaturą i pod palcem.** Kierunki: strzałki oraz krzyż pod planszą (`shared/Pad.tsx`),
  w 2048 i wężyku dodatkowo swipe. Bąbelki celują kursorem lub palcem i strzelają puszczeniem.
  Klawisze słucha tylko plansza (ma `tabIndex`), więc nie podsłuchuje innych okien.
- **Skala, nie przewijanie.** Plansze rysują się na CSS Grid i SVG z `viewBox`, więc mieszczą się
  w oknie o każdej szerokości — na telefonie też, bez suwaków.
- Saper pierwszego kliknięcia nie zabija: miny są rozkładane dopiero po nim, poza klikniętym polem
  i jego sąsiedztwem. Kółko i krzyżyk ma przeciwnika „łatwy" (losuje, wygrywa jeśli może) i „trudny"
  (minimax, nie do pokonania — najwyższy wynik to remis).

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

1. wpis w `shared/manifest.js` (`APPS`; gra additionally w `GAMES`, wtedy ląduje w folderze „Gry"
   zamiast na pulpicie i paskach),
2. folder `frontend/src/apps/<id>/` z komponentem i własnym `*.test.tsx`,
3. jedna linia w `APP_VIEWS` (i jedna w ikonie) w `frontend/src/shell/registry.tsx`,
4. migracja dokładająca ikonę na **istniejące** pulpity — inaczej nikt, kto już sobie poukładał
   pulpit, nie miałby czym otworzyć nowej aplikacji (patrz `004_files_icon.sql`, a dla gierek
   `011_games.sql`, które dokładają cały folder).

Ikona wskazująca na usuniętą aplikację nie wywali pulpitu — dostajesz okno z komunikatem.

## Wdrożenie

`deploy/` zawiera jednostkę systemd, vhost nginx i `install.sh`. Podstawowe hasło nginxa
zostało wyłączone razem z wprowadzeniem kont — bramką jest teraz ekran logowania.
Patrz `deploy/README.md`.
