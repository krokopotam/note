# Wdrożenie note.wincyj.pl

Serwer: `10.8.0.1` (`ssh ubuntu@10.8.0.1`), aplikacja w `/home/ubuntu/src/note`,
backend na `127.0.0.1:8120`, nginx + certyfikat letsencrypt.

**Konta pilnuje aplikacja**, nie nginx: każdy, kto wejdzie na `https://note.wincyj.pl`,
może założyć konto (login + hasło dwa razy). Podstawowe hasło nginx-a, które tu było
wcześniej (`test` / `milka`), zostało wyłączone — stałoby przed ekranem logowania i
odcinałoby nowych użytkowników od rejestracji. Plik `/etc/nginx/note.wincyj.pl.htpasswd`
pozostał na dysku, ale nic go już nie używa.

## Kiedy VPN stoi

`10.8.0.1` jest za WireGuardem. Ten sam serwer słucha SSH na publicznym adresie, więc
można podmienić hosta: `HOST_SSH=ubuntu@57.129.68.45 ./deploy/push.sh`.

## Wymagania po stronie serwera

Node **22.5+** (backend używa `better-sqlite3`, który dobiera sobie binarium pod wersję Node).
Jeśli go nie ma:

```bash
./deploy/install-node.sh      # oficjalna paczka do /usr/local, niczego nie nadpisuje
```

## Pierwszy raz

```bash
# na swoim komputerze (testy, build, wysyłka, instalacja serwisu i vhosta HTTP)
./deploy/push.sh

# na serwerze — certyfikat
sudo certbot certonly --webroot -w /var/www/html -d note.wincyj.pl -n

# na serwerze — HTTPS + vhost
/home/ubuntu/src/note/deploy/install-https.sh

# na serwerze — przejęcie danych, które powstały przed kontami
npm run cli -- set-password wincyj <hasło>
```

Migracja `002_users.sql` przy pierwszym starcie tworzy tabele `users` i `sessions` oraz
przypisuje wszystkie istniejące wcześniejsze dane do konta `wincyj` (zablokowanego, aż
ktoś ustawi mu hasło przez `npm run cli`). Nic nie jest usuwane ani przenoszone inaczej.

## Kolejne wersje

```bash
./deploy/push.sh                       # to samo: testy → build → rsync → restart serwisu
ssh ubuntu@10.8.0.1 'sudo systemctl restart note.wincyj.pl.service'   # tylko restart
```

`rsync --delete` **nie** dotyka `data/` ani `node_modules` po stronie serwera — pliki
wykluczone są chronione przed usunięciem. Baza (`data/note.db`) przeżywa każde wdrożenie.

## Co jest gdzie

| Rzecz | Ścieżka |
|---|---|
| aplikacja | `/home/ubuntu/src/note` |
| baza SQLite | `/home/ubuntu/src/note/data/note.db` |
| serwis | `/etc/systemd/system/note.wincyj.pl.service` |
| zmienne środowiskowe | `/etc/default/note.wincyj.pl` |
| logi aplikacji | `/var/log/note/app.log` |
| vhost nginx | `/etc/nginx/sites-available/note.wincyj.pl` |
| konta i sesje | tabele `users` / `sessions` w `data/note.db` |

## Diagnostyka

```bash
ssh ubuntu@10.8.0.1
sudo systemctl status note.wincyj.pl.service
tail -50 /var/log/note/app.log
sudo tail -50 /var/log/nginx/note.error.log
curl -s http://127.0.0.1:8120/api/health     # pomijając nginx
sudo nginx -t

# w awaryjnym razie: konto do logowania
npm run cli -- list
npm run cli -- set-password ala <hasło>
npm run cli -- remove ala        # usunięcie konta razem z jego danymi
```

Test przez curl wymaga ciasteczka: `curl -c /tmp/jar -X POST -H 'Content-Type: application/json' -d '{"username":"ala","password":"..."}' https://note.wincyj.pl/api/auth/login`,
potem `curl -b /tmp/jar https://note.wincyj.pl/api/notes`.

## Kopia zapasowa bazy

Baza jest jednym plikiem, więc kopią jest jego skopiowanie. Żeby nie ściąć połowy
wpisów żyjących w WAL, zrzut robi się przez SQLite (CLI nie jest potrzebne — używamy
modułu, który i tak ma aplikacja):

```bash
ssh ubuntu@10.8.0.1 'cd /home/ubuntu/src/note && node -e "
  const db = require(\"better-sqlite3\")(\"data/note.db\");
  db.backup(\"/home/ubuntu/note-backup.db\").then(() => console.log(\"zrobione\"));
"'
```

## Co zmienia na serwerze

Wyłącznie własne pliki: nowa jednostka systemd, nowy `/etc/default/...`, nowy katalog logów,
nowy vhost. Wspólny `/etc/nginx/nginx.conf` ani cudze vhosty nie są ruszane.
`install.sh` dodatkowo sprawdza, czy port `8120` jest wolny, zanim cokolwiek zainstaluje.
