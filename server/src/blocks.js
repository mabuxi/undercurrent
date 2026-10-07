import { getDb, now, normalizeTag } from './db.js';

// Blocked creators: stronger than hiding a post. Everything from them is hidden, now and in the future, and the
// bigger model looks at several of their posts together to learn what you did not like about them.
// A creator is a poster on one source (kind 'author') or a performer by name on every source (kind 'performer').

let cache = null;

function table() {
  getDb().exec('CREATE TABLE IF NOT EXISTS blocked_creators (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, source TEXT, name TEXT NOT NULL, ts INTEGER, UNIQUE(kind, source, name))');
}

function load() {
  if (cache) return cache;
  table();
  const rows = getDb().prepare('SELECT * FROM blocked_creators').all();
  cache = { authors: new Set(rows.filter((r) => r.kind === 'author').map((r) => `${r.source}|${r.name}`)), performers: new Set(rows.filter((r) => r.kind === 'performer').map((r) => r.name)), rows };
  return cache;
}

const key = (s) => String(s || '').trim().toLowerCase().replace(/^[@]+|^u\//, '');

// Is a new or known post from someone you blocked?
export function isBlockedCreator(n) {
  const c = load();
  if (!c.rows.length) return false;
  if (n.author && c.authors.has(`${n.source}|${key(n.author)}`)) return true;
  for (const p of n.performers || []) if (c.performers.has(normalizeTag(p))) return true;
  return false;
}

export function listBlocked() {
  return load().rows.map((r) => ({ id: r.id, kind: r.kind, source: r.source, name: r.name, ts: r.ts }));
}

// Hides everything already here from them and returns the ids of their posts, most looked at first.
export function blockCreator({ kind = 'author', source = null, name }) {
  table();
  const db = getDb();
  const n = kind === 'performer' ? normalizeTag(name) : key(name);
  if (!n) return { ids: [] };
  db.prepare('INSERT OR IGNORE INTO blocked_creators(kind, source, name, ts) VALUES(?, ?, ?, ?)').run(kind, kind === 'author' ? source : null, n, now());
  cache = null;
  const ids = kind === 'author'
    ? db.prepare("SELECT i.id FROM items i LEFT JOIN item_state s ON s.item_id = i.id WHERE i.source = ? AND lower(replace(replace(i.author, 'u/', ''), '@', '')) = ? ORDER BY COALESCE(s.seen, 0) DESC, i.score DESC").all(source, n).map((r) => r.id)
    : db.prepare("SELECT DISTINCT i.id FROM items i JOIN item_tags it ON it.item_id = i.id JOIN tags t ON t.id = it.tag_id LEFT JOIN item_state s ON s.item_id = i.id WHERE t.kind = 'performer' AND t.name = ? ORDER BY COALESCE(s.seen, 0) DESC, i.score DESC").all(n).map((r) => r.id);
  const up = db.prepare("UPDATE items SET blocked = 1, block_reason = COALESCE(block_reason, 'creator') WHERE id = ? AND blocked = 0");
  db.transaction(() => { for (const id of ids) up.run(id); })();
  try { db.prepare("UPDATE follows SET active = 0 WHERE lower(value) LIKE ?").run(`%|${n}`); } catch {}
  return { ids };
}

export function unblockCreator(id) {
  table();
  const db = getDb();
  const r = db.prepare('SELECT * FROM blocked_creators WHERE id = ?').get(Number(id));
  if (!r) return false;
  db.prepare('DELETE FROM blocked_creators WHERE id = ?').run(r.id);
  cache = null;
  const ids = r.kind === 'author'
    ? db.prepare("SELECT id FROM items WHERE source = ? AND lower(replace(replace(author, 'u/', ''), '@', '')) = ? AND block_reason = 'creator'").all(r.source, r.name).map((x) => x.id)
    : db.prepare("SELECT DISTINCT i.id FROM items i JOIN item_tags it ON it.item_id = i.id JOIN tags t ON t.id = it.tag_id WHERE t.kind = 'performer' AND t.name = ? AND i.block_reason = 'creator'").all(r.name).map((x) => x.id);
  const up = db.prepare("UPDATE items SET blocked = 0, block_reason = NULL WHERE id = ?");
  db.transaction(() => { for (const x of ids) up.run(x); })();
  return true;
}
