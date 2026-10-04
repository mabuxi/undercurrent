import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const mock = process.argv.includes('--mock') || process.env.MOCK === '1';
// Your data (database, settings, history, logs) lives outside the code: the Mac app keeps it in
// ~/Library/Application Support/Undercurrent, so updating or re-downloading the code never touches it.
const dataDir = process.env.UC_DATA_DIR || path.join(root, 'data');
let version = '0.0.0';
try { version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version || version; } catch {}

export const config = {
  root,
  dataDir,
  version,
  // Started from the Mac app: quitting the app also quits the local models, even when Ollama was already running.
  app: process.env.UC_APP === '1',
  quitOllama: process.env.UC_QUIT_OLLAMA === '1' || process.env.UC_APP === '1',
  port: Number(process.env.PORT || 4317),
  // Bind to the local network by default so the UI can be opened from another
  // device on the same network. Set HOST=127.0.0.1 to keep the server local-only.
  host: process.env.HOST || '0.0.0.0',
  dbPath: process.env.DB_PATH || path.join(dataDir, mock ? 'mock.db' : 'undercurrent.db'),
  webDist: path.join(root, 'web', 'dist'),
  mock,
  ollamaUrl: (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
  defaultModel: process.env.OLLAMA_MODEL || 'orcarouter/Qwen3.8-27B-Uncensored:q4_K_M',
  userAgent: process.env.USER_AGENT || `desktop:undercurrent:v${version} (personal use)`,
  ingestIntervalMin: Number(process.env.INGEST_INTERVAL_MIN || 20),
  taggerEnabled: process.env.TAGGER !== 'off'
};
