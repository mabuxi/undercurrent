import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const mock = process.argv.includes('--mock') || process.env.MOCK === '1';
// Your data (database, settings, history, logs) lives outside the code: the Mac app keeps it in
// ~/Library/Application Support/Undercurrent, so updating or re-downloading the code never touches it.
const dataDir = process.env.UC_DATA_DIR || path.join(root, 'data');
// Profiles: each one is its own database in the data folder; profiles.json says which one is open.
export function readProfiles() {
  const file = path.join(dataDir, 'profiles.json');
  try {
    const p = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (p && Array.isArray(p.list) && p.list.length) return p;
  } catch {}
  return { active: 'main', list: [{ id: 'main', name: 'Main', file: 'undercurrent.db', color: '#E39A83', created: Date.now() }] };
}
const profiles = readProfiles();
const activeProfile = profiles.list.find((x) => x.id === profiles.active) || profiles.list[0];
let version = '0.0.0';
let repo = 'mabuxi/undercurrent';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  version = pkg.version || version;
  const url = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const m = String(url || '').match(/github\.com[/:]([^/]+\/[^/.]+)/);
  if (m) repo = m[1];
} catch {}

export const config = {
  root,
  dataDir,
  version,
  // Started from the Mac app: quitting the app also quits the local models, even when Ollama was already running.
  app: process.env.UC_APP === '1',
  quitOllama: process.env.UC_QUIT_OLLAMA === '1' || process.env.UC_APP === '1',
  // The downloaded app carries its own Node and code; it updates itself from GitHub Releases.
  packaged: process.env.UC_PACKAGED === '1',
  appBundle: process.env.UC_APP_BUNDLE || null,
  repo,
  port: Number(process.env.PORT || 4317),
  // Bind to the local network by default so the UI can be opened from another
  // device on the same network. Set HOST=127.0.0.1 to keep the server local-only.
  host: process.env.HOST || '0.0.0.0',
  profile: process.env.DB_PATH || mock ? { id: 'main', name: mock ? 'Test' : 'Main' } : { id: activeProfile.id, name: activeProfile.name },
  dbPath: process.env.DB_PATH || path.join(dataDir, mock ? 'mock.db' : activeProfile.file),
  webDist: path.join(root, 'web', 'dist'),
  mock,
  ollamaUrl: (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
  defaultModel: process.env.OLLAMA_MODEL || 'orcarouter/Qwen3.8-27B-Uncensored:q4_K_M',
  userAgent: process.env.USER_AGENT || `desktop:undercurrent:v${version} (personal use)`,
  ingestIntervalMin: Number(process.env.INGEST_INTERVAL_MIN || 20),
  taggerEnabled: process.env.TAGGER !== 'off'
};
