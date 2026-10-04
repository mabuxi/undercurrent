#!/bin/bash
# Cuts a new version: npm run release -- 0.15.0
# 1. CHANGELOG.md must already have a "## 0.15.0 · date" section with the notes.
# 2. Sets the version in every package.json, commits, tags v0.15.0 with those notes and pushes both to GitHub.
# 3. GitHub Actions then builds the downloadable app and attaches it to a Release; every installed app offers the update.
set -euo pipefail
cd "$(dirname "$0")/.."
V="${1:-}"
[[ "$V" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Usage: npm run release -- 0.15.0"; exit 1; }
grep -q "^## $V" CHANGELOG.md || { echo "Add a '## $V · date' section to CHANGELOG.md first."; exit 1; }
git rev-parse "v$V" >/dev/null 2>&1 && { echo "v$V already exists."; exit 1; }
for f in package.json server/package.json web/package.json; do
  node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('$f'));p.version='$V';fs.writeFileSync('$f',JSON.stringify(p,null,2)+'\n')"
done
NOTES="$(awk -v v="$V" '$0 ~ "^## "v {on=1; next} /^## / {on=0} on' CHANGELOG.md)"
git add -A
git commit -m "Release v$V" -m "$NOTES" || true
git tag -a "v$V" -m "Undercurrent $V" -m "$NOTES"
git push origin main
git push origin "v$V"
echo "Released v$V. GitHub now builds the Mac app and publishes it on the Releases page (about ten minutes):"
echo "https://github.com/mabuxi/undercurrent/actions"
