import { getDb, now } from './db.js';
import { engagement } from './profile.js';
import { tagsForItems } from './store.js';
import { kinkIndex, kinksForTags } from './kinks.js';

// How much you did with each kink, in points: every post that has the kink (by its tags or its communities) adds
// the points you gave it (watching, heat, likes, saves), all time, over the last 7 days and over the
// last day. The share is the part of all your points in that time that went to the kink, so a kink you are getting
// into lately stands out clearly against all time.

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
  // Only what you got out of a post counts: a post you skipped adds nothing (it does not take points away).
  const pos = (v) => Math.max(0, v || 0);
  cache = { at: t, items: all.filter((x) => x.p > 0 || week.get(x.item_id) > 0).map((x) => ({ id: x.item_id, all: pos(x.p), lately: pos(week.get(x.item_id)), now: pos(day.get(x.item_id)), tags: tagMap.get(x.item_id) || [], community: comm.get(x.item_id) })) };
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
