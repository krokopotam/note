# Wdrożenie note.wincyj.pl

Serwer: `10.8.0.1` (`ssh ubuntu@10.8.0.1`), aplikacja w `/home/ubuntu/src/note`,
backend na `127.0.0.1:8120`, nginx + certyfikat letsencrypt, basic auth `test` / `milka`.

## Pierwszy raz

```bash
# na swoim komputerze (testy, build, wysyłka, instalacja serwisu i vhosta HTTP)
./deploy/push.sh

# na serwerze — certyfikat
sudo certbot certonly --webroot -w /var/www/html -d note.wincyj.pl -n

# na serwerze — HTTPS + basic auth
/home/ubuntu/src/note/deploy/install-https.sh
```

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
| hasło basic auth | `/etc/nginx/.htpasswd-test` |

## Diagnostyka

```bash
ssh ubuntu@10.8.0.1
sudo systemctl status note.wincyj.pl.service
tail -50 /var/log/note/app.log
sudo tail -50 /var/log/nginx/note.error.log
curl -s -u test:milka http://127.0.0.1:8120/api/health     # pomijając nginx
sudo nginx -t
```

## Kopia zapasowa bazy

Baza jest jednym plikiem, więc kopią jest jego skopiowanie (WAL dołączone):

```bash
ssh ubuntu@10.8.0.1 'sqlite3 /home/ubuntu/src/note/data/note.db ".backup /home/ubuntu/note-backup.db"'
```

## Co zmienia na serwerze

Wyłącznie własne pliki: nową jednostkę systemd, nowy `/etc/default/...`, nowy katalog logów,
nowy vhost i nowy plik htpasswd. Wspólny `/etc/nginx/nginx.conf` ani cudze vhosty nie są ruszane.
`install.sh` dodatkowo sprawdza, czy port `8120` jest wolny, zanim cokolwiek zainstaluje.
