#!/bin/bash
# Installs (or reinstalls) Undercurrent on this Mac and opens it. Paste this in Terminal:
#   curl -fsSL https://raw.githubusercontent.com/mabuxi/undercurrent/main/install.sh | bash
# Nothing else is needed: Node.js is inside the app, and the app downloads Ollama and the AI models by itself.
# Your data in ~/Library/Application Support/Undercurrent is kept.
set -euo pipefail
REPO="mabuxi/undercurrent"
URL="https://github.com/$REPO/releases/latest/download/Undercurrent-mac.zip"

[ "$(uname -s)" = "Darwin" ] || { echo "Undercurrent is a Mac app."; exit 1; }
MAJOR="$(sw_vers -productVersion | cut -d. -f1)"
[ "$MAJOR" -ge 13 ] || { echo "Undercurrent needs macOS 13 (Ventura) or newer."; exit 1; }

DEST="/Applications"
[ -w "$DEST" ] || DEST="$HOME/Applications"
mkdir -p "$DEST"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading Undercurrent…"
curl -fL --progress-bar "$URL" -o "$TMP/Undercurrent-mac.zip"
ditto -x -k "$TMP/Undercurrent-mac.zip" "$TMP"
[ -d "$TMP/Undercurrent.app" ] || { echo "The download did not contain the app. Try again in a few minutes."; exit 1; }

if pgrep -x Undercurrent >/dev/null; then
  echo "Closing the running Undercurrent…"
  osascript -e 'quit app "Undercurrent"' >/dev/null 2>&1 || true
  for _ in $(seq 1 40); do pgrep -x Undercurrent >/dev/null || break; sleep 0.5; done
fi
rm -rf "$DEST/Undercurrent.app"
ditto "$TMP/Undercurrent.app" "$DEST/Undercurrent.app"
xattr -dr com.apple.quarantine "$DEST/Undercurrent.app" 2>/dev/null || true

VERSION="$(defaults read "$DEST/Undercurrent.app/Contents/Info" CFBundleShortVersionString 2>/dev/null || echo '')"
echo "Undercurrent ${VERSION} is in $DEST. Opening it…"
open "$DEST/Undercurrent.app"
