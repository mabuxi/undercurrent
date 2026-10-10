import { config } from './config.js';
import { getDb, getSetting, setSetting, now } from './db.js';
import { upsertItem, setState } from './store.js';
import { applyEvent, topTags } from './profile.js';
import * as reddit from './sources/reddit.js';
import * as redgifs from './sources/redgifs.js';
import { PROVIDERS, providerState, SORTS } from './sources/providers.js';
import { listKinks } from './kinks.js';
import { refreshStars } from './sources/stars.js';
import { backfillExtraction, lexicon } from './ai/extract.js';
import { addTags, relatedTags, tagSpecificity, itemTags } from './store.js';
import { autoDiscover, noteRemoved } from './discover.js';
import { mockItems } from './sources/mock.js';
import { genderTerm, genderMode } from './gender.js';
import { log } from './log.js';
import { invalidatePool } from './searchstate.js';
import { tr } from './i18n.js';

export const ingestState = { running: false, lastRun: 0, lastError: null, added: 0, blocked: 0, log: [], stats: {} };

function note(key, vars) {
  const msg = tr(key, vars);
  ingestState.log.unshift({ ts: now(), msg });
  ingestState.log = ingestState.log.slice(0, 40);
  log('info', `Ingest: ${tr(key, vars, 'en')}`);
}

const sortName = (s) => ({ hot: tr('hot'), week: tr('this week'), month: tr('this month'), new: tr('new') }[s] || s);

function stat(provider, patch) {
  const all = getSetting('providerStats', {}) || {};
  all[provider] = { ...(all[provider] || {}), ...patch };
  setSetting('providerStats', all);
  ingestState.stats = all;
}

export function providerStats() {
  return getSetting('providerStats', {}) || {};
}

export function listFollows() {
  return getDb().prepare('SELECT * FROM follows ORDER BY kind, value').all();
}

export function follow(kind, value, { label = null, synced = null, active = 1 } = {}) {
  getDb().prepare(`INSERT INTO follows(kind, value, label, synced_from, active, created) VALUES(?, ?, ?, ?, ?, ?)
    ON CONFLICT(kind, value) DO UPDATE SET active = excluded.active, label = COALESCE(excluded.label, label)`).run(kind, value, label, synced, active, now());
}

export function unfollow(kind, value) {
  getDb().prepare('UPDATE follows SET active = 0 WHERE kind = ? AND value = ?').run(kind, value);
}

export function removeFollow(id) {
  const f = getDb().prepare('SELECT * FROM follows WHERE id = ?').get(id);
  noteRemoved(f);
  getDb().prepare('DELETE FROM follows WHERE id = ?').run(id);
}

export function ensureDefaults() {
  const n = getDb().prepare('SELECT COUNT(*) c FROM follows').get().c;
  if (n || !config.mock) return;
  ['mock_velvet', 'mock_outdoors', 'mock_stories', 'mock_cosplay', 'mock_sensual', 'mock_confessions'].forEach((s) => follow('subreddit', s, { synced: 'mock' }));
}

export function followTarget(f) {
  if (f.kind === 'redgifs_trending') return { provider: 'redgifs', mode: 'trending', value: '' };
  if (f.kind === 'redgifs_tag') return { provider: 'redgifs', mode: 'search', value: f.value };
  if (f.kind === 'redgifs_user') return { provider: 'redgifs', mode: 'creator', value: f.value };
  if (f.kind === 'booru_query') { const [p, ...q] = f.value.split('|'); return { provider: p, mode: 'search', value: q.join('|') }; }
  if (f.kind === 'subreddit') return { provider: 'reddit', mode: 'community', value: f.value };
  if (f.kind === 'reddit_user') return { provider: 'reddit', mode: 'creator', value: f.value };
  if (f.kind === 'search' || f.kind === 'creator' || f.kind === 'community') { const [p, ...q] = f.value.split('|'); return { provider: p, mode: f.kind, value: q.join('|') }; }
  if (f.kind === 'trending') return { provider: f.value, mode: 'trending', value: '' };
  return null;
}

async function enrichRedgifs(list) {
  const ids = list.filter((x) => x.media?.kind === 'redgifs' && !x.media.hd).map((x) => x.media.redgifsId);
  if (!ids.length || config.mock) return list;
  const gifs = await redgifs.resolve(ids, { max: 30 });
  return list.map((x) => (x.media?.kind === 'redgifs' && !x.media.hd ? redgifs.enrichFromGif(x, gifs[x.media.redgifsId]) : x));
}

async function fetchTarget(t, page = 1, sort = 'hot') {
  if (config.mock) return mockItems(`${t.provider}:${t.mode}:${t.value}:${sort}:${page}:${Math.floor(Date.now() / 600000)}`, 24, 0, t.provider);
  const p = PROVIDERS[t.provider];
  if (!p) return [];
  const list = await p.fetch({ mode: t.mode === 'subreddit' ? 'community' : t.mode, value: t.value, page, sort });
  return t.provider === 'reddit' ? enrichRedgifs(list) : list;
}

function store(list, followId = null) {
  let added = 0;
  let blocked = 0;
  getDb().transaction(() => {
    for (const n of list) {
      const r = upsertItem(followId ? { ...n, via: `f:${followId}` } : n);
      if (r.created) added++;
      if (r.created && r.blocked) blocked++;
    }
  })();
  return { added, blocked };
}

async function runTarget(t, label, page = 1, sort = 'hot', followId = null) {
  const started = now();
  try {
    const list = await fetchTarget(t, page, sort);
    const r = store(list, followId);
    const cur = providerStats()[t.provider] || {};
    stat(t.provider, { lastFetch: now(), lastError: null, added: (cur.added || 0) + r.added, lastMs: now() - started });
    if (r.added) note(r.blocked ? '{label}: {added} new, {blocked} filtered out' : '{label}: {added} new', { label, added: r.added, blocked: r.blocked });
    return r;
  } catch (err) {
    stat(t.provider, { lastError: err.message, lastErrorAt: now() });
    note('{label} failed: {error}', { label, error: err.message });
    return { added: 0, blocked: 0, error: err.message };
  }
}

export function autoTags(limit = 6) {
  const short = topTags({ by: 'short', limit: 12 }).filter((t) => t.name && t.short > 0.1);
  const lately = topTags({ by: 'lately', limit: 12 }).filter((t) => t.name && t.lately > 0.2);
  const long = topTags({ by: 'long', limit: 20 }).filter((t) => t.name && t.long > 0.2);
  const searches = (getSetting('recentSearches', []) || []).filter((x) => now() - x.at < 3 * 86400000).map((x) => ({ name: x.q }));
  const names = [];
  const push = (n) => { const v = String(n || '').replace(/-/g, ' ').trim(); if (v && !names.includes(v)) names.push(v); };
  const lists = [short, searches, lately, long];
  for (let i = 0; names.length < limit * 2 && i < 20; i++) for (const l of lists) if (l[i]) push(l[i].name);
  return names.slice(0, limit).map(genderTerm);
}

export function rememberSearch(q) {
  const list = (getSetting('recentSearches', []) || []).filter((x) => x.q !== q);
  list.unshift({ q, at: now() });
  setSetting('recentSearches', list.slice(0, 15));
}

const redditQueue = [];
let redditWorking = false;
function queueReddit(t, label, followId, sort, onList = null) {
  if (redditQueue.some((x) => x.t.value === t.value && x.t.mode === t.mode)) return;
  redditQueue.push({ t, label, followId, sort, onList });
  if (redditWorking) return;
  redditWorking = true;
  (async () => {
    while (redditQueue.length) {
      const job = redditQueue.shift();
      if (job.onList) {
        let list = [];
        try { list = await fetchTarget(job.t, 1, job.sort); } catch {}
        try { job.onList(list); } catch {}
        if (list.length) store(list);
        continue;
      }
      const r = await runTarget(job.t, job.label, 1, job.sort, job.followId);
      if (job.followId) getDb().prepare('UPDATE follows SET last_fetch = ? WHERE id = ?').run(now(), job.followId);
      ingestState.added += r.added || 0;
    }
    redditWorking = false;
  })().catch(() => { redditWorking = false; });
}

export function queueRedditCheck(sub, onList) {
  queueReddit({ provider: 'reddit', mode: 'community', value: sub }, `Checking r/${sub}`, null, 'hot', onList);
}

export function redditQueueSize() {
  return redditQueue.length + (redditWorking ? 1 : 0);
}

const pages = new Map();
// More of a search starts with what is popular this week and keeps coming back to it.
const TERM_SORTS = ['week', 'hot', 'week', 'month', 'week', 'new'];
function nextPage(key) {
  const n = (pages.get(key) || 0) + 1;
  pages.set(key, n);
  return n;
}

export function termsForFilters(f = {}) {
  return termsForFiltersRaw(f).map(genderTerm);
}

function termsForFiltersRaw(f = {}) {
  const terms = [];
  if (f.relaxed) for (const t of relatedTags([...(f.tags || []), ...(f.q ? [f.q] : [])], 3)) terms.push(t);
  if (f.q) terms.push(String(f.q));
  for (const t of f.tags || []) terms.push(String(t));
  if (f.kink) {
    const k = listKinks({ includeHidden: true }).find((x) => x.id === Number(f.kink) || x.name.toLowerCase() === String(f.kink).toLowerCase());
    if (k) terms.push(...(k.tags || []).slice(0, 3).map((x) => x.name));
  }
  if (f.pair?.length === 2) {
    const ks = listKinks({ includeHidden: true });
    for (const id of f.pair) { const k = ks.find((x) => x.id === Number(id)); if (k?.tags?.[0]) terms.push(k.tags[0].name); }
  }
  return [...new Set(terms.map((x) => x.replace(/-/g, ' ').trim()).filter(Boolean))].slice(0, f.relaxed ? 5 : 3);
}

export async function fetchMore(filters = {}, { budgetMs = 14000 } = {}) {
  const started = now();
  const state = providerState();
  const named = Array.isArray(filters.sources) && filters.sources.length ? new Set(filters.sources) : null;
  const enabled = Object.keys(PROVIDERS).filter((id) => (state[id].enabled || config.mock) && (!named || named.has(id)));
  const terms = termsForFilters(filters);
  const jobs = [];
  const wantFormats = filters.formats?.length ? new Set(filters.formats) : null;
  for (const id of enabled) {
    const p = PROVIDERS[id];
    if (wantFormats && !p.formats.some((x) => wantFormats.has(x))) continue;
    if (filters.source && filters.source !== id) continue;
    if (terms.length) {
      if (!p.can.search || id === 'reddit') continue;
      for (const term of terms) {
        const sort = TERM_SORTS[(pages.get(`${id}|${term}|sortturn`) || 0) % TERM_SORTS.length];
        pages.set(`${id}|${term}|sortturn`, (pages.get(`${id}|${term}|sortturn`) || 0) + 1);
        jobs.push({ t: { provider: id, mode: 'search', value: term }, label: tr('{source} more for "{term}"', { source: p.label, term }), page: nextPage(`${id}|${term}|${sort}`), sort });
      }
    } else if (p.can.trending) {
      const sort = SORTS[(pages.get(`${id}|sortturn`) || 0) % SORTS.length];
      pages.set(`${id}|sortturn`, (pages.get(`${id}|sortturn`) || 0) + 1);
      jobs.push({ t: { provider: id, mode: 'trending', value: '' }, label: tr('{source} more ({sort})', { source: p.label, sort: sortName(sort) }), page: nextPage(`${id}|trending|${sort}`), sort });
    }
  }
  if (!terms.length) {
    for (const tag of autoTags(3)) {
      for (const id of enabled) {
        if (named && !named.has(id)) continue;
        const p = PROVIDERS[id];
        if (!p.can.search || id === 'reddit') continue;
        if (wantFormats && !p.formats.some((x) => wantFormats.has(x))) continue;
        jobs.push({ t: { provider: id, mode: 'search', value: tag }, label: tr('{source} for "{term}"', { source: p.label, term: tag }), page: nextPage(`${id}|${tag}|week`), sort: 'week' });
      }
    }
  }
  let added = 0;
  let blocked = 0;
  let finished = 0;
  const list = jobs.slice(0, 12);
  await new Promise((resolve) => {
    if (!list.length) return resolve();
    const quickMs = Math.min(budgetMs, 6000);
    const timer = setTimeout(resolve, quickMs);
    for (const j of list) {
      runTarget(j.t, j.label, j.page, j.sort).then((r) => {
        added += r.added || 0;
        blocked += r.blocked || 0;
      }).catch(() => {}).finally(() => {
        finished++;
        if (added >= 8 || finished === list.length) { clearTimeout(timer); resolve(); }
      });
    }
  });
  if (added) invalidatePool();
  return { added, blocked, terms, jobs: jobs.length };
}

export async function runIngest({ force = false, only = null } = {}) {
  if (ingestState.running) return { skipped: true };
  ingestState.running = true;
  ingestState.lastError = null;
  let added = 0;
  let blocked = 0;
  const pause = () => (config.mock ? null : new Promise((r) => setTimeout(r, 600)));
  try {
    ensureDefaults();
    const cutoff = now() - config.ingestIntervalMin * 60000;
    const state = providerState();
    const enabled = Object.keys(PROVIDERS).filter((id) => state[id].enabled && (!only || only === id));
    const cycle = (getSetting('ingestCycle', 0) || 0) + 1;
    setSetting('ingestCycle', cycle);
    const stats = providerStats();
    const sort = SORTS[cycle % SORTS.length];
    for (const id of enabled) {
      const p = PROVIDERS[id];
      if (!p.can.trending) continue;
      if (!force && (stats[id]?.lastTrending || 0) > cutoff) continue;
      const gm = genderMode();
      const gterm = gm === 'men' ? 'gay' : gm === 'women' ? 'lesbian' : null;
      const r = gterm && p.can.search && id !== 'reddit'
        ? await runTarget({ provider: id, mode: 'search', value: gterm }, `${p.label} ${gterm} ${sortName(sort)}`, 1 + (Math.floor(cycle / SORTS.length) % 3), sort)
        : await runTarget({ provider: id, mode: 'trending', value: '' }, `${p.label} ${sortName(sort)}`, 1 + (Math.floor(cycle / SORTS.length) % 2), sort);
      stat(id, { lastTrending: now() });
      added += r.added; blocked += r.blocked;
      await pause();
      if (sort === 'hot' || sort === 'new') {
        const top = cycle % 2 ? 'week' : 'month';
        const r2 = await runTarget({ provider: id, mode: 'trending', value: '' }, tr('{source} popular ({sort})', { source: p.label, sort: sortName(top) }), 1 + (Math.floor(cycle / 2) % 3), top);
        added += r2.added; blocked += r2.blocked;
        await pause();
      }
    }
    if (getSetting('autoDiscover', true)) {
      const tags = autoTags(6);
      if (tags.length) {
        for (const id of enabled) {
          const p = PROVIDERS[id];
          if (!p.can.search || id === 'reddit') continue;
          for (let k = 0; k < 2; k++) {
            const tag = tags[(cycle * 2 + k) % tags.length];
            const s2 = SORTS[(cycle + k) % SORTS.length];
            const r = await runTarget({ provider: id, mode: 'search', value: tag }, tr('{source} for "{term}" ({sort})', { source: p.label, term: tag, sort: sortName(s2) }), 1, s2);
            added += r.added; blocked += r.blocked;
            await pause();
          }
        }
      }
    }
    const follows = getDb().prepare('SELECT * FROM follows WHERE active = 1').all();
    for (const f of follows) {
      if (!force && f.last_fetch > cutoff) continue;
      const t = followTarget(f);
      if (!t || t.mode === 'trending') continue;
      if (!config.mock && (!state[t.provider] || !state[t.provider].enabled)) continue;
      const label = f.label || `${PROVIDERS[t.provider]?.label || t.provider} ${t.value}`;
      // Automatic sources mostly bring what is popular this week, so it is not always the same old posts and not
      // the low-quality new ones; now and then the newest or all-time best for variety.
      const fsort = f.synced_from === 'auto' ? ((cycle + f.id) % 3 ? 'week' : SORTS[(cycle + f.id) % SORTS.length]) : 'new';
      if (t.provider === 'reddit' && !config.mock) { queueReddit(t, `${label} (${sortName(fsort)})`, f.id, fsort); continue; }
      const r = await runTarget(t, label, 1, fsort, f.id);
      getDb().prepare('UPDATE follows SET last_fetch = ? WHERE id = ?').run(now(), f.id);
      added += r.added; blocked += r.blocked;
      await pause();
    }
  } catch (err) {
    ingestState.lastError = err.message;
    log('error', 'Ingest crashed', err.stack);
  } finally {
    ingestState.running = false;
    ingestState.lastRun = now();
    ingestState.added += added;
    ingestState.blocked += blocked;
    if (added) invalidatePool();
  }
  return { added, blocked };
}

// Fetches one source right away (a source the quick tuning just added or woke up), so its posts are in the feed
// within seconds instead of at the next round.
export async function fetchFollowNow(id, sort = 'week') {
  const f = getDb().prepare('SELECT * FROM follows WHERE id = ?').get(id);
  const t = f && followTarget(f);
  if (!t || t.mode === 'trending') return { added: 0 };
  const label = f.label || `${PROVIDERS[t.provider]?.label || t.provider} ${t.value}`;
  if (t.provider === 'reddit' && !config.mock) { queueReddit(t, `${label} (${sortName(sort)})`, f.id, sort); return { queued: true, added: 0 }; }
  const r = await runTarget(t, label, 1, sort, f.id);
  getDb().prepare('UPDATE follows SET last_fetch = ? WHERE id = ?').run(now(), f.id);
  if (r.added) invalidatePool();
  return r;
}

export async function testProvider(id) {
  const p = PROVIDERS[id];
  if (!p) throw new Error(tr('Unknown source'));
  const started = now();
  const sample = { bluesky: 'bsky.app', reddit: 'gonewild' }[id] ?? '';
  const list = await fetchTarget({ provider: id, mode: p.can.trending ? 'trending' : id === 'reddit' ? 'community' : 'creator', value: sample });
  const r = id === 'bluesky' || id === 'reddit' ? { added: 0, blocked: 0 } : store(list);
  stat(id, { lastFetch: now(), lastError: null });
  return { ok: true, fetched: list.length, added: r.added, filtered: r.blocked, ms: now() - started, sample: list.slice(0, 3).map((x) => x.title) };
}

export async function syncRedditSubscriptions() {
  const subs = await reddit.subscriptions();
  const db = getDb();
  const names = new Set(subs.map((s) => s.name));
  db.transaction(() => {
    for (const s of subs) follow('subreddit', s.name, { label: `r/${s.name}`, synced: 'reddit' });
    for (const row of db.prepare("SELECT value FROM follows WHERE kind = 'subreddit' AND synced_from = 'reddit' AND active = 1").all()) {
      if (!names.has(row.value)) unfollow('subreddit', row.value);
    }
  })();
  return { subscriptions: subs.length, nsfw: subs.filter((s) => s.nsfw).length };
}

export async function importRedditHistory() {
  const out = { upvoted: 0, saved: 0 };
  for (const kind of ['upvoted', 'saved']) {
    let posts = [];
    try { posts = await reddit.userHistory(kind, 300); } catch (err) { note(kind === 'saved' ? 'Reddit saved import failed: {error}' : 'Reddit upvoted import failed: {error}', { error: err.message }); continue; }
    const items = await enrichRedgifs(posts.map(reddit.normalizePost).filter(Boolean));
    for (const n of items) {
      const r = upsertItem(n);
      if (r.blocked) continue;
      setState(r.id, { seen: 1, seen_ts: now(), ...(kind === 'saved' ? { saved: 1 } : { vote: 1 }) });
      applyEvent({ itemId: r.id, type: kind === 'saved' ? 'save' : 'up', sessionId: 'import' });
      out[kind]++;
    }
  }
  note('Imported {upvoted} upvoted and {saved} saved posts from Reddit', out);
  return out;
}

let timer = null;
export function startScheduler() {
  if (timer) return;
  setTimeout(() => runIngest().catch((e) => log('error', 'Ingest failed', e.stack)), 3000);
  if (!config.mock) {
    setTimeout(async () => {
      try {
        const r = await refreshStars();
        if (r.stored) { setSetting('extractVersion', 0); lexicon(true); await backfillExtraction(addTags); }
      } catch (e) { log('warn', `Performer list failed: ${e.message}`); }
    }, 8000);
  }
  const disc = () => autoDiscover().then((r) => { if (r && !r.skipped && r.added) runIngest().catch(() => {}); }).catch((e) => log('warn', `Auto-discover failed: ${e.message}`));
  setTimeout(disc, 20000);
  setInterval(disc, 60 * 60000);
  timer = setInterval(() => runIngest().catch((e) => log('error', 'Ingest failed', e.stack)), 5 * 60000);
}

let insightAt = 0;
export function fetchForInsight(itemIds) {
  if (config.mock || Date.now() - insightAt < 90000 || !itemIds.length) return;
  insightAt = Date.now();
  const spec = tagSpecificity().map;
  const tags = [];
  for (const id of itemIds.slice(-3)) {
    const ranked = itemTags(id).filter((t) => t.kind !== 'performer' && t.weight >= 0.45).sort((a, b) => b.weight * (spec.get(b.id) ?? 1) - a.weight * (spec.get(a.id) ?? 1));
    if (ranked[0]) tags.push(ranked[0].name);
    const perf = itemTags(id).find((t) => t.kind === 'performer');
    if (perf) tags.push(perf.name);
  }
  const uniq = [...new Set(tags)].slice(0, 2);
  if (!uniq.length) return;
  log('info', `Fetching more because you liked: ${uniq.join(', ')}`);
  for (const t of uniq) fetchMore({ tags: [t] }, { budgetMs: 20000 }).catch(() => {});
}

export async function followEverywhere(source, name) {
  const clean = String(name || '').replace(/^\/?u\//i, '').replace(/^@/, '').trim();
  if (!clean) return { followed: [] };
  const done = [];
  const add = (kind, value, label) => { follow(kind, value, { label }); done.push(label); };
  const provider = source === 'reddit' ? 'reddit' : source;
  add('creator', `${provider}|${clean}`, `${PROVIDERS[provider]?.label || provider}: ${clean}`);
  if (config.mock) return { followed: done };
  const checks = [];
  if (provider !== 'redgifs') {
    checks.push((async () => {
      try { const g = await redgifs.byUser(clean.toLowerCase(), 3); if (g?.length) add('creator', `redgifs|${clean.toLowerCase()}`, `RedGIFs: ${clean}`); } catch {}
    })());
  }
  if (provider !== 'bluesky') {
    checks.push((async () => {
      try {
        const data = await (await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?${new URLSearchParams({ q: clean, limit: '10' })}`)).json();
        const hit = (data?.actors || []).find((a) => a.handle.split('.')[0].toLowerCase() === clean.toLowerCase());
        if (hit) add('creator', `bluesky|${hit.handle}`, `Bluesky: @${hit.handle}`);
      } catch {}
    })());
  }
  if (provider !== 'reddit') {
    queueReddit({ provider: 'reddit', mode: 'creator', value: clean }, `Reddit check ${clean}`, null, 'new', (list) => {
      if (list?.length) follow('creator', `reddit|${clean}`, { label: `Reddit: u/${clean}` });
    });
  }
  await Promise.race([Promise.all(checks), new Promise((r) => setTimeout(r, 12000))]);
  runIngest().catch(() => {});
  return { followed: done };
}
