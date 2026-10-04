import { getDb, now } from './db.js';
import { buildFeed, presentOne } from './rank.js';
import { hydrate, followed, relatedTags } from './store.js';
import { listKinks, listFantasies, kinkPairs, listLinks } from './kinks.js';
import { topTags, affinityMap, engagement } from './profile.js';
import { hotThreads } from './threads.js';
import { listSuggestions, newKinks } from './suggest.js';
import { brain } from './brain.js';
import { genderPrefs, allowance, kindOf, stableRand, sureOf } from './gender.js';
import { sessionStats } from './ai/assistant.js';
import { listMemory } from './memory.js';
import { userLimits } from './safety.js';
import { displayTag } from './tagquality.js';

const same = (a, b) => String(a || '').toLowerCase().replace(/[^a-z0-9]+/g, '') === String(b || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function slim(it) {
  return {
    created: it.created, id: it.id, title: it.title, format: it.format, media: it.media, match: it.match, label: it.label, kinks: it.kinks || [], oc: !!it.oc, aiSummary: it.format === 'discussion' ? it.aiSummary : undefined,
    duration: it.duration, score: it.score, upvotes: it.upvotes ?? null, comments: it.comments ?? null, author: it.author, community: it.community, source: it.source, lengthCat: it.lengthCat
  };
}

let EXCLUDE = [];
let MEDIA = new Set();
const RATE_ASKED = new Set();

// The picture a post shows, so the same image (posted twice, or crossposted) is never in two windows.
export function mediaKey(it) {
  const m = it.media || {};
  const u = m.poster || m.mid || m.src || m.thumbs?.[0] || m.items?.[0]?.mid || m.items?.[0]?.src || m.redgifsId || '';
  return String(u).replace(/[?#].*$/, '').replace(/^https?:\/\/[^/]+/, '').toLowerCase();
}

function feed(filters, limit, offset = 0) {
  filters = { ...filters, noCollections: true };
  const r = buildFeed(filters, { limit: (limit + offset) * 2, mix: 0, exclude: EXCLUDE }).items.filter((it) => { const k = mediaKey(it); return !k || !MEDIA.has(k); });
  const out = r.slice(offset % Math.max(1, r.length - limit + 1)).slice(0, limit).map(slim);
  for (const it of out) { EXCLUDE.push(it.id); const k = mediaKey(it); if (k) MEDIA.add(k); }
  return out;
}

// What each browser session already got in a window (both columns), for 45 minutes.
const SERVED = new Map();
function servedFor(sid) {
  const key = sid || 'none';
  if (!SERVED.has(key)) SERVED.set(key, { ids: new Map(), media: new Map(), titles: [] });
  const s = SERVED.get(key);
  const cut = Date.now() - 45 * 60000;
  for (const [k, t] of s.ids) if (t < cut) s.ids.delete(k);
  for (const [k, t] of s.media) if (t < cut) s.media.delete(k);
  return s;
}

const LAYOUTS = [['carousel', 4], ['hero', 3], ['mosaic', 2], ['list', 1]];
function pickLayout(r) {
  let x = r() * 10;
  for (const [l, w] of LAYOUTS) { x -= w; if (x <= 0) return l; }
  return 'carousel';
}
const SAVES = new Set(['recentSaved', 'oldSaves', 'savedPick']);
const RARE = new Set(['fantasySuggest', 'combo', 'tonight', 'analytics', 'map', 'limits', 'savedFant', 'moodCheck', 'rateRecent', 'recentSaved', 'oldSaves', 'shortsRail', 'memory', 'newKink', 'savedPick']);

// Windows that come in variants take turns, so two analytics or map windows in a row never look the same.
const TURN = new Map();
function turn(family, n) {
  const v = TURN.get(family) || 0;
  TURN.set(family, v + 1);
  return v % n;
}
function agoText(sec) {
  if (!sec) return '';
  const d = Date.now() / 1000 - sec;
  if (d < 3600) return `${Math.max(1, Math.round(d / 60))} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  return `${Math.round(d / 86400)} d ago`;
}
function savedRows(order, limit) {
  return getDb().prepare(`SELECT i.*, (SELECT MAX(ts) FROM events e WHERE e.item_id = i.id AND e.type = 'save') saved_at FROM item_state s JOIN items i ON i.id = s.item_id
    WHERE s.saved = 1 AND i.blocked = 0 ORDER BY ${order} LIMIT ?`).all(limit);
}

const FORMAT_GROUPS = [
  { label: 'images', formats: ['image', 'set'], layout: 'mosaic' },
  { label: 'videos', formats: ['long'], layout: 'hero' },
  { label: 'short clips', formats: ['short', 'gif'], layout: 'carousel' },
  { label: 'to read', formats: ['story', 'discussion'] },
  { label: 'mixed', formats: null },
  { label: 'mixed', formats: null }
];

// Kinks weighted by how big they are on your map, so the biggest ones come up most, not the last video you saw.
function pickKink(r, ctx) {
  const list = ctx.kinks.slice(0, 14);
  if (!list.length) return null;
  const w = list.map((k) => Math.max(1, (k.allTime + k.lately) / 2 - 45) ** 1.4);
  let x = r() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) { x -= w[i]; if (x <= 0) return list[i]; }
  return list[0];
}
function pickTag(r, ctx) {
  const tags = ctx.longTags;
  if (!tags.length) return null;
  const t = tags[Math.floor(r() * Math.min(tags.length, 15))];
  return { kind: 'tag', name: t.name, color: '#B6A8B0' };
}

function build(type, r, ctx) {
  const off = Math.floor(r() * 6);
  const k = pickKink(r, ctx);
  const kinkMeta = (kk) => ({ kink: { id: kk.id, name: kk.name, color: kk.color }, color: kk.color });
  switch (type) {
    case 'kinkList': {
      if (!k) return null;
      const items = feed({ kink: k.id }, 8, off);
      return items.length ? { type, layout: pickLayout(r), title: k.name, meta: `${k.status === 'proposed' ? 'suggested kink' : 'kink'} · ${Math.round((k.allTime + k.lately) / 2)}% match`, filter: { kink: k.id }, items, ...kinkMeta(k) } : null;
    }
    case 'kinkDeep': {
      const groups = ctx.groups.filter((g) => ctx.children.get(g.id)?.length);
      const g = groups.length && r() < 0.7 ? groups[Math.floor(r() * groups.length)] : null;
      if (g) {
        const kids = ctx.children.get(g.id);
        const kid = kids[Math.floor(r() * kids.length)];
        const items = feed({ kink: kid.id }, 8, off);
        if (!items.length) return null;
        return { type: 'kinkDeep', layout: pickLayout(r), title: kid.name, meta: `inside ${g.name}`, filter: { kink: kid.id }, items, group: { id: g.id, name: g.name }, subs: kids.map((x) => ({ id: x.id, name: x.name, color: x.color })), activeSub: kid.id, color: kid.color || g.color, kink: { id: kid.id, name: kid.name, color: kid.color } };
      }
      if (!k) return null;
      const niche = (k.tags || []).filter((x) => !same(x.name, k.name)).slice(0, 5);
      const t = niche[Math.floor(r() * niche.length)];
      const items = t ? feed({ kink: k.id, tags: [t.name] }, 8, off) : [];
      const use = items.length >= 2 ? items : feed({ kink: k.id }, 8, off);
      if (!use.length) return null;
      return { type: 'kinkDeep', layout: pickLayout(r), title: items.length >= 2 ? `${k.name}: ${displayTag(t.name)}` : k.name, meta: 'go deeper', filter: items.length >= 2 ? { kink: k.id, tags: [t.name] } : { kink: k.id }, items: use, subs: niche.map((x) => ({ tag: x.name, name: displayTag(x.name) })), activeTag: items.length >= 2 ? t.name : null, color: k.color, kink: { id: k.id, name: k.name, color: k.color } };
    }
    case 'formatMix': {
      // A category from your map shown as one kind of content, or mixed.
      const subj = r() < 0.7 && k ? { kind: 'kink', id: k.id, name: k.name, color: k.color } : pickTag(r, ctx);
      if (!subj) return null;
      const f = FORMAT_GROUPS[Math.floor(r() * FORMAT_GROUPS.length)];
      const base = subj.kind === 'kink' ? { kink: subj.id } : { tags: [subj.name] };
      const filter = f.formats ? { ...base, formats: f.formats } : base;
      const items = feed(filter, f.formats?.includes('story') || f.formats?.includes('discussion') ? 4 : 6, off);
      if (items.length < 2) return null;
      return { type: f.formats?.includes('story') ? 'stories' : 'kinkList', layout: f.layout || pickLayout(r), title: `${subj.kind === 'kink' ? subj.name : displayTag(subj.name)} · ${f.label}`, meta: subj.kind === 'kink' ? 'from your map' : 'a tag you respond to', filter, items: items.map((it) => ({ ...it, readMin: it.media?.readMin || undefined })), color: subj.color || '#B6A8B0', ...(subj.kind === 'kink' ? { kink: { id: subj.id, name: subj.name, color: subj.color } } : {}) };
    }
    case 'kinkMix': {
      if (ctx.kinks.length < 3) return null;
      const a = pickKink(r, ctx);
      let b = pickKink(r, ctx);
      for (let t = 0; t < 4 && b?.id === a?.id; t++) b = pickKink(r, ctx);
      if (!a || !b || a.id === b.id) return null;
      const items = feed({ anyKinks: [a.id, b.id] }, 6, off);
      if (items.length < 3) return null;
      return { type: 'kinkList', layout: pickLayout(r), title: `${a.name} and ${b.name}`, meta: 'a mix from your map', filter: { anyKinks: [a.id, b.id] }, items, color: a.color };
    }
    case 'nearby': {
      // Similar to what you watched lately, but not the same thing.
      const recent = ctx.nowTags.slice(0, 4).map((t) => t.name);
      if (!recent.length) return null;
      const near = relatedTags(recent, 10).filter((x) => !recent.includes(x));
      if (!near.length) return null;
      const t = near[Math.floor(r() * Math.min(near.length, 6))];
      const items = feed({ tags: [t] }, 6, off);
      if (items.length < 2) return null;
      return { type: 'kinkList', layout: pickLayout(r), title: `Near what you just watched: ${displayTag(t)}`, meta: 'similar, not the same', filter: { tags: [t] }, items, color: '#E8C66B' };
    }
    case 'tagNow': {
      const tags = ctx.nowTags;
      if (!tags.length) return null;
      const t = tags[Math.floor(r() * Math.min(tags.length, 5))];
      const items = feed({ tags: [t.name] }, 8, off);
      return items.length ? { type: 'kinkList', layout: pickLayout(r), title: `Right now: ${displayTag(t.name)}`, meta: 'from what you just watched', filter: { tags: [t.name] }, items, color: '#E8C66B' } : null;
    }
    case 'performer': {
      const ps = ctx.performers;
      if (!ps.length) return null;
      const p = ps[Math.floor(r() * Math.min(ps.length, 8))];
      const items = feed({ tags: [p.name] }, 6, 0);
      return items.length ? { type: 'kinkList', layout: r() < 0.5 ? 'carousel' : 'hero', performerThumb: p.thumb || null, title: p.name.replace(/\b\w/g, (c) => c.toUpperCase()), meta: `performer · ${p.n} videos here`, filter: { tags: [p.name] }, performer: p.name, items, color: '#D6A0CF' } : null;
    }
    case 'gallery': {
      const items = feed({ formats: ['set', 'image'] }, 4, off);
      return items.length >= 2 ? { type: 'gifs', title: 'Photo posts', meta: 'image sets and pictures', filter: { formats: ['set', 'image'] }, items, color: '#93B4DF' } : null;
    }
    case 'kinkSpot': {
      if (!k) return null;
      const items = feed({ kink: k.id, formats: ['long', 'image', 'set', 'short'] }, 3, off);
      if (!items.length) return null;
      if (items[0].match >= 90) return { type, title: k.name, meta: 'spotlight', filter: { kink: k.id }, items: items.slice(0, 1), ...kinkMeta(k) };
      return { type: 'kinkList', layout: 'list', title: k.name, meta: 'kink', filter: { kink: k.id }, items, ...kinkMeta(k) };
    }
    case 'pair': {
      if (!ctx.pairs.length) return null;
      const p = ctx.pairs[Math.floor(r() * ctx.pairs.length)];
      const items = feed({ pair: [p.a.id, p.b.id] }, 4, off);
      return items.length ? { type, title: `${p.a.name} × ${p.b.name}`, meta: `pairs well · ${p.score}%`, filter: { pair: [p.a.id, p.b.id] }, items, pair: [p.a, p.b], color: p.a.color } : null;
    }
    case 'fantasy': {
      if (!ctx.fantasies.length) return null;
      const f = ctx.fantasies[Math.floor(r() * ctx.fantasies.length)];
      return { type, title: f.name, meta: `fantasy · ${f.match}%`, filter: { fantasy: f.id }, fantasy: f, color: '#F6C35B' };
    }
    case 'following':
    case 'followLatest':
    case 'followSpotlight': {
      const fol = getDb().prepare("SELECT kind, value, label, created FROM follows WHERE active = 1 AND COALESCE(synced_from, '') NOT IN ('auto', 'source') AND kind NOT IN ('subreddit', 'community') ORDER BY RANDOM() LIMIT 12").all()
        .map((f) => { const [p, ...rest] = f.value.split('|'); const v = rest.length ? rest.join('|') : f.value; return { ...f, provider: rest.length ? p : f.kind === 'subreddit' ? 'reddit' : p, name: v }; });
      if (!fol.length) return null;
      if (type === 'followSpotlight') {
        const f = fol[Math.floor(r() * fol.length)];
        const filter = f.kind === 'community' || f.kind === 'subreddit' ? { community: f.provider === 'reddit' ? `r/${f.name}` : f.name } : { author: f.name };
        const items = feed(filter, 6, 0).sort((a, b) => (b.created || 0) - (a.created || 0));
        if (!items.length) return null;
        const fresh = items.filter((x) => (x.created || 0) * 1000 > (f.created || 0)).length;
        return { type: 'kinkList', layout: r() < 0.5 ? 'carousel' : 'hero', title: f.label || f.name, meta: `following · newest ${agoText(items[0].created)}${fresh ? ` · ${fresh} new` : ''}`, newest: items[0].created, filter, items, color: '#8EA6C9' };
      }
      const items = buildFeed({ following: true, noCollections: true }, { limit: 16, mix: 0, exclude: EXCLUDE }).items
        .sort((a, b) => (b.created || 0) - (a.created || 0)).slice(0, type === 'followLatest' ? 8 : 5).map(slim);
      const newest = items[0]?.created || null;
      if (type === 'followLatest') return items.length ? { type: 'followLatest', title: 'Latest from who you follow', meta: newest ? `newest post ${agoText(newest)}` : 'newest first', newest, filter: { following: true }, items, color: '#8EA6C9' } : null;
      return { type, title: 'Following', meta: `${fol.length} followed${newest ? ` · newest ${agoText(newest)}` : ''}`, newest, filter: { following: true }, follows: fol.slice(0, 8).map((f) => ({ kind: f.kind, value: f.name, provider: f.provider })), items, color: '#8EA6C9' };
    }
    case 'trending': {
      const kk = k;
      const rows = getDb().prepare(`SELECT i.* FROM items i LEFT JOIN item_state s ON s.item_id = i.id WHERE i.blocked = 0 AND COALESCE(s.hidden,0) = 0 AND COALESCE(s.seen,0) = 0 AND i.created_utc > ? ORDER BY i.score DESC LIMIT 80`).all(Math.round(now() / 1000) - 7 * 86400);
      const gp = genderPrefs();
      let items = rows.filter((row) => !EXCLUDE.includes(row.id)).map(hydrate).filter((it) => stableRand(it.id) < allowance(gp.male, kindOf(it), it.gTrans, gp.trans, sureOf(it), gp.everyone)).map((it) => presentOne(it));
      if (kk) {
        const f = items.filter((it) => it.kinks.some((x) => x.id === kk.id));
        if (f.length >= 3) items = f;
      }
      items = items.slice(0, 5).map(slim);
      for (const it of items) EXCLUDE.push(it.id);
      return items.length ? { type, title: 'Popular this week', meta: kk && items.every((it) => it.kinks.some((x) => x.id === kk.id)) ? kk.name : 'across your sources', filter: kk ? { kink: kk.id } : {}, items, color: kk?.color || '#E39A83' } : null;
    }
    case 'gifs': {
      const items = feed(k && r() < 0.5 ? { formats: ['gif'], kink: k.id } : { formats: ['gif'] }, 4, off);
      return items.length ? { type, title: 'GIFs', meta: 'loops', filter: { formats: ['gif'] }, items, color: '#B79BF0' } : null;
    }
    case 'shortsRail': {
      const items = feed({ formats: ['short'] }, 3, off);
      return items.length ? { type, title: 'Short form', meta: 'vertical clips', filter: { formats: ['short'] }, items, color: '#7FD0C2' } : null;
    }
    case 'creator': {
      const aff = ctx.aff;
      const rows = getDb().prepare(`SELECT source, author, COUNT(*) n, SUM(score) sc FROM items WHERE blocked = 0 AND author IS NOT NULL AND author NOT IN ('[deleted]','AutoModerator') GROUP BY source, author HAVING n >= 2 ORDER BY n DESC LIMIT 80`).all();
      if (!rows.length) return null;
      const fol = followed();
      rows.forEach((a) => { const v = aff.get(`a:${a.source}:${String(a.author).toLowerCase()}`); a.aff = (v?.long || 0) + (v?.lately || 0); a.following = fol.authors.has(String(a.author).toLowerCase()); });
      const pool = rows.filter((a) => !a.following && a.aff > 0).sort((a, b) => b.aff - a.aff || b.n - a.n);
      const list = pool.length ? pool : rows.filter((a) => !a.following);
      if (!list.length) return null;
      const a = list[Math.floor(r() * Math.min(list.length, 12))];
      const items = feed({ author: a.author }, 3);
      if (!items.length) return null;
      const match = Math.round(items.reduce((x, y) => x + (y.match || 0), 0) / items.length);
      return { type, layout: items.length >= 3 && r() < 0.5 ? 'hero' : 'list', title: a.author, meta: `creator you might like · ${match}% match`, filter: { author: a.author }, creator: { name: a.author, source: a.source, posts: a.n, followed: false, match }, items, color: '#E3A58F' };
    }
    case 'discovery': {
      const items = feed({ onlyNew: true }, 3, off);
      return items.length ? { type, big: items[0].match >= 90, title: 'New to you', meta: 'not opened yet', filter: { onlyNew: true }, items: items[0].match >= 90 ? items.slice(0, 1) : items, color: '#E8C66B' } : null;
    }
    case 'savedPick': {
      const rows = getDb().prepare('SELECT i.* FROM item_state s JOIN items i ON i.id = s.item_id WHERE s.saved = 1 AND i.blocked = 0 ORDER BY RANDOM() LIMIT 6').all();
      return rows.length >= 2 ? { type: 'recentSaved', title: 'From your saves', meta: `${rows.length} saved posts, picked at random`, filter: { saved: true }, items: rows.map((row) => slim(presentOne(hydrate(row)))), color: '#C98BC4' } : null;
    }
    case 'stories': {
      let items = feed({ formats: ['story'], minFit: 55 }, 6, off);
      if (items.length < 2) items = feed({ formats: ['story'] }, 6, off);
      items = items.map((it) => ({ ...it, readMin: it.media?.readMin || 1 }));
      return items.length ? { type, title: 'Keep reading', meta: `stories · ${items.reduce((a, b) => a + b.readMin, 0)} min of reading`, filter: { formats: ['story'] }, items, color: '#E39A83' } : null;
    }
    case 'community': {
      const c = getDb().prepare("SELECT kind, value, synced_from FROM follows WHERE active = 1 AND kind IN ('subreddit', 'community') ORDER BY RANDOM() LIMIT 1").get();
      if (!c) return null;
      const name = c.kind === 'subreddit' ? `r/${c.value}` : c.value.split('|').slice(1).join('|');
      const items = feed({ community: name }, 8, off);
      return items.length ? { type: 'kinkList', layout: pickLayout(r), title: name, meta: 'one of your sources', filter: { community: name }, items, color: '#8EA6C9' } : null;
    }
    case 'tonight': return { type, title: 'Tonight', meta: 'this session', stats: sessionStats(ctx.sessionId), color: '#B6A8B0' };
    case 'analytics': return analytics(r, ctx);
    case 'lately': return ctx.kinks.length ? { type, title: 'Lately vs all time', meta: 'last 7 days', kinks: ctx.kinks.slice(0, 6), color: '#7FC49B' } : null;
    case 'map': {
      const v = turn('map', 3);
      if (v === 1 && ctx.groups.length) {
        const groups = ctx.groups.filter((g) => ctx.children.get(g.id)?.length).map((g) => {
          const kids = ctx.children.get(g.id);
          return { id: g.id, name: g.name, color: g.color, score: Math.round(kids.reduce((a, b) => a + (b.allTime + b.lately) / 2, 0) / kids.length), kinks: kids.slice(0, 5).map((k) => ({ id: k.id, name: k.name, color: k.color })) };
        }).sort((a, b) => b.score - a.score).slice(0, 5);
        if (groups.length) return { type: 'map', variant: 'groups', title: 'Your map: groups', meta: `${groups.length} families of kinks`, groups, color: '#B6A8B0' };
      }
      if (v === 2) {
        const b = brain();
        const name = new Map(b.nodes.map((n) => [n.key, n]));
        const links = b.edges.filter((e) => e.a[0] === 'k' && e.b[0] === 'k').sort((x, y) => y.w - x.w).slice(0, 5)
          .map((e) => ({ a: { id: name.get(e.a)?.id, name: name.get(e.a)?.name, color: name.get(e.a)?.color }, b: { id: name.get(e.b)?.id, name: name.get(e.b)?.name, color: name.get(e.b)?.color }, w: e.w }));
        if (links.length) return { type: 'map', variant: 'links', title: 'Your map: strongest links', meta: 'kinks your brain ties together', links, color: '#B6A8B0' };
      }
      return ctx.kinks.length ? { type, variant: 'brain', title: 'Your map', meta: `${ctx.kinks.length} kinks · ${ctx.fantasies.length} fantasies`, kinks: ctx.kinks.slice(0, 8), fantasies: ctx.fantasies.slice(0, 4), color: '#B6A8B0' } : null;
    }
    case 'limits': return { type, title: 'Hard limits', meta: 'never shown', limits: userLimits(), color: '#E07070' };
    case 'savedFant': return { type, title: 'Your fantasies', meta: 'saved scenarios', fantasies: ctx.fantasies, color: '#F6C35B' };
    case 'journey': {
      const mode = ['close', 'branch', 'genre'][turn('journey', 3)];
      const useF = ctx.fantasies.length && r() < 0.3;
      const f = useF ? ctx.fantasies[Math.floor(r() * ctx.fantasies.length)] : null;
      const kk = f ? null : k;
      if (!f && !kk) return { type, title: 'Journeys', meta: 'a guided path, start to end', kinks: ctx.kinks.slice(0, 3), color: '#F6C35B' };
      const subject = f ? { kind: 'fantasy', id: f.id, name: f.name, color: '#F6C35B' } : { kind: 'kink', id: kk.id, name: kk.name, color: kk.color };
      const label = mode === 'close' ? `Dive deeper into ${subject.name}` : mode === 'branch' ? `Branch out from ${subject.name}` : `Surprise me near ${subject.name}`;
      const blurb = mode === 'close' ? 'Your strongest matches for it, from quick visuals to a longer piece at the end.'
        : mode === 'branch' ? 'Starts where you are comfortable, then crosses into the kink it pairs with best.'
          : 'Things you have not seen yet from the same family, picked to still fit you.';
      const preview = journey({ kink: kk?.id, fantasy: f?.id, mode, limit: 3 }).steps.map(slim);
      return { type: 'journeyOne', title: label, meta: `journey · ${mode === 'close' ? 'deeper' : mode === 'branch' ? 'branch out' : 'same family'}`, subject, mode, blurb, items: preview, color: subject.color };
    }
    case 'combo': {
      const list = listSuggestions('combo', { limit: 12 });
      if (!list.length) return null;
      const c = list[Math.floor(r() * Math.min(list.length, 6))];
      const items = feed({ pair: [c.data.a.id, c.data.b.id] }, 4, off);
      if (!items.length) return null;
      return { type: 'combo', title: c.title, meta: `${c.data.distance === 'far' ? 'far apart' : 'same family'} · ${c.confidence}% match`, why: c.body, suggestion: { id: c.id, ...c.data, match: c.confidence }, filter: { pair: [c.data.a.id, c.data.b.id] }, items, color: c.data.a.color };
    }
    case 'fantasySuggest': {
      const list = listSuggestions('fantasy', { limit: 10 });
      if (!list.length) return null;
      const sg = list[Math.floor(r() * Math.min(list.length, 4))];
      const ids = (sg.data.kinks || []).map((x) => x.id);
      const items = ids.length ? feed({ anyKinks: ids, tags: sg.data.tags?.slice(0, 3), relaxed: true }, 3) : feed({ tags: sg.data.tags?.slice(0, 3), relaxed: true }, 3);
      return { type: 'fantasySuggest', title: sg.title, meta: `fantasy for you · ${sg.confidence}% sure`, suggestion: { id: sg.id, title: sg.title, scenario: sg.body, kinks: sg.data.kinks || [], tags: sg.data.tags || [], why: sg.data.why, confidence: sg.confidence }, filter: ids.length ? { anyKinks: ids } : { tags: sg.data.tags?.slice(0, 3) }, items, color: '#F6C35B' };
    }
    case 'newKink': {
      const list = newKinks();
      if (!list.length) return null;
      const nk = list[Math.floor(r() * Math.min(list.length, 3))];
      const items = feed({ kink: nk.id }, 6, 0);
      if (!items.length) return null;
      return { type: 'newKink', layout: r() < 0.5 ? 'carousel' : 'hero', title: nk.name, meta: `new kink you might like · ${Math.round((nk.lately + nk.now) / 2)}% lately`, kink: { id: nk.id, name: nk.name, color: nk.color, description: nk.description, status: nk.status, tags: nk.tags.slice(0, 5).map((t) => t.name) }, filter: { kink: nk.id }, items, color: nk.color };
    }
    case 'moodCheck': return { type, title: 'What’s the mood?', meta: 'one tap sets everything', color: '#E39A83' };
    case 'tagcloud': {
      const tags = topTags({ by: 'long', limit: 18 }).filter((t) => t.long > 0.05 && t.name);
      return tags.length >= 4 ? { type, title: 'Your tags', meta: 'size is weight', tags: tags.map((t) => ({ name: t.name, weight: t.long })), color: '#B6A8B0' } : null;
    }
    case 'rateRecent': {
      // Only posts you clearly spent time on: watched to the end, rewatched, liked, or stayed on for 20 seconds.
      const rows = getDb().prepare(`SELECT i.* FROM item_state s JOIN items i ON i.id = s.item_id WHERE s.seen = 1 AND COALESCE(s.rating,0) = 0 AND COALESCE(s.hidden,0) = 0 AND i.blocked = 0
        AND (s.vote = 1 OR s.dwell_ms >= 20000 OR EXISTS (SELECT 1 FROM events e WHERE e.item_id = i.id AND e.type IN ('complete', 'rewatch'))) ORDER BY s.seen_ts DESC LIMIT 30`).all();
      const row = rows.find((x) => !RATE_ASKED.has(x.id));
      if (!row) return null;
      RATE_ASKED.add(row.id);
      const ev = getDb().prepare("SELECT type FROM events WHERE item_id = ? AND type IN ('complete', 'rewatch', 'up')").all(row.id).map((e) => e.type);
      const why = ev.includes('rewatch') ? 'you rewatched this' : ev.includes('complete') ? 'you watched this to the end' : ev.includes('up') ? 'you liked this' : 'you stayed on this a while';
      return { type, title: 'How was this?', meta: why, items: [slim(presentOne(hydrate(row)))], color: '#F2894E' };
    }
    case 'recentSaved': {
      const rows = savedRows('saved_at DESC', 12).sort(() => r() - 0.5).slice(0, 4);
      return rows.length ? { type, title: 'Recently saved', meta: 'your collection', filter: { saved: true }, items: rows.map((row) => slim(presentOne(hydrate(row)))), color: '#E39A83' } : null;
    }
    case 'oldSaves': {
      const rows = getDb().prepare(`SELECT i.* FROM item_state s JOIN items i ON i.id = s.item_id WHERE s.saved = 1 AND i.blocked = 0
        AND COALESCE((SELECT MAX(ts) FROM events e WHERE e.item_id = i.id AND e.type = 'save'), 0) < ? ORDER BY RANDOM() LIMIT 4`).all(now() - 7 * 86400000);
      return rows.length >= 2 ? { type: 'recentSaved', title: 'From your saves', meta: 'older favorites, picked at random', filter: { saved: true }, items: rows.map((row) => slim(presentOne(hydrate(row)))), color: '#C98BC4' } : null;
    }
    case 'hotThread':
    case 'discussion': {
      const ids = hotThreads({ limit: 4, exclude: EXCLUDE });
      let item = null;
      if (ids.length) {
        const row = getDb().prepare('SELECT * FROM items WHERE id = ?').get(ids[Math.floor(r() * Math.min(ids.length, 3))]);
        if (row) item = slim(presentOne(hydrate(row)));
      }
      if (!item) item = feed({ formats: ['discussion'] }, 1, off)[0];
      if (!item) return null;
      EXCLUDE.push(item.id);
      return { type: 'hotThread', title: 'Hot thread', meta: `${item.community || item.source} · ${item.match}% match`, filter: { formats: ['discussion'] }, items: [item], color: '#81737B' };
    }
    case 'memory': {
      const mem = listMemory();
      return { type, title: 'Memory', meta: `${mem.filter((m) => m.status === 'active').length} remembered · ${mem.filter((m) => m.status === 'proposed').length} to review`, memories: mem.slice(0, 4), color: '#C9A7E8' };
    }
    default: return null;
  }
}

function analytics(r, ctx) {
  const db = getDb();
  const week = now() - 7 * 86400000;
  const tries = ['rising', 'topWatched', 'scoreboard', 'lately', 'formats', 'tagcloud'];
  const start = turn('analytics', tries.length);
  for (let i = 0; i < tries.length; i++) {
    const v = tries[(start + i) % tries.length];
    if (v === 'rising') {
      const rising = ctx.kinks.map((k) => ({ id: k.id, name: k.name, color: k.color, delta: k.lately - k.allTime, lately: k.lately })).filter((k) => k.delta >= 2).sort((a, b) => b.delta - a.delta).slice(0, 4);
      const falling = ctx.kinks.map((k) => ({ id: k.id, name: k.name, color: k.color, delta: k.lately - k.allTime })).filter((k) => k.delta <= -3).sort((a, b) => a.delta - b.delta).slice(0, 2);
      if (rising.length) return { type: 'rising', title: 'On the rise', meta: 'this week compared with all time', rising, falling, color: '#7FC49B' };
    }
    if (v === 'topWatched') {
      const eng = engagement(week, { limit: 300, minPoints: 2 }).sort((a, b) => b.p - a.p).slice(0, 5);
      const items = eng.map((e) => { const row = db.prepare('SELECT * FROM items WHERE id = ? AND blocked = 0').get(e.item_id); return row ? { ...slim(presentOne(hydrate(row))), points: Math.round(e.p * 10) / 10 } : null; }).filter(Boolean);
      if (items.length >= 3) return { type: 'topWatched', title: 'Your week, ranked', meta: 'what counted most for your taste', items, color: '#F2894E' };
    }
    if (v === 'scoreboard') {
      const c = (since, until) => Object.fromEntries(db.prepare('SELECT type, COUNT(*) n, COALESCE(SUM(value), 0) v FROM events WHERE ts > ? AND ts <= ? GROUP BY type').all(since, until).map((x) => [x.type, x]));
      const a = c(week, now());
      const b = c(week - 7 * 86400000, week);
      const row = (key, label, get) => ({ key, label, now: get(a), before: get(b) });
      const rows = [
        row('up', 'Likes', (x) => x.up?.n || 0), row('rate', 'Heat given', (x) => x.rate?.n || 0), row('save', 'Saves', (x) => x.save?.n || 0),
        row('complete', 'Watched to the end', (x) => x.complete?.n || 0), row('rewatch', 'Rewatches', (x) => x.rewatch?.n || 0),
        row('minutes', 'Minutes watched', (x) => Math.round((x.dwell?.v || 0) / 60000))
      ];
      if (rows.some((x) => x.now)) return { type: 'scoreboard', title: 'This week in numbers', meta: 'compared with the week before', rows, color: '#8EA6C9' };
    }
    if (v === 'lately' && ctx.kinks.length) return { type: 'lately', title: 'Lately vs all time', meta: 'last 7 days', kinks: ctx.kinks.slice(0, 6), color: '#7FC49B' };
    if (v === 'formats') {
      const aff = ctx.aff;
      const formats = ['long', 'short', 'gif', 'image', 'set', 'story', 'discussion'].map((f) => { const x = aff.get(`f:${f}`); return { format: f, lately: Math.round(50 + 50 * Math.tanh((x?.lately || 0) / 2)), allTime: Math.round(50 + 50 * Math.tanh((x?.long || 0) / 2)) }; }).sort((x, y) => y.lately - x.lately);
      return { type: 'formats', title: 'What you reach for', meta: 'formats this week', formats, color: '#B79BF0' };
    }
    if (v === 'tagcloud') {
      const tags = topTags({ by: 'long', limit: 18 }).filter((t) => t.long > 0.05 && t.name);
      if (tags.length >= 4) return { type: 'tagcloud', title: 'Your tags', meta: 'size is weight', tags: tags.map((t) => ({ name: t.name, weight: t.long })), color: '#B6A8B0' };
    }
  }
  return null;
}

// Content windows (categories, formats, kinks, mixes, fantasies, creators) make up most of the column;
// every two or three windows one of the other kinds (numbers, map, journeys, memory…) comes in between.
const CONTENT_W = [['formatMix', 7], ['kinkDeep', 4], ['kinkList', 4], ['kinkMix', 3], ['nearby', 2], ['pair', 2], ['combo', 2], ['fantasy', 2], ['fantasySuggest', 2], ['newKink', 2], ['performer', 2], ['creator', 2], ['hotThread', 3], ['stories', 1], ['gifs', 1], ['shortsRail', 1], ['gallery', 1], ['trending', 1], ['discovery', 1], ['community', 1], ['followLatest', 2], ['followSpotlight', 1], ['following', 1], ['kinkSpot', 1], ['tagNow', 1]];
const OTHER_W = [['analytics', 4], ['map', 3], ['journey', 4], ['rateRecent', 2], ['recentSaved', 1], ['oldSaves', 1], ['tonight', 1], ['limits', 1], ['savedFant', 1], ['moodCheck', 1], ['memory', 1]];
const RHYTHM = [0, 0, 1, 0, 0, 0, 1];
function pickFrom(list, r) {
  const total = list.reduce((a, b) => a + b[1], 0);
  let x = r() * total;
  for (const [t, w] of list) { x -= w; if (x <= 0) return t; }
  return list[0][0];
}

// Windows already shown are not shown again for a long time, unless there is nothing else left.
const SHOWN = new Map();
const REPEAT_MS = 12 * 3600000;
const BY_ITEMS = new Set(['hotThread', 'trending', 'gifs', 'shortsRail', 'stories', 'recentSaved', 'followLatest', 'following', 'discovery', 'rateRecent', 'topWatched']);
const sigOf = (w) => `${w.type}|${w.title}|${w.variant || ''}${BY_ITEMS.has(w.type) || /^(Photo posts|Keep reading|From your saves)$/.test(w.title) ? `|${(w.items || []).slice(0, 2).map((x) => x.id).join(',')}` : ''}`.toLowerCase();

export function windows({ cursor = 0, count = 4, side = 0, sessionId = null, seed = 0, exclude = [] } = {}) {
  const allKinks = listKinks();
  const kinks = allKinks.filter((k) => !k.isGroup && k.status !== 'hidden');
  const groups = allKinks.filter((k) => k.isGroup);
  const children = new Map();
  for (const k of kinks) if (k.parentId) { if (!children.has(k.parentId)) children.set(k.parentId, []); children.get(k.parentId).push(k); }
  const served = servedFor(sessionId);
  EXCLUDE = [...exclude.map(Number).filter(Boolean), ...served.ids.keys()];
  MEDIA = new Set(served.media.keys());
  const aff = affinityMap();
  const performers = getDb().prepare("SELECT t.id, t.name, COUNT(*) n, (SELECT thumb FROM performers p WHERE p.name = t.name) thumb FROM tags t JOIN item_tags it ON it.tag_id = t.id JOIN items i ON i.id = it.item_id WHERE t.kind = 'performer' AND i.blocked = 0 GROUP BY t.id HAVING n >= 2 ORDER BY n DESC LIMIT 40").all()
    .map((p) => ({ ...p, a: (aff.get(`t:${p.id}`)?.long || 0) + 0.3 * (aff.get(`t:${p.id}`)?.short || 0) })).sort((a, b) => b.a - a.a || b.n - a.n);
  const ctx = {
    kinks, groups, children, fantasies: listFantasies(), pairs: kinkPairs(kinks), aff, sessionId, performers,
    nowTags: topTags({ by: 'short', limit: 8 }).filter((t) => t.short > 0.08 && t.name),
    longTags: topTags({ by: 'long', limit: 30 }).filter((t) => t.long > 0.1 && t.name),
    followCount: getDb().prepare('SELECT COUNT(*) c FROM follows WHERE active = 1').get().c
  };
  const out = [];
  const usedTypes = new Map();
  const t0 = now();
  for (let i = 0; i < count; i++) {
    const idx = cursor + i;
    const r = rng(idx * 104729 + side * 7 + 13 + seed * 7919);
    const other = RHYTHM[(idx + side * 3) % RHYTHM.length] === 1;
    let w = null;
    let fallback = null;
    for (let tries = 0; tries < 24 && !w; tries++) {
      const t = pickFrom(tries < 16 ? (other ? OTHER_W : CONTENT_W) : [...CONTENT_W, ...OTHER_W], r);
      if ((RARE.has(t) || ['tagNow', 'nearby', 'hotThread', 'stories', 'journey', 'creator', 'performer'].includes(t)) && usedTypes.has(t)) continue;
      // Your saves come back now and then, not all the time: at most one saves window in every 30 windows.
      if (SAVES.has(t) && (served.shown || 0) - (served.savesAt ?? -999) < 30) continue;
      let c = null;
      try { c = build(t, r, ctx); } catch { c = null; }
      if (!c) continue;
      const sig = sigOf(c);
      if (out.some((x) => sigOf(x) === sig)) continue;
      // The same window title (two "Short form" windows) never stands twice within a few windows of each other.
      if ((served.titles || []).slice(-4).includes(c.title)) { if (!fallback) fallback = c; continue; }
      if (t0 - (SHOWN.get(sig) || 0) < REPEAT_MS) { if (!fallback || (SHOWN.get(sig) || 0) < (SHOWN.get(sigOf(fallback)) || 0)) fallback = c; continue; }
      w = c;
      usedTypes.set(t, idx);
    }
    if (!w) w = fallback;
    if (w) {
      SHOWN.set(sigOf(w), t0);
      served.titles = [...(served.titles || []), w.title].slice(-8);
      served.shown = (served.shown || 0) + 1;
      if (w.filter?.saved) served.savesAt = served.shown;
      // A full-size preview only for a post that fits you for at least 90%; otherwise a carousel or a list.
      if (w.layout === 'hero' && !((w.items?.[0]?.match || 0) >= 90)) w = { ...w, layout: (w.items?.length || 0) >= 2 ? 'carousel' : 'list' };
      for (const it of w.items || []) { served.ids.set(Number(it.id), Date.now()); const k = mediaKey(it); if (k) served.media.set(k, Date.now()); }
      out.push({ ...w, uid: `w${side}-${idx}-${seed}` });
    }
  }
  if (SHOWN.size > 3000) for (const [k, v] of SHOWN) if (t0 - v > REPEAT_MS) SHOWN.delete(k);
  return out;
}

export function mapData() {
  const kinks = listKinks({ includeHidden: false });
  const aff = affinityMap();
  const formats = ['long', 'short', 'gif', 'image', 'set', 'story', 'discussion'].map((f) => {
    const v = aff.get(`f:${f}`);
    return { format: f, allTime: Math.round(50 + 50 * Math.tanh((v?.long || 0) / 2)), lately: Math.round(50 + 50 * Math.tanh((v?.lately || 0) / 2)) };
  });
  return { kinks, fantasies: listFantasies(), pairs: kinkPairs(kinks.filter((k) => !k.isGroup)), links: listLinks(), tags: topTags({ by: 'long', limit: 30 }).filter((t) => t.name), formats };
}

const ARC = { image: 0, gif: 1, short: 2, set: 3, long: 4, story: 5, discussion: 6 };

export function journey({ kink, fantasy, mode = 'close', limit = 8 }) {
  const kinks = listKinks();
  let steps = [];
  let title = 'Surprise';
  let desc = 'Eight things you haven’t opened yet, picked because they sit next to what you like.';
  const family = (k) => {
    const ids = new Set();
    if (k.parentId) for (const x of kinks) if (x.parentId === k.parentId && !x.isGroup) ids.add(x.id);
    for (const p of kinkPairs(kinks.filter((x) => !x.isGroup)).filter((p) => p.a.id === k.id || p.b.id === k.id).slice(0, 3)) ids.add(p.a.id === k.id ? p.b.id : p.a.id);
    ids.add(k.id);
    return [...ids];
  };
  const bestPartner = (k) => {
    const pair = kinkPairs(kinks.filter((x) => !x.isGroup)).find((p) => p.a.id === k.id || p.b.id === k.id);
    return pair ? (pair.a.id === k.id ? pair.b : pair.a) : kinks.find((x) => x.id !== k.id && !x.isGroup);
  };
  if (fantasy) {
    const f = listFantasies().find((x) => x.id === Number(fantasy) || x.name.toLowerCase() === String(fantasy).toLowerCase());
    if (f) {
      const fk = kinks.filter((k) => f.kinks.some((x) => x.id === k.id));
      if (mode === 'branch' && fk[0]) {
        const other = bestPartner(fk[0]);
        const a = buildFeed({ fantasy: f.id }, { limit: Math.ceil(limit / 2), mix: 0 }).items;
        const b = other ? buildFeed({ kink: other.id }, { limit: Math.floor(limit / 2), mix: 0, exclude: a.map((x) => x.id) }).items : [];
        steps = [...a, ...b];
        title = `Branching out from ${f.name}`;
        desc = other ? `Starts inside your fantasy, then moves toward ${other.name}.` : 'Starts inside your fantasy and widens from there.';
      } else if (mode === 'genre' && fk.length) {
        const ids = [...new Set(fk.flatMap(family))];
        steps = buildFeed({ anyKinks: ids, onlyNew: true }, { limit, mix: 0 }).items;
        if (steps.length < 3) steps = buildFeed({ anyKinks: ids }, { limit, mix: 0 }).items;
        title = `Surprise me near ${f.name}`;
        desc = 'New things from the same family as this fantasy.';
      } else {
        steps = buildFeed({ fantasy: f.id }, { limit, mix: 0 }).items.sort((x, y) => ARC[x.format] - ARC[y.format]);
        title = f.name;
        desc = `Steps through ${f.kinks.map((x) => x.name).join(', ')}, from quick visuals to a longer piece at the end.`;
      }
    }
  } else if (kink) {
    const k = kinks.find((x) => x.id === Number(kink) || x.name.toLowerCase() === String(kink).toLowerCase());
    if (k && mode === 'branch') {
      const other = bestPartner(k);
      const a = buildFeed({ kink: k.id }, { limit: 3, mix: 0 }).items;
      const both = other ? buildFeed({ pair: [k.id, other.id] }, { limit: 2, mix: 0, exclude: a.map((x) => x.id) }).items : [];
      const b = other ? buildFeed({ kink: other.id }, { limit: 3, mix: 0, exclude: [...a, ...both].map((x) => x.id) }).items : [];
      steps = [...a, ...both, ...b].slice(0, limit);
      title = `Branching out from ${k.name}`;
      desc = other ? `Starts where you're comfortable, then crosses into ${other.name} through posts that carry both.` : 'Starts where you’re comfortable and widens from there.';
    } else if (k && (mode === 'genre' || mode === 'surprise')) {
      const ids = family(k).filter((id) => id !== k.id);
      const use = ids.length ? ids : [k.id];
      steps = buildFeed({ anyKinks: use, onlyNew: true }, { limit, mix: 0 }).items;
      if (steps.length < 3) steps = buildFeed({ anyKinks: use }, { limit, mix: 0 }).items;
      title = `Surprise me near ${k.name}`;
      desc = `New things from the same family as ${k.name}, still picked to fit you.`;
    } else if (k) {
      steps = buildFeed({ kink: k.id }, { limit, mix: 0 }).items.sort((x, y) => ARC[x.format] - ARC[y.format]);
      title = `Deep into ${k.name}`;
      desc = `Your best matches in ${k.name} across every format.`;
    }
  }
  if (!steps.length) steps = buildFeed({ onlyNew: true }, { limit, mix: 0 }).items;
  if (!steps.length) steps = buildFeed({}, { limit, mix: 0 }).items;
  return { title, description: desc, steps };
}
