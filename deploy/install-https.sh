#!/usr/bin/env bash
#
# Etap 2 wdrożenia note.wincyj.pl — HTTPS + basic auth.
# Uruchomić NA SERWERZE po wydaniu certyfikatu przez certbot.
#
set -euo pipefail

DOMAIN="note.wincyj.pl"
AUTH_USER="${AUTH_USER:-test}"
AUTH_PASS="${AUTH_PASS:-milka}"
HTPASSWD="/etc/nginx/.htpasswd-${AUTH_USER}"
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '\n== %s\n' "$*"; }
die() { printf '\nBŁĄD: %s\n' "$*" >&2; exit 1; }

[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ] || die \
  "brak certyfikatu /etc/letsencrypt/live/$DOMAIN — najpierw:
   sudo certbot certonly --webroot -w /var/www/html -d $DOMAIN -n"

log "użytkownik basic auth: $AUTH_USER (plik $HTPASSWD)"
if command -v htpasswd >/dev/null; then
  # -b: hasło z argumentu, -B: bcrypt (najmocniejszy wariant obsługiwany przez nginx)
  sudo htpasswd -B -b "$HTPASSWD" "$AUTH_USER" "$AUTH_PASS"
else
  # Fallback bez apache2-utils: hash APR1, też akceptowany przez nginx.
  HASH="$(openssl passwd -apr1 "$AUTH_PASS")"
  printf '%s:%s\n' "$AUTH_USER" "$HASH" | sudo tee "$HTPASSWD" >/dev/null
fi
sudo chmod 0640 "$HTPASSWD"
sudo chown root:www-data "$HTPASSWD" 2>/dev/null || sudo chown root "$HTPASSWD"

log "vhost HTTPS $DOMAIN (proxy na 127.0.0.1:8120 + basic auth)"
sudo install -m 0644 "$DEPLOY_DIR/nginx/$DOMAIN.conf" "/etc/nginx/sites-available/$DOMAIN"
sudo ln -sfn "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
sudo nginx -t
sudo systemctl reload nginx

log "sprawdzenie"
sleep 1
curl -ksS -o /dev/null -w "bez hasła:    %{http_code} (oczekiwane 401)\n" "https://$DOMAIN/" || true
curl -ksS -o /dev/null -w "z hasłem:     %{http_code} (oczekiwane 200)\n" \
  -u "$AUTH_USER:$AUTH_PASS" "https://$DOMAIN/" || true
curl -ksS -u "$AUTH_USER:$AUTH_PASS" "https://$DOMAIN/api/health" && echo

echo
echo "Wdrożenie zakończone: https://$DOMAIN (użytkownik $AUTH_USER)"
