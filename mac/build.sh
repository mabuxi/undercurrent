#!/bin/bash
# Builds Undercurrent.app from this folder. With --install it also puts it in /Applications (or ~/Applications).
# The app points at the code folder it was built from; your data stays in ~/Library/Application Support/Undercurrent.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then for n in "$HOME"/.nvm/versions/node/*/bin/node /opt/homebrew/bin/node /usr/local/bin/node; do [ -x "$n" ] && NODE="$n"; done; fi
[ -n "$NODE" ] || { echo "Node.js not found. Install Node 22 or newer first."; exit 1; }
VERSION="$("$NODE" -p "require('$ROOT/package.json').version")"
OUT="$HERE/build/Undercurrent.app"

echo "Building Undercurrent ${VERSION}…"
rm -rf "$OUT"
mkdir -p "$OUT/Contents/MacOS" "$OUT/Contents/Resources"
xcrun swiftc -O -swift-version 5 -o "$OUT/Contents/MacOS/Undercurrent" "$HERE/Undercurrent/main.swift" -framework Cocoa -framework WebKit

# The icon, in every size macOS asks for.
ICONSET="$HERE/build/AppIcon.iconset"
rm -rf "$ICONSET" && mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$HERE/AppIcon.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$HERE/AppIcon.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$OUT/Contents/Resources/AppIcon.icns"

sed -e "s|__VERSION__|$VERSION|g" -e "s|__ROOT__|$ROOT|g" -e "s|__NODE__|$NODE|g" "$HERE/Info.plist" > "$OUT/Contents/Info.plist"
codesign --force --deep --sign - "$OUT" >/dev/null 2>&1 || true

# The web app and its packages, so the first start is quick.
if [ ! -d "$ROOT/node_modules" ]; then (cd "$ROOT" && "$(dirname "$NODE")/npm" install --no-audit --no-fund); fi
if [ ! -f "$ROOT/web/dist/index.html" ] || [ "${1:-}" = "--install" ]; then (cd "$ROOT" && PATH="$(dirname "$NODE"):$PATH" "$(dirname "$NODE")/npm" run build --silent); fi

if [ "${1:-}" = "--install" ]; then
  DEST="/Applications"
  [ -w "$DEST" ] || DEST="$HOME/Applications"
  mkdir -p "$DEST"
  rm -rf "$DEST/Undercurrent.app"
  ditto "$OUT" "$DEST/Undercurrent.app"
  echo "Installed in $DEST/Undercurrent.app"
else
  echo "Built $OUT"
fi
