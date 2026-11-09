#!/usr/bin/env bash
#
# Bramka wdrożenia — uruchomić NA SWOIM KOMPUTERZE.
# Testy + build + wysyłka na serwer + etap 1 instalacji.
#
# Zmienne: HOST_SSH (domyślnie ubuntu@10.8.0.1), DEST (domyślnie /home/ubuntu/src/note).
#
set -euo pipefail

HOST_SSH="${HOST_SSH:-ubuntu@10.8.0.1}"
DEST="${DEST:-/home/ubuntu/src/note}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== testy"
npm test

echo "== typy i build frontendu"
npm run lint --workspace frontend
npm run build

echo "== wysyłka plików (bez .git, node_modules i danych)"
ssh "$HOST_SSH" "mkdir -p $DEST"
rsync -az --delete --info=stats1 \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'data' \
  --exclude '*.db' \
  --exclude '*.db-shm' \
  --exclude '*.db-wal' \
  "$ROOT/" "$HOST_SSH:$DEST/"

echo "== etap 1 instalacji na serwerze"
ssh -t "$HOST_SSH" "cd $DEST && ./deploy/install.sh"
