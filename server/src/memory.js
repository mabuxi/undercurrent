import { getDb, now } from './db.js';
import { tr } from './i18n.js';

export const CATEGORIES = ['Right now', 'Kinks and interests', 'Fantasies', 'Turn-offs and limits', 'Formats and moods', 'Creators and communities', 'Notes'];

export function listMemory({ status } = {}) {
  // "Still true?" memories keep counting until you answer.
  const where = status === 'active' ? "WHERE status IN ('active', 'recheck')" : status ? 'WHERE status = ?' : "WHERE status != 'archived'";
  const rows = getDb().prepare(`SELECT * FROM memory ${where} ORDER BY pinned DESC, updated DESC`).all(...(status && status !== 'active' ? [status] : []));
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

// Memories do not stay forever without a check. Old ones the assistant wrote itself, things that may well have been
// a phase (moods, formats, creators) and taste notes whose tags have cooled down are asked about again: "still true?".
// Pinned memories and your limits are never asked about. Suggestions nobody answered for a week make room for new ones.
const RECHECK_DAYS = { 'Kinks and interests': 75, Fantasies: 90, 'Formats and moods': 45, 'Creators and communities': 45, Notes: 120 };
export function memoryUpkeep({ cooling = [] } = {}) {
  const db = getDb();
  const t = now();
  const day = 86400000;
  db.prepare("UPDATE memory SET status = 'archived', updated = ? WHERE status = 'proposed' AND origin = 'ai' AND created < ?").run(t, t - 7 * day);
  const open = db.prepare("SELECT COUNT(*) c FROM memory WHERE status = 'recheck'").get().c;
  if (open >= 3) return 0;
  const cool = cooling.map((x) => String(x).toLowerCase()).filter((x) => x.length > 2);
  let n = 0;
  for (const m of db.prepare("SELECT * FROM memory WHERE status = 'active' AND pinned = 0 AND category != 'Turn-offs and limits' AND category != 'Right now' ORDER BY updated ASC").all()) {
    if (open + n >= 3) break;
    const age = (t - (m.updated || m.created || t)) / day;
    const limit = (RECHECK_DAYS[m.category] || 90) * (m.origin === 'ai' ? 0.5 : 1);
    const cooled = cool.some((c) => m.content.toLowerCase().includes(c)) && age > 21;
    if (age < limit && !cooled) continue;
    db.prepare("UPDATE memory SET status = 'recheck' WHERE id = ?").run(m.id);
    n++;
  }
  return n;
}
