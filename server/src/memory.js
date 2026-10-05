import { getDb, now } from './db.js';
import { tr } from './i18n.js';

export const CATEGORIES = ['Right now', 'Kinks and interests', 'Fantasies', 'Turn-offs and limits', 'Formats and moods', 'Creators and communities', 'Notes'];

export function listMemory({ status } = {}) {
  const rows = getDb().prepare(`SELECT * FROM memory ${status ? 'WHERE status = ?' : "WHERE status != 'archived'"} ORDER BY pinned DESC, updated DESC`).all(...(status ? [status] : []));
  return rows.map((r) => ({ id: r.id, category: r.category, content: r.content, origin: r.origin, status: r.status, pinned: !!r.pinned, evidence: r.evidence, created: r.created, updated: r.updated }));
}

// "Right now" notes describe a mood of the moment; after ten days they move to the archive by themselves.
export function expireRightNow() {
  getDb().prepare("UPDATE memory SET status = 'archived', updated = ? WHERE category = 'Right now' AND status = 'active' AND updated < ?").run(now(), now() - 10 * 86400000);
}

export function grouped() {
  expireRightNow();
  const all = listMemory();
  return CATEGORIES.map((c) => ({ category: c, label: tr(c), items: all.filter((m) => m.category === c) }))
    .concat(all.some((m) => !CATEGORIES.includes(m.category)) ? [{ category: 'Other', label: tr('Other'), items: all.filter((m) => !CATEGORIES.includes(m.category)) }] : []);
}

// The category names in the language of the interface, for showing them; the English names stay the stored values.
export function categoryLabels() {
  return Object.fromEntries(CATEGORIES.map((c) => [c, tr(c)]));
}

export function addMemory({ category = 'Notes', content, origin = 'user', status = 'active', evidence = null, pinned = false }) {
  const text = String(content || '').trim();
  if (!text) throw new Error(tr('A memory needs some text.'));
  const dup = getDb().prepare("SELECT id FROM memory WHERE lower(content) = lower(?) AND status != 'archived'").get(text);
  if (dup) return dup.id;
  return Number(getDb().prepare('INSERT INTO memory(category, content, origin, status, pinned, evidence, created, updated) VALUES(?, ?, ?, ?, ?, ?, ?, ?)')
    .run(category, text.slice(0, 500), origin, status, pinned ? 1 : 0, evidence, now(), now()).lastInsertRowid);
}

export function updateMemory(id, patch) {
  const db = getDb();
  const cur = db.prepare('SELECT * FROM memory WHERE id = ?').get(id);
  if (!cur) return false;
  db.prepare('UPDATE memory SET category = ?, content = ?, status = ?, pinned = ?, updated = ? WHERE id = ?').run(
    patch.category ?? cur.category, patch.content ?? cur.content, patch.status ?? cur.status,
    patch.pinned === undefined ? cur.pinned : patch.pinned ? 1 : 0, now(), id);
  return true;
}

export function deleteMemory(id) {
  getDb().prepare('DELETE FROM memory WHERE id = ?').run(id);
}

export function memoryForPrompt(limit = 40) {
  return listMemory({ status: 'active' }).slice(0, limit).map((m) => `- [${m.category}] ${m.content}`).join('\n');
}

// The prompt log: everything typed into the assistant, kept apart from memory.
export function logPrompt({ text, kind = 'command', result = null, itemId = null }) {
  getDb().prepare('INSERT INTO prompts(text, kind, result, item_id, ts) VALUES(?, ?, ?, ?, ?)').run(String(text || '').slice(0, 1000), kind, result ? String(result).slice(0, 500) : null, itemId || null, now());
  getDb().prepare('DELETE FROM prompts WHERE id NOT IN (SELECT id FROM prompts ORDER BY ts DESC LIMIT 2000)').run();
}

export function listPrompts(limit = 200) {
  return getDb().prepare('SELECT * FROM prompts ORDER BY ts DESC LIMIT ?').all(limit).map((r) => ({ id: r.id, text: r.text, kind: r.kind, result: r.result, itemId: r.item_id, ts: r.ts }));
}

export function deletePrompt(id) {
  if (id === 'all') getDb().prepare('DELETE FROM prompts').run();
  else getDb().prepare('DELETE FROM prompts WHERE id = ?').run(Number(id));
}
