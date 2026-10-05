import { getDb, now, normalizeTag } from './db.js';
import { listKinks, kinkIndex, kinksForTags, listFantasies, createKink } from './kinks.js';
import { risingConcepts } from './kinkengine.js';
import { topTags, affinityMap, decayed, engagement } from './profile.js';
import { tagSpecificity, tagsForItems, getItem } from './store.js';
import { conceptsOf, conceptName, isKinkConcept } from './concepts.js';

export function ensureBrainSchema() {
  const db = getDb();
  const cols = db.prepare('PRAGMA table_info(kink_links)').all().map((c) => c.name);
  if (!cols.includes('w')) db.exec('ALTER TABLE kink_links ADD COLUMN w REAL DEFAULT 0');
  if (!cols.includes('n')) db.exec('ALTER TABLE kink_links ADD COLUMN n INTEGER DEFAULT 0');
  if (!cols.includes('last')) db.exec('ALTER TABLE kink_links ADD COLUMN last INTEGER DEFAULT 0');
}

export function strengthen(itemIds, signal = 1) {
  if (!itemIds?.length || signal <= 0) return;
  ensureBrainSchema();
  const db = getDb();
  const idx = kinkIndex(listKinks({ includeHidden: false }).filter((k) => !k.isGroup));
  const tagMap = tagsForItems(itemIds);
  const up = db.prepare(`INSERT INTO kink_links(a, b, why, origin, w, n, last) VALUES(?, ?, '', 'use', ?, 1, ?)
    ON CONFLICT(a, b) DO UPDATE SET w = w + excluded.w, n = n + 1, last = excluded.last`);
  const t = now();
  db.transaction(() => {
    for (const id of itemIds) {
      const ks = kinksForTags(tagMap.get(id) || [], idx).map((k) => k.id).sort((x, y) => x - y);
      for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) up.run(ks[i], ks[j], 0.15 * signal, t);
    }
  })();
}

// Kinks now come only from the kink engine (kinkengine.js); nothing is promoted on the side any more.
export function promoteHotTags() {
  return 0;
}

function cooccurrence(kinks, hotTags) {
  const db = getDb();
  const rows = engagement(now() - 120 * 86400000);
  const idx = kinkIndex(kinks);
  const hotIds = new Set(hotTags.map((t) => t.id));
  const tagMap = tagsForItems(rows.map((r) => r.item_id));
  const pair = new Map();
  const act = new Map();
  const last = new Map();
  const add = (a, b, w) => { const k = a < b ? `${a}|${b}` : `${b}|${a}`; pair.set(k, (pair.get(k) || 0) + w); };
  for (const r of rows) {
    const tags = tagMap.get(r.item_id) || [];
    const keys = [...kinksForTags(tags, idx).map((k) => `k${k.id}`), ...tags.filter((t) => hotIds.has(t.id) && t.weight >= 0.4).map((t) => `t${t.id}`)];
    const w = Math.min(3, r.s);
    for (const key of keys) {
      act.set(key, (act.get(key) || 0) + w);
      last.set(key, Math.max(last.get(key) || 0, r.last));
    }
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) add(keys[i], keys[j], w);
  }
  return { pair, act, last, engaged: rows.length };
}

export function brain({ maxTags = 18 } = {}) {
  ensureBrainSchema();
  const db = getDb();
  const all = listKinks({ includeHidden: false });
  const groups = all.filter((k) => k.isGroup);
  const kinks = all.filter((k) => !k.isGroup);
  // Hollow dots: things you are clearly into that are not quite a kink yet.
  const tagQ = db.prepare('SELECT id FROM tags WHERE name = ?');
  const hotTags = risingConcepts(maxTags).map((x) => ({ id: tagQ.get(x.concept)?.id, name: x.name, rising: x })).filter((t) => t.id);
  const aff = affinityMap();
  const { pair, act, last } = cooccurrence(kinks, hotTags);
  const groupColor = new Map(groups.map((g) => [g.id, g.color]));
  const topGroup = (id) => {
    let g = groups.find((x) => x.id === id);
    for (let i = 0; i < 3 && g?.parentId && groups.some((x) => x.id === g.parentId); i++) g = groups.find((x) => x.id === g.parentId);
    return g;
  };
  const nodes = [];
  for (const k of kinks) {
    const tg = k.parentId ? topGroup(k.parentId) : null;
    nodes.push({
      key: `k${k.id}`, id: k.id, type: 'kink', name: k.label || k.name, baseName: k.name, status: k.status, origin: k.origin, description: k.description || '',
      color: tg ? groupColor.get(tg.id) || k.color : k.color, ownColor: k.color, group: k.parentId || null, topGroup: tg?.id || null,
      allTime: k.allTime, lately: k.lately, now: k.now, activity: Math.round((act.get(`k${k.id}`) || 0) * 10) / 10, last: last.get(`k${k.id}`) || null,
      tags: k.tags.slice(0, 8).map((t) => t.name)
    });
  }
  for (const t of hotTags) {
    const v = aff.get(`t:${t.id}`);
    nodes.push({
      key: `t${t.id}`, id: t.id, type: 'tag', name: t.name, color: '#B6A8B0',
      allTime: Math.round(50 + 50 * Math.tanh((v?.long || 0) / 4)), lately: Math.round(50 + 50 * Math.tanh((v?.lately || 0) / 3)), now: Math.round(50 + 50 * Math.tanh((v?.short || 0) / 2)),
      activity: Math.round((act.get(`t${t.id}`) || 0) * 10) / 10, last: last.get(`t${t.id}`) || null, n: t.rising.n,
      promote: t.rising.need <= 1, need: t.rising.need
    });
  }
  const fantasies = listFantasies();
  for (const f of fantasies) nodes.push({ key: `f${f.id}`, id: f.id, type: 'fantasy', name: f.name, color: '#F6C35B', allTime: f.match, lately: f.match, saved: f.saved, description: f.description || '', kinks: f.kinks.map((k) => k.id) });

  const links = db.prepare('SELECT a, b, why, origin, COALESCE(w, 0) w, COALESCE(n, 0) n, COALESCE(last, 0) last FROM kink_links').all();
  const edges = new Map();
  const put = (a, b, w, extra = {}) => {
    if (a === b) return;
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    const cur = edges.get(k) || { a: a < b ? a : b, b: a < b ? b : a, raw: 0 };
    cur.raw += w;
    Object.assign(cur, extra);
    edges.set(k, cur);
  };
  const keys = new Set(nodes.map((n) => n.key));
  for (const [k, w] of pair) { const [a, b] = k.split('|'); if (keys.has(a) && keys.has(b)) put(a, b, w * 0.35, { together: Math.round(w * 10) / 10 }); }
  for (const l of links) {
    const a = `k${l.a}`;
    const b = `k${l.b}`;
    if (!keys.has(a) || !keys.has(b)) continue;
    put(a, b, (l.origin === 'use' ? 0 : 0.8) + l.w, { why: l.why || undefined, manual: l.origin === 'user', last: l.last || undefined, uses: l.n || undefined });
  }
  for (const f of fantasies) for (const k of f.kinks) if (keys.has(`k${k.id}`)) put(`f${f.id}`, `k${k.id}`, 1.2, { fantasy: true });
  const kinkTagSets = new Map(kinks.map((k) => [`k${k.id}`, new Set(k.tags.map((t) => t.name))]));
  const kinkKeys = [...kinkTagSets.keys()];
  for (let i = 0; i < kinkKeys.length; i++) for (let j = i + 1; j < kinkKeys.length; j++) {
    const A = kinkTagSets.get(kinkKeys[i]);
    const B = kinkTagSets.get(kinkKeys[j]);
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    if (inter) put(kinkKeys[i], kinkKeys[j], inter * 0.4, { shared: inter });
  }
  const raws = [...edges.values()].map((e) => e.raw).sort((a, b) => a - b);
  const scale = Math.max(1, 0.5 * (raws[Math.floor(raws.length * 0.9)] || 1));
  let list = [...edges.values()].map((e) => ({ ...e, raw: Math.round(e.raw * 100) / 100, w: Math.round((1 - Math.exp(-e.raw / scale)) * 100) / 100 }));
  const byNode = new Map();
  for (const e of list) for (const k of [e.a, e.b]) { if (!byNode.has(k)) byNode.set(k, []); byNode.get(k).push(e); }
  const keep = new Set();
  for (const [, es] of byNode) es.sort((x, y) => y.w - x.w).slice(0, 8).forEach((e) => keep.add(e));
  list = list.filter((e) => keep.has(e) || e.w >= 0.5 || e.fantasy || e.manual);
  return {
    nodes,
    edges: list,
    groups: groups.map((g) => ({ id: g.id, name: g.name, color: g.color, parentId: g.parentId || null, description: g.description || '' })),
    at: now()
  };
}

export function nodeDetail(key) {
  const db = getDb();
  const type = key[0];
  const id = Number(key.slice(1));
  let tagNames = [];
  let filter = {};
  if (type === 'k') {
    const k = listKinks({ includeHidden: true }).find((x) => x.id === id);
    if (!k) return null;
    tagNames = k.tags.map((t) => t.name);
    filter = { kink: id };
  } else if (type === 't') {
    const row = db.prepare('SELECT name FROM tags WHERE id = ?').get(id);
    if (!row) return null;
    tagNames = [row.name];
    filter = { tags: [row.name] };
  } else if (type === 'f') {
    const f = listFantasies().find((x) => x.id === id);
    if (!f) return null;
    const ks = listKinks({ includeHidden: true }).filter((k) => f.kinks.some((x) => x.id === k.id));
    tagNames = ks.flatMap((k) => k.tags.map((t) => t.name));
    filter = { fantasy: id };
  }
  if (!tagNames.length) return { filter, recent: [], counts: {} };
  const ph = tagNames.map(() => '?').join(',');
  const recent = db.prepare(`SELECT e.item_id, e.type, e.value, e.ts FROM events e WHERE e.item_id IN (SELECT DISTINCT it.item_id FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE t.name IN (${ph}) AND it.weight >= 0.42)
    AND e.type NOT IN ('impression', 'play', 'progress', 'tagboost', 'search', 'skip') ORDER BY e.ts DESC LIMIT 200`).all(...tagNames);
  const counts = {};
  for (const r of db.prepare(`SELECT e.type, COUNT(*) c FROM events e WHERE e.item_id IN (SELECT DISTINCT it.item_id FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE t.name IN (${ph}) AND it.weight >= 0.35) GROUP BY e.type`).all(...tagNames)) counts[r.type] = r.c;
  const weekAgo = now() - 7 * 86400000;
  const week = db.prepare(`SELECT COUNT(DISTINCT e.item_id) c FROM events e WHERE e.ts > ? AND e.type != 'impression' AND e.item_id IN (SELECT DISTINCT it.item_id FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE t.name IN (${ph}) AND it.weight >= 0.35)`).get(weekAgo, ...tagNames).c;
  const before = db.prepare(`SELECT COUNT(DISTINCT e.item_id) c FROM events e WHERE e.ts <= ? AND e.ts > ? AND e.type != 'impression' AND e.item_id IN (SELECT DISTINCT it.item_id FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE t.name IN (${ph}) AND it.weight >= 0.35)`).get(weekAgo, weekAgo - 28 * 86400000, ...tagNames).c;
  // One row per post, newest first, with what you did on it and a picture of it.
  const perItem = new Map();
  for (const r of recent) {
    if (r.type === 'dwell' && Number(r.value) < 6000) continue;
    let x = perItem.get(r.item_id);
    if (!x) { x = { item_id: r.item_id, ts: r.ts, events: [] }; perItem.set(r.item_id, x); }
    const same = x.events.find((e) => e.type === r.type);
    if (same) { same.n++; if (r.type === 'dwell') same.value += Number(r.value) || 0; else same.value = Math.max(Number(same.value) || 0, Number(r.value) || 0); }
    else x.events.push({ type: r.type, value: Number(r.value) || 0, n: 1 });
  }
  const posts = [...perItem.values()].slice(0, 16).map((x) => {
    const it = getItem(x.item_id);
    return it ? { ...x, title: it.title, media: it.media, source: it.source, format: it.format, author: it.author } : null;
  }).filter(Boolean);
  const related = db.prepare(`SELECT t2.name, COUNT(*) c FROM item_tags a JOIN tags t1 ON t1.id = a.tag_id JOIN item_tags b ON b.item_id = a.item_id JOIN tags t2 ON t2.id = b.tag_id
    WHERE t1.name IN (${ph}) AND t2.name NOT IN (${ph}) AND t2.kind != 'performer' AND b.weight >= 0.45 GROUP BY t2.id ORDER BY c DESC LIMIT 40`).all(...tagNames, ...tagNames);
  const spec = tagSpecificity();
  const idOf = new Map(db.prepare(`SELECT id, name FROM tags WHERE name IN (${related.map(() => '?').join(',') || "''"})`).all(...related.map((r) => r.name)).map((r) => [r.name, r.id]));
  const relTags = related.filter((r) => conceptsOf(r.name).some(isKinkConcept)).map((r) => ({ name: r.name, score: r.c * (spec.map.get(idOf.get(r.name)) ?? 1) })).sort((a, b) => b.score - a.score).slice(0, 10).map((r) => r.name);
  return {
    filter, counts, week, perWeekBefore: Math.round((before / 4) * 10) / 10, relatedTags: relTags,
    recent: posts
  };
}

export function kinkIdForTag(tagId) {
  const row = getDb().prepare('SELECT name FROM tags WHERE id = ?').get(tagId);
  if (!row) return null;
  return createKink({ name: conceptName(conceptsOf(row.name)[0] || row.name), tags: [row.name], description: '', origin: 'user', status: 'active' });
}

export { normalizeTag, decayed };
