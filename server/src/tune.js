import { getDb, getSetting, setSetting, now, normalizeTag } from './db.js';
import { replayPoints, topTags } from './profile.js';
import { sourcesForTopic } from './discover.js';
import { tagSpecificity, itemTags } from './store.js';
import { providerState } from './sources/providers.js';
import { isBlocked } from './safety.js';
import { conceptsOf, isKinkConcept, familyOf } from './concepts.js';
import { log } from './log.js';
import { tr } from './i18n.js';

// Quick tuning of the automatic sources while you scroll. Every few posts it looks at what you just saw:
// sources whose last posts you all skipped rest right away, sources for what you are into right now wake up or
// are added (and fetched at once, popular this week first), and when the feed feels the same or nothing lands,
// it brings searches for things you like that were not on screen lately. Sources you follow yourself are never
// touched. The slower hourly round (discover.js) still does the bigger clean-up.

const EVERY = 5;
const MIN_GAP = 40000;
const MAX_AUTO_SEARCHES = 70;

let seenSince = 0;
let lastAt = 0;
let running = null;

export function noteSeen(list) {
  seenSince += list.filter((e) => e.type === 'impression' || e.type === 'skip').length;
  if (seenSince < EVERY || running || now() - lastAt < MIN_GAP || !getSetting('autoFollow', true)) return null;
  seenSince = 0;
  lastAt = now();
  running = quickTune().catch((e) => { log('warn', `Quick source tuning failed: ${e.message}`); return null; }).finally(() => { running = null; });
  return running;
}

function pointsOf(itemId, item) {
  const ev = getDb().prepare("SELECT type, value FROM events WHERE item_id = ? AND type NOT IN ('impression', 'tagboost') ORDER BY ts, id").all(itemId);
  return replayPoints(ev, item);
}

// The posts you saw last, newest first, with how much each one did for you.
export function recentSeen(n = 12) {
  const db = getDb();
  const rows = db.prepare("SELECT item_id, MAX(ts) ts FROM events WHERE type IN ('impression', 'skip') AND item_id IS NOT NULL GROUP BY item_id ORDER BY ts DESC LIMIT ?").all(n);
  return rows.map((r) => {
    const it = db.prepare('SELECT id, via, source, format, title, body FROM items WHERE id = ?').get(r.item_id);
    if (!it) return null;
    return { id: it.id, via: it.via, source: it.source, p: pointsOf(it.id, it), tags: itemTags(it.id).filter((t) => t.weight >= 0.45 && t.kind !== 'performer').map((t) => t.name) };
  }).filter(Boolean);
}

// An automatic source whose last five or six posts you saw did nothing for you rests (kept, not fetched).
function restDull(recent) {
  const db = getDb();
  const rested = [];
  const ids = [...new Set(recent.map((r) => r.via).filter((v) => String(v || '').startsWith('f:')).map((v) => Number(v.slice(2))))];
  for (const id of ids) {
    const f = db.prepare("SELECT * FROM follows WHERE id = ? AND synced_from = 'auto' AND active = 1").get(id);
    if (!f) continue;
    const last = db.prepare("SELECT i.id, i.format, i.title, i.body FROM items i JOIN item_state s ON s.item_id = i.id WHERE i.via = ? AND s.seen = 1 ORDER BY s.seen_ts DESC LIMIT 6").all(`f:${id}`);
    if (last.length < 5) continue;
    const pts = last.map((x) => pointsOf(x.id, x));
    const liked = pts.filter((p) => p >= 2).length;
    const sum = pts.reduce((a, p) => a + Math.max(0, p), 0);
    if (!liked && sum < 1.5) {
      db.prepare('UPDATE follows SET active = 0, dormant_since = ?, why = ? WHERE id = ?').run(now(), tr('resting: you skipped its last {n} posts', { n: last.length }), id);
      rested.push(f.label || f.value);
    }
  }
  return rested;
}

const covered = () => new Set(getDb().prepare("SELECT topic FROM follows WHERE active = 1 AND topic IS NOT NULL").all().flatMap((r) => r.topic.split(',').map((x) => x.trim())));

export async function quickTune({ st = providerState(), fetch = true } = {}) {
  const db = getDb();
  const recent = recentSeen(12);
  const out = { rested: [], woke: [], added: [], bored: false };
  if (recent.length < EVERY) return out;
  out.rested = restDull(recent);

  // Same thing over and over, or nothing lands: time for something else you like.
  const counts = new Map();
  for (const r of recent.slice(0, 10)) for (const tg of new Set(r.tags)) counts.set(tg, (counts.get(tg) || 0) + 1);
  const top = [...counts.values()].sort((a, b) => b - a)[0] || 0;
  const avg = recent.slice(0, 10).reduce((a, r) => a + r.p, 0) / Math.min(10, recent.length);
  out.bored = recent.length >= 8 && (avg < 0.5 || top / Math.min(10, recent.length) > 0.6);

  const spec = tagSpecificity().map;
  // Only tags that make a good search: a real kink idea (a body type, an act, a place...) or a phrase of a few
  // words, not single loose words like "bed" or "massive".
  const searchable = (name) => conceptsOf(name).some((c) => isKinkConcept(c) && (familyOf(c) || String(name).trim().includes(' ')));
  const ok = (t) => t.name && t.name.length > 2 && (spec.get(t.id) ?? 1) >= 0.4 && searchable(t.name) && !isBlocked({ title: t.name, tags: [t.name] }).blocked;
  const hot = topTags({ by: 'short', limit: 10 }).filter((t) => t.short > 0.25 && ok(t)).slice(0, 6);

  // Sources resting for what you are into right now wake up.
  const fetchNow = [];
  for (const t of hot) {
    const name = normalizeTag(t.name);
    for (const f of db.prepare("SELECT * FROM follows WHERE synced_from = 'auto' AND active = 0 AND dormant_since IS NOT NULL AND topic LIKE ?").all(`%${name}%`)) {
      if (out.woke.length >= 3) break;
      db.prepare('UPDATE follows SET active = 1, dormant_since = NULL, why = ? WHERE id = ?').run(tr('woke up: you are into it again'), f.id);
      out.woke.push(f.label || f.value);
      fetchNow.push(f.id);
    }
  }

  // New searches: what you are into right now that has none yet, and when bored, things you like that were not
  // on screen lately.
  const have = covered();
  const seenTags = new Set(recent.flatMap((r) => r.tags));
  const wanted = hot.filter((t) => !have.has(normalizeTag(t.name)));
  if (out.bored) {
    for (const t of topTags({ by: 'long', limit: 25 }).filter((x) => x.long > 0.3 && ok(x))) {
      const n = normalizeTag(t.name);
      if (!have.has(n) && !seenTags.has(n) && !wanted.some((w) => w.name === t.name)) wanted.push(t);
    }
  }
  const room = MAX_AUTO_SEARCHES - db.prepare("SELECT COUNT(*) c FROM follows WHERE synced_from = 'auto' AND kind = 'search' AND active = 1").get().c;
  const max = Math.min(room, out.bored ? 3 : 2);
  for (const t of wanted) {
    if (out.added.length >= max) break;
    const before = db.prepare('SELECT COALESCE(MAX(id), 0) m FROM follows').get().m;
    const added = await sourcesForTopic(t.name, [t.name], { st, searches: 1, withNiche: false });
    if (!added.length) continue;
    out.added.push(...added);
    for (const f of db.prepare("SELECT id FROM follows WHERE id > ? AND synced_from = 'auto'").all(before)) fetchNow.push(f.id);
  }

  if (fetch && fetchNow.length) {
    const { fetchFollowNow } = await import('./ingest.js');
    await Promise.all(fetchNow.slice(0, 6).map((id) => fetchFollowNow(id, 'week').catch(() => null)));
  }
  const parts = [out.rested.length ? `rested ${out.rested.join(', ')}` : '', out.woke.length ? `woke ${out.woke.join(', ')}` : '', out.added.length ? `added ${out.added.join(', ')}` : ''].filter(Boolean);
  if (parts.length) {
    log('info', `Quick tuning${out.bored ? ' (feed felt samey or flat)' : ''}: ${parts.join('; ')}`);
    const hist = getSetting('tuneLog', []) || [];
    hist.unshift({ at: now(), bored: out.bored, rested: out.rested, woke: out.woke, added: out.added });
    setSetting('tuneLog', hist.slice(0, 30));
  }
  return out;
}
