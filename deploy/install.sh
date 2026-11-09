#!/usr/bin/env bash
#
# Etap 1 wdrożenia note.wincyj.pl — uruchomić NA SERWERZE w folderze aplikacji.
#
# Robi tylko to, co potrzebne tej aplikacji: własne zależności, własny serwis
# systemd, własny plik środowiskowy, własny log i vhost HTTP pod ACME.
# Nic wspólnego (nginx.conf, cudze vhosty, cudze serwisy) nie jest ruszane.
#
set -euo pipefail

DOMAIN="note.wincyj.pl"
PORT="${PORT:-8120}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$APP_DIR/deploy"

log() { printf '\n== %s\n' "$*"; }
die() { printf '\nBŁĄD: %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null || die "brak node w PATH"
command -v npm >/dev/null || die "brak npm w PATH"
command -v curl >/dev/null || die "brak curl"
command -v sudo >/dev/null || die "brak sudo"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NODE_MINOR="$(node -p 'process.versions.node.split(".")[1]')"
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 5 ]; }; then
  die "wymagany Node >= 22.5, jest $(node -v)"
fi

NODE_BIN="$(command -v node)"
log "aplikacja: $APP_DIR"
log "node:      $NODE_BIN ($(node -v))"

if ss -ltn 'sport = :'"$PORT" | grep -q LISTEN; then
  die "port $PORT jest zajęty przez inny proces — ustaw inny PORT w /etc/default/$DOMAIN"
fi

log "zależności produkcyjne (backend + shared)"
npm ci --omit=dev

log "baza danych w folderze aplikacji"
mkdir -p "$APP_DIR/data"
ls -la "$APP_DIR/data"

log "katalog logów /var/log/note"
sudo install -d -o "$(id -un)" -g "$(id -gn)" /var/log/note

log "/etc/default/$DOMAIN"
sudo install -m 0644 "$DEPLOY_DIR/$DOMAIN.env" "/etc/default/$DOMAIN"

log "/etc/systemd/system/$DOMAIN.service"
sed -e "s|@NODE@|$NODE_BIN|" -e "s|@APP_DIR@|$APP_DIR|" "$DEPLOY_DIR/$DOMAIN.service" \
  | sudo tee "/etc/systemd/system/$DOMAIN.service" >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now "$DOMAIN.service"

sleep 1
curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null \
  || die "backend nie odpowiada na 127.0.0.1:$PORT — zobacz /var/log/note/app.log"
echo "health: OK"

log "vhost HTTP (potrzebny do wydania certyfikatu)"
sudo install -m 0644 "$DEPLOY_DIR/nginx/http-only.conf" "/etc/nginx/sites-available/$DOMAIN"
sudo ln -sfn "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
sudo nginx -t
sudo systemctl reload nginx

cat <<EOF

Etap 1 gotowy: aplikacja działa na 127.0.0.1:$PORT, vhost HTTP czeka na ACME.

Brakuje certyfikatu:

  sudo certbot certonly --webroot -w /var/www/html -d $DOMAIN -n

potem:

  $DEPLOY_DIR/install-https.sh
EOF
