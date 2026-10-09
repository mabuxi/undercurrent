import express from 'express';
import { Readable } from 'node:stream';
import { config } from './config.js';
import { getDb, getSetting, setSetting, now, normalizeTag } from './db.js';
import { buildFeed, presentOne, popRaw } from './rank.js';
import { blockCreator, unblockCreator, listBlocked } from './blocks.js';
import { getItem, itemTags, setState, hydrate, recheckBlocks, upsertItem, followed, addTags, removeItemTag } from './store.js';
import { applyEvents, applyEvent, topTags, rebuildProfile, points } from './profile.js';
import { topReplies } from './threads.js';
import { lookupPerson, platformPosts, profileUrl } from './people.js';
import { genderPrefs, setGenderPrefs, autoMale } from './gender.js';
import { queueLook } from './ai/looker.js';
import { listSuggestions, setSuggestion, suggestCombos, suggestFantasies, refreshFantasyIdeas } from './suggest.js';
import { touchSession } from './sessions.js';
import { listKinks, createKink, updateKink, deleteKink, mergeKinks, unlockKink, listFantasies, saveFantasy, deleteFantasy, setLink, removeLink, kinkIdsForTagNames } from './kinks.js';
import { writeFantasy, tagsForText, conceptsFor } from './fantasywrite.js';
import { deeperStep, fantasyTags } from './deeper.js';
import { directMedia } from './direct.js';
import { planDiscovery, journeyOutcome } from './discovery.js';
import { removedConcepts, forgetRemoved, risingConcepts, RULES } from './kinkengine.js';
import { conceptName } from './concepts.js';
import { grouped, addMemory, updateMemory, deleteMemory, CATEGORIES, listPrompts, deletePrompt } from './memory.js';
import { hardBlockList, userLimits } from './safety.js';
import { windows, mapData, journey } from './views.js';
import { presets } from './presets.js';
import { runIngest, ingestState, listFollows, follow, unfollow, removeFollow, syncRedditSubscriptions, importRedditHistory, testProvider, providerStats, autoTags, followTarget } from './ingest.js';
import { PROVIDERS, providerState, setProvider, hasKeys } from './sources/providers.js';
import { extremeFilter, DEFAULT_EXTREME } from './safety.js';
import { log } from './log.js';
import * as reddit from './sources/reddit.js';
import * as redgifs from './sources/redgifs.js';
import { BOORUS } from './sources/booru.js';
import { mockSvg } from './sources/mock.js';
import { health, listModels, running, activeModel, setModel, systemInfo, usageSummary, chat } from './ai/ollama.js';
import { taggerStatus, tagItem } from './ai/tagger.js';
import { summarizeSession, reflect, refreshKinks, sessionStats, organizeKinks } from './ai/assistant.js';
import { runCommand } from './ai/agent.js';
import * as lemmy from './sources/lemmy.js';
import * as tubes from './sources/tubes.js';
import * as rss from './sources/redditRss.js';
import { fetchMore, redditQueueSize, rememberSearch, fetchForInsight, followEverywhere } from './ingest.js';
import { fastModel, deepModel, setFastModel, pullModel, pulls, modelInfo } from './ai/ollama.js';
import { queueDeep, deepNow } from './ai/tagger.js';
import { autoDiscover, interestTerms } from './discover.js';
import { brain, nodeDetail, strengthen, kinkIdForTag } from './brain.js';
import { performerInfo } from './sources/stars.js';
import { tagsForItems, tagSpecificity } from './store.js';
import { lustUrl, lustTest, TUBE_CDNS, tubeReferer } from './sources/lustpress.js';
import { invalidatePool } from './searchstate.js';
import { setupStatus, pullModels, installOllama, conceptCatalog, suggestFor, moreFor, aiKinks, SOURCE_ORDER, modelOptions, chooseModels } from './setup.js';
import { fantasyIdeas } from './fantasyideas.js';
import { listProfiles, createProfile, renameProfile, setProfileColor, switchProfile, deleteProfile, backupProfile, restoreBackup, deleteBackup, revealInFinder } from './profiles.js';
import { updateStatus, applyUpdate, job as updateJob, whatsNew, markSeen, changelog } from './update.js';
import { lang, languageSet, setLanguage, LANGS, tr, trn, replyIn } from './i18n.js';
import { kinkLabel, translateItem } from './translate.js';
import { queueDislike, queueBlock, dislikeOf, dropReason, dislikedTags, forgiveTag, confirmDislike, skipDislike, dropGuess, guessesToVerify, verifyGuess } from './dislike.js';
import { conceptLabel } from './vocab.js';
import { conceptName as cName, knownVariants } from './concepts.js';
import { boostTags } from './profile.js';
import { syncGroups } from './kinkengine.js';
import { startSearch, jobView, editChip, searchMore, keepSearchSource, webKey, webSearch, openProfile } from './search.js';

export const api = express.Router();
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((err) => {
  const status = err.status && err.status < 600 && err.status >= 400 ? err.status : 500;
  if (status >= 500) log('error', `${req.method} ${req.path}`, err.stack || err.message);
  if (!res.headersSent) res.status(status).json({ error: err.message });
});

function resolveFilters(f = {}) {
  const out = { ...f };
  const kinks = listKinks({ includeHidden: true });
  const byName = (n) => kinks.find((k) => k.id === Number(n) || k.name.toLowerCase() === String(n).toLowerCase());
  if (out.kink !== undefined && out.kink !== null && out.kink !== '') {
    const k = byName(out.kink);
    if (k) out.kink = k.id;
    else { out.tags = [...(out.tags || []), normalizeTag(out.kink)]; delete out.kink; }
  }
  if (out.fantasy) {
    const fan = listFantasies().find((x) => x.id === Number(out.fantasy) || x.name.toLowerCase() === String(out.fantasy).toLowerCase());
    if (fan) out.fantasy = fan.id; else delete out.fantasy;
  }
  if (out.tags) out.tags = out.tags.map(normalizeTag).filter(Boolean);
  if (out.length === 'any') delete out.length;
  return out;
}

api.post('/feed', wrap((req, res) => {
  const { filters = {}, exclude = [], limit = 10, mix = 15 } = req.body || {};
  const rf = resolveFilters(filters);
  const r = buildFeed(rf, { exclude, limit: Math.min(30, limit), mix, capFollows: !rf.search && !rf.author && !rf.community && !rf.following && !rf.saved });
  // Posts about to be shown get a closer look (frames or the image itself), so their tags match what is really in them.
  try {
    const ids = r.items.filter((x) => ['image', 'set', 'short', 'gif', 'long'].includes(x.format)).map((x) => x.id);
    if (ids.length) getDb().prepare(`UPDATE items SET ai_deep = 2 WHERE COALESCE(ai_deep, 0) = 0 AND id IN (${ids.map(() => '?').join(',')})`).run(...ids);
    queueLook(r.items.map((x) => x.id));
  } catch {}
  res.json(r);
}));

const moreRuns = new Map();
api.post('/feed/more', wrap(async (req, res) => {
  const filters = resolveFilters(req.body?.filters || {});
  const key = JSON.stringify(filters);
  if (!moreRuns.has(key)) moreRuns.set(key, fetchMore(filters).finally(() => setTimeout(() => moreRuns.delete(key), 1500)));
  res.json(await moreRuns.get(key));
}));

let eventsSinceKinks = 0;
let kinkRunAt = 0;
let kinkRun = null;
api.post('/events', wrap((req, res) => {
  const { sessionId, events = [] } = req.body || {};
  touchSession();
  const list = events.slice(0, 200).map((e) => ({ ...e, sessionId }));
  const signal = applyEvents(list);
  const strongIds = list.filter((e) => ['save', 'reason', 'complete', 'rewatch', 'up'].includes(e.type) || (e.type === 'rate' && Number(e.value) > 0)).map((e) => Number(e.itemId)).filter(Boolean);
  if (strongIds.length) { fetchForInsight(strongIds); for (const id of strongIds) { deepNow(id); try { keepSearchSource(id); } catch {} } }
  const hebb = list.filter((e) => ['save', 'reason', 'complete', 'rewatch', 'up', 'follow'].includes(e.type) || (e.type === 'rate' && Number(e.value) > 0) || (e.type === 'dwell' && Number(e.value) > 20000)).map((e) => Number(e.itemId)).filter(Boolean);
  if (hebb.length) { try { strengthen(hebb, 1); } catch {} }
  eventsSinceKinks += list.filter((e) => e.type !== 'impression').length;
  if (eventsSinceKinks >= 30 && !kinkRun && Date.now() - kinkRunAt > 10 * 60000) {
    eventsSinceKinks = 0;
    kinkRunAt = Date.now();
    kinkRun = refreshKinks().catch(() => null).finally(() => { kinkRun = null; });
  }
  res.json({ ok: true, signal });
}));

api.get('/items/:id/top', wrap(async (req, res) => {
  const it = getItem(Number(req.params.id));
  if (!it) return res.status(404).json({ error: tr('Not found') });
  const n = Math.max(2, Math.min(40, Number(req.query.n) || 2));
  try { res.json({ top: await topReplies(it, { waitMs: n > 2 ? 20000 : 6000, n }), n }); } catch (err) { res.json({ top: it.media?.top || [], pending: true, note: err.message }); }
}));

api.get('/items/:id', wrap((req, res) => {
  const it = getItem(Number(req.params.id));
  if (!it) return res.status(404).json({ error: tr('Not found') });
  res.json({ ...presentOne(it), allTags: itemTags(it.id) });
}));

async function loadComments(it) {
  if (config.mock) {
    return [
      { id: 'c1', author: 'amber_tide12', body: 'This one is great, thanks for posting.', score: 120, replies: [{ author: 'silk_echo19', body: 'Agreed, the second half especially.', score: 30 }] },
      { id: 'c2', author: 'north_atlas30', body: 'Is there a longer version of this?', score: 64, replies: [] },
      { id: 'c3', author: 'copper_lark48', body: 'Saving this for later.', score: 12, replies: [] }
    ];
  }
  if (it.source === 'reddit' && reddit.redditConfigured()) return reddit.comments(it.extId, 8);
  if (it.source === 'reddit') return rss.comments(it.extId, 10);
  if (it.source === 'lemmy' && it.media?.lemmyId) return lemmy.comments(it.media.lemmyId, 8);
  return [];
}

api.get('/items/:id/comments', wrap(async (req, res) => {
  const it = getItem(Number(req.params.id));
  if (!it) return res.status(404).json({ error: tr('Not found') });
  res.json({ comments: await loadComments(it), url: it.url });
}));

function clientActions(client) {
  const kinks = listKinks({ includeHidden: true });
  const fans = listFantasies();
  return client.map((c) => {
    if (c.type === 'filter') return { ...c, filters: resolveFilters(c.filters) };
    if (c.type === 'journey') {
      const k = c.kink ? kinks.find((x) => x.name.toLowerCase() === String(c.kink).toLowerCase()) : null;
      const f = c.fantasy ? fans.find((x) => x.name.toLowerCase() === String(c.fantasy).toLowerCase()) : null;
      return { type: 'journey', kink: k?.id || null, fantasy: f?.id || null, mode: c.mode };
    }
    return c;
  });
}

// A post's title or text in the interface language, by the local AI (kept, so it is quick the next time).
api.post('/translate', wrap(async (req, res) => {
  try {
    res.json(await translateItem(req.body?.id, req.body?.field));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}));

api.post('/items/:id/ask', wrap(async (req, res) => {
  const it = getItem(Number(req.params.id));
  const q = String(req.body?.question || '').trim();
  if (!it) return res.status(404).json({ error: tr('Not found') });
  if (!q) return res.status(400).json({ error: tr('Type a question first.') });
  applyEvent({ itemId: it.id, type: 'ask', sessionId: req.body?.sessionId });
  const r = await runCommand(q, { itemId: it.id, sessionId: req.body?.sessionId });
  res.json({ answer: r.reply, client: clientActions(r.client), engine: r.engine });
}));

const refreshing = new Map();
api.post('/items/:id/refresh-media', wrap(async (req, res) => {
  const it = getItem(Number(req.params.id));
  if (!it) return res.status(404).json({ error: tr('Not found') });
  const p = tubes[it.source];
  if (config.mock || !p?.byId || it.media?.kind !== 'embed') return res.json({ media: it.media, refreshed: false });
  if (Date.now() - (it.media.thumbsAt || 0) < 60_000) return res.json({ media: it.media, refreshed: false });
  if (!refreshing.has(it.id)) refreshing.set(it.id, p.byId(it.extId).catch((err) => { log('warn', `Refreshing ${it.source} ${it.extId} failed: ${err.message}`); return undefined; }).finally(() => setTimeout(() => refreshing.delete(it.id), 60_000)));
  const fresh = await refreshing.get(it.id);
  if (fresh === undefined) return res.json({ media: it.media, refreshed: false });
  if (!fresh) {
    getDb().prepare("UPDATE items SET blocked = 1, block_reason = 'broken' WHERE id = ?").run(it.id);
    return res.json({ media: null, gone: true });
  }
  getDb().prepare('UPDATE items SET media = ? WHERE id = ?').run(JSON.stringify(fresh.media), it.id);
  res.json({ media: fresh.media, refreshed: true });
}));

// The video file behind a tube site's player, for the phone's own player (see direct.js).
api.get('/items/:id/direct', wrap(async (req, res) => {
  const it = getItem(Number(req.params.id));
  if (!it) return res.status(404).json({ error: tr('Not found') });
  // Test mode: Pornhub posts play a test file in the phone's player, the others keep the site's player.
  if (config.mock) return res.json({ direct: it.source === 'pornhub' ? { kind: 'mp4', src: '/api/mock/video/landscape.webm', height: 360 } : null });
  res.json({ direct: await directMedia(it) });
}));

api.get('/items/:id/similar', wrap((req, res) => {
  const id = Number(req.params.id);
  const all = tagsForItems([id]).get(id) || [];
  const perf = all.filter((t) => t.kind === 'performer').map((t) => t.name);
  const spec = tagSpecificity().map;
  const tags = all.filter((t) => t.kind !== 'performer' && t.weight >= 0.4).sort((a, b) => b.weight * (spec.get(b.id) ?? 1) - a.weight * (spec.get(a.id) ?? 1)).slice(0, 4).map((t) => t.name);
  const exclude = [...String(req.query.exclude || '').split(',').map(Number).filter(Boolean), id];
  const limit = Math.min(6, Number(req.query.limit) || 3);
  let items = [];
  if (perf.length) items = buildFeed({ tags: perf }, { limit: 1, mix: 0, exclude }).items;
  if (tags.length) {
    let more = buildFeed({ tags }, { limit: limit * 4, mix: 0, exclude: [...exclude, ...items.map((x) => x.id)] }).items;
    if (more.length < limit) more = [...more, ...buildFeed({ tags, relaxed: true }, { limit: limit * 3, mix: 0, exclude: [...exclude, ...items.map((x) => x.id), ...more.map((x) => x.id)] }).items];
    const overlap = (x) => x.tags.filter((t) => tags.includes(t)).length;
    items = [...items, ...more.sort((a, b) => overlap(b) * 12 + b.match - (overlap(a) * 12 + a.match)).slice(0, limit - items.length)];
  }
  res.json({ items, tags, performers: perf });
}));

api.get('/performers/:name', wrap(async (req, res) => {
  const name = normalizeTag(req.params.name);
  const db = getDb();
  if (req.query.fetch === '1') {
    const targets = [['pornhub', 'creator'], ['redtube', 'creator'], ['eporner', 'search'], ['redgifs', 'search'], ['xvideos', 'search'], ['xhamster', 'search'], ['xnxx', 'search']].filter(([p]) => PROVIDERS[p] && (providerState()[p]?.enabled || config.mock));
    await Promise.race([
      Promise.all(targets.map(([p, mode]) => PROVIDERS[p].fetch({ mode, value: req.params.name }).then((list) => { db.transaction(() => { for (const n of list) upsertItem({ ...n, performers: [...new Set([...(n.performers || []), mode === 'search' ? req.params.name : null].filter(Boolean))] }); })(); }).catch(() => {}))),
      new Promise((r) => setTimeout(r, 12000))
    ]);
  }
  const items = buildFeed({ tags: [name], includeSeen: true }, { limit: 60, mix: 0 }).items;
  const bySource = {};
  for (const it of items) bySource[it.source] = (bySource[it.source] || 0) + 1;
  const tagCounts = {};
  for (const it of items) for (const t of it.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
  const followed = !!db.prepare("SELECT 1 FROM follows WHERE active = 1 AND lower(value) LIKE ?").get(`%|${name}`);
  const info = performerInfo(name);
  res.json({
    name: info?.display || req.params.name, count: items.length, bySource, followed, thumb: info?.thumb || null, videosElsewhere: info?.videos || null, gender: info?.gender || null,
    match: items.length ? Math.round(items.reduce((a, b) => a + b.match, 0) / items.length) : null,
    tags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t),
    // Their best known videos first: the most upvoted and viewed, from here and fetched from the sources.
    items: topFirst(items).slice(0, 12)
  });
}));

api.post('/performers/:name/follow', wrap((req, res) => {
  const name = req.params.name;
  const on = req.body?.on !== false;
  const targets = [['creator', 'pornhub'], ['creator', 'redtube'], ['search', 'eporner'], ['search', 'redgifs']];
  for (const [kind, p] of targets) { if (on) follow(kind, `${p}|${name}`, { label: name }); else unfollow(kind, `${p}|${name}`); }
  if (on) runIngest({ force: false }).catch(() => {});
  res.json({ ok: true });
}));

api.post('/items/:id/vote', wrap(async (req, res) => {
  const it = getItem(Number(req.params.id));
  const dir = Number(req.body?.dir) || 0;
  // Liking what you already like (or the same twice from two windows) is not a new like: nothing is logged.
  if (Math.sign(it.vote || 0) === Math.sign(dir)) return res.json({ ok: true, same: true });
  applyEvent({ itemId: it.id, type: dir > 0 ? 'up' : dir < 0 ? 'down' : 'unvote', sessionId: req.body?.sessionId });
  if (dir > 0) { fetchForInsight([it.id]); deepNow(it.id); try { strengthen([it.id], 1); } catch {} }
  if (dir < 0) queueDislike(it.id, 'down');
  let synced = false;
  if (it.source === 'reddit' && !config.mock && getSetting('syncVotes', true) && reddit.redditConfigured()) {
    await reddit.vote(`t3_${it.extId}`, dir);
    synced = true;
  }
  res.json({ ok: true, synced });
}));

api.post('/items/:id/save', wrap(async (req, res) => {
  const it = getItem(Number(req.params.id));
  const on = !!req.body?.on;
  if (!!it.saved === on) return res.json({ ok: true, same: true });
  applyEvent({ itemId: it.id, type: on ? 'save' : 'unsave', sessionId: req.body?.sessionId });
  if (on) { fetchForInsight([it.id]); deepNow(it.id); try { strengthen([it.id], 1.4); } catch {} }
  let synced = false;
  if (it.source === 'reddit' && !config.mock && getSetting('syncSaves', false) && reddit.redditConfigured()) {
    await reddit.save(`t3_${it.extId}`, on);
    synced = true;
  }
  res.json({ ok: true, synced });
}));

api.post('/items/:id/rate', wrap((req, res) => {
  applyEvent({ itemId: Number(req.params.id), type: 'rate', value: Math.max(0, Math.min(5, Number(req.body?.value) || 0)), sessionId: req.body?.sessionId });
  if (Number(req.body?.value) > 0) { fetchForInsight([Number(req.params.id)]); deepNow(Number(req.params.id)); try { strengthen([Number(req.params.id)], 1 + Number(req.body.value) * 0.3); } catch {} }
  res.json({ ok: true });
}));

// You can put a post in a kink, or take it out when the tagging got it wrong. Taking it out removes the tags that
// put it there, from every tagger, so the post stops showing that kink.
api.post('/items/:id/kinks', wrap((req, res) => {
  const id = Number(req.params.id);
  const k = listKinks({ includeHidden: true }).find((x) => x.id === Number(req.body?.kink));
  if (!k || k.isGroup || !getItem(id)) return res.status(404).json({ error: tr('Not found') });
  const db = getDb();
  if (req.body?.on === false) {
    const ids = k.tags.map((t) => t.id);
    if (ids.length) db.prepare(`DELETE FROM item_tags WHERE item_id = ? AND tag_id IN (${ids.map(() => '?').join(',')})`).run(id, ...ids);
  } else {
    const main = k.concepts?.[0] && k.tags.some((t) => t.name === k.concepts[0]) ? k.concepts[0] : k.tags[0]?.name || k.name.toLowerCase();
    addTags(id, [{ name: main, weight: 1 }], 'user');
  }
  invalidatePool();
  res.json({ item: presentOne(getItem(id)) });
}));

// A tag that does not fit a post: it goes from that post for good, stops counting for your taste from that post,
// and the tagger is told so it uses it less loosely.
api.delete('/items/:id/tags/:tag', wrap((req, res) => {
  const id = Number(req.params.id);
  const it = getItem(id);
  if (!it) return res.status(404).json({ error: tr('Not found') });
  const name = removeItemTag(id, decodeURIComponent(req.params.tag));
  if (!name) return res.status(404).json({ error: tr('Not found') });
  if ((it.vote || 0) > 0 || it.saved || (it.rating || 0) >= 3 || (it.heat || 0) > 0) boostTags([name], -0.25);
  invalidatePool();
  res.json({ item: presentOne(getItem(id)), tag: name });
}));

api.post('/items/:id/less', wrap((req, res) => {
  applyEvent({ itemId: Number(req.params.id), type: 'less', sessionId: req.body?.sessionId });
  queueDislike(Number(req.params.id), 'less');
  res.json({ ok: true });
}));
// What the bigger model thinks you did not like in a post you hid or disliked, and taking one reason back.
api.get('/items/:id/dislike', wrap((req, res) => res.json(dislikeOf(Number(req.params.id)))));
api.delete('/items/:id/dislike/:reason', wrap((req, res) => res.json(dropReason(Number(req.params.id), String(req.params.reason)))));
// Your answer to "what did you not like?": only what you pick counts. "Not sure" leaves any guess to verify later.
api.post('/items/:id/dislike', wrap((req, res) => res.json(confirmDislike(Number(req.params.id), (req.body?.tags || []).map(String).slice(0, 12)))));
api.post('/items/:id/dislike/skip', wrap((req, res) => res.json(skipDislike(Number(req.params.id)))));
api.delete('/items/:id/dislike-guess/:tag', wrap((req, res) => res.json(dropGuess(Number(req.params.id), String(req.params.tag)))));

api.post('/items/:id/retag', wrap(async (req, res) => {
  res.json(await tagItem(Number(req.params.id)));
}));

api.get('/media/redgifs/:id', wrap(async (req, res) => {
  if (config.mock) return res.json({ hd: '/api/mock/video/vertical.webm', sd: '/api/mock/video/vertical.webm', poster: null });
  const g = await redgifs.resolveOne(req.params.id, req.query.fresh === '1');
  if (!g) return res.status(404).json({ error: tr('This RedGIFs clip is gone or private.') });
  const it = getDb().prepare("SELECT id, media FROM items WHERE source IN ('redgifs','reddit') AND json_extract(media, '$.redgifsId') = ?").all(req.params.id.toLowerCase());
  for (const row of it) {
    let m = {};
    try { m = JSON.parse(row.media || '{}'); } catch {}
    getDb().prepare('UPDATE items SET media = ? WHERE id = ?').run(JSON.stringify({ ...m, hd: g.urls?.hd, sd: g.urls?.sd, poster: m.poster || g.urls?.poster || g.urls?.thumbnail, urlsAt: Date.now() }), row.id);
  }
  res.json({ hd: g.urls?.hd, sd: g.urls?.sd, poster: g.urls?.poster || g.urls?.thumbnail, hasAudio: g.hasAudio !== false, duration: g.duration });
}));

const PROXY_HOSTS = [/\.redgifs\.com$/, /^v\.redd\.it$/, /\.redd\.it$/, /rule34\.xxx$/, /gelbooru\.com$/, /imgur\.com$/, ...TUBE_CDNS.map(([re]) => re)];
api.get('/proxy', async (req, res) => {
  let u;
  try { u = new URL(String(req.query.url)); } catch { return res.status(400).end(); }
  if (u.protocol !== 'https:' || !PROXY_HOSTS.some((re) => re.test(u.hostname))) return res.status(403).end();
  try {
    const referer = tubeReferer(u.href);
    const headers = { 'User-Agent': referer ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' : config.userAgent };
    if (referer) headers.Referer = referer;
    if (req.headers.range) headers.Range = req.headers.range;
    const r = await fetch(u, { headers });
    res.status(r.status);
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control']) if (r.headers.get(h)) res.setHeader(h, r.headers.get(h));
    if (!r.body) return res.end();
    const stream = Readable.fromWeb(r.body);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch {
    if (!res.headersSent) res.status(502).end(); else res.destroy();
  }
});

const HLS_HOSTS = [/^v\.redd\.it$/, /\.redd\.it$/, /\.redgifs\.com$/, ...TUBE_CDNS.map(([re]) => re)];
api.get('/hls', async (req, res) => {
  let u;
  try { u = new URL(String(req.query.url)); } catch { return res.status(400).end(); }
  if (u.protocol !== 'https:' || !HLS_HOSTS.some((re) => re.test(u.hostname))) return res.status(403).end();
  try {
    const referer = tubeReferer(u.href);
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', ...(referer ? { Referer: referer } : {}) } });
    if (!r.ok) return res.status(r.status).end();
    const text = await r.text();
    const abs = (x) => new URL(x, u).toString();
    const wrap = (x) => (/\.m3u8(\?|$)/i.test(x) ? `/api/hls?url=${encodeURIComponent(abs(x))}` : `/api/proxy?url=${encodeURIComponent(abs(x))}`);
    const out = text.split('\n').map((line) => {
      const l = line.trim();
      if (!l) return line;
      if (l.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, x) => `URI="${wrap(x)}"`);
      return wrap(l);
    }).join('\n');
    res.setHeader('content-type', 'application/vnd.apple.mpegurl');
    res.send(out);
  } catch {
    res.status(502).end();
  }
});

// A few lines for the home screen: what the feed leans into tonight, what is new since last time, what you did last time.
api.get('/home/summary', wrap((req, res) => {
  const db = getDb();
  const t = now();
  touchSession();
  const prev = getSetting('lastVisit', 0) || 0;
  if (t - prev > 30 * 60000) { setSetting('prevVisit', prev); setSetting('lastVisit', t); }
  const since = getSetting('prevVisit', 0) || t - 86400000;
  const kinks = listKinks().filter((k) => !k.isGroup && k.status !== 'hidden');
  const lean = kinks.slice().sort((a, b) => (b.lately + b.now) - (a.lately + a.now)).slice(0, 2).map((k) => k.label || k.name);
  const rising = kinks.filter((k) => k.lately - k.allTime >= 4).sort((a, b) => (b.lately - b.allTime) - (a.lately - a.allTime))[0];
  const fresh = db.prepare('SELECT COUNT(*) c FROM items i LEFT JOIN item_state s ON s.item_id = i.id WHERE i.blocked = 0 AND i.fetched_at > ? AND COALESCE(s.seen, 0) = 0').get(since).c;
  const fol = followed();
  let fromFollowed = 0;
  for (const r of db.prepare('SELECT author, community FROM items WHERE blocked = 0 AND fetched_at > ?').all(since)) if ((r.community && fol.communities.has(r.community.toLowerCase())) || (r.author && fol.authors.has(String(r.author).toLowerCase()))) fromFollowed++;
  const newKinks = db.prepare("SELECT name FROM kinks WHERE created > ? AND status = 'proposed' AND COALESCE(is_group, 0) = 0").all(since).map((r) => kinkLabel({ name: r.name })).slice(0, 2);
  const ideas = db.prepare("SELECT COUNT(*) c FROM suggestions WHERE status = 'new' AND kind = 'fantasy'").get().c;
  const last = db.prepare(`SELECT i.id FROM events e JOIN items i ON i.id = e.item_id WHERE e.ts BETWEEN ? AND ? AND e.type IN ('up', 'save', 'rate', 'complete', 'rewatch') ORDER BY e.ts DESC LIMIT 40`).all(since - 7 * 86400000, since);
  const lastTags = new Map();
  for (const r of last) for (const tg of itemTags(r.id).filter((x) => x.kind !== 'performer' && x.weight >= 0.5).slice(0, 4)) lastTags.set(tg.name, (lastTags.get(tg.name) || 0) + 1);
  const lastTop = [...lastTags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map((x) => x[0]);
  const parts = [];
  const both = (l) => (l.length > 1 ? tr('{a} and {b}', { a: l.slice(0, -1).join(', '), b: l[l.length - 1] }) : l[0]);
  if (lean.length) parts.push(rising && !lean.includes(rising.label || rising.name) ? tr('Tonight leans into {kinks}, with {rising} rising.', { kinks: both(lean), rising: rising.label || rising.name }) : tr('Tonight leans into {kinks}.', { kinks: both(lean) }));
  if (fresh) parts.push(fromFollowed ? trn(fresh, "{n} post you haven't seen since last time, {f} from who you follow.", "{n} posts you haven't seen since last time, {f} from who you follow.", { f: fromFollowed }) : trn(fresh, "{n} post you haven't seen since last time.", "{n} posts you haven't seen since last time."));
  if (lastTop.length) parts.push(tr('Last time you were into {tags}.', { tags: both(lastTop) }));
  if (newKinks.length) parts.push(tr('New to try: {kinks}.', { kinks: newKinks.join(', ') }));
  if (ideas) parts.push(trn(ideas, '{n} fantasy idea waits in your windows.', '{n} fantasy ideas wait in your windows.'));
  res.json({ text: parts.join(' ') || tr('Scroll, like and heat a few posts and the feed starts shaping itself around you.') });
}));

// What a request to another site was for, in the interface language (stored in English).
function purposeLabel(p) {
  const v = String(p || '');
  let m = v.match(/^(.+) content$/);
  if (m && !['reddit', 'redgifs'].includes(m[1])) return tr('{site} content', { site: m[1] });
  m = v.match(/^Scraper server: (.+)$/);
  if (m) return tr('Scraper server: {site}', { site: m[1] });
  return tr(v);
}

// Opening Undercurrent on a phone: the addresses on this network, or why it is not possible.
api.get('/lan', wrap(async (req, res) => {
  const os = await import('node:os');
  const { lanUrls } = await import('./lan.js');
  const local = /^(127\.|::1$|localhost$)/.test(config.host);
  const { pairToken } = await import('./lan.js');
  const code = encodeURIComponent(pairToken(config.dataDir));
  res.json({ urls: local ? [] : lanUrls(config.port, os.networkInterfaces()).map((u) => ({ ...u, url: `${u.url}/?pair=${code}`, plain: u.url })), port: config.port, localOnly: local });
}));
// Forgetting every paired phone: a new code, the old QR code stops working.
api.post('/lan/reset', wrap(async (req, res) => {
  const { resetPairToken, isLoopback } = await import('./lan.js');
  if (!isLoopback(req.socket.remoteAddress)) return res.status(403).json({ error: tr('Only the Mac itself can do this.') });
  resetPairToken(config.dataDir);
  res.json({ ok: true });
}));

api.get('/settings/language', wrap((req, res) => res.json({ language: languageSet() ? lang() : null, languages: LANGS })));
api.put('/settings/language', wrap((req, res) => {
  const b = req.body || {};
  if (b.guessed && languageSet()) return res.json({ language: lang() });
  res.json({ language: setLanguage(b.language) });
}));
// The feed filters you set (formats, new or popular, how much new to you, the mood) stay set until you change them,
// also after closing Undercurrent. They apply to searches too.
const TUNE_FORMATS = ['long', 'short', 'gif', 'image', 'set', 'story', 'discussion'];
export function cleanTune(b = {}) {
  const out = {};
  const f = Array.isArray(b.formats) ? b.formats.filter((x) => TUNE_FORMATS.includes(x)) : [];
  if (f.length) out.formats = [...new Set(f)];
  if (typeof b.window === 'string' && /^(new|popular):(day|week|month|year)$/.test(b.window)) out.window = b.window;
  if (Number.isFinite(Number(b.mix)) && b.mix !== null && b.mix !== '') out.mix = Math.max(0, Math.min(40, Math.round(Number(b.mix) / 5) * 5));
  if (typeof b.mood === 'string' && /^[a-z]{2,20}$/.test(b.mood)) out.mood = b.mood;
  return out;
}
api.get('/settings/tune', wrap((req, res) => res.json(getSetting('tune', {}) || {})));
api.put('/settings/tune', wrap((req, res) => { const v = cleanTune(req.body || {}); setSetting('tune', v); res.json(v); }));
api.get('/settings/gender', wrap((req, res) => res.json({ ...genderPrefs(), autoValue: autoMale() })));
api.put('/settings/gender', wrap((req, res) => {
  const b = req.body || {};
  const patch = {};
  if (b.male !== undefined) patch.male = Number(b.male);
  if (b.auto !== undefined) patch.auto = !!b.auto;
  if (b.trans !== undefined) patch.trans = !!b.trans;
  res.json({ ...setGenderPrefs(patch), autoValue: autoMale() });
}));

api.get('/people/lookup', wrap(async (req, res) => {
  const handle = String(req.query.handle || '').trim();
  if (!handle) return res.status(400).json({ error: tr('Which person?') });
  res.json(await lookupPerson(handle, { platform: String(req.query.platform || 'any') }));
}));

// Most upvoted and viewed first, then how well they fit you.
function topFirst(items) {
  return [...items].sort((a, b) => popRaw({ score: b.upvotes ?? b.score, media: b.media }) - popRaw({ score: a.upvotes ?? a.score, media: a.media }) || b.match - a.match);
}

api.get('/authors/:source/:name', wrap(async (req, res) => {
  const { source, name } = req.params;
  const db = getDb();
  // With fetch=1 their posts are also fetched from the source itself, not only what is already here.
  if (req.query.fetch === '1' && PROVIDERS[source]?.can?.creator && (providerState()[source]?.enabled || config.mock)) {
    await Promise.race([
      PROVIDERS[source].fetch({ mode: 'creator', value: name }).then((list) => { db.transaction(() => { for (const n of list || []) upsertItem(n); })(); invalidatePool(); }).catch(() => {}),
      new Promise((r) => setTimeout(r, 10000))
    ]);
  }
  const stats = db.prepare('SELECT COUNT(*) posts, COALESCE(SUM(score),0) score, MIN(community) community FROM items WHERE source = ? AND lower(author) = lower(?) AND blocked = 0').get(source, name);
  const tags = db.prepare(`SELECT t.name, COUNT(*) n FROM items i JOIN item_tags it ON it.item_id = i.id JOIN tags t ON t.id = it.tag_id WHERE i.source = ? AND lower(i.author) = lower(?) GROUP BY t.id ORDER BY n DESC LIMIT 8`).all(source, name);
  const kind = 'creator';
  const followValue = `${source}|${name}`;
  const followed = !!db.prepare("SELECT 1 FROM follows WHERE active = 1 AND ((kind = 'creator' AND lower(value) = lower(?)) OR (kind IN ('reddit_user','redgifs_user') AND lower(value) = lower(?)))").get(followValue, name);
  const items = buildFeed({ author: name, includeSeen: true, noCollections: true }, { limit: 40, mix: 0 }).items;
  const match = items.length ? Math.round(items.reduce((a, b) => a + b.match, 0) / items.length) : null;
  const onPlatform = await platformPosts(source, name).catch(() => null);
  res.json({ name, source, ...stats, platformPosts: onPlatform?.posts ?? null, followers: onPlatform?.followers ?? null, profileUrl: onPlatform?.url || profileUrl(source === 'reddit' ? 'reddit' : source, name), avatar: onPlatform?.avatar || null, tags: tags.map((t) => t.name), followed, kind, followValue, canFollow: !!PROVIDERS[source]?.can?.creator, match, top: items.slice(0, 3).map((x) => ({ id: x.id, title: x.title, format: x.format, match: x.match })), items: topFirst(items).slice(0, 12) });
}));

// Blocking a creator: worse than hiding a post. Everything from them goes, now and later, and the bigger model looks
// at several of their posts together to learn what you did not like.
api.post('/creators/block', wrap((req, res) => {
  const kind = req.body?.kind === 'performer' ? 'performer' : 'author';
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: tr('Which creator?') });
  const { ids } = blockCreator({ kind, source: req.body?.source || null, name });
  const first = Number(req.body?.itemId) || null;
  const look = [...new Set([first, ...ids].filter(Boolean))].slice(0, 5);
  if (first) { setState(first, { hidden: 1 }); applyEvent({ itemId: first, type: 'less' }); }
  queueBlock(look);
  invalidatePool();
  res.json({ ok: true, hidden: ids.length, analysed: look[0] || null });
}));
api.get('/creators/blocked', wrap((req, res) => res.json({ blocked: listBlocked() })));
api.delete('/creators/blocked/:id', wrap((req, res) => { const ok = unblockCreator(req.params.id); invalidatePool(); res.json({ ok }); }));

// What you probably did not like, from the closer looks after hides, thumbs down and blocks.
api.get('/memory/disliked', wrap((req, res) => res.json({ tags: dislikedTags(), verify: guessesToVerify(), blocked: listBlocked() })));
api.delete('/memory/disliked/:tag', wrap((req, res) => res.json({ ok: true, n: forgiveTag(req.params.tag) })));
api.post('/memory/verify/:tag', wrap((req, res) => res.json({ ok: true, n: verifyGuess(req.params.tag, req.body?.ok !== false) })));

api.get('/follows', wrap((req, res) => res.json({ follows: listFollows().map((f) => ({ ...f, target: followTarget(f) })) })));
api.delete('/follows/:id', wrap((req, res) => { removeFollow(Number(req.params.id)); res.json({ ok: true }); }));

api.get('/providers', wrap((req, res) => {
  const state = providerState();
  const stats = providerStats();
  const counts = Object.fromEntries(getDb().prepare('SELECT source, COUNT(*) n, SUM(blocked) b FROM items GROUP BY source').all().map((r) => [r.source, { items: r.n, filtered: r.b || 0 }]));
  const follows = listFollows().map((f) => ({ ...f, target: followTarget(f) }));
  res.json({
    autoDiscover: getSetting('autoDiscover', true),
    autoTags: autoTags(),
    providers: Object.entries(PROVIDERS).map(([id, p]) => ({
      id, label: p.label, about: tr(p.about), formats: p.formats, keys: p.keys, can: p.can, enabled: state[id].enabled, hasKeys: hasKeys(id), needs: p.needs || null, alsoScraper: !!lustUrl() && ['pornhub', 'redtube', 'eporner'].includes(id),
      stats: { ...(stats[id] || {}), ...(counts[id] || { items: 0, filtered: 0 }) },
      follows: follows.filter((f) => f.target?.provider === id),
      ...(id === 'reddit' ? { rss: { ...rss.rssStatus(), queue: redditQueueSize() } } : {})
    }))
  });
}));

api.put('/providers/:id', wrap((req, res) => {
  if (!PROVIDERS[req.params.id]) return res.status(404).json({ error: tr('Unknown source') });
  if ('enabled' in (req.body || {})) setProvider(req.params.id, { enabled: !!req.body.enabled });
  if (req.body?.enabled) runIngest({ only: req.params.id, force: true }).catch(() => {});
  res.json({ ok: true });
}));

api.post('/providers/:id/test', wrap(async (req, res) => {
  try {
    res.json(await testProvider(req.params.id));
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
}));

api.put('/settings/discovery', wrap((req, res) => {
  if ('autoDiscover' in (req.body || {})) setSetting('autoDiscover', !!req.body.autoDiscover);
  res.json({ ok: true });
}));

api.get('/settings/extreme', wrap((req, res) => res.json({ ...extremeFilter(), defaults: DEFAULT_EXTREME })));
api.put('/settings/extreme', wrap((req, res) => {
  const cur = extremeFilter();
  const terms = Array.isArray(req.body?.terms) ? req.body.terms.map((t) => normalizeTag(t)).filter(Boolean) : cur.terms;
  const on = 'on' in (req.body || {}) ? !!req.body.on : cur.on;
  setSetting('extremeFilter', { on, terms });
  res.json({ ok: true, on, terms, ...recheckBlocks() });
}));

api.post('/follow-creator', wrap(async (req, res) => {
  const { source, name, itemId } = req.body || {};
  const r = await followEverywhere(source, name);
  if (itemId) applyEvent({ itemId: Number(itemId), type: 'follow', sessionId: req.body?.sessionId });
  res.json(r);
}));

api.get('/following/latest', wrap((req, res) => {
  const items = buildFeed({ following: true, includeSeen: true }, { limit: Math.min(30, Number(req.query.limit) || 12), mix: 0 }).items.sort((a, b) => (b.created || 0) - (a.created || 0));
  res.json({ items, follows: listFollows().filter((f) => f.active && f.synced_from !== 'auto').map((f) => ({ ...f, target: followTarget(f) })) });
}));

api.post('/follow', wrap(async (req, res) => {
  const { kind, value, on = true, label } = req.body || {};
  if (!kind || !value) return res.status(400).json({ error: tr('Pick what to follow.') });
  if (on) follow(kind, String(value).trim(), { label, synced: kind === 'subreddit' || kind === 'community' ? 'source' : null }); else unfollow(kind, value);
  let synced = false;
  if (kind === 'subreddit' && !config.mock && getSetting('syncFollows', true) && reddit.redditConfigured()) {
    await reddit.subscribe(value, on);
    synced = true;
  }
  if (on) runIngest({ force: false }).catch(() => {});
  res.json({ ok: true, synced });
}));

api.post('/ingest', wrap(async (req, res) => {
  res.json(await runIngest({ force: !!req.body?.force }));
}));

api.get('/windows', wrap((req, res) => {
  const wr = windows({ cursor: Number(req.query.cursor) || 0, count: Math.min(8, Number(req.query.count) || 4), side: Number(req.query.side) || 0, sessionId: req.query.session || null, seed: Number(req.query.seed) || 0, exclude: String(req.query.exclude || '').split(',').map(Number).filter(Boolean).slice(-400) });
  try { queueLook(wr.flatMap((w) => (w.items || []).map((x) => x.id)).slice(0, 40)); } catch {}
  res.json({ windows: wr });
}));

api.get('/map', wrap((req, res) => res.json(mapData())));
api.get('/presets', wrap((req, res) => res.json({ presets: presets({ turn: Math.max(0, Number(req.query.turn) || 0) }) })));

api.get('/journey', wrap((req, res) => {
  res.json(journey({ kink: req.query.kink, fantasy: req.query.fantasy, mode: req.query.mode || 'close' }));
}));

api.post('/ask', wrap(async (req, res) => {
  const q = String(req.body?.q || '').trim();
  if (!q) return res.status(400).json({ error: tr('Type a question or a request first.') });
  const r = await runCommand(q, { sessionId: req.body?.sessionId });
  res.json({ reply: r.reply, client: clientActions(r.client), engine: r.engine });
}));

// The search bar: a search runs as a job whose steps the bar shows while they happen.
api.post('/search', wrap((req, res) => {
  const q = String(req.body?.q || '').trim();
  if (!q) return res.status(400).json({ error: tr('Type something to search for, or ask for something.') });
  const id = startSearch({ q, deep: !!req.body?.deep, sessionId: req.body?.sessionId || null });
  res.json(jobView(id));
}));
api.get('/search/:id', wrap((req, res) => {
  const v = jobView(req.params.id);
  if (!v) return res.status(404).json({ error: tr('That search has expired. Search again.') });
  res.json(v);
}));
api.post('/search/:id/chip', wrap((req, res) => {
  const v = editChip(req.params.id, req.body || {});
  if (!v) return res.status(404).json({ error: tr('That search has expired. Search again.') });
  res.json(v);
}));
api.post('/search/:id/more', wrap(async (req, res) => {
  const v = await searchMore(req.params.id);
  if (!v) return res.status(404).json({ error: tr('That search has expired. Search again.') });
  res.json(v);
}));
api.post('/search/:id/profile', wrap(async (req, res) => {
  const r = await openProfile(req.params.id, String(req.body?.key || ''));
  if (!r) return res.status(404).json({ error: tr('That search has expired. Search again.') });
  res.json(r);
}));
api.post('/search/:id/follow', wrap((req, res) => {
  const { provider, mode, value, label } = req.body || {};
  if (!PROVIDERS[provider] || !value) return res.status(400).json({ error: tr('Unknown source.') });
  // Added as a source: its posts come into the feed, but it is not something you "follow".
  if (provider === 'reddit' && mode === 'community') follow('subreddit', value, { label: label || `r/${value}`, synced: 'source' });
  else if (provider === 'reddit' && mode === 'creator') follow('reddit_user', value, { label: label || `u/${value}`, synced: 'source' });
  else follow(mode || 'search', `${provider}|${value}`, { label: label || `${PROVIDERS[provider].label}: ${value}`, synced: 'source' });
  runIngest().catch(() => {});
  res.json({ ok: true });
}));
api.get('/settings/lustpress', wrap((req, res) => res.json({ url: lustUrl() || null })));
api.put('/settings/lustpress', wrap(async (req, res) => {
  const url = String(req.body?.url || '').trim().replace(/\/+$/, '');
  if (!url) { setSetting('lustpressUrl', null); invalidatePool(); return res.json({ url: null }); }
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: tr('Give the full address, starting with https://') });
  try {
    const n = await lustTest(url);
    setSetting('lustpressUrl', url);
    for (const id of Object.keys(PROVIDERS)) if (PROVIDERS[id].needs === 'lustpress') setProvider(id, { enabled: true });
    invalidatePool();
    runIngest().catch(() => {});
    res.json({ url, ok: true, results: n });
  } catch (err) { res.status(400).json({ error: tr('That server did not answer like a Lustpress server: {error}', { error: err.message }) }); }
}));
api.get('/settings/websearch', wrap((req, res) => res.json({ set: !!webKey(), fromEnv: !getSetting('ollamaApiKey', null) && !!process.env.OLLAMA_API_KEY })));
api.put('/settings/websearch', wrap(async (req, res) => {
  const key = String(req.body?.key || '').trim();
  if (!key) { setSetting('ollamaApiKey', null); return res.json({ set: !!webKey() }); }
  setSetting('ollamaApiKey', key);
  try { const r = await webSearch('redgifs', 1); res.json({ set: true, ok: true, results: r.length }); } catch (err) { res.json({ set: true, ok: false, error: err.message }); }
}));

api.get('/session/summary', wrap(async (req, res) => res.json(await summarizeSession(req.query.session || null))));
api.get('/session/stats', wrap((req, res) => res.json(sessionStats(req.query.session || null))));

api.get('/kinks', wrap((req, res) => res.json({ kinks: listKinks({ includeHidden: true }).map((k) => ({ ...k, name: k.label || k.name, baseName: k.name })) })));
api.post('/kinks', wrap((req, res) => res.json({ id: createKink({ ...req.body, origin: 'user' }) })));
api.patch('/kinks/:id', wrap((req, res) => res.json({ ok: updateKink(Number(req.params.id), req.body || {}) })));
api.delete('/kinks/:id', wrap((req, res) => { deleteKink(Number(req.params.id)); res.json({ ok: true }); }));
api.post('/kinks/refresh', wrap(async (req, res) => res.json(await refreshKinks())));
api.post('/kinks/organize', wrap(async (req, res) => res.json(await organizeKinks())));
api.post('/kinks/groups', wrap((req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: tr('Give the group a name.') });
  const id = createKink({ name, isGroup: true, origin: 'user', color: req.body?.color || undefined });
  for (const k of req.body?.kinks || []) updateKink(Number(k), { parentId: id });
  res.json({ id });
}));
api.post('/kinks/:id/merge', wrap((req, res) => res.json({ id: mergeKinks(Number(req.params.id), Number(req.body?.into)) })));
api.post('/kinks/:id/unlock', wrap(async (req, res) => { unlockKink(Number(req.params.id)); res.json(await refreshKinks()); }));
api.get('/kinks/removed', wrap((req, res) => res.json({ removed: [...removedConcepts()].map((c) => ({ concept: c, name: conceptLabel(c, lang(), conceptName(c)) })) })));
api.delete('/kinks/removed/:concept', wrap(async (req, res) => { forgetRemoved(String(req.params.concept)); res.json(await refreshKinks()); }));
api.get('/kinks/rising', wrap((req, res) => res.json({ rising: risingConcepts(12), rules: RULES })));
api.post('/kinks/links', wrap((req, res) => { setLink(req.body?.a, req.body?.b, req.body?.why || '', 'user'); res.json({ ok: true }); }));
api.delete('/kinks/links/:a/:b', wrap((req, res) => { removeLink(req.params.a, req.params.b); res.json({ ok: true }); }));

api.get('/brain', wrap((req, res) => res.json(brain())));
api.get('/brain/node/:key', wrap((req, res) => {
  const d = nodeDetail(String(req.params.key));
  if (!d) return res.status(404).json({ error: tr('Not found') });
  res.json(d);
}));
const insightCache = new Map();
api.get('/brain/insight/:key', wrap(async (req, res) => {
  const key = String(req.params.key);
  const cacheKey = `${lang()}|${key}`;
  const hit = insightCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 10 * 60000 && req.query.fresh !== '1') return res.json({ text: hit.text, cached: true });
  const b = brain();
  const node = b.nodes.find((n) => n.key === key);
  if (!node) return res.status(404).json({ error: tr('Not found') });
  const d = nodeDetail(key) || {};
  const names = new Map(b.nodes.map((n) => [n.key, n.name]));
  const links = b.edges.filter((e) => e.a === key || e.b === key).sort((x, y) => y.w - x.w).slice(0, 6).map((e) => `${names.get(e.a === key ? e.b : e.a)} (${Math.round(e.w * 100)}%)`);
  const facts = [
    `${node.type === 'tag' ? 'Tag' : node.type === 'fantasy' ? 'Fantasy' : 'Kink'}: ${node.name}${node.description ? ` (${node.description})` : ''}`,
    node.tags?.length ? `Its tags: ${node.tags.join(', ')}` : '',
    `Score all time ${node.allTime}%, lately ${node.lately}%`,
    `Posts engaged with in the last 7 days: ${d.week ?? 0}, average per week before that: ${d.perWeekBefore ?? 0}`,
    `Interactions: ${Object.entries(d.counts || {}).filter(([t]) => t !== 'impression').map(([t, c]) => `${c} ${t}`).join(', ') || 'none yet'}`,
    links.length ? `Most linked with: ${links.join(', ')}` : '',
    d.relatedTags?.length ? `Tags that come with it: ${d.relatedTags.join(', ')}` : ''
  ].filter(Boolean).join('\n');
  try {
    const text = await chat({ kind: 'summary', model: fastModel(), numPredict: 170, temperature: 0.4,
      system: `You are the private, local assistant of one adult using an adult-content browser. In 2 or 3 short sentences, second person, no judgement, say what this kink means for his taste right now: how strong it is, whether it is rising or fading, what it pairs with, and one specific thing worth exploring next. Plain words, no lists. ${replyIn()}`,
      user: facts });
    insightCache.set(cacheKey, { text, at: Date.now() });
    res.json({ text });
  } catch (err) {
    res.json({ text: null, error: err.message });
  }
}));
api.post('/brain/promote/:tagId', wrap((req, res) => res.json({ id: kinkIdForTag(Number(req.params.tagId)) })));

api.get('/history', wrap((req, res) => {
  const db = getDb();
  const type = String(req.query.type || '');
  const want = Math.min(400, Number(req.query.limit) || 150);
  const rows = db.prepare(`SELECT e.item_id, MAX(e.ts) last FROM events e WHERE e.item_id IS NOT NULL AND e.type NOT IN ('impression', 'tagboost') ${type ? 'AND e.item_id IN (SELECT item_id FROM events WHERE type = ?)' : ''} GROUP BY e.item_id ORDER BY last DESC LIMIT ?`)
    .all(...(type ? [type] : []), want * 4);
  const cq = db.prepare('SELECT type, COUNT(*) c, COALESCE(SUM(value), 0) v, MAX(value) mx, MAX(ts) t FROM events WHERE item_id = ? GROUP BY type');
  const evq = db.prepare("SELECT type, value FROM events WHERE item_id = ? AND type != 'impression'");
  const out = [];
  for (const r of rows) {
    if (out.length >= want) break;
    const it = getItem(r.item_id);
    if (!it) continue;
    const counts = {};
    for (const c of cq.all(r.item_id)) counts[c.type] = { n: c.c, v: c.v, max: c.mx, t: c.t };
    // Likes, dislikes and saves count once, as they are now: liking, unliking and liking again is one like.
    // Heat shows how hot it is now.
    const VOTES = ['up', 'down', 'unvote', 'save', 'unsave', 'rate'];
    const at = (k) => counts[k]?.t || 0;
    for (const k of VOTES) delete counts[k];
    if ((it.vote || 0) > 0) counts.up = { n: 1, t: Math.max(at('up'), r.last) };
    if ((it.vote || 0) < 0) counts.down = { n: 1, t: r.last };
    if (it.saved) counts.save = { n: 1, t: r.last };
    if ((it.rating || 0) > 0) counts.rate = { n: 1, max: it.rating, t: r.last };
    const dwellMs = counts.dwell?.v || 0;
    const meaningful = Object.keys(counts).some((k) => !['impression', 'dwell', 'progress', 'play', 'skip'].includes(k)) || dwellMs >= 6000 || ((counts.progress?.v || 0) >= 0.5 && dwellMs >= 3000);
    if (!meaningful) continue;
    let pts = 0;
    for (const e of evq.all(r.item_id)) if (!VOTES.includes(e.type)) pts += points(e.type, e.value, it);
    if ((it.vote || 0) > 0) pts += points('up', null, it);
    if ((it.vote || 0) < 0) pts += points('down', null, it);
    if (it.saved) pts += points('save', null, it);
    if ((it.rating || 0) > 0) pts += points('rate', it.rating, it);
    const video = ['long', 'short', 'gif'].includes(it.format);
    out.push({
      id: it.id, title: it.title, source: it.source, format: it.format, media: it.media, author: it.author, community: it.community, last: r.last,
      dwellMs, watchMs: video ? dwellMs : 0, watched: Math.min(1, counts.progress?.v || 0), completed: !!counts.complete, rewatches: counts.rewatch?.n || 0,
      score: Math.round(pts * 10) / 10, counts, types: Object.keys(counts), rating: it.rating, saved: it.saved, vote: it.vote
    });
  }
  res.json({ items: out });
}));

let rebuilding = null;
api.delete('/history/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  db.prepare('DELETE FROM events WHERE item_id = ?').run(id);
  if (req.query.less === '1') db.prepare('INSERT INTO events(item_id, type, value, session_id, ts) VALUES(?, ?, NULL, ?, ?)').run(id, 'less', 'history', now());
  if (!rebuilding) rebuilding = new Promise((r) => setTimeout(r, 400)).then(() => rebuildProfile()).finally(() => { rebuilding = null; });
  await rebuilding;
  res.json({ ok: true });
}));

api.get('/suggestions', wrap((req, res) => { const kind = String(req.query.kind || 'fantasy'); res.json({ suggestions: listSuggestions(kind, { status: String(req.query.status || 'new'), limit: kind === 'fantasy' ? 4 : 30 }) }); }));
api.post('/suggestions/refresh', wrap(async (req, res) => {
  const kind = req.body?.kind || 'fantasy';
  const run = kind === 'combo' ? suggestCombos({ force: true }) : refreshFantasyIdeas();
  res.json({ started: true, added: await Promise.race([run, new Promise((r) => setTimeout(() => r(null), 1500))]) });
}));
api.post('/suggestions/:id', wrap((req, res) => {
  const row = getDb().prepare('SELECT * FROM suggestions WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: tr('Not found') });
  const data = JSON.parse(row.data || '{}');
  if (req.body?.action === 'save' && row.kind === 'fantasy') {
    // One you refined is yours (at least 90%); its kinks follow the tags you gave it.
    const id = saveFantasy({ name: row.title, description: row.body, kinks: data.refined ? [] : (data.kinks || []).map((k) => k.id), tags: data.tags || [], saved: 1, origin: data.refined ? 'user' : 'ai' });
    setSuggestion(row.id, 'saved');
    return res.json({ ok: true, fantasyId: id });
  }
  setSuggestion(row.id, req.body?.action === 'save' ? 'saved' : 'dismissed');
  res.json({ ok: true });
}));

// A fantasy idea you refined or regenerated: its new story and tags, and it counts as yours from then on.
api.patch('/suggestions/:id', wrap((req, res) => {
  const row = getDb().prepare('SELECT * FROM suggestions WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: tr('Not found') });
  const b = req.body || {};
  const data = JSON.parse(row.data || '{}');
  const tags = Array.isArray(b.tags) ? [...new Set(b.tags.map((t) => normalizeTag(String(t))).filter(Boolean))].slice(0, 16) : data.tags || [];
  const ids = kinkIdsForTagNames(tags);
  const all = listKinks();
  const next = { ...data, tags, refined: true, kinks: all.filter((k) => ids.includes(k.id)).map((k) => ({ id: k.id, name: k.label || k.name, color: k.color })) };
  const title = String(b.title || row.title).slice(0, 60);
  const body = String(b.scenario ?? row.body).slice(0, 300);
  const conf = Math.max(90, row.confidence || 0);
  try {
    getDb().prepare('UPDATE suggestions SET title = ?, body = ?, data = ?, confidence = ? WHERE id = ?').run(title, body, JSON.stringify(next), conf, row.id);
  } catch {
    // Another idea already has this title.
    getDb().prepare('UPDATE suggestions SET body = ?, data = ?, confidence = ? WHERE id = ?').run(body, JSON.stringify(next), conf, row.id);
  }
  const r = getDb().prepare('SELECT * FROM suggestions WHERE id = ?').get(row.id);
  res.json({ suggestion: { ...r, data: JSON.parse(r.data || '{}') } });
}));

// Writing a fantasy from tags: polled, since the bigger model may need a while to load.
api.post('/fantasy/write', wrap((req, res) => {
  const id = `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const job = { done: false, result: null };
  FANT_JOBS.set(id, job);
  for (const [k] of [...FANT_JOBS].slice(0, -20)) FANT_JOBS.delete(k);
  const b = req.body || {};
  writeFantasy({ tags: b.tags, scenario: b.scenario, title: b.title, mode: b.mode, male: b.male ?? genderPrefs().male, avoid: b.avoid || [] })
    .then((r) => { job.result = r; }).catch(() => { job.result = { title: b.title || '', scenario: b.scenario || '', tags: b.tags || [], byAi: false }; }).finally(() => { job.done = true; });
  res.json({ job: id });
}));
api.get('/fantasy/write/:id', wrap((req, res) => {
  const job = FANT_JOBS.get(req.params.id);
  if (!job) return res.status(404).json({ error: tr('Not found') });
  res.json(job.done ? { done: true, ...job.result } : { done: false });
}));
// A discovery journey: planned by the bigger model in the background (it may need a while to load), checked here.
api.post('/journey/discover', wrap((req, res) => {
  const id = `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const job = { done: false, result: null, started: now() };
  FANT_JOBS.set(id, job);
  for (const [k] of [...FANT_JOBS].slice(0, -20)) FANT_JOBS.delete(k);
  const b = req.body || {};
  let anchor = [];
  let anchorName = '';
  if (b.kink) {
    const k = listKinks({ includeHidden: true }).find((x) => x.id === Number(b.kink));
    if (k) { anchor = k.tags.slice(0, 5).map((t) => t.name); anchorName = k.label || k.name; }
  } else if (b.fantasy) {
    const f = listFantasies().find((x) => x.id === Number(b.fantasy));
    if (f) { anchor = fantasyTags(f, listKinks({ includeHidden: true })); anchorName = f.name; }
  }
  planDiscovery({ anchor, anchorName }).then((r) => { job.result = r; }).catch((e) => { log('warn', `Journey failed: ${e.message}`); job.result = { steps: [], stages: [], title: tr('Nothing new nearby yet'), description: e.message }; }).finally(() => { job.done = true; });
  res.json({ job: id });
}));
api.get('/journey/discover/:id', wrap((req, res) => {
  const job = FANT_JOBS.get(req.params.id);
  if (!job) return res.status(404).json({ error: tr('Not found') });
  res.json(job.done ? { done: true, ...job.result } : { done: false, waited: Math.round((now() - job.started) / 1000) });
}));
api.post('/journey/outcome', wrap((req, res) => res.json(journeyOutcome(normalizeTag(String(req.body?.dest || '')), ['love', 'maybe', 'no'].includes(req.body?.verdict) ? req.body.verdict : null))));
// Going deeper into a fantasy: the next choice to make, and the posts for what is chosen so far.
api.post('/fantasy/deeper', wrap(async (req, res) => res.json(await deeperStep(req.body || {}))));
// The tags a story you are typing is about.
api.post('/fantasy/tags', wrap(async (req, res) => res.json(await tagsForText(req.body?.text, { ai: !!req.body?.ai }))));

api.get('/fantasies', wrap((req, res) => res.json({ fantasies: listFantasies() })));
api.post('/fantasies', wrap((req, res) => res.json({ id: saveFantasy(req.body || {}) })));
api.patch('/fantasies/:id', wrap((req, res) => {
  const cur = listFantasies().find((f) => f.id === Number(req.params.id));
  if (!cur) return res.status(404).json({ error: tr('Not found') });
  const b = req.body || {};
  res.json({ id: saveFantasy({ id: cur.id, name: cur.name, description: cur.description, kinks: b.tags && !b.kinks ? [] : cur.kinks.map((k) => k.id), saved: cur.saved, ...b, origin: b.tags || b.description != null ? 'user' : undefined }) });
}));
api.delete('/fantasies/:id', wrap((req, res) => { deleteFantasy(Number(req.params.id)); res.json({ ok: true }); }));

api.get('/memory', wrap((req, res) => res.json({ groups: grouped(), categories: CATEGORIES })));
api.get('/prompts', wrap((req, res) => res.json({ prompts: listPrompts(Math.min(1000, Number(req.query.limit) || 200)) })));
api.delete('/prompts/:id', wrap((req, res) => { deletePrompt(req.params.id); res.json({ ok: true }); }));
api.post('/memory', wrap((req, res) => res.json({ id: addMemory({ ...req.body, origin: 'user', status: 'active' }) })));
api.patch('/memory/:id', wrap((req, res) => res.json({ ok: updateMemory(Number(req.params.id), req.body || {}) })));
api.delete('/memory/:id', wrap((req, res) => { deleteMemory(Number(req.params.id)); res.json({ ok: true }); }));
api.post('/memory/reflect', wrap(async (req, res) => res.json({ proposed: (await reflect()).length })));

api.get('/limits', wrap((req, res) => res.json({ limits: userLimits(), safetyTerms: hardBlockList().length })));
api.post('/limits', wrap((req, res) => {
  const t = normalizeTag(req.body?.tag);
  if (!t) return res.status(400).json({ error: tr('Type a tag to block.') });
  getDb().prepare('INSERT OR IGNORE INTO limits(tag, created) VALUES(?, ?)').run(t, now());
  const r = recheckBlocks();
  res.json({ ok: true, hidden: r.blocked });
}));
api.delete('/limits/:tag', wrap((req, res) => { getDb().prepare('DELETE FROM limits WHERE tag = ?').run(req.params.tag); res.json({ ok: true, ...recheckBlocks() }); }));

api.put('/settings/lemmy', wrap((req, res) => {
  const inst = String(req.body?.instance || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
  if (inst) setSetting('lemmyInstance', inst);
  res.json({ ok: true, instance: inst });
}));

api.get('/settings', wrap((req, res) => {
  const r = reddit.redditCreds();
  res.json({
    reddit: r ? { clientId: r.clientId, username: r.username, hasSecret: !!r.clientSecret, hasPassword: !!r.password } : null,
    boorus: Object.fromEntries(Object.keys(BOORUS).map((b) => { const c = getSetting(`booru.${b}`, null); return [b, c ? { userId: c.userId, hasKey: !!c.apiKey } : null]; })),
    general: {
      syncVotes: getSetting('syncVotes', true), syncSaves: getSetting('syncSaves', false), syncFollows: getSetting('syncFollows', true),
      taggerOn: getSetting('taggerOn', config.taggerEnabled), taggerVision: getSetting('taggerVision', true), tagBooru: getSetting('tagBooru', false)
    },
    mock: config.mock,
    lemmyInstance: getSetting('lemmyInstance', 'lemmynsfw.com'),
    ai: { model: activeModel(), fastModel: getSetting('fastModel', null), deepModel: getSetting('deepModel', null), taggerPace: getSetting('taggerPace', 'normal'), autoFollow: getSetting('autoFollow', true) },
    redditFeed: rss.feedToken() ? { user: rss.feedToken().user, set: true } : null
  });
}));

api.put('/settings/reddit', wrap((req, res) => {
  const cur = reddit.redditCreds() || {};
  const b = req.body || {};
  setSetting('reddit', { clientId: b.clientId ?? cur.clientId, clientSecret: b.clientSecret || cur.clientSecret, username: b.username ?? cur.username, password: b.password || cur.password });
  reddit.resetRedditToken();
  res.json({ ok: true });
}));
api.delete('/settings/reddit', wrap((req, res) => { setSetting('reddit', null); reddit.resetRedditToken(); res.json({ ok: true }); }));
api.post('/reddit/test', wrap(async (req, res) => res.json(await reddit.diagnose())));
api.post('/reddit/sync', wrap(async (req, res) => { const r = await syncRedditSubscriptions(); runIngest({ force: true }).catch(() => {}); res.json(r); }));
api.post('/reddit/import', wrap(async (req, res) => res.json(await importRedditHistory())));

api.put('/settings/booru/:name', wrap((req, res) => {
  if (!BOORUS[req.params.name]) return res.status(404).json({ error: tr('Unknown board') });
  const cur = getSetting(`booru.${req.params.name}`, {}) || {};
  setSetting(`booru.${req.params.name}`, { userId: req.body?.userId ?? cur.userId, apiKey: req.body?.apiKey || cur.apiKey });
  res.json({ ok: true });
}));

api.put('/settings/reddit-feed', wrap((req, res) => {
  const raw = String(req.body?.url || '').trim();
  if (!raw) { setSetting('redditFeed', null); return res.json({ ok: true, set: false }); }
  let feed = req.body?.feed;
  let user = req.body?.user;
  try { const u = new URL(raw); feed = u.searchParams.get('feed') || feed; user = u.searchParams.get('user') || user; } catch {}
  if (!feed || !user) return res.status(400).json({ error: tr('Paste one of the private feed links from reddit.com/prefs/feeds. It contains feed= and user=.') });
  setSetting('redditFeed', { feed, user });
  res.json({ ok: true, set: true, user });
}));

api.put('/settings/ai', wrap((req, res) => {
  const b = req.body || {};
  if ('fastModel' in b) setFastModel(b.fastModel || null);
  if ('deepModel' in b) setSetting('deepModel', b.deepModel || null);
  if ('autoFollow' in b) setSetting('autoFollow', !!b.autoFollow);
  if ('taggerPace' in b && ['eco', 'normal', 'fast'].includes(b.taggerPace)) setSetting('taggerPace', b.taggerPace);
  res.json({ ok: true, fastModel: fastModel(), deepModel: getSetting('deepModel', null), taggerPace: getSetting('taggerPace', 'normal') });
}));

api.post('/models/pull', wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!/^[\w.\-/:]+$/.test(name)) return res.status(400).json({ error: tr('That does not look like a model name.') });
  res.json(await pullModel(name));
}));
api.get('/models/pull', wrap((req, res) => res.json({ pulls: [...pulls.values()] })));

api.post('/discover', wrap(async (req, res) => {
  const r = await autoDiscover({ force: true });
  runIngest().catch(() => {});
  res.json(r);
}));

api.post('/items/:id/deep', wrap((req, res) => { deepNow(Number(req.params.id)); res.json({ ok: true }); }));

api.put('/settings/general', wrap((req, res) => {
  for (const k of ['syncVotes', 'syncSaves', 'syncFollows', 'taggerOn', 'taggerVision', 'tagBooru']) if (k in (req.body || {})) setSetting(k, !!req.body[k]);
  res.json({ ok: true });
}));

const SUGGESTED_FAST = [
  { name: 'huihui_ai/qwen3.5-abliterated:4b', size: '3.3 GB', note: 'Fast and sees images. About 8 to 10 times faster than the 27B for tagging.' },
  { name: 'huihui_ai/qwen3.5-abliterated:9b', size: '6.6 GB', note: 'More precise tags, still about 3 times faster than the 27B. Sees images.' }
];
api.get('/models', wrap(async (req, res) => {
  let models = [];
  let error = null;
  try { models = await listModels(); } catch (err) { error = err.message; }
  for (const m of models) { try { const i = await modelInfo(m.name); m.vision = i.vision; m.capabilities = i.capabilities; } catch {} }
  res.json({ models, running: await running(), active: activeModel(), fast: fastModel(), system: systemInfo(), error, suggested: SUGGESTED_FAST.map((m) => ({ ...m, size: tr(m.size), note: tr(m.note) })) });
}));
api.put('/models/active', wrap((req, res) => { setModel(String(req.body?.name || '')); res.json({ ok: true, active: activeModel() }); }));
api.post('/models/test', wrap(async (req, res) => {
  const t = Date.now();
  const reply = await chat({ kind: 'test', user: `Answer with one short sentence: are you ready to tag posts for a private adult-content browser? ${replyIn()}`, temperature: 0.2 });
  res.json({ reply, ms: Date.now() - t });
}));

// ---------- First run ----------
api.get('/setup/status', wrap(async (req, res) => res.json(await setupStatus())));
api.post('/setup/models', wrap(async (req, res) => res.json(await pullModels())));
// Before the welcome steps go on to your kinks: the models are not only downloaded, they run and answer.
api.post('/setup/check', wrap(async (req, res) => {
  if (config.mock) return res.json({ ok: true, models: [{ name: 'test', ok: true }] });
  const st = await setupStatus();
  if (!st.ready) return res.json({ ok: false, waiting: true, models: [] });
  const names = [...new Set([fastModel(), deepModel()].filter(Boolean))];
  const models = [];
  for (const name of names) {
    try {
      const out = await Promise.race([
        chat({ kind: 'summary', model: name, temperature: 0, numPredict: 20, schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }, system: 'Answer with {"ok": true}.', user: 'Are you working?' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error(tr('took too long'))), 90000))
      ]);
      models.push({ name, ok: !!out });
    } catch (e) { models.push({ name, ok: false, error: String(e.message || e).slice(0, 120) }); }
  }
  res.json({ ok: models.length > 0 && models.every((m) => m.ok), models });
}));
api.get('/setup/models/options', wrap(async (req, res) => res.json(await modelOptions())));
api.put('/setup/models/choice', wrap(async (req, res) => {
  chooseModels(req.body || {});
  const pull = req.body?.pull ? await pullModels() : null;
  res.json({ ...(await modelOptions()), pull });
}));
api.post('/setup/ollama', wrap(async (req, res) => res.json(await installOllama())));
api.get('/setup/concepts', wrap((req, res) => {
  const mine = new Set(listKinks({ includeHidden: false }).filter((k) => !k.isGroup).flatMap((k) => k.concepts || []));
  res.json({ families: conceptCatalog({ male: req.query.male !== undefined ? Number(req.query.male) : undefined }), picked: [...mine] });
}));
// Each pick asks the local model for more, in that pick's family and in others, with the ready-made suggestions as
// its examples; the ready-made ones follow, so there is always something even without the model.
api.post('/setup/suggest', wrap(async (req, res) => {
  const picked = (req.body?.picked || []).map(String).slice(0, 60);
  const focus = req.body?.focus ? String(req.body.focus) : null;
  const premade = suggestFor(picked, focus, { male: req.body?.male });
  const ai = focus ? await aiKinks({ picked, focus, shown: (req.body?.shown || []).map(String).slice(0, 300), male: req.body?.male }) : { items: [], ai: false };
  const seen = new Set(ai.items.map((x) => x.concept));
  res.json({ suggestions: [...ai.items, ...premade.filter((x) => !seen.has(x.concept))], ai: ai.ai });
}));
api.post('/setup/more', wrap(async (req, res) => res.json({ more: await moreFor(String(req.body?.family || ''), { picked: (req.body?.picked || []).map(String).slice(0, 60), shown: (req.body?.shown || []).map(String).slice(0, 300), male: req.body?.male }) })));
api.get('/setup/sources', wrap((req, res) => {
  const st = providerState();
  const order = (id) => { const i = SOURCE_ORDER.indexOf(id); return i < 0 ? 99 : i; };
  res.json({ sources: Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, about: tr(p.about), formats: p.formats, enabled: st[id].enabled, hasKeys: hasKeys(id), needs: p.needs || null }))
    .sort((a, b) => order(a.id) - order(b.id)) });
}));
// A few fantasies from what you picked: written by the local model when it is ready, simple pairings otherwise.
// Writing the ideas can take a while with a big model, so it runs as a job the page asks about every few seconds.
const FANT_JOBS = new Map();
api.post('/setup/fantasies', wrap(async (req, res) => {
  const id = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const job = { done: false, result: null };
  FANT_JOBS.set(id, job);
  for (const [k] of [...FANT_JOBS].slice(0, -20)) FANT_JOBS.delete(k);
  setupFantasies(req.body || {}).then((r) => { job.result = r; }).catch(() => { job.result = { fantasies: [], byAi: false }; }).finally(() => { job.done = true; });
  res.json({ job: id });
}));
api.get('/setup/fantasies/:id', wrap((req, res) => {
  const job = FANT_JOBS.get(req.params.id);
  if (!job) return res.status(404).json({ error: tr('Not found') });
  res.json(job.done ? { done: true, ...job.result } : { done: false });
}));
async function setupFantasies(body) {
  const req = { body };
  const res = { json: (x) => x };
  const picked = (req.body?.picked || []).map(String).filter(Boolean).slice(0, 12);
  if (picked.length < 2) return res.json({ fantasies: [] });
  const names = picked.map(cName);
  let list = [];
  // The kinks an idea uses, matched loosely: the model may write them in French, in another spelling, or only in the
  // sentence itself.
  const labels = picked.map((c) => [c, ...knownVariants(c), cName(c), conceptLabel(c, 'fr', '')].filter(Boolean).map((x) => String(x).toLowerCase()));
  const matchKinks = (f) => {
    const hits = new Set();
    for (const k of f.kinks || []) {
      const v = String(k).toLowerCase().trim();
      const i = labels.findIndex((l) => l.includes(v) || l.some((x) => x.length > 3 && (v.includes(x) || x.includes(v))));
      if (i >= 0) hits.add(picked[i]);
    }
    const text = ` ${String(f.description || '').toLowerCase()} `;
    labels.forEach((l, i) => { if (l.some((x) => x.length > 3 && text.includes(x))) hits.add(picked[i]); });
    return [...hits];
  };
  if (!config.mock && (await health()).ok) {
    // The bigger model writes better, but it may need a while to load: it gets 100 seconds, then the quick model 45.
    const models = [...new Set([deepModel(), fastModel()].filter(Boolean))];
    for (const [i, model] of models.entries()) {
      try {
        const out = await Promise.race([chat({
          kind: 'summary', model, temperature: 0.85, numPredict: 700,
          schema: { type: 'object', properties: { fantasies: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, kinks: { type: 'array', items: { type: 'string' } } }, required: ['name', 'description', 'kinks'] } } }, required: ['fantasies'] },
          system: `You suggest fantasies for one adult using a private adult-content browser. A fantasy is ONE short, explicit sentence (at most 30 words, second person "you"), written like a porn scene description, not like a story: direct and dirty, no poetic language, no metaphors, no feelings. It names a specific setting that is hard to come by, who it is with, the sex act, and one thrill that comes from their picks (public or getting caught means risk, a straight guy means a first time, a partner means someone watching). Good example for someone who picked muscle, public and blowjob: "In a spa's shared steam shower where anyone could walk in, a muscular stranger drops to his knees and sucks you off." Use the two or three picks that fit together best, never all of them, never a list of the kinks. Every fantasy in a set has its own setting, person and act. Everyone is a consenting adult; nothing about family members, age, animals or non-consent. Give 5. name: 2 to 4 words naming the scene, not the kinks. description: the one sentence. kinks: the exact picked kink names it really uses (2 or 3), unchanged. ${replyIn()}`,
          user: `Picked kinks: ${names.join(', ')}`
        }), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), i === 0 && models.length > 1 ? 100000 : 45000))]);
        list = (out?.fantasies || []).map((f) => ({ name: String(f.name || '').slice(0, 50), description: String(f.description || '').replace(/\s*[—–]\s*/g, ', ').slice(0, 260), concepts: matchKinks(f) }))
          .filter((f) => f.name && f.description.split(/\s+/).length >= 6 && f.concepts.length >= 1);
        log('info', `Fantasy ideas: ${out?.fantasies?.length || 0} from ${model}, ${list.length} kept`);
        if (list.length >= 3) break;
      } catch (e) { log('info', `Fantasy ideas: ${model} did not answer (${e.message})`); }
    }
  }
  const byAi = list.length > 0;
  // Without the model (or too few from it): scenarios written from your picks, never just the picks in a row.
  if (list.length < 3) {
    const male = Number(req.body?.male);
    const gender = Number.isFinite(male) ? (male >= 70 ? 'men' : male <= 30 ? 'women' : 'both') : 'both';
    for (const f of fantasyIdeas(picked, { gender, max: 5 })) if (list.length < 5 && !list.some((x) => x.name === f.name)) list.push(f);
  }
  // The kinks each idea uses, by name, shown under it.
  return res.json({ fantasies: list.slice(0, 5).map((f) => ({ ...f, tags: (f.concepts || []).map((c) => cName(c)) })), byAi });
}
// Saves everything from the welcome steps at once.
api.post('/setup/finish', wrap(async (req, res) => {
  const b = req.body || {};
  const db = getDb();
  const have = listKinks({ includeHidden: true }).filter((k) => !k.isGroup);
  const idFor = new Map();
  for (const c of (b.picked || []).map(String).slice(0, 60)) {
    const existing = have.find((k) => (k.concepts || []).includes(c));
    if (existing) {
      if (existing.status === 'hidden') updateKink(existing.id, { status: 'active' }, { byUser: false });
      idFor.set(c, existing.id);
    } else {
      const id = createKink({ name: cName(c), tags: knownVariants(c), origin: 'user', status: 'active' });
      // Picked at the start, but free to grow: new spellings join it as you like them.
      db.prepare("UPDATE kinks SET locks = '{}' WHERE id = ?").run(id);
      idFor.set(c, id);
    }
    boostTags(knownVariants(c).slice(0, 4), 1.2);
  }
  for (const f of b.fantasies || []) {
    const tags = Array.isArray(f.tags) ? f.tags : [];
    const ids = [...new Set([...(f.concepts || []), ...conceptsFor(tags)].map((c) => idFor.get(c)).filter(Boolean))];
    if (f.name) saveFantasy({ name: String(f.name).slice(0, 60), description: String(f.description || '').slice(0, 300), kinks: ids, tags, saved: 1, origin: 'user' });
  }
  if (b.gender) setGenderPrefs({ male: Number(b.gender.male ?? 50), auto: !!b.gender.auto, trans: b.gender.trans !== false, everyone: false });
  for (const [id, on] of Object.entries(b.sources || {})) if (PROVIDERS[id]) setProvider(id, { enabled: !!on });
  for (const t of (b.limits || []).map((x) => normalizeTag(x)).filter(Boolean)) db.prepare('INSERT OR IGNORE INTO limits(tag, created) VALUES(?, ?)').run(t, now());
  if (b.limits?.length) recheckBlocks();
  try { syncGroups(); } catch {}
  setSetting('onboarded', true);
  if (!config.mock) pullModels().catch(() => {});
  invalidatePool();
  runIngest({ force: true }).catch(() => {});
  res.json({ ok: true, kinks: idFor.size });
}));
api.post('/setup/reset', wrap((req, res) => { setSetting('onboarded', false); res.json({ ok: true }); }));

// ---------- Profiles ----------
api.get('/profiles', wrap((req, res) => res.json(listProfiles())));
api.post('/profiles', wrap((req, res) => {
  const p = createProfile(req.body?.name, { switchTo: req.body?.switch !== false });
  res.json({ profile: p, ...(req.body?.switch !== false ? switchProfile(p.id) : {}) });
}));
api.patch('/profiles/:id', wrap((req, res) => {
  if (req.body?.name) renameProfile(req.params.id, req.body.name);
  if (req.body?.color) setProfileColor(req.params.id, req.body.color);
  res.json(listProfiles());
}));
api.post('/profiles/:id/switch', wrap((req, res) => res.json(switchProfile(req.params.id))));
api.delete('/profiles/:id', wrap((req, res) => res.json(deleteProfile(req.params.id))));
api.post('/profiles/:id/backup', wrap(async (req, res) => res.json(await backupProfile(req.params.id))));
api.post('/backups/:file/restore', wrap((req, res) => res.json({ profile: restoreBackup(req.params.file, req.body?.name) })));
api.delete('/backups/:file', wrap((req, res) => res.json(deleteBackup(req.params.file))));
api.post('/profiles/reveal', wrap((req, res) => res.json(revealInFinder(req.body?.what))));

// ---------- Versions and updates ----------
api.get('/update/status', wrap(async (req, res) => res.json(await updateStatus({ fresh: req.query.fresh === '1' }))));
api.post('/update/apply', wrap(async (req, res) => res.json(await applyUpdate())));
api.get('/update/job', wrap((req, res) => res.json(updateJob)));
api.get('/update/whatsnew', wrap((req, res) => res.json(whatsNew())));
api.post('/update/seen', wrap((req, res) => { markSeen(); res.json({ ok: true }); }));
api.get('/update/changelog', wrap((req, res) => res.json({ version: config.version, notes: changelog(12) })));

api.get('/status', wrap(async (req, res) => {
  const db = getDb();
  const since = Number(req.query.since) || 0;
  const net = db.prepare('SELECT host, purpose, COUNT(*) n, COALESCE(SUM(bytes_out),0) bytesOut, COALESCE(SUM(bytes_in),0) bytesIn FROM net_log WHERE ts > ? GROUP BY host, purpose ORDER BY n DESC').all(since);
  for (const r of net) r.purpose = purposeLabel(r.purpose);
  const counts = db.prepare('SELECT COUNT(*) items, SUM(blocked) blocked, SUM(CASE WHEN ai_status = \'done\' THEN 1 ELSE 0 END) tagged FROM items').get();
  res.json({
    version: config.version,
    language: lang(),
    app: config.app,
    profile: config.profile,
    webSearch: !!webKey(),
    mock: config.mock,
    model: config.mock ? tr('test model (mock mode)') : activeModel(),
    ollama: await health(),
    running: await running(),
    tagger: taggerStatus(),
    reddit: { ...rss.rssStatus(), queue: redditQueueSize() },
    ingest: { ...ingestState, log: ingestState.log.slice(0, 12) },
    counts,
    usage: usageSummary(),
    privacy: { profileBytesSent: 0, requests: net, totalOut: net.reduce((a, b) => a + b.bytesOut, 0), totalIn: net.reduce((a, b) => a + b.bytesIn, 0) },
    system: systemInfo()
  });
}));

api.get('/export', wrap((req, res) => {
  const db = getDb();
  res.setHeader('Content-Disposition', 'attachment; filename="undercurrent-profile.json"');
  res.json({
    exported: new Date().toISOString(),
    memory: db.prepare('SELECT * FROM memory').all(), kinks: listKinks({ includeHidden: true }), fantasies: listFantasies(),
    follows: listFollows(), limits: userLimits(), affinity: db.prepare('SELECT * FROM affinity').all(), topTags: topTags({ limit: 100 })
  });
}));

api.post('/reset-profile', wrap((req, res) => {
  if (req.body?.confirm !== 'reset') return res.status(400).json({ error: tr('Send confirm: "reset" to wipe your profile.') });
  const db = getDb();
  db.transaction(() => { db.exec('DELETE FROM affinity; DELETE FROM events; DELETE FROM item_state;'); })();
  res.json({ ok: true });
}));

api.get('/mock/embed', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!doctype html><html><body style="margin:0;background:#120d14;color:#efe6ea;font:14px sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><video src="/api/mock/video/landscape.webm" controls autoplay muted loop style="width:100%;height:100%;object-fit:contain"></video></body></html>`);
});

api.get('/mock/img/:seed', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(mockSvg(req.params.seed.replace(/\.svg$/, ''), Number(req.query.w) || 640, Number(req.query.h) || 400));
});
