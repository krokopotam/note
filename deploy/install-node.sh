#!/usr/bin/env bash
#
# Node 22 LTS na serwerze — oficjalna paczka do /usr/local.
#
# Bez repozytoriów firmowych i bez pakietów systemowych: istniejące aplikacje
# (Python, Java, Dockery) mają swój własny runtime i nic tu ich nie dotyczy.
# Skrypt jest idempotentny: druga konfiguracja nic nie zmienia.
#
set -euo pipefail

WANT_MAJOR=22
PREFIX_ROOT=/usr/local/lib/nodejs

log() { printf '\n== %s\n' "$*"; }
die() { printf '\nBŁĄD: %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null || die "brak curl"
command -v sudo >/dev/null || die "brak sudo"

case "$(dpkg --print-architecture 2>/dev/null || uname -m)" in
  amd64|x86_64) NODE_ARCH=x64 ;;
  arm64|aarch64) NODE_ARCH=arm64 ;;
  *) die "nieobsługiwana architektura: $(uname -m)" ;;
esac

if [ -z "${NODE_VERSION:-}" ]; then
  log "szukam najnowszego Node ${WANT_MAJOR}.x"
  NODE_VERSION="$(curl -fsS https://nodejs.org/dist/index.json \
    | grep -o "\"version\":\"v${WANT_MAJOR}[^\"]*\"" | head -1 | sed 's/.*v//; s/"//')"
  [ -n "$NODE_VERSION" ] || die "nie udało się ustalić wersji Node z nodejs.org"
fi

PREFIX="$PREFIX_ROOT/node-v${NODE_VERSION}-linux-${NODE_ARCH}"

if [ -x "$PREFIX/bin/node" ]; then
  log "Node ${NODE_VERSION} już zainstalowany"
else
  TARBALL="node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
  log "pobieram $TARBALL"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  curl -fsSL -o "$TMP/$TARBALL" "https://nodejs.org/dist/v${NODE_VERSION}/$TARBALL"

  log "rozpakowuję do $PREFIX_ROOT"
  sudo mkdir -p "$PREFIX_ROOT"
  sudo tar -xJf "$TMP/$TARBALL" -C "$PREFIX_ROOT"
fi

log "linki w /usr/local/bin"
for binary in node npm npx corepack; do
  [ -x "$PREFIX/bin/$binary" ] && sudo ln -sfn "$PREFIX/bin/$binary" "/usr/local/bin/$binary"
done

log "wersja"
/usr/local/bin/node -v
/usr/local/bin/npm -v

echo
echo "Node ${NODE_VERSION} gotowy (node, npm, npx w /usr/local/bin)."
