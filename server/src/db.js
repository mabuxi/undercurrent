import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  ext_id TEXT NOT NULL,
  url TEXT,
  title TEXT,
  body TEXT,
  author TEXT,
  community TEXT,
  flair TEXT,
  format TEXT NOT NULL,
  media TEXT,
  width INTEGER,
  height INTEGER,
  duration REAL,
  score INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  created_utc INTEGER,
  nsfw INTEGER DEFAULT 0,
  source_tags TEXT,
  ai_status TEXT DEFAULT 'pending',
  ai_summary TEXT,
  blocked INTEGER DEFAULT 0,
  fetched_at INTEGER,
  UNIQUE(source, ext_id)
);
CREATE INDEX IF NOT EXISTS idx_items_ai ON items(ai_status);
CREATE INDEX IF NOT EXISTS idx_items_created ON items(created_utc);
CREATE INDEX IF NOT EXISTS idx_items_community ON items(community);
CREATE INDEX IF NOT EXISTS idx_items_author ON items(source, author);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT DEFAULT 'tag',
  created INTEGER
);

CREATE TABLE IF NOT EXISTS item_tags (
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  weight REAL NOT NULL DEFAULT 0.5,
  origin TEXT NOT NULL DEFAULT 'source',
  PRIMARY KEY (item_id, tag_id, origin)
);
CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags(tag_id);

CREATE TABLE IF NOT EXISTS kinks (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  description TEXT,
  origin TEXT DEFAULT 'ai',
  status TEXT DEFAULT 'active',
  created INTEGER,
  updated INTEGER
);

CREATE TABLE IF NOT EXISTS kink_tags (
  kink_id INTEGER NOT NULL REFERENCES kinks(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  weight REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (kink_id, tag_id)
);

CREATE TABLE IF NOT EXISTS fantasies (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  kinks TEXT,
  saved INTEGER DEFAULT 0,
  origin TEXT DEFAULT 'user',
  created INTEGER,
  updated INTEGER
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  item_id INTEGER,
  type TEXT NOT NULL,
  value REAL,
  session_id TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);

CREATE TABLE IF NOT EXISTS affinity (
  key TEXT PRIMARY KEY,
  long REAL NOT NULL DEFAULT 0,
  short REAL NOT NULL DEFAULT 0,
  n INTEGER NOT NULL DEFAULT 0,
  long_ts INTEGER NOT NULL DEFAULT 0,
  short_ts INTEGER NOT NULL DEFAULT 0,
  lately REAL NOT NULL DEFAULT 0,
  lately_ts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS item_state (
  item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  seen INTEGER DEFAULT 0,
  seen_ts INTEGER,
  saved INTEGER DEFAULT 0,
  rating INTEGER DEFAULT 0,
  vote INTEGER DEFAULT 0,
  hidden INTEGER DEFAULT 0,
  dwell_ms INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS follows (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT,
  synced_from TEXT,
  active INTEGER DEFAULT 1,
  last_fetch INTEGER DEFAULT 0,
  created INTEGER,
  UNIQUE(kind, value)
);

CREATE TABLE IF NOT EXISTS memory (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  pinned INTEGER DEFAULT 0,
  evidence TEXT,
  created INTEGER,
  updated INTEGER
);

CREATE TABLE IF NOT EXISTS limits (
  tag TEXT PRIMARY KEY,
  created INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  model TEXT,
  kind TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  ms INTEGER
);

CREATE TABLE IF NOT EXISTS net_log (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  host TEXT,
  purpose TEXT,
  bytes_out INTEGER,
  bytes_in INTEGER,
  status INTEGER
);
`;

let db;

export function openDb(file = config.dbPath) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  const prepare = db.prepare.bind(db);
  const cache = new Map();
  db.prepare = (sql) => {
    let st = cache.get(sql);
    if (!st) {
      if (cache.size > 400) cache.clear();
      st = prepare(sql);
      cache.set(sql, st);
    }
    return st;
  };
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.exec(SCHEMA);
  const cols = db.prepare('PRAGMA table_info(items)').all().map((c) => c.name);
  if (!cols.includes('block_reason')) db.exec('ALTER TABLE items ADD COLUMN block_reason TEXT');
  if (!cols.includes('ai_deep')) db.exec('ALTER TABLE items ADD COLUMN ai_deep INTEGER DEFAULT 0');
  if (!cols.includes('via')) db.exec('ALTER TABLE items ADD COLUMN via TEXT');
  if (!cols.includes('oc')) db.exec('ALTER TABLE items ADD COLUMN oc INTEGER DEFAULT 0');
  if (!cols.includes('thread_ok')) db.exec('ALTER TABLE items ADD COLUMN thread_ok INTEGER');
  if (!cols.includes('thread_match')) db.exec('ALTER TABLE items ADD COLUMN thread_match INTEGER');
  if (!cols.includes('ai_fit')) db.exec('ALTER TABLE items ADD COLUMN ai_fit INTEGER');
  for (const c of ['g_men INTEGER', 'g_women INTEGER', 'g_trans INTEGER', 'g_src TEXT', 'look_q INTEGER']) if (!cols.includes(c.split(' ')[0])) db.exec(`ALTER TABLE items ADD COLUMN ${c}`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_items_via ON items(via)');
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_items_lookq ON items(look_q)'); } catch {}
  const fcols = db.prepare('PRAGMA table_info(follows)').all().map((c) => c.name);
  if (!fcols.includes('topic')) db.exec('ALTER TABLE follows ADD COLUMN topic TEXT');
  if (!fcols.includes('dormant_since')) db.exec('ALTER TABLE follows ADD COLUMN dormant_since INTEGER');
  if (!fcols.includes('why')) db.exec('ALTER TABLE follows ADD COLUMN why TEXT');
  db.exec('CREATE TABLE IF NOT EXISTS prompts (id INTEGER PRIMARY KEY, text TEXT NOT NULL, kind TEXT, result TEXT, item_id INTEGER, ts INTEGER NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS suggestions (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT, data TEXT, confidence INTEGER, status TEXT DEFAULT \'new\', created INTEGER, UNIQUE(kind, title))');
  const kcols = db.prepare('PRAGMA table_info(kinks)').all().map((c) => c.name);
  if (!kcols.includes('parent_id')) db.exec('ALTER TABLE kinks ADD COLUMN parent_id INTEGER');
  if (!kcols.includes('is_group')) db.exec('ALTER TABLE kinks ADD COLUMN is_group INTEGER DEFAULT 0');
  db.exec('CREATE TABLE IF NOT EXISTS performers (name TEXT PRIMARY KEY, display TEXT, thumb TEXT, videos INTEGER DEFAULT 0, gender TEXT, source TEXT, updated INTEGER)');
  db.exec('CREATE TABLE IF NOT EXISTS kink_links (a INTEGER NOT NULL, b INTEGER NOT NULL, why TEXT, origin TEXT DEFAULT \'ai\', PRIMARY KEY (a, b))');
  db.exec("UPDATE items SET blocked = 1, block_reason = 'broken' WHERE blocked = 0 AND source IN ('redtube','pornhub') AND media LIKE '%/videos//original%'");
  return db;
}

export function getDb() {
  if (!db) openDb();
  return db;
}

export const now = () => Date.now();

export function getSetting(key, fallback = null) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export function setSetting(key, value) {
  getDb().prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
}

export function tagId(name, kind = 'tag') {
  const d = getDb();
  const clean = normalizeTag(name);
  if (!clean) return null;
  const row = d.prepare('SELECT id FROM tags WHERE name = ?').get(clean);
  if (row) return row.id;
  return d.prepare('INSERT INTO tags(name, kind, created) VALUES(?, ?, ?)').run(clean, kind, now()).lastInsertRowid;
}

export function normalizeTag(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
}

export function logNet(host, purpose, bytesOut, bytesIn, status) {
  try {
    getDb().prepare('INSERT INTO net_log(ts, host, purpose, bytes_out, bytes_in, status) VALUES(?, ?, ?, ?, ?, ?)').run(now(), host, purpose, bytesOut || 0, bytesIn || 0, status || 0);
  } catch {}
}
