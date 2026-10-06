#!/bin/bash
# Builds the downloadable Undercurrent.app: the app, its own Node.js (for Apple Silicon and Intel Macs) and the code,
# so nothing has to be installed first. Ollama and the AI models are downloaded by the app itself on the first start.
#
#   bash mac/package.sh            -> mac/dist/Undercurrent-mac.zip and mac/dist/Undercurrent.dmg
#   ARCHS=arm64 bash mac/package.sh  (only Apple Silicon, quicker for testing)
#
# Needs: macOS with Xcode or the Command Line Tools, Node.js and npm, and the packages installed (npm install).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
NODE_VERSION="${NODE_VERSION:-24.21.0}"
ARCHS="${ARCHS:-arm64 x86_64}"
NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then for n in "$HOME"/.nvm/versions/node/*/bin/node /opt/homebrew/bin/node /usr/local/bin/node; do [ -x "$n" ] && NODE="$n"; done; fi
[ -n "$NODE" ] || { echo "Node.js not found."; exit 1; }
export PATH="$(dirname "$NODE"):$PATH"
VERSION="$(node -p "require('$ROOT/package.json').version")"
WORK="$HERE/build/package"
CACHE="$HERE/build/cache"
DIST="$HERE/dist"
APP="$WORK/Undercurrent.app"
RES="$APP/Contents/Resources"

echo "Packaging Undercurrent ${VERSION} for: ${ARCHS}"
rm -rf "$WORK" "$DIST"
mkdir -p "$APP/Contents/MacOS" "$RES/app" "$RES/node" "$CACHE" "$DIST"

# 1. The web interface.
echo "- Building the interface"
(cd "$ROOT" && npm run build --silent)

# 2. The Mac app itself, for every chip.
echo "- Building the Mac app"
BINS=()
for a in $ARCHS; do
  xcrun swiftc -O -swift-version 5 -target "${a}-apple-macos13.0" -o "$WORK/Undercurrent-$a" "$HERE/Undercurrent/main.swift" -framework Cocoa -framework WebKit
  BINS+=("$WORK/Undercurrent-$a")
done
lipo -create "${BINS[@]}" -output "$APP/Contents/MacOS/Undercurrent"
rm -f "${BINS[@]}"

ICONSET="$WORK/AppIcon.iconset"
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$HERE/AppIcon.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$HERE/AppIcon.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$RES/AppIcon.icns"
rm -rf "$ICONSET"
# No code folder and no Node path: the downloaded app uses what is inside it.
sed -e "s|__VERSION__|$VERSION|g" -e "s|__ROOT__||g" -e "s|__NODE__||g" "$HERE/Info.plist" > "$APP/Contents/Info.plist"

# 3. The code: the server, the built interface and the change notes.
echo "- Copying the code"
mkdir -p "$RES/app/server" "$RES/app/web"
ditto "$ROOT/server/src" "$RES/app/server/src"
ditto "$ROOT/server/mock-media" "$RES/app/server/mock-media"
ditto "$ROOT/web/dist" "$RES/app/web/dist"
cp "$ROOT/CHANGELOG.md" "$ROOT/CHANGELOG.fr.md" "$RES/app/"
node -e "
const root = require('$ROOT/package.json'); const server = require('$ROOT/server/package.json');
const pkg = { name: 'undercurrent', private: true, version: root.version, type: 'module', repository: root.repository, dependencies: server.dependencies };
require('fs').writeFileSync('$RES/app/package.json', JSON.stringify(pkg, null, 2) + '\n');"

# 4. Only the packages the server needs. SQLite comes prebuilt for both chips with better-sqlite3, so nothing is compiled.
echo "- Installing the server packages"
(cd "$RES/app" && npm install --omit=dev --ignore-scripts --no-audit --no-fund --no-package-lock --loglevel=error)
B="$RES/app/node_modules/better-sqlite3"
rm -rf "$B/deps" "$B/src" "$B/binding.gyp" "$B/build"
find "$B/prebuilds" -type f ! -name 'darwin-*' -delete
for a in $ARCHS; do
  n="darwin-$([ "$a" = x86_64 ] && echo x64 || echo arm64).node"
  [ -f "$B/prebuilds/$n" ] || { echo "SQLite for $a is missing ($n)."; exit 1; }
done

# 5. Node.js itself, from nodejs.org, checked against its published checksums, joined into one file for both chips.
echo "- Adding Node.js ${NODE_VERSION}"
SUMS="$CACHE/SHASUMS256-$NODE_VERSION.txt"
[ -s "$SUMS" ] || curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" -o "$SUMS"
NODES=()
for a in $ARCHS; do
  na="$([ "$a" = x86_64 ] && echo x64 || echo arm64)"
  tgz="node-v$NODE_VERSION-darwin-$na.tar.gz"
  [ -s "$CACHE/$tgz" ] || curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/$tgz" -o "$CACHE/$tgz"
  want="$(grep " $tgz\$" "$SUMS" | cut -d' ' -f1)"
  have="$(shasum -a 256 "$CACHE/$tgz" | cut -d' ' -f1)"
  [ -n "$want" ] && [ "$want" = "$have" ] || { rm -f "$CACHE/$tgz"; echo "Node.js download for $na does not match its checksum."; exit 1; }
  tar -xzf "$CACHE/$tgz" -C "$WORK" "node-v$NODE_VERSION-darwin-$na/bin/node"
  NODES+=("$WORK/node-v$NODE_VERSION-darwin-$na/bin/node")
done
lipo -create "${NODES[@]}" -output "$RES/node/node"
chmod 755 "$RES/node/node"
rm -rf "$WORK"/node-v*

# 6. Signing (ad hoc: enough for macOS to run it; there is no paid Apple developer certificate).
echo "- Signing"
codesign --force --sign - "$RES/node/node"
find "$RES/app/node_modules" -name '*.node' -exec codesign --force --sign - {} \;
codesign --force --sign - "$APP"
codesign --verify --strict "$APP"
"$RES/node/node" -e "process.exit(0)"

# 7. The zip (for the updater and the installer) and the disk image (to drag into Applications).
echo "- Making the zip and the disk image"
ditto -c -k --keepParent "$APP" "$DIST/Undercurrent-mac.zip"
STAGE="$WORK/dmg"
mkdir -p "$STAGE"
ditto "$APP" "$STAGE/Undercurrent.app"
ln -s /Applications "$STAGE/Applications"
for i in 1 2 3; do
  hdiutil create -volname "Undercurrent" -srcfolder "$STAGE" -ov -format UDZO -fs HFS+ "$DIST/Undercurrent.dmg" >/dev/null && break
  echo "  disk image busy, trying again…"; sleep 3
done
[ -f "$DIST/Undercurrent.dmg" ] || { echo "The disk image could not be made."; exit 1; }
rm -rf "$STAGE"

echo "Done: $(du -h "$DIST/Undercurrent-mac.zip" | cut -f1) zip, $(du -h "$DIST/Undercurrent.dmg" | cut -f1) disk image in $DIST"
