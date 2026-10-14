import { getDb, now } from './db.js';
import { engagement, bucketEngagement } from './profile.js';
import { tagsForItems } from './store.js';
import { kinkIndex, kinksForTags } from './kinks.js';

// How much you did with each kink, in points: every post that has the kink (by its tags or its communities) adds
// the points you gave it (watching, heat, likes, saves; skipping and disliking take points away), all time, over the
// last 7 days and over the last day. The share is the kink's points against all the points you gave in that time
// (never under 0%), so a kink you are getting into lately stands out against all time, and one you are going off drops.

const DAY = 86400000;
let cache = { at: 0, items: null };

function engagedItems() {
  if (cache.items && now() - cache.at < 60000) return cache.items;
  const t = now();
  const all = engagement(0, { limit: 20000, minPoints: -1e9 });
  const week = new Map(engagement(t - 7 * DAY, { limit: 20000, minPoints: -1e9 }).map((x) => [x.item_id, x.p]));
  const day = new Map(engagement(t - DAY, { limit: 20000, minPoints: -1e9 }).map((x) => [x.item_id, x.p]));
  const ids = all.map((x) => x.item_id);
  const tagMap = tagsForItems(ids);
  const comm = new Map();
  const q = getDb().prepare('SELECT community FROM items WHERE id = ?');
  for (const id of ids) comm.set(id, q.get(id)?.community || null);
  // Points both ways: a post you skipped or disliked takes points away from its kinks, so a kink you are going off
  // lately goes down.
  cache = { at: t, items: all.filter((x) => x.p || week.get(x.item_id) || day.get(x.item_id)).map((x) => ({ id: x.item_id, all: x.p || 0, lately: week.get(x.item_id) || 0, now: day.get(x.item_id) || 0, tags: tagMap.get(x.item_id) || [], community: comm.get(x.item_id) })) };
  return cache.items;
}

let last = { key: '', at: 0, v: null };
export function kinkPoints(kinks) {
  const key = kinks.map((k) => `${k.id}:${k.tags.length}:${(k.subs || []).length}:${k.status}`).join('|');
  if (last.v && last.key === key && now() - last.at < 60000) return last.v;
  const items = engagedItems();
  const idx = kinkIndex(kinks.map((k) => ({ ...k, status: 'active' })));
  const per = new Map();
  const tot = { all: 0, lately: 0, now: 0 };
  for (const it of items) {
    tot.all += Math.max(0, it.all);
    tot.lately += Math.max(0, it.lately);
    tot.now += Math.max(0, it.now);
    const ks = kinksForTags(it.tags, idx, it.community);
    for (const k of ks) {
      const x = per.get(k.id) || { all: 0, lately: 0, now: 0 };
      x.all += it.all;
      x.lately += it.lately;
      x.now += it.now;
      per.set(k.id, x);
    }
  }
  // A group counts every post of the kinks inside it (once each).
  for (const g of kinks.filter((k) => k.isGroup)) {
    const kids = new Set(kinks.filter((k) => k.parentId === g.id).map((k) => k.id));
    const x = { all: 0, lately: 0, now: 0 };
    for (const it of items) {
      if (!kinksForTags(it.tags, idx, it.community).some((k) => kids.has(k.id))) continue;
      x.all += it.all; x.lately += it.lately; x.now += it.now;
    }
    per.set(g.id, x);
  }
  const share = (v, total) => (total > 0 ? Math.round((Math.max(0, v) / total) * 1000) / 10 : 0);
  const out = new Map();
  for (const [id, x] of per) {
    out.set(id, {
      all: Math.round(x.all), lately: Math.round(x.lately), now: Math.round(x.now),
      shareAll: share(x.all, tot.all), shareLately: share(x.lately, tot.lately), shareNow: share(x.now, tot.now)
    });
  }
  last = { key, at: now(), v: out };
  return out;
}

// The share of your points that went to each kink (0 to 100) per stretch of time, oldest first: day by day over the
// last week or month, or week by week from your first week with the app. For the graphs of how a kink rose or dropped.
export const RANGES = { week: { ms: 86400000, n: 7 }, month: { ms: 86400000, n: 30 }, all: { ms: 7 * 86400000, n: 52 } };
const seriesCache = new Map();
export function kinkSeries(kinks, range = 'all') {
  const R = RANGES[range] || RANGES.all;
  const key = `${range}|${kinks.map((k) => `${k.id}:${(k.tags || []).length}`).join('|')}`;
  const hit = seriesCache.get(range);
  if (hit && hit.key === key && now() - hit.at < (range === 'all' ? 10 : 2) * 60000) return hit.v;
  const per = bucketEngagement(R.ms, R.n);
  const tagMap = tagsForItems([...per.keys()]);
  const q = getDb().prepare('SELECT community FROM items WHERE id = ?');
  const idx = kinkIndex(kinks.map((k) => ({ ...k, status: 'active' })));
  const total = new Array(R.n).fill(0);
  const sums = new Map();
  for (const [id, b] of per) {
    const ks = kinksForTags(tagMap.get(id) || [], idx, q.get(id)?.community || null);
    for (const [w, p] of b) {
      total[w] += Math.max(0, p);
      for (const k of ks) {
        if (!sums.has(k.id)) sums.set(k.id, new Array(R.n).fill(0));
        sums.get(k.id)[w] += p;
      }
    }
  }
  // Week by week, the line starts at your first week with the app; day by day it always shows the whole stretch.
  let first = R.n - 1;
  if (range === 'all') while (first > 0 && !total[first]) first--;
  // A stretch you did not use the app keeps the one before (no fake dip), and each point is evened out with the ones
  // next to it, so the line shows where a kink is going rather than the noise of single days or weeks.
  const out = new Map();
  for (const [id, arr] of sums) {
    const raw = arr.slice(0, first + 1).reverse().map((v, i) => { const tot = total[first - i]; return tot > 0 ? (Math.max(0, v) / tot) * 100 : null; });
    let prev = raw.find((v) => v != null) ?? 0;
    const filled = raw.map((v) => (v == null ? prev : (prev = v)));
    out.set(id, filled.map((v, i) => {
      const near = filled.slice(Math.max(0, i - 1), i + 2);
      return Math.round(((v * 2 + near.reduce((a, b) => a + b, 0) - v) / (near.length + 1)) * 10) / 10;
    }));
  }
  seriesCache.set(range, { at: now(), key, v: out });
  return out;
}
export function kinkWeeks(kinks) {
  return kinkSeries(kinks, 'all');
}

// The kinks that moved the most over a stretch, with their lines (for the graph on your kinks page).
export function kinkMovers(kinks, range = 'all', limit = 6) {
  const series = kinkSeries(kinks, range);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  return kinks.map((k) => {
    const s = series.get(k.id) || [];
    if (s.length < 3) return null;
    const half = Math.floor(s.length / 2);
    return { id: k.id, name: k.label || k.name, color: k.color, series: s, change: Math.round((avg(s.slice(half)) - avg(s.slice(0, half))) * 10) / 10, now: s[s.length - 1] };
  }).filter((x) => x && Math.max(...x.series) > 0).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, limit);
}
