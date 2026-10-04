#!/bin/bash
# Double-click to start Undercurrent without the Mac app (for development). It starts the local models (Ollama) with it, opens it in your browser,
# and stops everything again when you close this window or press Ctrl+C.
cd "$(dirname "$0")" || exit 1
if [ ! -d node_modules ]; then echo "Installing once…"; npm install || exit 1; fi
echo "Building the app…"
npm run build --silent >/dev/null 2>&1 || npm run build
echo "Starting Undercurrent. Close this window or press Ctrl+C to stop it and the local models."
(sleep 5; open "http://127.0.0.1:4317") &
exec node --env-file-if-exists=.env server/src/index.js
