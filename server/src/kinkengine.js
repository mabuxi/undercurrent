import { getDb, now, getSetting, setSetting, tagId } from './db.js';
import { lang } from './i18n.js';
import { conceptLabel } from './vocab.js';
import { conceptsOf, isKinkConcept, familyOf, conceptName, knownVariants, knownConcept, FAMILIES } from './concepts.js';
import { kinkableTag } from './tagquality.js';
import { log } from './log.js';

// Kinks, rebuilt from scratch.
// A kink is one small, specific thing you keep coming back to, proven by what you did, not by what you watched:
// heat, likes, saves, "more like this" and saying why. It has to show up in clearly more of what you loved than in
// everything you've seen (a tag that is on every video, like "big dick" or "gay", never qualifies), across several
// posts and on more than one day. Each kink is one concept with a plain name ("Latino", "Jockstrap") and only the
// tags that mean that concept. Kinks of the same family ("Ethnicity", "Body") are grouped once there are two.
// It keeps updating: tags join a kink as you like them, a kink fades when you stop, and anything you change by
// hand stays the way you set it.

const DAY = 86400000;
const HALF_LIFE = 150 * DAY;
const STRONG = { up: 1.0, save: 1.5, reason: 1.2, more: 1.0, follow: 0.5 };

export const RULES = { create: { n: 4, s: 3.5, days: 2, lift: 1.7, prevalence: 0.2, text: 0.5 }, keep: { n: 3, s: 2.5, days: 2, lift: 1.35, prevalence: 0.26, text: 0.34 } };

export function ensureKinkSchema() {
  const db = getDb();
  const cols = db.prepare('PRAGMA table_info(kinks)').all().map((c) => c.name);
  if (!cols.includes('concepts')) db.exec('ALTER TABLE kinks ADD COLUMN concepts TEXT');
  if (!cols.includes('locks')) db.exec('ALTER TABLE kinks ADD COLUMN locks TEXT');
  if (!cols.includes('evidence')) db.exec('ALTER TABLE kinks ADD COLUMN evidence TEXT');
  if (!cols.includes('faded_at')) db.exec('ALTER TABLE kinks ADD COLUMN faded_at INTEGER');
  if (!cols.includes('parent_id')) db.exec('ALTER TABLE kinks ADD COLUMN parent_id INTEGER');
  if (!cols.includes('is_group')) db.exec('ALTER TABLE kinks ADD COLUMN is_group INTEGER DEFAULT 0');
}

const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
export const locksOf = (row) => parse(row?.locks, {});
export const conceptsOfRow = (row) => parse(row?.concepts, []);

// Every post you clearly liked, with how strongly, fading slowly over months so old phases give way to new ones.
function strongItems(t = now()) {
  const db = getDb();
  const per = new Map();
  for (const e of db.prepare("SELECT item_id, type, value, ts FROM events WHERE item_id IS NOT NULL AND type IN ('rate', 'up', 'save', 'reason', 'more', 'follow', 'down', 'less', 'unvote', 'unsave') ORDER BY ts").all()) {
    let x = per.get(e.item_id);
    if (!x) { x = { id: e.item_id, kinds: new Map(), last: 0, neg: false }; per.set(e.item_id, x); }
    if (e.type === 'down' || e.type === 'less') { x.neg = true; x.kinds.clear(); continue; }
    if (e.type === 'unvote') { x.kinds.delete('up'); continue; }
    if (e.type === 'unsave') { x.kinds.delete('save'); continue; }
    const w = e.type === 'rate' ? (Number(e.value) > 0 ? 0.6 + 0.2 * Math.min(5, Number(e.value)) : 0) : STRONG[e.type];
    if (!w) continue;
    x.neg = false;
    x.kinds.set(e.type, Math.max(x.kinds.get(e.type) || 0, w));
    x.last = Math.max(x.last, e.ts);
  }
  const out = [];
  for (const x of per.values()) {
    if (x.neg || !x.kinds.size) continue;
    const ws = [...x.kinds.values()].sort((a, b) => b - a);
    const w = ws[0] + 0.3 * (ws.length - 1);
    out.push({ id: x.id, w: w * Math.pow(0.5, (t - x.last) / HALF_LIFE), raw: w, last: x.last, kinds: [...x.kinds.keys()] });
  }
  return out;
}

function conceptTagsOf(ids, minWeight = 0.45) {
  const db = getDb();
  const out = new Map();
  for (let i = 0; i < ids.length; i += 800) {
    const chunk = ids.slice(i, i + 800);
    const rows = db.prepare(`SELECT it.item_id, t.name, MAX(it.weight) w, MAX(it.origin != 'vision') said FROM item_tags it JOIN tags t ON t.id = it.tag_id
      WHERE it.item_id IN (${chunk.map(() => '?').join(',')}) AND t.kind != 'performer' GROUP BY it.item_id, t.id`).all(...chunk);
    for (const r of rows) {
      if (r.w < minWeight || !kinkableTag(r.name)) continue;
      if (!out.has(r.item_id)) out.set(r.item_id, new Map());
      const m = out.get(r.item_id);
      for (const c of conceptsOf(r.name)) {
        if (!m.has(c)) m.set(c, new Set());
        m.get(c).add(r.name);
        if (r.said) { if (!m.said) m.said = new Set(); m.said.add(c); }
      }
    }
  }
  return out;
}

// How strongly each concept stands out in what you loved compared with everything you've seen.
let evCache = { at: 0, v: null };
export function conceptEvidence({ fresh = false } = {}) {
  if (!fresh && evCache.v && now() - evCache.at < 60000) return evCache.v;
  evCache = { at: now(), v: computeEvidence() };
  return evCache.v;
}

function computeEvidence() {
  const db = getDb();
  const t = now();
  const strong = strongItems(t);
  let base = db.prepare('SELECT item_id FROM item_state WHERE seen = 1').all().map((r) => r.item_id);
  if (base.length < 300) base = [...new Set([...base, ...db.prepare('SELECT id FROM items WHERE blocked = 0 ORDER BY fetched_at DESC LIMIT 3000').all().map((r) => r.id)])];
  const strongTags = conceptTagsOf(strong.map((s) => s.id));
  const baseTags = conceptTagsOf(base);
  const totS = strong.reduce((a, b) => a + b.w, 0) || 1;
  const stats = new Map();
  const get = (c) => { let x = stats.get(c); if (!x) { x = { concept: c, s: 0, n: 0, days: new Set(), last: 0, b: 0, variants: new Map(), heat: 0, up: 0, save: 0, items: [] }; stats.set(c, x); } return x; };
  for (const it of strong) {
    const m = strongTags.get(it.id);
    if (!m) continue;
    for (const [c, names] of m) {
      if (!isKinkConcept(c)) continue;
      const x = get(c);
      x.s += it.w;
      x.n++;
      x.days.add(Math.floor(it.last / DAY));
      x.last = Math.max(x.last, it.last);
      if (it.kinds.includes('rate')) x.heat++;
      if (it.kinds.includes('up')) x.up++;
      if (it.kinds.includes('save')) x.save++;
      if (m.said?.has(c)) x.said = (x.said || 0) + 1;
      x.items.push(it.id);
      for (const nm of names) x.variants.set(nm, (x.variants.get(nm) || 0) + it.w);
    }
  }
  for (const m of baseTags.values()) for (const c of m.keys()) if (stats.has(c)) stats.get(c).b++;
  const nBase = base.length;
  for (const x of stats.values()) {
    x.prevalence = x.b / Math.max(1, nBase);
    x.lift = (x.s / totS) / ((x.b + 1) / (nBase + 20));
    x.dayCount = x.days.size;
    x.textShare = (x.said || 0) / Math.max(1, x.n);
    delete x.days;
  }
  return { stats, strongCount: strong.length, baseCount: nBase };
}

export function qualifies(x, rule = RULES.create) {
  if (!x) return false;
  // A word nobody here has a meaning for (not in the concept list) only counts when the posts themselves say it,
  // not only the quick look at the picture, so background things like "floor" or "couch" never become kinks.
  if (!knownConcept(x.concept) && x.textShare < rule.text) return false;
  return x.n >= rule.n && x.s >= rule.s && (rule.days ? x.dayCount >= rule.days : true) && x.lift >= rule.lift && x.prevalence <= rule.prevalence;
}

// When nearly everything you loved about a concept is one more specific tag ("grey briefs" inside underwear),
// the kink is named after that.
function nameFor(x) {
  const total = [...x.variants.values()].reduce((a, b) => a + b, 0) || 1;
  const [top, w] = [...x.variants.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  if (top && w / total >= 0.7 && x.n >= 4 && top.split(' ').length > x.concept.split(' ').length && conceptsOf(top).length === 1 && kinkableTag(top)) return conceptName(top);
  return conceptName(x.concept);
}

// The tags a kink matches posts with: every spelling of the concept found in your posts, plus the known ones.
function tagsFor(concepts, x) {
  const db = getDb();
  const names = new Set();
  for (const c of concepts) for (const v of knownVariants(c)) names.add(v);
  if (x) for (const v of x.variants.keys()) names.add(v);
  const out = [];
  const q = db.prepare('SELECT id FROM tags WHERE name = ?');
  for (const nm of names) {
    const row = q.get(nm);
    if (!row && !concepts.includes(nm)) continue;
    out.push({ name: nm, weight: concepts.includes(nm) ? 1 : 0.9 });
  }
  return out.slice(0, 30);
}

function setTags(id, tags) {
  const db = getDb();
  db.prepare('DELETE FROM kink_tags WHERE kink_id = ?').run(id);
  const ins = db.prepare('INSERT OR REPLACE INTO kink_tags(kink_id, tag_id, weight) VALUES(?, ?, ?)');
  for (const t of tags) { const tid = tagId(t.name); if (tid) ins.run(id, tid, t.weight ?? 1); }
}

function uniqueName(name, selfId) {
  const db = getDb();
  let n = name.slice(0, 60);
  for (let i = 2; i < 9; i++) {
    const row = db.prepare('SELECT id FROM kinks WHERE name = ? COLLATE NOCASE').get(n);
    if (!row || row.id === selfId) return n;
    n = `${name} ${i}`;
  }
  return `${name} ${Date.now() % 1000}`;
}

function shade(hex, i, n) {
  const v = parseInt(hex.slice(1), 16);
  const rgb = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  const f = n <= 1 ? 0 : -0.22 + (0.44 * i) / (n - 1);
  const out = rgb.map((c) => Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f)));
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

// Colours for kinks on their own, none of them a family colour, so a loose kink never looks like part of a family.
const LOOSE = ['#D98A99', '#A58FE0', '#D2A15E', '#B7A4E8', '#F28FB1', '#8FD3F2', '#C4E08A', '#F2B98F', '#A0E0C0', '#D0A0F0', '#F0D080', '#90A8F0', '#E09090', '#80C8A8', '#C8A0B8', '#B0C870', '#F5A3C7', '#9FC9E8'];

export function removedConcepts() {
  return new Set(getSetting('kinkRemoved', []) || []);
}

export function rememberRemoved(concepts) {
  const s = removedConcepts();
  for (const c of concepts || []) s.add(c);
  setSetting('kinkRemoved', [...s].slice(-300));
}

export function forgetRemoved(concept) {
  const s = removedConcepts();
  s.delete(concept);
  setSetting('kinkRemoved', [...s]);
}

// A kink's id is used by fantasies and links: when two kinks become one, those follow the one that stays.
export function moveReferences(fromId, toId) {
  const db = getDb();
  for (const f of db.prepare('SELECT id, kinks FROM fantasies').all()) {
    const ids = parse(f.kinks, []);
    if (!ids.includes(fromId)) continue;
    const next = [...new Set(ids.map((x) => (x === fromId ? toId : x)).filter(Boolean))];
    db.prepare('UPDATE fantasies SET kinks = ? WHERE id = ?').run(JSON.stringify(next), f.id);
  }
  for (const l of db.prepare('SELECT a, b, why, origin FROM kink_links WHERE a = ? OR b = ?').all(fromId, fromId)) {
    db.prepare('DELETE FROM kink_links WHERE a = ? AND b = ?').run(l.a, l.b);
    if (!toId) continue;
    const a = l.a === fromId ? toId : l.a;
    const b = l.b === fromId ? toId : l.b;
    if (a === b) continue;
    const [x, y] = [a, b].sort((m, n) => m - n);
    db.prepare('INSERT OR IGNORE INTO kink_links(a, b, why, origin) VALUES(?, ?, ?, ?)').run(x, y, l.why, l.origin);
  }
  db.prepare('UPDATE kinks SET parent_id = NULL WHERE parent_id = ?').run(fromId);
}

export function dropKink(id) {
  const db = getDb();
  moveReferences(id, null);
  db.prepare('DELETE FROM kink_tags WHERE kink_id = ?').run(id);
  db.prepare('DELETE FROM kinks WHERE id = ?').run(id);
}

// For kinks made before concepts existed: the concept their tags are mostly about.
function legacyConcepts(row, stats) {
  const tags = getDb().prepare('SELECT t.name FROM kink_tags kt JOIN tags t ON t.id = kt.tag_id WHERE kt.kink_id = ?').all(row.id).map((r) => r.name);
  const count = new Map();
  for (const tg of [...tags, row.name]) for (const c of conceptsOf(tg)) if (isKinkConcept(c)) count.set(c, (count.get(c) || 0) + 1 + (stats.get(c)?.s || 0) / 10);
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? [best[0]] : [];
}

export function syncKinks({ ai = null } = {}) {
  ensureKinkSchema();
  const db = getDb();
  const t = now();
  const ev = conceptEvidence({ fresh: true });
  const { stats } = ev;
  const removed = removedConcepts();
  const summary = { created: [], faded: [], back: [], merged: [], renamed: [], groups: 0, strong: ev.strongCount };
  const rows = () => db.prepare('SELECT * FROM kinks').all();

  db.transaction(() => {
    // 1. Every kink is about concepts. Old kinks get theirs from their tags; a kink about nothing real goes.
    for (const r of rows()) {
      if (r.is_group) continue;
      if (r.concepts) continue;
      const cs = legacyConcepts(r, stats);
      const lk = locksOf(r);
      if (!cs.length && r.origin !== 'user' && !Object.keys(lk).length) { dropKink(r.id); continue; }
      db.prepare('UPDATE kinks SET concepts = ? WHERE id = ?').run(JSON.stringify(cs), r.id);
    }
    // 2. Two kinks about the same concept become one: yours wins, then the one that is shown, then the oldest.
    const owner = new Map();
    const order = rows().filter((r) => !r.is_group).sort((a, b) => (a.origin === 'user' || Object.keys(locksOf(a)).length ? 0 : 1) - (b.origin === 'user' || Object.keys(locksOf(b)).length ? 0 : 1)
      || (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || a.id - b.id);
    for (const r of order) {
      const cs = conceptsOfRow(r);
      const keep = cs.map((c) => owner.get(c)).find(Boolean);
      if (keep && keep.id !== r.id) {
        const userMade = r.origin === 'user' || Object.keys(locksOf(r)).length;
        if (!userMade) {
          const into = conceptsOfRow(keep);
          db.prepare('UPDATE kinks SET concepts = ? WHERE id = ?').run(JSON.stringify([...new Set([...into, ...cs])]), keep.id);
          moveReferences(r.id, keep.id);
          db.prepare('DELETE FROM kink_tags WHERE kink_id = ?').run(r.id);
          db.prepare('DELETE FROM kinks WHERE id = ?').run(r.id);
          if (r.status === 'active') summary.merged.push(`${r.name} into ${keep.name}`);
          continue;
        }
      }
      for (const c of cs) if (!owner.has(c)) owner.set(c, r);
    }
    // 3. Update every kink from its evidence. What you changed by hand stays as you set it.
    for (const r of rows()) {
      if (r.is_group) continue;
      const cs = conceptsOfRow(r);
      const lk = locksOf(r);
      const userMade = r.origin === 'user';
      const x = cs.map((c) => stats.get(c)).filter(Boolean).sort((a, b) => b.s - a.s)[0];
      const evidence = x ? { n: x.n, s: Math.round(x.s * 10) / 10, lift: Math.round(x.lift * 10) / 10, prevalence: Math.round(x.prevalence * 1000) / 10, days: x.dayCount, heat: x.heat, up: x.up, save: x.save, last: x.last } : null;
      const alive = cs.some((c) => qualifies(stats.get(c), r.status === 'active' ? RULES.keep : RULES.create));
      let status = r.status;
      if (userMade || lk.status) status = r.status === 'proposed' ? 'active' : r.status;
      else if (alive && !cs.every((c) => removed.has(c))) { if (r.status !== 'active') summary.back.push(r.name); status = 'active'; }
      else { if (r.status === 'active') summary.faded.push(r.name); status = 'hidden'; }
      let name = r.name;
      if (!lk.name && !userMade && x) {
        const want = nameFor(x);
        if (want !== r.name) { name = uniqueName(want, r.id); if (status === 'active') summary.renamed.push(`${r.name} → ${name}`); }
      }
      if (!lk.tags && x) setTags(r.id, tagsFor(cs, x));
      db.prepare('UPDATE kinks SET name = ?, status = ?, evidence = ?, faded_at = ?, updated = ? WHERE id = ?')
        .run(name, status, evidence ? JSON.stringify(evidence) : r.evidence, status === 'hidden' && r.status === 'active' ? t : r.faded_at, t, r.id);
    }
    // 4. New kinks for concepts that now clearly qualify.
    const covered = new Set(rows().flatMap((r) => conceptsOfRow(r)));
    const fresh = [...stats.values()].filter((x) => qualifies(x) && !covered.has(x.concept) && !removed.has(x.concept)).sort((a, b) => b.s - a.s);
    for (const x of fresh) {
      const name = uniqueName(nameFor(x), null);
      const info = db.prepare("INSERT INTO kinks(name, color, description, origin, status, created, updated, concepts, evidence) VALUES(?, ?, '', 'ai', 'active', ?, ?, ?, ?)")
        .run(name, LOOSE[0], t, t, JSON.stringify([x.concept]), JSON.stringify({ n: x.n, s: Math.round(x.s * 10) / 10, lift: Math.round(x.lift * 10) / 10, prevalence: Math.round(x.prevalence * 1000) / 10, days: x.dayCount, heat: x.heat, up: x.up, save: x.save, last: x.last }));
      setTags(Number(info.lastInsertRowid), tagsFor([x.concept], x));
      summary.created.push(name);
    }
    summary.groups = syncGroups(ai);
  })();
  return summary;
}

// Families: a group exists once two of your kinks share a family, named plainly after it.
export function syncGroups(aiFamilies = null) {
  const db = getDb();
  const t = now();
  const learned = { ...(getSetting('kinkFamilies', {}) || {}), ...(aiFamilies || {}) };
  const groupRemoved = new Set(getSetting('kinkGroupRemoved', []) || []);
  const all = db.prepare('SELECT * FROM kinks').all();
  const groups = all.filter((r) => r.is_group);
  const famOf = (r) => { const c = conceptsOfRow(r)[0]; return c ? familyOf(c) || learned[c] || null : null; };
  // Old groups from before (no family behind them) go, unless you made them.
  for (const g of groups) {
    const cs = conceptsOfRow(g);
    if (!cs.some((c) => c.startsWith('family:')) && g.origin !== 'user' && !Object.keys(locksOf(g)).length) {
      db.prepare('UPDATE kinks SET parent_id = NULL WHERE parent_id = ?').run(g.id);
      db.prepare('DELETE FROM kink_tags WHERE kink_id = ?').run(g.id);
      db.prepare('DELETE FROM kinks WHERE id = ?').run(g.id);
    }
  }
  const live = db.prepare('SELECT * FROM kinks WHERE is_group = 1').all();
  const byFamily = new Map(live.map((g) => [conceptsOfRow(g).find((c) => c.startsWith('family:'))?.slice(7), g]).filter(([f]) => f));
  const fresh = db.prepare("SELECT * FROM kinks WHERE is_group = 0 AND status != 'hidden'").all();
  const free = fresh.filter((k) => !locksOf(k).parent);
  // Kinks you put in a group yourself count for that group's family too.
  const pinned = new Map();
  for (const k of fresh) if (locksOf(k).parent && k.parent_id) pinned.set(k.parent_id, (pinned.get(k.parent_id) || 0) + 1);
  const members = new Map();
  for (const k of free) {
    const f = famOf(k);
    if (!f || !FAMILIES[f] || groupRemoved.has(f)) continue;
    if (!members.has(f)) members.set(f, []);
    members.get(f).push(k);
  }
  let made = 0;
  const want = new Map(free.map((k) => [k.id, null]));
  for (const [f, list] of members) {
    let g = byFamily.get(f);
    if (list.length + (g ? pinned.get(g.id) || 0 : 0) < 2) continue;
    if (!g) {
      const name = uniqueName(FAMILIES[f].name, null);
      const info = db.prepare("INSERT INTO kinks(name, color, description, origin, status, created, updated, is_group, concepts) VALUES(?, ?, '', 'ai', 'active', ?, ?, 1, ?)")
        .run(name, FAMILIES[f].color, t, t, JSON.stringify([`family:${f}`]));
      g = db.prepare('SELECT * FROM kinks WHERE id = ?').get(Number(info.lastInsertRowid));
      byFamily.set(f, g);
      made++;
    } else if (g.status === 'hidden' && !locksOf(g).status) db.prepare("UPDATE kinks SET status = 'active' WHERE id = ?").run(g.id);
    for (const k of list) want.set(k.id, g.id);
  }
  for (const k of free) if ((k.parent_id || null) !== want.get(k.id)) db.prepare('UPDATE kinks SET parent_id = ? WHERE id = ?').run(want.get(k.id), k.id);
  for (const g of db.prepare('SELECT * FROM kinks WHERE is_group = 1').all()) {
    const n = db.prepare("SELECT COUNT(*) c FROM kinks WHERE parent_id = ? AND status != 'hidden'").get(g.id).c;
    if (!n && g.origin !== 'user' && !Object.keys(locksOf(g)).length) db.prepare('DELETE FROM kinks WHERE id = ?').run(g.id);
  }
  recolor();
  return made;
}

// Kinks in a group get shades of the group's colour, so a family is easy to spot on a post. Loose kinks get
// their own colours. Colours you picked yourself stay.
export function recolor() {
  const db = getDb();
  const all = db.prepare("SELECT * FROM kinks WHERE status != 'hidden' ORDER BY id").all();
  const groups = all.filter((r) => r.is_group);
  for (const g of groups) {
    const fam = conceptsOfRow(g).find((c) => c.startsWith('family:'))?.slice(7);
    const base = locksOf(g).color ? g.color : FAMILIES[fam]?.color || g.color || LOOSE[g.id % LOOSE.length];
    if (base !== g.color) db.prepare('UPDATE kinks SET color = ? WHERE id = ?').run(base, g.id);
    const kids = all.filter((k) => !k.is_group && k.parent_id === g.id).sort((a, b) => a.id - b.id);
    kids.forEach((k, i) => { if (!locksOf(k).color) db.prepare('UPDATE kinks SET color = ? WHERE id = ?').run(shade(base, i, kids.length), k.id); });
  }
  const used = new Set(groups.map((g) => g.color));
  let i = 0;
  for (const k of all.filter((r) => !r.is_group && !r.parent_id)) {
    if (locksOf(k).color) continue;
    let c = LOOSE[(k.id + i) % LOOSE.length];
    for (let j = 0; j < LOOSE.length && used.has(c); j++) c = LOOSE[(k.id + i + j + 1) % LOOSE.length];
    used.add(c);
    i++;
    db.prepare('UPDATE kinks SET color = ? WHERE id = ?').run(c, k.id);
  }
}

// Concepts that are close to becoming a kink: shown on the map as hollow dots.
export function risingConcepts(limit = 12) {
  const { stats } = conceptEvidence();
  const covered = new Set(getDb().prepare("SELECT concepts FROM kinks WHERE status != 'hidden'").all().flatMap((r) => conceptsOfRow(r)));
  return [...stats.values()].filter((x) => !covered.has(x.concept) && x.n >= 2 && x.lift >= 1.4 && x.prevalence <= RULES.create.prevalence && !qualifies(x))
    .sort((a, b) => (knownConcept(b.concept) ? 1 : 0) - (knownConcept(a.concept) ? 1 : 0) || b.s * Math.min(3, b.lift) - a.s * Math.min(3, a.lift)).slice(0, limit)
    .map((x) => ({ concept: x.concept, name: conceptLabel(x.concept, lang(), conceptName(x.concept)), n: x.n, s: Math.round(x.s * 10) / 10, lift: Math.round(x.lift * 10) / 10, need: Math.max(0, RULES.create.n - x.n) }));
}

// Which family unknown concepts belong to, asked once to the local model and remembered.
export async function learnFamilies(chat, model) {
  const db = getDb();
  const learned = getSetting('kinkFamilies', {}) || {};
  const unknown = db.prepare("SELECT concepts FROM kinks WHERE is_group = 0 AND status != 'hidden'").all().flatMap((r) => conceptsOfRow(r)).filter((c) => !familyOf(c) && !(c in learned));
  if (!unknown.length) return null;
  const keys = Object.keys(FAMILIES);
  const out = await chat({
    kind: 'name-kinks', model, temperature: 0,
    schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { tag: { type: 'string' }, family: { type: 'string', enum: [...keys, 'none'] } }, required: ['tag', 'family'] } } }, required: ['items'] },
    system: `Sort each tag from an adult-content browser into one family: ${keys.map((k) => `${k} (${FAMILIES[k].name})`).join(', ')}. Use none when it fits no family clearly.`,
    user: unknown.join('\n')
  });
  for (const x of out?.items || []) if (unknown.includes(x.tag)) learned[x.tag] = x.family === 'none' ? null : x.family;
  for (const c of unknown) if (!(c in learned)) learned[c] = null;
  setSetting('kinkFamilies', learned);
  return learned;
}

export function logSummary(s) {
  const parts = [];
  if (s.created.length) parts.push(`new: ${s.created.join(', ')}`);
  if (s.back.length) parts.push(`back: ${s.back.join(', ')}`);
  if (s.faded.length) parts.push(`faded: ${s.faded.join(', ')}`);
  if (s.merged.length) parts.push(`combined: ${s.merged.join('; ')}`);
  if (s.renamed.length) parts.push(`renamed: ${s.renamed.join('; ')}`);
  if (parts.length) log('info', `Kinks updated from ${s.strong} posts you clearly liked. ${parts.join(' · ')}`);
}
