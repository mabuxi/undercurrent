import { kinkLabel } from './translate.js';
import { getDb, now, tagId, normalizeTag, getSetting, setSetting } from './db.js';
import { affinityMap, engagement } from './profile.js';
import { tagsForItems } from './store.js';
import { conceptsOf, isKinkConcept } from './concepts.js';
import { ensureKinkSchema, locksOf, conceptsOfRow, rememberRemoved, removedConcepts, dropKink, moveReferences, recolor } from './kinkengine.js';
import { tr } from './i18n.js';

export const PALETTE = ['#D98A99', '#A58FE0', '#66B5A6', '#D2A15E', '#7FA7D9', '#C98BC4', '#E3A58F', '#93C47D', '#E07A7A', '#7FD0C2', '#B7A4E8', '#E8C66B'];

function score01(aff, tags, field) {
  let num = 0;
  let den = 0;
  for (const t of tags) {
    const v = aff.get(`t:${t.tag_id}`);
    num += t.weight * Math.tanh((v ? v[field] : 0) / 5);
    den += t.weight;
  }
  return den ? num / den : 0;
}

export function listKinks({ includeHidden = false } = {}) {
  ensureKinkSchema();
  const db = getDb();
  const aff = affinityMap();
  const kinks = db.prepare(`SELECT * FROM kinks ${includeHidden ? '' : "WHERE status != 'hidden'"} ORDER BY id`).all();
  const tagRows = db.prepare('SELECT kt.kink_id, kt.tag_id, kt.weight, t.name FROM kink_tags kt JOIN tags t ON t.id = kt.tag_id').all();
  const byKink = new Map();
  for (const r of tagRows) { if (!byKink.has(r.kink_id)) byKink.set(r.kink_id, []); byKink.get(r.kink_id).push(r); }
  // A group matches posts through the kinks inside it.
  for (const g of kinks.filter((k) => k.is_group)) {
    const kids = kinks.filter((k) => k.parent_id === g.id && !k.is_group && k.status !== 'hidden').flatMap((k) => byKink.get(k.id) || []);
    if (kids.length) byKink.set(g.id, [...new Map(kids.map((r) => [r.tag_id, { ...r, kink_id: g.id }])).values()]);
  }
  return kinks.map((k) => {
    const tags = byKink.get(k.id) || [];
    const all = score01(aff, tags, 'long');
    const lately = score01(aff, tags, 'lately');
    const nowv = score01(aff, tags, 'short');
    return {
      id: k.id, name: k.name, label: kinkLabel({ name: k.name, locks: locksOf(k), isGroup: !!k.is_group, concepts: conceptsOfRow(k) }), color: k.color, description: k.description, origin: k.origin, status: k.status, parentId: k.parent_id || null, isGroup: !!k.is_group,
      concepts: conceptsOfRow(k), locks: locksOf(k), evidence: k.evidence ? JSON.parse(k.evidence) : null, created: k.created, fadedAt: k.faded_at || null,
      tags: tags.map((t) => ({ id: t.tag_id, name: t.name, weight: t.weight })),
      allTime: Math.round(50 + 50 * all), lately: Math.round(50 + 50 * lately), now: Math.round(50 + 50 * nowv)
    };
  }).sort((a, b) => b.allTime + b.lately - a.allTime - a.lately);
}

// Groups never match a post themselves: a post shows the kinks it has, in their family's colour.
export function kinkIndex(kinks = listKinks()) {
  const byTag = new Map();
  for (const k of kinks) {
    if (k.isGroup || k.status === 'hidden') continue;
    for (const t of k.tags) {
      if (!byTag.has(t.id)) byTag.set(t.id, []);
      byTag.get(t.id).push({ kink: k, weight: t.weight });
    }
  }
  return byTag;
}

// A post has a kink when one of its tags for it is solid (a title word, the site's own tag, something the AI saw),
// not when a weak guess brushes past it.
export function kinksForTags(itemTags, index) {
  const sums = new Map();
  for (const t of itemTags) for (const { kink, weight } of index.get(t.id) || []) {
    const cur = sums.get(kink.id) || { kink, s: 0, top: 0 };
    cur.s += t.weight * weight;
    cur.top = Math.max(cur.top, t.weight * weight);
    sums.set(kink.id, cur);
  }
  return [...sums.values()].filter((x) => x.top >= 0.42 || x.s >= 0.8).sort((a, b) => b.s - a.s).map((x) => x.kink);
}

function conceptsForUser(name, tags) {
  const cs = new Set();
  for (const t of tags) for (const c of conceptsOf(typeof t === 'string' ? t : t.name)) if (isKinkConcept(c)) cs.add(c);
  if (!cs.size) for (const c of conceptsOf(name)) cs.add(c);
  return [...cs].slice(0, 6);
}

// Kinks and groups you make yourself: kept exactly as you set them.
export function createKink({ name, tags = [], description = '', color, origin = 'user', status = 'active', parentId = null, isGroup = false }) {
  ensureKinkSchema();
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) c FROM kinks').get().c;
  const clean = String(name || '').trim().slice(0, 60);
  const taken = db.prepare('SELECT * FROM kinks WHERE name = ? COLLATE NOCASE').get(clean);
  if (taken && taken.status === 'hidden' && !taken.is_group && !isGroup) {
    // Bringing back a kink that faded: it is yours now.
    db.prepare("UPDATE kinks SET status = ?, origin = ?, locks = ?, parent_id = ?, updated = ? WHERE id = ?").run(status, origin, JSON.stringify(origin === 'user' ? { name: 1, status: 1 } : {}), parentId || null, now(), taken.id);
    if (tags.length) setKinkTags(taken.id, tags);
    return taken.id;
  }
  const locks = origin === 'user' ? { name: 1, tags: tags.length ? 1 : 0, color: color ? 1 : 0, parent: parentId ? 1 : 0 } : {};
  const info = db.prepare('INSERT INTO kinks(name, color, description, origin, status, created, updated, parent_id, is_group, concepts, locks) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(taken ? `${clean} ${count}` : clean, color || PALETTE[count % PALETTE.length], description, origin, status, now(), now(), parentId || null, isGroup ? 1 : 0,
      JSON.stringify(isGroup ? [] : conceptsForUser(clean, tags)), JSON.stringify(Object.fromEntries(Object.entries(locks).filter(([, v]) => v))));
  const id = Number(info.lastInsertRowid);
  if (!isGroup) {
    const list = tags.length ? tags : [normalizeTag(clean)];
    setKinkTags(id, list);
  }
  if (!isGroup) forgetRemovedAll(conceptsForUser(clean, tags));
  return id;
}

function forgetRemovedAll(cs) {
  const s = removedConcepts();
  let changed = false;
  for (const c of cs) if (s.delete(c)) changed = true;
  if (changed) setSetting('kinkRemoved', [...s]);
}

export function setKinkTags(id, tags) {
  const db = getDb();
  db.prepare('DELETE FROM kink_tags WHERE kink_id = ?').run(id);
  const ins = db.prepare('INSERT OR REPLACE INTO kink_tags(kink_id, tag_id, weight) VALUES(?, ?, ?)');
  for (const t of tags) {
    const name = typeof t === 'string' ? t : t.name;
    const tid = tagId(normalizeTag(name));
    if (tid) ins.run(id, tid, typeof t === 'string' ? 1 : t.weight ?? 1);
  }
}

// Every change you make by hand is locked, so the automatic updates never undo it.
export function updateKink(id, patch, { byUser = true } = {}) {
  ensureKinkSchema();
  const db = getDb();
  const cur = db.prepare('SELECT * FROM kinks WHERE id = ?').get(id);
  if (!cur) return false;
  const locks = locksOf(cur);
  if (byUser) {
    if (patch.name != null && patch.name !== cur.name) locks.name = 1;
    if (patch.tags) locks.tags = 1;
    if ('parentId' in patch) locks.parent = 1;
    if (patch.color) locks.color = 1;
    if (patch.status && patch.status !== cur.status) locks.status = 1;
  }
  const parent = 'parentId' in patch ? (patch.parentId && Number(patch.parentId) !== id ? Number(patch.parentId) : null) : cur.parent_id;
  let name = patch.name != null ? String(patch.name).trim().slice(0, 60) || cur.name : cur.name;
  if (name !== cur.name && db.prepare('SELECT id FROM kinks WHERE name = ? COLLATE NOCASE AND id != ?').get(name, id)) throw Object.assign(new Error(tr('There is already a kink or group called {name}.', { name })), { status: 400 });
  db.prepare('UPDATE kinks SET name = ?, color = ?, description = ?, status = ?, parent_id = ?, is_group = ?, locks = ?, updated = ? WHERE id = ?')
    .run(name, patch.color ?? cur.color, patch.description ?? cur.description, patch.status ?? cur.status, parent, 'isGroup' in patch ? (patch.isGroup ? 1 : 0) : cur.is_group, JSON.stringify(locks), now(), id);
  if (patch.tags) {
    setKinkTags(id, patch.tags);
    if (!cur.is_group) {
      const cs = conceptsForUser(name, patch.tags.map((t) => (typeof t === 'string' ? t : t.name)));
      const keep = conceptsOfRow(cur).filter((c) => cs.includes(c) || !patch.tags.length);
      db.prepare('UPDATE kinks SET concepts = ? WHERE id = ?').run(JSON.stringify([...new Set([...keep, ...cs])].slice(0, 8)), id);
    }
  }
  if (patch.color || 'parentId' in patch) recolor();
  return true;
}

// Lets the automatic updates take over again after you edited a kink.
export function unlockKink(id) {
  getDb().prepare("UPDATE kinks SET locks = '{}', origin = CASE WHEN origin = 'user' THEN 'ai' ELSE origin END WHERE id = ?").run(id);
}

// Deleting a kink also means "don't bring it back": its concepts are remembered. Deleting a group puts its kinks
// back on their own and stops that family from being grouped again.
export function deleteKink(id) {
  ensureKinkSchema();
  const db = getDb();
  const row = db.prepare('SELECT * FROM kinks WHERE id = ?').get(id);
  if (!row) return;
  if (row.is_group) {
    const fam = conceptsOfRow(row).find((c) => c.startsWith('family:'))?.slice(7);
    if (fam) setSetting('kinkGroupRemoved', [...new Set([...(getSetting('kinkGroupRemoved', []) || []), fam])]);
    for (const k of db.prepare('SELECT id, locks FROM kinks WHERE parent_id = ?').all(id)) db.prepare('UPDATE kinks SET parent_id = NULL, locks = ? WHERE id = ?').run(JSON.stringify({ ...locksOf(k), parent: 1 }), k.id);
  } else rememberRemoved(conceptsOfRow(row));
  dropKink(id);
  recolor();
}

// Two kinks that are really one: everything moves to the one you keep.
export function mergeKinks(fromId, intoId) {
  ensureKinkSchema();
  const db = getDb();
  const a = db.prepare('SELECT * FROM kinks WHERE id = ?').get(fromId);
  const b = db.prepare('SELECT * FROM kinks WHERE id = ?').get(intoId);
  if (!a || !b || a.id === b.id || a.is_group || b.is_group) throw Object.assign(new Error(tr('Pick two kinks to combine.')), { status: 400 });
  const tags = new Map();
  for (const r of db.prepare('SELECT t.name, kt.weight FROM kink_tags kt JOIN tags t ON t.id = kt.tag_id WHERE kt.kink_id IN (?, ?)').all(a.id, b.id)) tags.set(r.name, Math.max(tags.get(r.name) || 0, r.weight));
  db.transaction(() => {
    setKinkTags(b.id, [...tags].map(([name, weight]) => ({ name, weight })));
    db.prepare('UPDATE kinks SET concepts = ?, locks = ?, updated = ? WHERE id = ?').run(JSON.stringify([...new Set([...conceptsOfRow(b), ...conceptsOfRow(a)])]), JSON.stringify({ ...locksOf(b), tags: 1 }), now(), b.id);
    moveReferences(a.id, b.id);
    db.prepare('DELETE FROM kink_tags WHERE kink_id = ?').run(a.id);
    db.prepare('DELETE FROM kinks WHERE id = ?').run(a.id);
  })();
  recolor();
  return b.id;
}

export function listLinks() {
  return getDb().prepare('SELECT a, b, why, origin FROM kink_links').all();
}

export function setLink(a, b, why = '', origin = 'user') {
  const [x, y] = [Number(a), Number(b)].sort((m, n) => m - n);
  if (!x || !y || x === y) return;
  getDb().prepare('INSERT INTO kink_links(a, b, why, origin) VALUES(?, ?, ?, ?) ON CONFLICT(a, b) DO UPDATE SET why = excluded.why').run(x, y, why, origin);
}

export function removeLink(a, b) {
  const [x, y] = [Number(a), Number(b)].sort((m, n) => m - n);
  getDb().prepare('DELETE FROM kink_links WHERE a = ? AND b = ?').run(x, y);
}

export function listFantasies() {
  const kinks = listKinks({ includeHidden: true });
  return getDb().prepare('SELECT * FROM fantasies ORDER BY saved DESC, updated DESC').all().map((f) => {
    const ids = JSON.parse(f.kinks || '[]');
    const ks = kinks.filter((k) => ids.includes(k.id));
    const match = ks.length ? Math.round(ks.reduce((a, b) => a + (b.allTime + b.lately) / 2, 0) / ks.length) : 50;
    return { id: f.id, name: f.name, description: f.description, kinks: ks.map((k) => ({ id: k.id, name: k.name, color: k.color })), saved: !!f.saved, origin: f.origin, match };
  });
}

export function saveFantasy({ id, name, description = '', kinks = [], saved = 1, origin = 'user' }) {
  const db = getDb();
  if (id) {
    db.prepare('UPDATE fantasies SET name = ?, description = ?, kinks = ?, saved = ?, updated = ? WHERE id = ?').run(name, description, JSON.stringify(kinks), saved ? 1 : 0, now(), id);
    return id;
  }
  return Number(db.prepare('INSERT INTO fantasies(name, description, kinks, saved, origin, created, updated) VALUES(?, ?, ?, ?, ?, ?, ?)')
    .run(name, description, JSON.stringify(kinks), saved ? 1 : 0, origin, now(), now()).lastInsertRowid);
}

export function deleteFantasy(id) {
  getDb().prepare('DELETE FROM fantasies WHERE id = ?').run(id);
}

// Pairs that actually go together for you, not pairs that simply share tags.
// Weighted by how strongly you engaged (likes, heat and saves count most), compared with how often the two
// appear together in everything fetched anyway (lift), and scaled by how much evidence there is.
let pairCache = { at: 0, key: '', list: [] };
export function kinkPairs(kinks = listKinks()) {
  const key = kinks.map((k) => k.id).join(',');
  if (pairCache.key === key && now() - pairCache.at < 10 * 60000) return pairCache.list;
  const list = computePairs(kinks);
  pairCache = { at: now(), key, list };
  return list;
}

function computePairs(kinks) {
  if (kinks.length < 2) return [];
  const db = getDb();
  const engaged = engagement(now() - 180 * 86400000, { limit: 4000, minPoints: 1.5 });
  if (!engaged.length) return [];
  const index = kinkIndex(kinks);
  const catalog = db.prepare('SELECT id FROM items WHERE blocked = 0 ORDER BY fetched_at DESC LIMIT 3000').all().map((r) => r.id);
  const tagMap = tagsForItems([...new Set([...engaged.map((e) => e.item_id), ...catalog])]);
  const kOf = (id) => kinksForTags(tagMap.get(id) || [], index).map((k) => k.id).sort((a, b) => a - b);
  const wK = new Map();
  const wP = new Map();
  const nP = new Map();
  let wTot = 0;
  for (const e of engaged) {
    const w = Math.min(4, e.p / 3);
    wTot += w;
    const ks = kOf(e.item_id);
    for (const a of ks) wK.set(a, (wK.get(a) || 0) + w);
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const k2 = `${ks[i]}:${ks[j]}`;
      wP.set(k2, (wP.get(k2) || 0) + w);
      nP.set(k2, (nP.get(k2) || 0) + 1);
    }
  }
  const base = new Map();
  for (const id of catalog) {
    const ks = kOf(id);
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) { const k2 = `${ks[i]}:${ks[j]}`; base.set(k2, (base.get(k2) || 0) + 1); }
  }
  const byId = new Map(kinks.map((k) => [k.id, k]));
  const out = [];
  const tagSet = new Map(kinks.map((k) => [k.id, new Set(k.tags.map((t) => t.id))]));
  for (const [k2, w] of wP) {
    const n = nP.get(k2);
    if (n < 3) continue;
    const [a, b] = k2.split(':').map(Number);
    if (!byId.get(a) || !byId.get(b)) continue;
    const A = tagSet.get(a) || new Set();
    const B = tagSet.get(b) || new Set();
    let inter = 0;
    for (const t of A) if (B.has(t)) inter++;
    const overlap = inter / Math.max(1, Math.min(A.size, B.size));
    const conf = w / Math.max(1e-6, Math.min(wK.get(a) || 0, wK.get(b) || 0));
    const pEng = w / Math.max(1e-6, wTot);
    const pAll = ((base.get(k2) || 0) + 1) / (catalog.length + 20);
    const lift = pEng / pAll;
    const evidence = 1 - Math.exp(-n / 10);
    const s = (0.4 * Math.min(1, conf) + 0.3 * Math.max(0, Math.min(1, Math.log2(Math.max(1, lift)) / 4)) + 0.3 * evidence) * (1 - 0.6 * overlap);
    // Few shared posts can never look like a sure thing, and two kinks built from the same tags are not a real pair.
    const cap = 45 + 50 * evidence;
    out.push({ a: byId.get(a), b: byId.get(b), count: n, lift: Math.round(lift * 10) / 10, overlap: Math.round(overlap * 100) / 100, score: Math.max(15, Math.min(Math.round(cap), Math.round(10 + 85 * s))) });
  }
  return out.sort((x, y) => y.score - x.score || y.count - x.count).slice(0, 12);
}
