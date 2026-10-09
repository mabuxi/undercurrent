import { getDb, now, tagId, normalizeTag, getSetting, setSetting } from './db.js';
import { isSourceName } from './sourcenames.js';
import { itemTags, getItem, setState, specOf } from './store.js';

const DAY = 86400000;
export const TAU = { long: 60 * DAY, lately: 7 * DAY, short: 45 * 60000 };

// Scores are written in "points" so the ordering is easy to read, then scaled to the affinity range.
// Order the user asked for: save > heat > like; then how long you watched, which counts more the longer it was (two
// minutes of a video with nothing else is about as much as a like, more after that, slower and slower). Watching to
// the end or the loop coming round only adds a little: you cannot always tell how wrong a video is before its end.
export const POINTS = {
  up: 3.0, down: -3.0, unvote: 0, save: 4.0, unsave: -1.5, less: -5.0,
  follow: 3.5, reason: 3.0, more: 2.5,
  rewatch: 0.5, complete: 0.3, progressFull: 0.2,
  open: 0.8, play: 0.6, comments: 0.8, profile: 1.0, ask: 0.8,
  skip: -0.3, fastSkipVideo: -1.2, fastSkip: -0.4
};
export const POINT_SCALE = 0.3;
const VIDEO = new Set(['long', 'short', 'gif']);
const TEXT = new Set(['story', 'discussion']);
const IMAGES = new Set(['image', 'set']);

export function readMs(item) {
  const words = String(item?.body || '').split(/\s+/).filter(Boolean).length + String(item?.title || '').split(/\s+/).length;
  return Math.max(item?.format === 'discussion' ? 15000 : 20000, (words / 230) * 60000);
}

// What all the time spent on a post is worth, from the total (every visit added up), so the second minute adds less
// than the first and the tenth less than the second. About: 9 s 0,6 · 30 s 1,5 · 1 min 2,3 · 2 min 3,2 · 5 min 4,4 ·
// 10 min 5,4 points for a video; pictures a bit less, texts by how much of them you read.
export function timePoints(ms, item = null) {
  const sec = Math.max(0, (Number(ms) || 0) - 2000) / 1000;
  const fmt = item?.format;
  if (TEXT.has(fmt)) { const ratio = (Number(ms) || 0) / readMs(item); return ratio < 0.25 ? -0.1 : Math.min(1.3, ratio) * 0.9; }
  if (VIDEO.has(fmt)) return Math.min(6.5, 1.45 * Math.log(1 + sec / 15));
  if (IMAGES.has(fmt)) return Math.min(4, 1.2 * Math.log(1 + sec / 10));
  return Math.min(3, 1.0 * Math.log(1 + sec / 10));
}

// How much a like, a save or heat counts, by how long you had been on the post: half after a glance, all of it after
// two minutes. A dislike counts fully at once (you know quickly what you do not want).
export function watchWeight(ms) {
  const sec = Math.max(0, Number(ms) || 0) / 1000;
  return 0.5 + 0.5 * Math.min(1, Math.log(1 + sec / 10) / Math.log(13));
}

// A dwell: what the time adds to the total so far. The very first look being under a second and a half is a quick
// "not for me".
function dwellPoints(v, item, before = 0) {
  const fmt = item?.format;
  if (!before && v < 1200) return VIDEO.has(fmt) ? POINTS.fastSkipVideo : POINTS.skip;
  if (before && v < 1200) return 0;
  return timePoints(before + v, item) - (before ? timePoints(before, item) : 0);
}

export function points(type, value, item = null, before = 0) {
  const v = Number(value) || 0;
  const fmt = item?.format;
  switch (type) {
    case 'skip': return VIDEO.has(fmt) ? POINTS.fastSkipVideo : POINTS.fastSkip;
    case 'dwell': return dwellPoints(v, item, before);
    case 'progress': return POINTS.progressFull * Math.max(0, Math.min(1, v));
    case 'rewatch': return v > 1 ? 0.25 : POINTS.rewatch;
    case 'rate': return v > 0 ? 3.3 + Math.min(5, v) * 0.5 : 0;
    default: return POINTS[type] ?? 0;
  }
}

export function signalFor(type, value, item = null) {
  return points(type, value, item) * POINT_SCALE;
}

export const SCORE_VERSION = 7;

// Positive engagement per item, same weights as the profile (played back in order, so watch time and likes count
// the way they did when they happened). Used by the brain, history and widgets.
export function engagement(since = 0, { limit = 2500, minPoints = 0.5 } = {}) {
  const rows = getDb().prepare(`SELECT e.item_id, e.type, e.value, e.ts, i.format, i.title, i.body FROM events e JOIN items i ON i.id = e.item_id
    WHERE e.ts > ? AND e.type != 'impression' ORDER BY e.ts, e.id`).all(since);
  const per = new Map();
  for (const r of rows) {
    let x = per.get(r.item_id);
    if (!x) { x = { item_id: r.item_id, item: r, ev: [], last: r.ts }; per.set(r.item_id, x); }
    x.ev.push(r);
    x.last = r.ts;
  }
  const out = [];
  for (const x of per.values()) {
    const p = replayPoints(x.ev, x.item);
    if (p >= minPoints) out.push({ item_id: x.item_id, p, last: x.last, s: p * POINT_SCALE });
  }
  return out.sort((a, b) => b.last - a.last).slice(0, limit);
}

// All the points one post got from a list of its events, in the order they happened.
export function replayPoints(events, item) {
  let st = { vote: 0, saved: 0, rating: 0, dwell_ms: 0 };
  let total = 0;
  for (const e of events) {
    for (const p of changePoints(e.type, e.value, item, st)) total += p.p;
    st = nextState(st, e.type, e.value);
  }
  return total;
}

function nextState(st, type, value) {
  const v = Number(value) || 0;
  if (type === 'dwell') return { ...st, dwell_ms: st.dwell_ms + Math.round(v) };
  if (type === 'save' || type === 'unsave') return { ...st, saved: type === 'save' ? 1 : 0 };
  if (type === 'rate') return { ...st, rating: rateOf(v) };
  if (type === 'up' || type === 'down' || type === 'unvote') return { ...st, vote: type === 'up' ? 1 : type === 'down' ? -1 : 0 };
  return st;
}

export function decayed(row, t = now()) {
  if (!row) return { long: 0, lately: 0, short: 0, n: 0 };
  return {
    long: row.long * Math.exp(-(t - row.long_ts) / TAU.long),
    lately: row.lately * Math.exp(-(t - row.lately_ts) / TAU.lately),
    short: row.short * Math.exp(-(t - row.short_ts) / TAU.short),
    n: row.n
  };
}

export function bump(key, delta, t = now(), countIt = true) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM affinity WHERE key = ?').get(key);
  const d = decayed(row, t);
  db.prepare(`INSERT INTO affinity(key, long, short, lately, n, long_ts, short_ts, lately_ts) VALUES(@key, @long, @short, @lately, @n, @t, @t, @t)
    ON CONFLICT(key) DO UPDATE SET long = @long, short = @short, lately = @lately, n = @n, long_ts = @t, short_ts = @t, lately_ts = @t`).run({
    key, long: d.long + delta, short: d.short + delta, lately: d.lately + delta, n: d.n + (countIt ? 1 : 0), t
  });
}

export function keysForItem(item, tags) {
  const keys = tags.map((tg) => [`t:${tg.id}`, tg.weight * Math.max(0.25, Math.min(1.3, specOf(tg.id)))]);
  if (item.community && !isSourceName(item.community)) keys.push([`c:${item.community.toLowerCase()}`, 0.6]);
  if (item.author) keys.push([`a:${item.source}:${String(item.author).toLowerCase()}`, 0.6]);
  keys.push([`f:${item.format}`, 0.4]);
  keys.push([`s:${item.source}`, 0.35]);
  return keys;
}

export function applyEvent(ev, t = now(), record = true) {
  const db = getDb();
  const type = ev.type;
  const itemId = Number(ev.itemId) || null;
  if (record) db.prepare('INSERT INTO events(item_id, type, value, session_id, ts) VALUES(?, ?, ?, ?, ?)').run(itemId, type, ev.value ?? null, ev.sessionId || null, t);
  if (type === 'tagboost') {
    const name = String(ev.sessionId || '').replace(/^tag:/, '');
    const id = name ? tagId(name) : null;
    if (id && !record) bump(`t:${id}`, Number(ev.value) || 0, t);
    return 0;
  }
  if (!itemId) return 0;
  const item = getItem(itemId);
  if (!item) return 0;
  // What this post had before, so taking a like, save or heat back takes back exactly what it added.
  // (and how long you had been on it, which decides how much a like counts and what more time adds).
  const prev = db.prepare('SELECT vote, saved, rating, dwell_ms FROM item_state WHERE item_id = ?').get(itemId) || {};
  if (type === 'skip') setState(itemId, { seen: 1, seen_ts: t });
  if (type === 'impression') {
    setState(itemId, { seen: 1, seen_ts: t });
    if (record && ['long', 'short', 'gif', 'set', 'image'].includes(item.format)) db.prepare('UPDATE items SET ai_deep = 2 WHERE id = ? AND COALESCE(ai_deep, 0) = 0').run(itemId);
    return 0;
  }
  if (type === 'dwell') setState(itemId, { seen: 1, seen_ts: t, dwell_ms: (prev.dwell_ms || 0) + Math.round(Number(ev.value) || 0) });
  if (type === 'save' || type === 'unsave') setState(itemId, { saved: type === 'save' ? 1 : 0 });
  if (type === 'rate') setState(itemId, { rating: Math.max(0, Math.min(5, Math.round((Number(ev.value) || 0) * 2) / 2)) });
  if (type === 'up' || type === 'down' || type === 'unvote') setState(itemId, { vote: type === 'up' ? 1 : type === 'down' ? -1 : 0 });
  if (type === 'less') setState(itemId, { hidden: 1 });
  if (record) {
    const st = db.prepare('SELECT dwell_ms FROM item_state WHERE item_id = ?').get(itemId);
    const strong = (type === 'rate' && Number(ev.value) > 0) || type === 'save' || type === 'reason' || type === 'complete' || type === 'rewatch' || type === 'up' || (type === 'progress' && Number(ev.value) >= 0.5) || (type === 'dwell' && (st?.dwell_ms || 0) >= 60000);
    if (strong) db.prepare('UPDATE items SET ai_deep = 4 WHERE id = ? AND COALESCE(ai_deep, 0) IN (0, 1, 2, 3)').run(itemId);
  }
  const parts = changeParts(type, ev.value, item, prev).filter((p) => p.s);
  if (!parts.length) return 0;
  const tags = itemTags(itemId);
  const total = tags.reduce((a, b) => a + b.weight, 0) || 1;
  const scale = Math.min(1, 3 / total);
  const keys = keysForItem(item, tags);
  let sum = 0;
  for (const { s, undo } of parts) {
    // A dislike is about what you did not like in this post, not about what you already like in it: tags you clearly
    // like are left alone and the rest takes the blame. A skip or dislike never teaches anything about a whole format
    // or site. Taking something back undoes it on everything it touched.
    const liked = s < 0 && !undo ? likedKeys(tags, t) : null;
    for (const [key, w] of keys) {
      if (s < 0 && !undo && (key.startsWith('f:') || key.startsWith('s:'))) continue;
      if (liked?.has(key)) continue;
      bump(key, s * w * (key.startsWith('t:') ? scale : key.startsWith('c:') && s < 0 && !undo ? 0.5 : 1), t, !undo);
    }
    sum += s;
  }
  return sum;
}

// Taking something back: the change is the difference between what the post has now and what it had, so removing
// a like, a save or heat takes back exactly what it added. A like, save or heat counts more the longer you had been
// on the post, and time spent after it brings it up to what it is worth then, so the order does not matter: a like
// after two minutes and two minutes after a like end up the same.
const votePoints = (v) => (v > 0 ? POINTS.up : v < 0 ? POINTS.down : 0);
const rateOf = (v) => Math.max(0, Math.min(5, Math.round((Number(v) || 0) * 2) / 2));
const ratePoints = (r) => (r > 0 ? points('rate', r) : 0);
const posPoints = (st) => Math.max(0, votePoints(st.vote || 0)) + (st.saved ? POINTS.save : 0) + ratePoints(rateOf(st.rating));
export function changePoints(type, value, item, prev = {}) {
  const w = watchWeight(prev.dwell_ms || 0);
  const vp = (v) => (v > 0 ? votePoints(v) * w : votePoints(v));
  if (type === 'up' || type === 'down' || type === 'unvote') {
    const before = prev.vote || 0;
    const now = type === 'up' ? 1 : type === 'down' ? -1 : 0;
    if (now === before) return [];
    return [{ p: -vp(before), undo: true }, { p: vp(now), undo: false }];
  }
  if (type === 'save') return prev.saved ? [] : [{ p: POINTS.save * w, undo: false }];
  if (type === 'unsave') return prev.saved ? [{ p: -POINTS.save * w, undo: true }] : [];
  if (type === 'rate') {
    const a = rateOf(prev.rating);
    const b = rateOf(value);
    return [{ p: (ratePoints(b) - ratePoints(a)) * w, undo: b < a }];
  }
  if (type === 'dwell') {
    const before = prev.dwell_ms || 0;
    const v = Number(value) || 0;
    const out = [{ p: points('dwell', v, item, before), undo: false }];
    const pos = posPoints(prev);
    if (pos > 0 && v > 0) out.push({ p: pos * (watchWeight(before + v) - watchWeight(before)), undo: false });
    return out;
  }
  return [{ p: points(type, value, item), undo: false }];
}
export function changeParts(type, value, item, prev = {}) {
  return changePoints(type, value, item, prev).map((x) => ({ s: x.p * POINT_SCALE, undo: x.undo }));
}

// Tags you clearly like (by your long-term taste), which a dislike leaves alone.
export const LIKED_AT = 0.25;
function likedKeys(tags, t) {
  const out = new Set();
  const q = getDb().prepare('SELECT * FROM affinity WHERE key = ?');
  for (const tg of tags) {
    const key = `t:${tg.id}`;
    if (decayed(q.get(key), t).long >= LIKED_AT) out.add(key);
  }
  return out;
}

export function boostTags(names, delta, t = now()) {
  const done = [];
  for (const n of names || []) {
    const name = normalizeTag(n);
    if (!name) continue;
    const id = tagId(name);
    if (!id) continue;
    bump(`t:${id}`, delta, t);
    getDb().prepare("INSERT INTO events(item_id, type, value, session_id, ts) VALUES(NULL, 'tagboost', ?, ?, ?)").run(delta, `tag:${name}`, t);
    done.push(name);
  }
  return done;
}

export function applyEvents(list) {
  const db = getDb();
  const t = now();
  let total = 0;
  db.transaction(() => { for (const ev of list) total += applyEvent(ev, t); })();
  return total;
}

export function affinityMap(t = now()) {
  const map = new Map();
  for (const row of getDb().prepare('SELECT * FROM affinity').all()) map.set(row.key, decayed(row, t));
  return map;
}

export function topTags({ by = 'long', limit = 30, positive = true } = {}) {
  const m = affinityMap();
  const out = [];
  for (const [key, v] of m) if (key.startsWith('t:')) out.push({ id: Number(key.slice(2)), ...v });
  out.sort((a, b) => positive ? b[by] - a[by] : a[by] - b[by]);
  const names = getDb().prepare('SELECT id, name FROM tags');
  const byId = new Map(names.all().map((r) => [r.id, r.name]));
  return out.slice(0, limit).map((r) => ({ ...r, name: byId.get(r.id) }));
}

export function seedFromHistory(items, type) {
  for (const it of items) applyEvent({ itemId: it, type, value: null, sessionId: 'import' });
}

export function ensureScoreVersion() {
  if ((getSetting('scoreVersion', 1) || 1) >= SCORE_VERSION) return null;
  const r = rebuildProfile();
  setSetting('scoreVersion', SCORE_VERSION);
  return r;
}

export function rebuildProfile({ dropSession = null } = {}) {
  const db = getDb();
  let replayed = 0;
  db.transaction(() => {
    if (dropSession) db.prepare('DELETE FROM events WHERE session_id = ?').run(dropSession);
    db.exec('DELETE FROM affinity; DELETE FROM item_state;');
    for (const e of db.prepare('SELECT * FROM events ORDER BY ts, id').all()) {
      applyEvent({ itemId: e.item_id, type: e.type, value: e.value, sessionId: e.session_id }, e.ts, false);
      replayed++;
    }
  })();
  return { replayed };
}
