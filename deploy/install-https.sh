#!/usr/bin/env bash
#
# Etap 2 wdrożenia note.wincyj.pl — HTTPS.
# Uruchomić NA SERWERZE po wydaniu certyfikatu przez certbot.
#
# Świadomie bez basic auth: kont pilnuje sama aplikacja (logowanie/rejestracja +
# ciasteczko sesji). Hasło nginx-a stałoby przed ekranem logowania i odcinałoby
# nowych użytkowników od rejestracji.
#
set -euo pipefail

DOMAIN="note.wincyj.pl"
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '\n== %s\n' "$*"; }
die() { printf '\nBŁĄD: %s\n' "$*" >&2; exit 1; }

# /etc/letsencrypt jest tylko dla roota, więc sprawdzenie też musi iść przez sudo
sudo test -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" || die \
  "brak certyfikatu /etc/letsencrypt/live/$DOMAIN — najpierw:
   sudo certbot certonly --webroot -w /var/www/html -d $DOMAIN -n"

log "vhost HTTPS $DOMAIN (proxy na 127.0.0.1:8120, bez basic auth)"
sudo install -m 0644 "$DEPLOY_DIR/nginx/$DOMAIN.conf" "/etc/nginx/sites-available/$DOMAIN"
sudo ln -sfn "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
sudo nginx -t
sudo systemctl reload nginx

log "sprawdzenie"
sleep 1
curl -ksS -o /dev/null -w "strona (anonimowo): %{http_code} (oczekiwane 200)\n" "https://$DOMAIN/" || true
curl -ksS -o /dev/null -w "/api/notes:         %{http_code} (oczekiwane 401)\n" "https://$DOMAIN/api/notes" || true
curl -ksS "https://$DOMAIN/api/health" && echo
curl -ksS -X POST -H 'Content-Type: application/json' -d '{}' \
  -o /dev/null -w "/api/auth/login (puste zgłoszenie): %{http_code} (oczekiwane 400)\n" \
  "https://$DOMAIN/api/auth/login" || true

echo
echo "Wdrożenie zakończone: https://$DOMAIN — konta nadają się przez ekran logowania."
echo "Konto założone migracjnie (dawne dane): npm run cli -- set-password wincyj <hasło>"
