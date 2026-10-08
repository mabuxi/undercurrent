import { getDb, now } from './db.js';
import { isSourceName } from './sourcenames.js';
import { sessionCount } from './sessions.js';
import { hydrate, tagsForItems, lengthCat, followed, tagSpecificity, relatedTags } from './store.js';
import { providerState } from './sources/providers.js';
import { config } from './config.js';
import { mentionsIn } from './people.js';
import { genderPrefs, allowance, kindOf, stableRand, sureOf } from './gender.js';
import { affinityMap } from './profile.js';
import { listKinks, kinkIndex, kinksForTags, listFantasies } from './kinks.js';
import { getSearchSpec, getProfileItems, pool, invalidatePool } from './searchstate.js';
import { starCard } from './sources/stars.js';
import { cleanPersonName } from './names.js';
import { tr } from './i18n.js';

const FORMAT_KEYS = ['long', 'short', 'gif', 'image', 'set', 'story', 'discussion'];
const GROUP = { long: 'video', short: 'clips', gif: 'clips', image: 'images', set: 'images', story: 'text', discussion: 'text' };

function tagValue(v) {
  if (!v) return 0;
  return 0.45 * Math.tanh(v.long / 4) + 0.2 * Math.tanh(v.lately / 3) + 0.35 * Math.tanh(v.short / 2);
}

export function scoreItem(item, tags, aff, fol, t = now(), spec = tagSpecificity().map, kinkTags = null) {
  let num = 0;
  let den = 0;
  let known = 0;
  const contrib = [];
  for (const tg of tags) {
    const v = aff.get(`t:${tg.id}`);
    // A tag that is part of one of your kinks never counts against a post, even after a few quick skips.
    let val = tagValue(v);
    if (val < 0 && kinkTags?.has(tg.id)) val = 0;
    const w = tg.weight * (spec.get(tg.id) ?? 1);
    num += w * val;
    den += w;
    known += w * Math.min(1, (v?.n || 0) / 3);
    contrib.push({ id: tg.id, name: tg.name, kind: tg.kind, value: w * val, n: v?.n || 0, long: v?.long || 0 });
  }
  const tagPart = den ? num / (den + 0.4) : 0;
  const familiarity = den ? known / den : 0;
  const src = [];
  const comm = item.community && !isSourceName(item.community) ? item.community : null;
  if (comm) src.push(tagValue(aff.get(`c:${comm.toLowerCase()}`)));
  if (item.author) src.push(tagValue(aff.get(`a:${item.source}:${String(item.author).toLowerCase()}`)));
  src.push(tagValue(aff.get(`f:${item.format}`)));
  src.push(tagValue(aff.get(`s:${item.source}`)));
  const srcPart = src.reduce((a, b) => a + b, 0) / src.length;
  const ageH = item.created ? Math.max(0, (t / 1000 - item.created) / 3600) : 240;
  const pop = Math.log10((item.score || 0) + 10) / 6;
  const fresh = Math.exp(-ageH / 96) * 0.12;
  const fAt = (item.community && fol.communities.get(item.community.toLowerCase())) ?? (item.author && fol.authors.get(String(item.author).toLowerCase()));
  const isFollowed = fAt !== undefined && fAt !== null && fAt !== false;
  const followNew = isFollowed && (item.created || 0) * 1000 >= (fAt || 0) - 86400000 && ageH < 24 * 7;
  const raw = 0.62 * tagPart + 0.24 * srcPart + 0.05 * pop + fresh + (followNew ? 0.55 : isFollowed ? 0.1 : 0);
  const match = Math.round(100 / (1 + Math.exp(-(raw - 0.15) * 3.4)));
  contrib.sort((a, b) => b.value - a.value);
  const srcBits = [
    comm ? { what: 'community', name: comm, v: tagValue(aff.get(`c:${comm.toLowerCase()}`)) } : null,
    item.author ? { what: 'author', name: item.author, v: tagValue(aff.get(`a:${item.source}:${String(item.author).toLowerCase()}`)) } : null
  ].filter(Boolean);
  return { raw, match: Math.max(1, Math.min(99, match)), familiarity, followed: !!isFollowed, followNew, contrib, tagPart, srcPart, srcBits, pop };
}

function passes(item, tags, f, kinkSets) {
  if (f.formats?.length && !f.formats.includes(item.format)) return false;
  if (f.length && f.length !== 'any' && lengthCat(item) !== f.length) return false;
  if (f.community && (item.community || '').toLowerCase() !== f.community.toLowerCase()) return false;
  if (f.author && String(item.author || '').toLowerCase() !== f.author.toLowerCase()) return false;
  if (f.source && item.source !== f.source) return false;
  if (Array.isArray(f.sources) && f.sources.length && !f.sources.includes(item.source)) return false;
  const ids = new Set(tags.map((t) => t.id));
  const names = new Set(tags.map((t) => t.name));
  if (f.tags?.length) {
    const want = new Set([...f.tags, ...(f.relaxed ? f.related || [] : [])].map((n) => String(n).toLowerCase()));
    if (!tags.some((t) => want.has(t.name) && t.weight >= (f.relaxed ? 0.25 : 0.44))) return false;
  }
  if (f.q && !f.relaxed) {
    const hay = `${item.title} ${item.author || ''} ${item.community || ''} ${item.aiSummary || ''} ${[...names].join(' ')}`.toLowerCase();
    if (!String(f.q).toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
  }
  // A kink counts when the post has one of its tags, or says it in its title or text (posts the closer look has
  // not reached yet still match what they are about).
  const text = kinkSets.required.length || kinkSets.any.length ? ` ${String(`${item.title || ''} ${String(item.body || '').slice(0, 800)}`).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} ` : '';
  const hits = (set) => {
    for (const id of set) if (ids.has(id)) return true;
    for (const n of set.names || []) if (n.length >= 3 && text.includes(` ${n} `)) return true;
    return false;
  };
  for (const set of kinkSets.required) if (!hits(set)) return false;
  if (kinkSets.any.length && !kinkSets.any.some(hits)) return false;
  return true;
}

// The posts a feed can draw from, with their tags, kept for a short while. Building this is the slow part
// (thousands of rows and their tags), and the feed, the side windows and "similar" all ask for it many times a minute.
const POOL = new Map();
export { invalidatePool };

function candidatePool(whereSql, extraIds = []) {
  const key = whereSql;
  let hit = POOL.get(key);
  if (!hit || !pool.cache || hit.ver !== pool.ver || Date.now() - hit.at > 45000 || (pool.dirtyAt > hit.at && Date.now() - hit.at > 8000)) {
    const db = getDb();
    const rows = db.prepare(`SELECT i.*, s.saved, s.rating, s.vote, s.seen FROM items i LEFT JOIN item_state s ON s.item_id = i.id
      WHERE ${whereSql} ORDER BY i.fetched_at DESC LIMIT 6000`).all();
    const items = rows.map(hydrate);
    const tagMap = tagsForItems(items.map((i) => i.id));
    const disc = items.filter((i) => i.format === 'discussion').map((i) => i.score || 0).sort((a, b) => a - b);
    hit = { at: Date.now(), ver: pool.ver, items, tagMap, byId: new Set(items.map((i) => i.id)), threadCut: disc.length ? disc[Math.floor(disc.length * 0.6)] : 0 };
    POOL.set(key, hit);
    if (POOL.size > 10) POOL.delete(POOL.keys().next().value);
  }
  const missing = extraIds.filter((id) => !hit.byId.has(id));
  if (!missing.length) return hit;
  const db = getDb();
  const extra = [];
  for (let i = 0; i < missing.length; i += 500) {
    const chunk = missing.slice(i, i + 500);
    extra.push(...db.prepare(`SELECT i.*, s.saved, s.rating, s.vote, s.seen FROM items i LEFT JOIN item_state s ON s.item_id = i.id
      WHERE i.id IN (${chunk.map(() => '?').join(',')}) AND i.blocked = 0 AND COALESCE(s.hidden, 0) = 0`).all(...chunk).map(hydrate));
  }
  const tm = tagsForItems(extra.map((x) => x.id));
  return { ...hit, items: [...extra, ...hit.items], tagMap: new Map([...hit.tagMap, ...tm]) };
}

// How well a post answers a search: each thing searched for counts once, whether the post has the tag itself,
// one of its synonyms (a bit less), or the words in its title.
function searchHit(it, tags, spec) {
  const title = `${it.title || ''} ${it.author || ''} ${it.community || ''}`.toLowerCase();
  let groups = 0;
  let strength = 0;
  for (const c of spec.concepts) {
    let best = 0;
    for (const t of tags) {
      if (t.name === c.name) best = Math.max(best, t.weight);
      else if (c.syn.includes(t.name)) best = Math.max(best, 0.7 * t.weight);
    }
    if (!best && [c.name, ...c.syn].some((w) => w.length > 2 && title.includes(w))) best = 0.5;
    if (best) { groups++; strength += best; }
  }
  for (const p of spec.people) {
    const k = p.toLowerCase();
    if (title.includes(k) || tags.some((t) => t.name === k) || (it.media?.performers || []).some((x) => String(x).toLowerCase() === k)) { groups++; strength += 1; }
  }
  return { groups, strength, total: spec.concepts.length + spec.people.length };
}

function genderFits(need, kind, fetched) {
  if (!need) return true;
  const unsure = kind === 'unknown';
  if (need === 'women') return ['women', 'women?', 'mixed'].includes(kind) || (unsure && fetched);
  if (need === 'men') return ['men', 'men?', 'mixed'].includes(kind) || (unsure && fetched);
  if (need === 'both') return kind === 'mixed' || ((unsure || kind === 'men?' || kind === 'women?') && fetched);
  if (need === 'women-only') return kind === 'women' || kind === 'women?' || (unsure && fetched);
  if (need === 'men-only') return kind === 'men' || kind === 'men?' || (unsure && fetched);
  return true;
}

// How a post does on its own source, as a percentile against the other posts of that source in the pool:
// q is how well received it is overall (score and views), vel how fast it is getting there (popular right now).
// A source without any score or view data gets a neutral 0.5, so it is never pushed down for that.
export function popRaw(it) {
  return Math.log10((Number(it.score) || 0) + 1) + 0.6 * Math.log10((Number(it.media?.views) || 0) + 1);
}
export function qualityRanks(list, t = now()) {
  const bySrc = new Map();
  for (const x of list) {
    const raw = popRaw(x.it);
    const ageH = Math.max(0, (t / 1000 - (x.it.created || t / 1000)) / 3600);
    x._raw = raw;
    x._vel = raw / Math.log2(ageH + 2);
    if (!bySrc.has(x.it.source)) bySrc.set(x.it.source, []);
    bySrc.get(x.it.source).push(x);
  }
  for (const group of bySrc.values()) {
    const known = group.some((x) => x._raw > 0);
    if (!known || group.length < 4) { for (const x of group) { x.q = 0.5; x.vel = 0.5; x.qKnown = false; } continue; }
    const rank = (key, out) => {
      const sorted = group.slice().sort((a, b) => a[key] - b[key]);
      const n = sorted.length - 1;
      let i = 0;
      while (i <= n) {
        let j = i;
        while (j < n && sorted[j + 1][key] === sorted[i][key]) j++;
        const pct = n ? ((i + j) / 2) / n : 0.5;
        for (let k = i; k <= j; k++) sorted[k][out] = pct;
        i = j + 1;
      }
    };
    rank('_raw', 'q');
    rank('_vel', 'vel');
    for (const x of group) x.qKnown = true;
  }
  return list;
}

// What quality adds to a post's place in the feed: well received and rising posts move up a little, and a post
// that hardly anyone liked moves down unless it fits your taste well. It never outweighs your taste.
export function qualityBoost(x) {
  if (!x.qKnown) return 0;
  return 0.16 * (x.q - 0.5) + 0.14 * (x.vel - 0.5) - (x.q < 0.15 && x.s.tagPart < 0.25 ? 0.12 : 0);
}

const FOLLOW_SERVED = { session: -1, by: new Map() };
function followServedNow() {
  const n = sessionCount();
  if (FOLLOW_SERVED.session !== n) { FOLLOW_SERVED.session = n; FOLLOW_SERVED.by = new Map(); }
  return FOLLOW_SERVED.by;
}
const followKey = (it) => (it.author ? `a:${it.source}:${String(it.author).toLowerCase()}` : it.community && !isSourceName(it.community) ? `c:${it.community.toLowerCase()}` : null);

export function buildFeed(filters = {}, { exclude = [], limit = 12, mix = 15, capFollows = false } = {}) {
  const t = now();
  const f = { ...(filters || {}) };
  // A fantasy with tags and none of your kinks in it shows the posts with its tags.
  if (f.fantasy) {
    const fan = listFantasies().find((x) => x.id === Number(f.fantasy));
    if (fan && !fan.kinks.length && fan.tags?.length) f.tags = [...new Set([...(f.tags || []), ...fan.tags])];
  }
  const sq = f.search ? getSearchSpec(f.search) : null;
  if (f.search && !sq && f.searchLabel) f.q = f.searchLabel;
  if (sq) f.includeSeen = true;
  if (f.relaxed && (f.tags?.length || f.q)) f.related = relatedTags([...(f.tags || []), ...(f.q ? String(f.q).split(/\s+/) : [])], 8);
  if (f.relaxed && f.q && !f.tags?.length) f.tags = String(f.q).toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const gp = genderPrefs();
  const only = sq && f.profile ? getProfileItems(f.search, f.profile) || new Set() : null;
  const explicit = !!(f.q || f.author || f.community || f.saved || sq?.gender || sq?.people?.length || only);
  // Your gender balance applies to searches too, except when the search says who it wants, looks up one person or
  // profile, or you asked to see the results without your filters.
  const genderFree = !!(f.anyGender || f.author || f.community || f.saved || sq?.gender || sq?.people?.length || only);
  const where = ['i.blocked = 0', 'COALESCE(s.hidden, 0) = 0', "NOT (i.format = 'discussion' AND COALESCE(i.thread_ok, 1) = 0)"];
  // Only some sources, for a while ("only bluesky and reddit"): those, also when one of them is switched off.
  const onlySources = Array.isArray(f.sources) ? f.sources.filter((x) => /^[a-z0-9]+$/.test(x)) : [];
  if (onlySources.length) where.push(`i.source IN (${onlySources.map((x) => `'${x}'`).join(',')})`);
  else if (!config.mock && !f.saved) {
    const st = providerState();
    const on = Object.keys(st).filter((k) => st[k].enabled);
    where.push(`i.source IN (${on.map((x) => `'${x}'`).join(',') || "''"})`);
  }
  if (f.saved) where.push('s.saved = 1');
  else if (!f.includeSeen) where.push('COALESCE(s.seen, 0) = 0');
  if (f.formats?.length) where.push(`i.format IN (${f.formats.filter((x) => FORMAT_KEYS.includes(x)).map((x) => `'${x}'`).join(',') || "''"})`);
  // At 90% or more one way, posts known to show only the other side never make it into the pool at all,
  // so the pool is filled with posts that can actually be shown.
  if (!genderFree && gp.male >= 90) where.push('NOT (COALESCE(i.g_women, 0) > 0 AND COALESCE(i.g_men, 0) = 0)', ...(gp.male >= 98 ? ['NOT (COALESCE(i.g_women, 0) > 0 AND COALESCE(i.g_men, 0) > 0)'] : []));
  if (!genderFree && gp.male <= 10) where.push('NOT (COALESCE(i.g_men, 0) > 0 AND COALESCE(i.g_women, 0) = 0)', ...(gp.male <= 2 ? ['NOT (COALESCE(i.g_women, 0) > 0 AND COALESCE(i.g_men, 0) > 0)'] : []));
  const pool = candidatePool(where.join(' AND '), only ? [...only] : sq ? [...sq.fetched, ...(sq.weak || [])] : []);
  const ex = new Set(exclude.map(Number));
  const items = pool.items.filter((it) => !ex.has(it.id));
  const tagMap = pool.tagMap;
  const aff = affinityMap(t);
  const fol = followed();
  const kinks = listKinks();
  const kidx = kinkIndex(kinks);
  const kinkTags = new Set(kinks.filter((k) => !k.isGroup && (k.status === 'active' || k.origin === 'user')).flatMap((k) => k.tags.map((x) => x.id)));
  const topIds = new Set([...aff].filter(([k, v]) => k.startsWith('t:') && (v.long || 0) > 0.5).sort((a, b) => (b[1].long || 0) - (a[1].long || 0)).slice(0, 40).map(([k]) => Number(k.slice(2))));
  const kinkSet = (id) => {
    const tags = kinks.find((k) => k.id === Number(id))?.tags || [];
    const set = new Set(tags.map((x) => x.id));
    set.names = [...new Set(tags.map((x) => String(x.name || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()).filter(Boolean))];
    return set;
  };
  const kinkSets = { required: [], any: [] };
  const spec2 = tagSpecificity().map;
  const wantTags = new Set((f.tags || []).map((n) => String(n).toLowerCase()));
  if (f.kink) kinkSets.required.push(kinkSet(f.kink));
  // A pair ("Abs × Shower") or a mix of two kinks shows posts that have both, never just one of them.
  if (f.pair?.length === 2) kinkSets.required.push(kinkSet(f.pair[0]), kinkSet(f.pair[1]));
  if (f.allKinks?.length) for (const id of f.allKinks) kinkSets.required.push(kinkSet(id));
  if (f.fantasy) {
    const fan = listFantasies().find((x) => x.id === Number(f.fantasy));
    for (const k of fan?.kinks || []) kinkSets.any.push(kinkSet(k.id));
  }
  if (f.anyKinks?.length) for (const id of f.anyKinks) kinkSets.any.push(kinkSet(id));
  // Feed window: only new posts, or only popular ones, from the last day, week, month or year. It filters, it does not sort.
  const [wMode, wPeriod] = String(f.window || '').split(':');
  const days = { day: 1, week: 7, month: 30, year: 365 }[wPeriod] || 0;
  let popCut = null;
  const popOf = (it) => Math.log10((it.score || 0) + 1) + 0.6 * Math.log10((Number(it.media?.views) || 0) + 1);
  if (days && (wMode === 'new' || wMode === 'popular')) {
    const since = t / 1000 - days * 86400;
    for (let i = items.length - 1; i >= 0; i--) if ((items[i].created || 0) < since) items.splice(i, 1);
    if (wMode === 'popular') {
      const bySrc = new Map();
      for (const it of items) { if (!bySrc.has(it.source)) bySrc.set(it.source, []); bySrc.get(it.source).push(popOf(it)); }
      popCut = new Map([...bySrc].map(([k, v]) => { v.sort((a, b) => a - b); return [k, v[Math.floor(v.length * 0.7)] || 0]; }));
    }
  }
  const scored = [];
  const searchOnly = !!sq;
  for (const it of items) {
    // The men and women balance shapes everything, except when you asked for something specific.
    const gk = kindOf(it);
    const fetched = searchOnly && sq.fetched.has(it.id);
    if (only) {
      if (it.gTrans && !gp.trans) continue;
    } else if (searchOnly && sq.gender) {
      if (!genderFits(sq.gender, gk, fetched)) continue;
      if (it.gTrans && sq.trans === false) continue;
      if (it.gTrans && !gp.trans && sq.trans !== true) continue;
    } else {
      const allow = allowance(gp.male, gk, it.gTrans, gp.trans, sureOf(it), gp.everyone);
      if (!genderFree && stableRand(it.id) >= allow) continue;
    }
    if (popCut && popOf(it) < (popCut.get(it.source) || 0)) continue;
    // Threads: only the popular ones of the last month, unless you asked for something specific.
    if (it.format === 'discussion' && !explicit && !searchOnly && !f.following && ((t / 1000 - (it.created || 0)) > 30 * 86400 || (it.score || 0) < pool.threadCut)) continue;
    const tags = tagMap.get(it.id) || [];
    let hitBonus = 0;
    if (only) {
      if (!only.has(it.id)) continue;
    } else if (searchOnly) {
      const h = searchHit(it, tags, sq);
      // Posts the sources returned for the whole search need one thing searched for; everything else
      // (single-word searches, what was already here) needs at least half of it. A person's own profile posts always count.
      const personOnly = sq.people.length && !sq.concepts.length;
      const need = fetched ? (personOnly ? 0 : 1) : Math.max(1, Math.ceil(h.total * 0.5));
      if (h.total && h.groups < need) continue;
      if (!fetched && !h.total && !sq.gender) continue;
      if (sq.formats?.length && !sq.formats.includes(it.format)) continue;
      hitBonus = (h.total ? 0.9 * (h.groups / h.total) + 0.4 * (h.strength / h.total) : 0) + (fetched ? 0.2 : 0) - (it.seen ? 0.35 : 0);
    }
    if (!passes(it, tags, f, kinkSets)) continue;
    const s = scoreItem(it, tags, aff, fol, t, spec2, kinkTags);
    // 90% and more only when the AI is sure: many of your top tags, your kinks, a high fit from the AI reading it,
    // and the AI has looked at the picture itself.
    const topHits = tags.filter((x) => x.weight >= 0.45 && topIds.has(x.id)).length;
    const ksNow = kinksForTags(tags, kidx);
    const sure = 60 + 5 * Math.min(6, topHits) + 4 * Math.min(3, ksNow.length) + ((it.aiFit ?? 0) >= 75 ? 6 : 0) + (it.gSrc === 'vision' ? 4 : 0);
    if (topHits >= 3) s.match = Math.max(s.match, Math.min(it.gSrc === 'vision' ? 99 : 89, sure));
    if (f.following && !s.followed) continue;
    const ks = ksNow;
    let bonus = hitBonus;
    if (f.pair?.length === 2) {
      const have = new Set(ks.map((k) => k.id));
      if (have.has(Number(f.pair[0])) && have.has(Number(f.pair[1]))) bonus += 0.15;
    }
    if (wantTags.size) {
      const ranked = [...tags].sort((a, b) => b.weight * (spec2.get(b.id) ?? 1) - a.weight * (spec2.get(a.id) ?? 1));
      const pos = ranked.findIndex((x) => wantTags.has(x.name));
      const w = tags.filter((x) => wantTags.has(x.name)).reduce((m, x) => Math.max(m, x.weight), 0);
      bonus += 0.9 * w + (pos >= 0 ? Math.max(0, 0.5 - pos * 0.06) : 0);
    }
    if (f.q) {
      const words = String(f.q).toLowerCase().split(/\s+/).filter(Boolean);
      if (words.some((w) => String(it.title).toLowerCase().includes(w))) bonus += 0.25;
      bonus += 0.3 * tags.filter((x) => words.some((w) => x.name.includes(w))).reduce((m, x) => Math.max(m, x.weight), 0);
    }
    if (it.threadMatch != null) bonus += (it.threadMatch - 50) / 300;
    if (gk === 'men' || gk === 'men?') bonus += (gp.male - 50) / 400;
    else if (gk === 'women' || gk === 'women?') bonus += (50 - gp.male) / 400;
    if (f.minFit && it.aiFit != null && it.aiFit < f.minFit) continue;
    if (it.aiFit != null) {
      if (it.aiFit < 20 && !f.q && !f.author && !f.community && !f.saved) continue;
      bonus += (it.aiFit - 50) / 140;
    }
    scored.push({ it, tags, s, ks, value: s.raw + bonus });
  }
  qualityRanks(scored, t);
  if (!f.saved) for (const x of scored) x.value += qualityBoost(x);
  // "Intense": only posts over the bar; when too few reach it, your very best matches right now.
  if (f.minMatch) {
    const over = scored.filter((x) => x.s.match >= f.minMatch);
    const keep = over.length >= 12 ? over : scored.slice().sort((a, b) => b.s.match - a.s.match).slice(0, Math.max(12, Math.ceil(scored.length * 0.08)));
    scored.length = 0;
    scored.push(...keep);
  }
  // Someone you follow posting a lot never floods the feed: per session, their most popular post you have not seen,
  // or two when you like their posts.
  if (capFollows) {
    const served = followServedNow();
    const groups = new Map();
    for (const x of scored) {
      if (!x.s.followed) continue;
      const k = followKey(x.it);
      if (!k) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(x);
    }
    const drop = new Set();
    for (const [k, list] of groups) {
      const liked = (aff.get(k)?.long || 0) >= 0.3;
      const room = Math.max(0, (liked ? 2 : 1) - (served.get(k)?.size || 0));
      list.sort((a, b) => popOf(b.it) - popOf(a.it) || b.value - a.value);
      for (const x of list.slice(room)) drop.add(x);
    }
    if (drop.size) for (let i = scored.length - 1; i >= 0; i--) if (drop.has(scored[i])) scored.splice(i, 1);
  }
  const onlyNew = !!f.onlyNew;
  const followPool = f.following || f.author || f.community ? [] : scored.filter((x) => x.s.followNew).sort((a, b) => (b.it.created || 0) - (a.it.created || 0));
  // Popular right now: posts that are taking off on their source and fit you, mixed in about every fifth post so
  // the feed leans to what people like now instead of random picks. Without that data, the best rated of each source.
  const bySrc = new Map();
  for (const x of scored) { if (!bySrc.has(x.it.source)) bySrc.set(x.it.source, []); bySrc.get(x.it.source).push(x.it.score || 0); }
  const p90 = new Map([...bySrc].map(([k, v]) => { v.sort((a, b) => a - b); return [k, v[Math.floor(v.length * 0.9)] || 0]; }));
  const noPopular = f.following || f.author || f.community || f.saved;
  // Popular posts still have to fit you as well as your usual posts do: at least as good a match as most of what is
  // here, with tags you like, and then the ones with the most attention first.
  const matches = scored.map((x) => x.s.match).sort((a, b) => a - b);
  const fitBar = Math.max(60, matches[Math.floor(matches.length * 0.6)] || 0);
  const popularPool = noPopular ? [] : scored.filter((x) => x.s.match >= fitBar && x.s.tagPart > 0.05 && (x.qKnown
    ? x.vel >= 0.8 && x.q >= 0.5
    : (x.it.score || 0) >= (p90.get(x.it.source) || 0) && (x.it.score || 0) > 0))
    .sort((a, b) => (b.value + 0.35 * (b.qKnown ? b.vel : 0.5)) - (a.value + 0.35 * (a.qKnown ? a.vel : 0.5)));
  let pi = 0;
  let fi = 0;
  let knownTags = 0;
  for (const [k, v] of aff) if (k.startsWith('t:') && v.n >= 3) knownTags++;
  const coldStart = knownTags < 15;
  const isNew = (x) => !coldStart && x.s.familiarity < 0.35 && x.tags.length > 0;
  // Discovery: new things for you, but ones other people liked; the worst received are left out when the source says so.
  const discoveryPool = scored.filter((x) => (coldStart ? x.s.familiarity < 0.2 : isNew(x)) && (!x.qKnown || x.q >= 0.25))
    .sort((a, b) => (b.s.tagPart + 0.35 * (b.q ?? 0.5)) - (a.s.tagPart + 0.35 * (a.q ?? 0.5)) || b.it.score - a.it.score);
  const mainPool = onlyNew ? discoveryPool : scored.filter((x) => !isNew(x) || x.s.followed || f.saved || f.author || f.community);
  mainPool.sort((a, b) => b.value - a.value);
  const out = [];
  const used = new Set();
  const every = mix > 0 && !onlyNew ? Math.max(2, Math.round(100 / mix)) : Infinity;
  let di = 0;
  const recent = () => out.slice(-3);
  const pickMain = () => {
    let best = null;
    let bestV = -Infinity;
    const window = mainPool.slice(0, 120);
    // Every kind of content keeps at least about 15% of the feed, even when you engage with it less.
    const under = new Set();
    if (!f.formats?.length && out.length >= 4) {
      const share = new Map();
      for (const o of out) share.set(GROUP[o.it.format], (share.get(GROUP[o.it.format]) || 0) + 1);
      for (const g of ['video', 'clips', 'images', 'text']) if ((share.get(g) || 0) / out.length < 0.15) under.add(g);
    }
    for (const x of window) {
      if (used.has(x.it.id)) continue;
      let v = x.value;
      if (under.has(GROUP[x.it.format])) v += 0.18;
      for (const r of recent()) {
        if (r.it.community && r.it.community === x.it.community) v -= 0.05;
        if (r.it.format === x.it.format) v -= 0.07;
        if (r.tags[0] && x.tags[0] && r.tags[0].id === x.tags[0].id) v -= 0.04;
      }
      if (v > bestV) { bestV = v; best = x; }
    }
    if (best) {
      used.add(best.it.id);
      mainPool.splice(mainPool.indexOf(best), 1);
    }
    return best;
  };
  while (out.length < limit) {
    let next = null;
    let label = null;
    if (!next && followPool.length && (out.length + 2) % 5 === 0) {
      while (fi < followPool.length && used.has(followPool[fi].it.id)) fi++;
      if (fi < followPool.length) { next = followPool[fi++]; used.add(next.it.id); label = 'following'; const at = mainPool.indexOf(next); if (at >= 0) mainPool.splice(at, 1); }
    }
    if (!next && popularPool.length && (out.length + 3) % 5 === 0) {
      while (pi < popularPool.length && used.has(popularPool[pi].it.id)) pi++;
      if (pi < popularPool.length) { next = popularPool[pi++]; used.add(next.it.id); label = 'popular'; const at = mainPool.indexOf(next); if (at >= 0) mainPool.splice(at, 1); }
    }
    if (!next && (out.length + 1) % every === 0) {
      while (di < discoveryPool.length && used.has(discoveryPool[di].it.id)) di++;
      if (di < discoveryPool.length) {
        next = discoveryPool[di++];
        used.add(next.it.id);
        label = 'discovery';
      }
    }
    if (!next) next = pickMain();
    if (!next) break;
    out.push({ ...next, label: label || (onlyNew ? 'discovery' : next.s.followed ? 'following' : 'foryou') });
  }
  if (capFollows) {
    const served = followServedNow();
    for (const x of out) {
      if (!x.s.followed) continue;
      const k = followKey(x.it);
      if (!k) continue;
      if (!served.has(k)) served.set(k, new Set());
      served.get(k).add(x.it.id);
    }
  }
  const collections = f.saved || f.author || f.noCollections ? new Map() : collect(out, mainPool, used, spec2);
  return { items: out.map((x) => (collections.has(x.it.id) ? presentCollection(x, collections.get(x.it.id)) : present(x))), total: scored.length };
}

// Image collections: an image post plus unseen images that fit with it, from the same creator on any source
// or with the same look (shared kinks and most of the same specific tags). Shown as one big image and smaller ones.
const IMG = new Set(['image', 'set']);
function imgsOf(it) {
  const m = it.media || {};
  if (m.kind === 'gallery') return (m.items || []).filter((g) => g.type !== 'video').map((g) => ({ src: g.src, mid: g.mid || g.src }));
  if (m.kind === 'image' && m.src) return [{ src: m.src, mid: m.mid || m.src }];
  return [];
}
function collect(out, pool, used, spec) {
  const res = new Map();
  let lastAt = -10;
  const top = (x) => new Set(x.tags.filter((t) => t.weight >= 0.45 && t.kind !== 'performer' && (spec.get(t.id) ?? 1) >= 0.4).map((t) => t.id));
  out.forEach((x, i) => {
    if (!IMG.has(x.it.format) || i - lastAt < 4 || !imgsOf(x.it).length) return;
    const a = String(x.it.author || '').toLowerCase();
    const ta = top(x);
    const ka = new Set(x.ks.map((k) => k.id));
    const sibs = [];
    for (const y of pool) {
      if (sibs.length >= 5) break;
      if (used.has(y.it.id) || !IMG.has(y.it.format) || !imgsOf(y.it).length) continue;
      const sameAuthor = a && String(y.it.author || '').toLowerCase() === a;
      let fit = false;
      if (!sameAuthor) {
        const tb = top(y);
        let inter = 0;
        for (const t of tb) if (ta.has(t)) inter++;
        const jac = inter / Math.max(1, ta.size + tb.size - inter);
        fit = jac >= 0.45 && inter >= 3 && y.ks.some((k) => ka.has(k.id)) && Math.abs(y.s.match - x.s.match) <= 15;
      }
      if (sameAuthor || fit) sibs.push({ y, why: sameAuthor ? 'author' : 'look' });
    }
    if (sibs.length < 2) return;
    for (const s2 of sibs) used.add(s2.y.it.id);
    res.set(x.it.id, sibs);
    lastAt = i;
  });
  return res;
}
function presentCollection(x, sibs) {
  const base = present(x);
  const members = [x, ...sibs.map((s) => s.y)];
  const items = [];
  for (const m of members) for (const g of imgsOf(m.it).slice(0, 4)) items.push({ type: 'image', src: g.src, mid: g.mid, itemId: m.it.id, source: m.it.source, title: m.it.title });
  const sources = [...new Set(members.map((m) => m.it.source))];
  const sameAuthor = sibs.every((s) => s.why === 'author');
  return {
    ...base,
    format: 'set',
    media: { ...x.it.media, kind: 'gallery', items: items.slice(0, 24) },
    collection: { members: members.map((m) => m.it.id), count: members.length, sources, why: sameAuthor ? tr('{n} posts from {author}', { n: members.length, author: x.it.author }) : tr('{n} posts with the same look', { n: members.length }) },
    match: Math.round(members.reduce((a, m) => a + m.s.match, 0) / members.length)
  };
}

// Video sites where the score is the view count; their vote count is separate (or unknown).
const VOTE_SITES = new Set(['pornhub', 'redtube', 'eporner', 'xvideos', 'xnxx', 'xhamster', 'youporn', 'txxx']);

const GENERIC_WHY = /^(gay|straight|hetero|lesbian|bi|bisexual|men|man|male|women|woman|female|guys?|girls?|trans|amateur|homemade|porn|sex|solo|nsfw|verified amateurs?|verified amateurs gay|pornstar|hd|cock|dick|pussy|ass)$/;

// Why a post is here, from what actually counted: your kinks it fits (only the ones strong for you), the tags you go
// for most, the creator or community, the AI's own reading, and being popular. Gender words are left out (that is
// your balance setting), and near-duplicates ("gay" next to "verified amateurs gay") are shown once.
export function why(x) {
  const reasons = [];
  if (x.label === 'discovery') reasons.push(x.tags.length ? tr("New to you: you haven't spent time on {what} yet.", { what: x.tags.slice(0, 2).map((t) => t.name).join(` ${tr('or')} `) }) : tr("New to you: you haven't spent time on this yet."));
  if (x.s.followed) reasons.push(tr('From {name}, which you follow.', { name: x.it.author && x.it.source !== 'reddit' ? x.it.author : x.it.community }));
  const strongKinks = x.ks.filter((k) => (k.allTime + k.lately) / 2 >= 58).sort((a, b) => (b.allTime + b.lately) - (a.allTime + a.lately)).slice(0, 2);
  if (strongKinks.length) reasons.push(strongKinks.length > 1 ? tr('Fits your kinks {list}.', { list: strongKinks.map((k) => k.label || k.name).join(` ${tr('and')} `) }) : tr('Fits your kink {list}.', { list: strongKinks[0].label || strongKinks[0].name }));
  const inKinks = new Set(strongKinks.flatMap((k) => k.tags.map((t) => t.name)));
  const pos = [];
  for (const c of x.s.contrib.filter((c) => c.value > 0.03 && c.long > 0.3 && c.kind !== 'performer' && !GENERIC_WHY.test(c.name) && !inKinks.has(c.name)).sort((a, b) => b.value - a.value)) {
    if (pos.some((p) => p.includes(c.name) || c.name.includes(p))) continue;
    pos.push(c.name);
    if (pos.length >= 3) break;
  }
  if (pos.length) reasons.push(tr('You often go for {tags}.', { tags: pos.join(', ') }));
  const src = (x.s.srcBits || []).filter((b) => b.v > 0.15).sort((a, b) => b.v - a.v)[0];
  if (src && !x.s.followed) reasons.push(src.what === 'author' ? tr('You liked earlier posts from {name}.', { name: src.name }) : tr('You like what {name} posts.', { name: src.name }));
  if (x.it.aiFit != null && x.it.aiFit >= 70) reasons.push(tr('The AI read it and rates it {n}% for you.', { n: x.it.aiFit }));
  if (x.label === 'popular') reasons.push(tr('One of the most popular posts on its source right now.'));
  const neg = x.s.contrib.filter((c) => c.value < -0.05 && c.long < -0.5 && !GENERIC_WHY.test(c.name)).sort((a, b) => a.value - b.value).slice(0, 2).map((c) => c.name);
  if (neg.length) reasons.push(tr('Ranked a bit lower for {tags}, which you usually skip.', { tags: neg.join(` ${tr('and')} `) }));
  if (!reasons.length) reasons.push(tr('Not much to go on yet: recent, and popular where it was posted.'));
  return reasons;
}

function rankTags(tags) {
  const spec = tagSpecificity().map;
  return tags.filter((t) => t.kind !== 'performer').sort((a, b) => b.weight * (spec.get(b.id) ?? 1) - a.weight * (spec.get(a.id) ?? 1));
}

const titleCase = (n) => String(n).replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

const NAME_OK = (k) => /^[a-z0-9][a-z0-9'. _-]{1,40}$/.test(cleanPersonName(k));

function performersOf(x) {
  const out = [];
  const seen = new Set();
  for (const p of [...(x.it.media?.performers || []), ...x.tags.filter((t) => t.kind === 'performer').map((t) => titleCase(t.name))]) {
    const k = String(p).toLowerCase().trim();
    // The account that posted it is not "in this video", unless it is their own original content.
    const own = x.it.author && k.replace(/[^a-z0-9]/g, '') === String(x.it.author).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!k || seen.has(k) || (own && !x.it.oc) || !NAME_OK(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out.slice(0, 6);
}

export function present(x) {
  return {
    ...x.it,
    body: x.it.format === 'story' || x.it.format === 'discussion' ? x.it.body : String(x.it.body || '').slice(0, 600),
    performers: performersOf(x),
    performerCards: performersOf(x).map(starCard),
    people: mentionsIn(x.it),
    gender: { men: x.it.gMen, women: x.it.gWomen, trans: !!x.it.gTrans, sure: x.it.gSrc === 'ai' },
    match: x.it.threadMatch != null ? Math.max(1, Math.min(99, Math.round(0.4 * x.it.threadMatch + 0.6 * x.s.match))) : x.s.match,
    upvotes: VOTE_SITES.has(x.it.source) ? (Number(x.it.media?.votes) || null) : (x.it.score > 0 ? x.it.score : null),
    comments: x.it.comments > 0 ? x.it.comments : null,
    label: x.label,
    why: why(x),
    tags: rankTags(x.tags).slice(0, 26).map((t) => t.name),
    kinks: x.ks.slice(0, 3).map((k) => ({ id: k.id, name: k.label || k.name, color: k.color })),
    lengthCat: lengthCat(x.it)
  };
}

export function presentOne(item) {
  const tags = tagsForItems([item.id]).get(item.id) || [];
  const kl = listKinks();
  const kt = new Set(kl.filter((k) => !k.isGroup && (k.status === 'active' || k.origin === 'user')).flatMap((k) => k.tags.map((x) => x.id)));
  const s = scoreItem(item, tags, affinityMap(), followed(), now(), tagSpecificity().map, kt);
  const ks = kinksForTags(tags, kinkIndex(kl));
  return present({ it: item, tags, s, ks, label: s.followed ? 'following' : s.familiarity < 0.35 ? 'discovery' : 'foryou' });
}
