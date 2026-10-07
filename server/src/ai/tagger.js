import { tubeReferer } from '../sources/lustpress.js';
import { config } from '../config.js';
import { getDb, getSetting } from '../db.js';
import { chat, fastModel, deepModel, activeModel, modelInfo, holdTagging } from './ollama.js';
import { addTags, getItem, tagSpecificity } from '../store.js';
import { isBlocked } from '../safety.js';
import { backfillExtraction, lexicon } from './extract.js';
import { providerState } from '../sources/providers.js';
import * as redgifs from '../sources/redgifs.js';
import { videoFrames, ffmpeg, shrinkImage } from './frames.js';
import { setGender } from '../gender.js';
import { NAME_RE, cleanPersonName } from '../names.js';
import { log } from '../log.js';

const BATCH_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'integer' }, tags: { type: 'array', items: { type: 'string' } }, scene: { type: 'string' }, people: { type: 'array', items: { type: 'string' } }, men: { type: 'integer' }, women: { type: 'integer' }, trans: { type: 'boolean' }, minor_risk: { type: 'boolean' } },
        required: ['id', 'tags', 'scene', 'people', 'men', 'women', 'trans', 'minor_risk']
      }
    }
  },
  required: ['items']
};

const DEEP_SCHEMA = {
  type: 'object',
  properties: {
    scene: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    people: { type: 'array', items: { type: 'string' } },
    men: { type: 'integer' },
    women: { type: 'integer' },
    trans: { type: 'boolean' },
    minor_risk: { type: 'boolean' }
  },
  required: ['scene', 'tags', 'men', 'women', 'trans', 'minor_risk']
};

export const PACE = {
  eco: { batch: 6, pause: 20000, parallel: 1 },
  normal: { batch: 8, pause: 1500, parallel: 2 },
  fast: { batch: 8, pause: 0, parallel: 3 }
};

export const tagger = { running: false, workers: 0, lastError: null, pausedUntil: 0, done: 0, deep: 0, failed: 0, blocked: 0, lastBatch: null, lastDeep: null, rate: [] };

const FORMAT_WORDS = { long: 'long video', short: 'short clip', gif: 'gif', image: 'photo', set: 'photo set', story: 'written story', discussion: 'discussion thread' };
const GENERIC = new Set(['porn', 'sex', 'video', 'hd', 'xxx', 'hot', 'sexy', 'adult', 'nsfw', 'nude', 'naked', 'woman', 'girl', 'man', 'amateur porn', 'porn video', 'explicit', 'female', 'male', 'erotic', 'adult content', 'pornography', 'sexual', 'hardcore sex']);

function overused() {
  return tagSpecificity().overused.slice(0, 35);
}

function rules() {
  return `Tags are lowercase, 1 to 4 words, specific, the words people use on porn sites.
Only tag what this post's own title, site tags, text or images clearly say or show. Never guess: no place, outfit, act, position, body type or camera angle unless it is written or visible. A wrong tag is much worse than a missing one; when in doubt, leave it out. Tags are always plain English words, the way English porn sites tag, also when the post is written in French or another language ("pieds" is feet, "douche" is shower).
When it is said or shown, cover: the people (how many, build, body hair, skin, hair, genitals and their details, tattoos), what they wear, what happens (acts and positions), fluids, where it is, how it is filmed, and the dynamic or scenario.
The title is the strongest evidence: turn every meaningful word and phrase in it into tags, and keep the site tags and hashtags that fit. Also tag what the title plainly means when any reader would be sure of it ("stepmom catches me" is stepmom and caught, "after the gym" is gym, "my first time with a guy" is first time and gay). When you are sure, more tags are better than fewer. Never output words from these instructions.
Never use: porn, sex, video, hd, xxx, hot, sexy, nsfw, nude, female, male, erotic, the format, the duration, the site or community name.
These tags are on almost every post, only use them when they are central here: ${overused().join(', ')}.
people: real names of performers or creators written in the title or text. Never roles like client, boss, stepsister. Empty if none.
men and women: how many men and how many women are in it or clearly involved (a hand, a voice or a POV camera counts). 0 when there are none. Judge from the image first, then the title and tags.
trans: true only when a trans person is in it (said in the title or tags, or clearly visible).
minor_risk: true only if anything suggests someone under 18 (stated ages under 18, school settings with minors, childlike characters).`;
}

export const ECHO = ['what they wear', 'the act', 'the position', 'the setting', 'the camera angle', 'camera angle', 'the people', 'act', 'genitals', 'grooming', 'build', 'skin', 'hair colour', 'hair color', 'body type', 'what happens', 'the scene'];
const META = new Set([...ECHO, 'scene', 'scenario', 'scenarios', 'roleplay scenario', 'positions', 'position', 'body', 'bodies', 'outfit', 'outfits', 'prop', 'props', 'camera style', 'camera', 'dynamic', 'mood', 'setting', 'acts', 'people', 'tags', 'tag', 'long video', 'short clip', 'photo', 'photo set', 'gif', 'written story', 'discussion thread', 'clip', 'unnamed', 'none', 'client', 'looks', 'specific', 'niche', 'explicit']);

function metaTag(t, row) {
  if (META.has(t) || META.has(t.replace(/-/g, ' '))) return true;
  if (/^\d+\s*(min|mins|minutes|sec|s)\b/.test(t) || /^\d+$/.test(t)) return true;
  const src = String(row?.source || '').toLowerCase();
  const comm = String(row?.community || '').toLowerCase().replace(/^r\//, '');
  return t === src || t === comm || t === `r/${comm}` || ['pornhub', 'redtube', 'eporner', 'redgifs', 'reddit', 'lemmy', 'bluesky', 'realgirls'].includes(t);
}

function realPeople(list, row) {
  const title = `${row.title || ''} ${row.body || ''}`;
  const lex = lexicon();
  return (list || []).map((p) => String(p || '').trim()).filter((p) => {
    if (!p || p.length > 40) return false;
    const low = p.toLowerCase();
    if (lex.performers.has(low)) return true;
    const words = p.split(/\s+/);
    return words.length >= 2 && words.length <= 4 && NAME_RE.test(cleanPersonName(p)) && title.toLowerCase().includes(low);
  });
}

function sourceTags(row) {
  try { return JSON.parse(row.source_tags || '[]'); } catch { return []; }
}

function enabledSources() {
  if (config.mock) return null;
  const st = providerState();
  return Object.keys(st).filter((k) => st[k].enabled);
}

const claimed = new Set();

function nextBatch(limit) {
  const en = enabledSources();
  const where = en ? `AND i.source IN (${en.map((s) => `'${s}'`).join(',') || "''"})` : '';
  const rows = getDb().prepare(`SELECT i.id, i.source, i.title, i.body, i.format, i.duration, i.community, i.flair, i.source_tags,
      COALESCE(s.seen, 0) seen, COALESCE(s.dwell_ms, 0) dwell
    FROM items i LEFT JOIN item_state s ON s.item_id = i.id
    WHERE i.ai_status = 'pending' AND i.blocked = 0 ${where}
    ORDER BY (COALESCE(s.saved,0) * 4 + (COALESCE(s.rating,0) > 0) * 4 + (COALESCE(s.dwell_ms,0) > 20000) * 2 + COALESCE(s.seen,0)) DESC, i.fetched_at DESC
    LIMIT ?`).all(limit + claimed.size);
  const out = rows.filter((r) => !claimed.has(r.id)).slice(0, limit);
  for (const r of out) claimed.add(r.id);
  return out;
}

function describe(row) {
  const tags = sourceTags(row).slice(0, 25).join(', ');
  const body = row.body ? String(row.body).replace(/\s+/g, ' ').slice(0, row.format === 'story' ? 900 : 300) : '';
  const dur = row.duration ? ` ${Math.round(row.duration / 60)} min` : '';
  return `#${row.id} [${FORMAT_WORDS[row.format] || row.format}${dur}] ${row.community ? `(${row.community}) ` : ''}${row.title}${tags ? ` | site tags: ${tags}` : ''}${body ? ` | text: ${body}` : ''}`;
}

function cleanTags(list, max) {
  const out = [];
  const seen = new Set();
  const over = new Set(overused().slice(0, 20));
  for (const raw of list || []) {
    const t = String(raw || '').toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t === 'undefined' || t === 'null' || t.length < 2 || t.length > 42 || t.split(' ').length > 5 || GENERIC.has(t) || seen.has(t) || metaTag(t, null)) continue;
    seen.add(t);
    out.push({ name: t, over: over.has(t) });
    if (out.length >= max) break;
  }
  return out.map((x, i) => ({ name: x.name, weight: Math.max(0.35, (x.over ? 0.6 : 0.95) - i * 0.03) }));
}

// Sites that check the age of everyone in their videos before publishing.
export const VERIFIED = new Set(['pornhub', 'redtube', 'eporner']);

function applyResult(id, tags, people, minorRisk, scene = null, { deep = false } = {}) {
  const db = getDb();
  const verdict = isBlocked({ title: '', body: scene || '', tags: tags.map((t) => t.name) });
  if (verdict.blocked && verdict.reason === 'safety') {
    db.prepare("UPDATE items SET blocked = 1, block_reason = 'safety', ai_status = 'blocked' WHERE id = ?").run(id);
    tagger.blocked++;
    return false;
  }
  // The tagging model's own "could be under 18" guess is not a verdict: on the age-verified video sites it is ignored,
  // elsewhere the post waits for the image check by the bigger model.
  const src = db.prepare('SELECT source FROM items WHERE id = ?').get(id)?.source;
  if (minorRisk && !VERIFIED.has(src)) {
    db.prepare("UPDATE items SET blocked = 1, block_reason = 'safety_check', ai_status = 'done' WHERE id = ?").run(id);
    addTags(id, tags, deep ? 'deep' : 'ai');
    tagger.blocked++;
    return false;
  }
  addTags(id, tags, deep ? 'deep' : 'ai');
  if (people?.length) addTags(id, people.filter((p) => p && p.length < 40 && p.split(' ').length <= 4).slice(0, 4).map((p) => ({ name: p, kind: 'performer', weight: 0.55 })), 'ai');
  if (scene) db.prepare("UPDATE items SET ai_status = 'done', ai_summary = ? WHERE id = ?").run(String(scene).slice(0, 400), id);
  else db.prepare("UPDATE items SET ai_status = 'done' WHERE id = ?").run(id);
  if (verdict.blocked) db.prepare('UPDATE items SET blocked = 1, block_reason = ? WHERE id = ?').run(verdict.reason, id);
  return true;
}

export function parseLines(text) {
  const out = new Map();
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^\s*#?(\d+)\s*[:|-]\s*(.+)$/);
    if (!m) continue;
    const [tagPart, ...rest] = m[2].split('||');
    const extra = rest.join('||');
    const scene = (extra.match(/scene\s*:\s*([^|]+)/i) || [])[1]?.trim() || null;
    const people = ((extra.match(/people\s*:\s*([^|]+)/i) || [])[1] || '').split(',').map((x) => x.trim()).filter((x) => x && !/^(none|n\/a|-)$/i.test(x));
    const risk = /minor\s*:\s*(yes|true)/i.test(extra);
    out.set(Number(m[1]), { tags: tagPart.split(',').map((x) => x.trim()).filter(Boolean), scene, people, minor_risk: risk });
  }
  return out;
}

export async function tagBatch(rows, { parallel = 1 } = {}) {
  const system = `You tag posts for a private, local adult-content browser used by one adult, so each post can be matched to his very specific tastes.
${rules()}
For every post return its id, 6 to 16 tags that the post really says or shows (most specific first), scene (what happens, 6 to 14 words), people and minor_risk.`;
  const user = rows.map(describe).join('\n');
  const started = Date.now();
  const out = await chat({ kind: 'tag', system, user, schema: BATCH_SCHEMA, temperature: 0.3, model: fastModel(), numPredict: 320 * rows.length + 120, parallel });
  const parsed = new Map((out?.items || []).map((x) => [Number(x.id), { tags: x.tags || [], scene: x.scene || null, people: x.people || [], minor_risk: !!x.minor_risk, men: Number(x.men), women: Number(x.women), trans: !!x.trans }]));
  const freq = new Map();
  for (const x of parsed.values()) for (const t of new Set(x.tags.map((y) => String(y).toLowerCase().trim()))) freq.set(t, (freq.get(t) || 0) + 1);
  const n = parsed.size;
  const parroted = (t, r) => {
    if (n < 4 || (freq.get(t) || 0) < Math.max(3, Math.ceil(n * 0.6))) return false;
    const own = `${r.title} ${sourceTags(r).join(' ')} ${r.body || ''}`.toLowerCase();
    return !t.split(' ').every((w) => own.includes(w));
  };
  let ok = 0;
  const db = getDb();
  for (const r of rows) {
    claimed.delete(r.id);
    const x = parsed.get(r.id);
    if (x && (Number.isFinite(x.men) || Number.isFinite(x.women))) setGender(r.id, { men: Math.max(0, Math.min(9, x.men | 0)), women: Math.max(0, Math.min(9, x.women | 0)), trans: !!x.trans }, 'ai');
    if (!x) { db.prepare("UPDATE items SET ai_status = CASE WHEN ai_status = 'pending' THEN 'retry' ELSE ai_status END WHERE id = ?").run(r.id); continue; }
    const people = realPeople(x.people, r);
    const tags = x.tags.map((t) => String(t).toLowerCase().trim()).filter((t) => !parroted(t, r) && !metaTag(t, r));
    if (applyResult(r.id, cleanTags(tags, 24), people, !!x.minor_risk, x.scene)) ok++;
  }
  tagger.done += ok;
  tagger.lastBatch = { n: rows.length, ok, ms: Date.now() - started, at: Date.now(), model: fastModel() };
  tagger.rate.push({ at: Date.now(), n: ok });
  tagger.rate = tagger.rate.filter((q) => Date.now() - q.at < 15 * 60000);
  return ok;
}

async function fetchImage(url) {
  if (!url) return null;
  try {
    const referer = tubeReferer(url) || undefined;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', ...(referer ? { Referer: referer } : {}) } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 6 * 1024 * 1024 || !/image/.test(res.headers.get('content-type') || 'image')) return null;
    return await shrinkImage(buf.toString('base64'), 640);
  } catch {
    return null;
  }
}

async function videoUrl(item) {
  const m = item.media || {};
  if (m.kind === 'redgifs' && m.redgifsId) {
    try { const g = await redgifs.resolveOne(m.redgifsId, true); return g?.urls?.hd || g?.urls?.sd || null; } catch { return null; }
  }
  if (m.kind === 'video') return m.src && !/\.m3u8/.test(m.src) ? m.src : m.hls || m.src || null;
  return null;
}

async function framesFor(item, max = 4) {
  if (config.mock) return [];
  const m = item.media || {};
  if ((m.kind === 'video' || m.kind === 'redgifs') && ffmpeg()) {
    const url = await videoUrl(item);
    const frames = await videoFrames(url, item.duration, { count: max, referer: /redgifs/.test(url || '') ? 'https://www.redgifs.com/' : undefined }).catch(() => []);
    if (frames.length >= 2) return frames;
  }
  let urls = [];
  if (m.thumbs?.length >= 3) {
    const n = m.thumbs.length;
    const picks = max >= 4 ? [0.15, 0.4, 0.65, 0.88] : [0.3, 0.7];
    urls = picks.map((p) => m.thumbs[Math.min(n - 1, Math.floor(p * n))]);
  } else if (m.kind === 'gallery') {
    urls = (m.items || []).filter((g) => g.type !== 'video').slice(0, max).map((g) => g.mid || g.src);
  } else {
    let u = m.poster || m.mid || (m.kind === 'image' ? m.src : null) || m.thumb;
    if (!u && m.kind === 'redgifs') {
      try { const g = await redgifs.resolveOne(m.redgifsId); u = g?.urls?.poster || g?.urls?.thumbnail; } catch {}
    }
    urls = [u];
  }
  const imgs = await Promise.all([...new Set(urls.filter(Boolean))].map(fetchImage));
  return imgs.filter(Boolean);
}

export async function tagItem(id, { priority = false } = {}) {
  const db = getDb();
  const item = getItem(id);
  if (!item) return null;
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  const model = priority ? deepModel() : fastModel();
  const info = await modelInfo(model).catch(() => null);
  const frames = getSetting('taggerVision', true) && info?.vision ? await framesFor(item, priority ? 4 : 3) : [];
  const system = `You look closely at one post for a private, local adult-content browser used by one adult.
${frames.length > 1 ? `The images are ${frames.length} frames taken from across the video, in order. Tag what you can actually see in them: who is involved and what they look like, what they wear, the acts and positions, the place. Trust the frames over the title, and leave out anything you can't see in any frame.` : frames.length ? 'Tag what you can actually see in the image: who is in it, what they look like, what they wear, what is happening, the place. Leave out anything you cannot see.' : ''}
scene: one short sentence saying what happens in this post.
Give 8 to 20 tags, most specific first.
${rules()}`;
  const started = Date.now();
  const out = await chat({ kind: 'tag', system, user: describe(row), images: frames.length ? frames : undefined, schema: DEEP_SCHEMA, temperature: 0.25, model, numPredict: 1100, numCtx: frames.length > 2 ? 12288 : 8192, parallel: 1 });
  const tags = cleanTags((out?.tags || []).map((t) => String(t).toLowerCase().trim()).filter((t) => !metaTag(t, row)), 28);
  const ok = applyResult(id, tags, realPeople(out?.people, row), !!out?.minor_risk, out?.scene, { deep: true });
  if (ok && (Number.isFinite(Number(out?.men)) || Number.isFinite(Number(out?.women)))) setGender(id, { men: Math.max(0, Math.min(9, Number(out.men) | 0)), women: Math.max(0, Math.min(9, Number(out.women) | 0)), trans: !!out.trans }, frames.length ? 'vision' : 'ai');
  if (ok) {
    db.prepare("UPDATE items SET ai_status = 'done', ai_deep = ? WHERE id = ?").run(priority ? 6 : 1, id);
    tagger.deep++;
    tagger.lastDeep = { id, frames: frames.length, ms: Date.now() - started, model, at: Date.now() };
  }
  return ok ? { tags, scene: out?.scene } : { blocked: true };
}

export function queueDeep(itemId) {
  getDb().prepare('UPDATE items SET ai_deep = 4 WHERE id = ? AND COALESCE(ai_deep, 0) IN (0, 1, 2, 3)').run(itemId);
}

// A like, heat or save: look at that post again right away with the bigger model and real frames, and keep every tag it finds.
const soon = [];
let soonBusy = false;
export function deepNow(itemId) {
  const id = Number(itemId);
  if (!id || soon.includes(id)) return;
  const row = getDb().prepare('SELECT ai_deep FROM items WHERE id = ? AND blocked = 0').get(id);
  if (!row || row.ai_deep === 6 || row.ai_deep === 5) return;
  getDb().prepare('UPDATE items SET ai_deep = 4 WHERE id = ?').run(id);
  soon.push(id);
  if (soonBusy || config.mock) return;
  soonBusy = true;
  (async () => {
    while (soon.length) {
      const next = soon.shift();
      getDb().prepare('UPDATE items SET ai_deep = 5 WHERE id = ?').run(next);
      try { const r = await tagItem(next, { priority: true }); if (r?.tags) log('info', `Looked deeper at post ${next}: ${r.tags.length} tags`); } catch (err) { getDb().prepare('UPDATE items SET ai_deep = 4 WHERE id = ?').run(next); if (!err.yielded) tagger.lastError = err.message; }
    }
    soonBusy = false;
  })();
}

async function deepWorker() {
  const db = getDb();
  const en = enabledSources();
  const where = en ? `AND source IN (${en.map((s) => `'${s}'`).join(',') || "''"})` : '';
  const row = db.prepare(`SELECT id, ai_deep FROM items WHERE ai_deep IN (2, 4) AND blocked = 0 ${where} ORDER BY ai_deep DESC, fetched_at DESC LIMIT 1`).get();
  if (!row) return false;
  db.prepare('UPDATE items SET ai_deep = 5 WHERE id = ?').run(row.id);
  try {
    await tagItem(row.id, { priority: row.ai_deep === 4 });
  } catch (err) {
    if (err.yielded) db.prepare('UPDATE items SET ai_deep = ? WHERE id = ?').run(row.ai_deep, row.id);
    else { db.prepare('UPDATE items SET ai_deep = 3 WHERE id = ?').run(row.id); tagger.lastError = err.message; }
  }
  return true;
}

async function batchWorker(pace) {
  const rows = nextBatch(pace.batch);
  if (!rows.length) return false;
  try {
    await tagBatch(rows, { parallel: pace.parallel });
    tagger.lastError = null;
  } catch (err) {
    for (const r of rows) claimed.delete(r.id);
    if (!err.yielded) {
      tagger.lastError = err.message;
      tagger.failed++;
      if (err.unavailable || /not running|isn't installed|took too long/i.test(err.message)) tagger.pausedUntil = Date.now() + 60000;
    }
  }
  return true;
}

let turn = 0;
async function loop(slot) {
  for (;;) {
    const pace = PACE[getSetting('taggerPace', 'normal')] || PACE.normal;
    if (slot >= pace.parallel || Date.now() < tagger.pausedUntil || holdTagging() || !getSetting('taggerOn', config.taggerEnabled)) {
      await new Promise((r) => setTimeout(r, config.mock ? 500 : 2000));
      continue;
    }
    tagger.workers++;
    let worked = false;
    try {
      const deepFirst = slot === 0 && turn++ % 3 === 2;
      worked = deepFirst ? (await deepWorker()) || (await batchWorker(pace)) : (await batchWorker(pace)) || (slot === 0 && (await deepWorker()));
    } catch (err) {
      tagger.lastError = err.message;
    } finally {
      tagger.workers--;
    }
    await new Promise((r) => setTimeout(r, worked ? pace.pause || 50 : config.mock ? 800 : 5000));
  }
}

export function startTagger() {
  if (tagger.running) return;
  tagger.running = true;
  const db = getDb();
  if (!getSetting('taggerV2', false)) {
    db.prepare("UPDATE items SET ai_status = 'pending' WHERE ai_status IN ('done','failed') AND blocked = 0 AND id NOT IN (SELECT DISTINCT item_id FROM item_tags WHERE origin = 'ai')").run();
    db.prepare("INSERT INTO settings(key, value) VALUES('taggerV2', 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'").run();
  }
  db.prepare("UPDATE items SET ai_status = 'pending' WHERE ai_status = 'retry'").run();
  db.prepare('UPDATE items SET ai_deep = 2 WHERE ai_deep = 5').run();
  backfillExtraction(addTags).catch(() => {});
  setInterval(() => { try { db.prepare("UPDATE items SET ai_status = 'pending' WHERE ai_status = 'retry'").run(); } catch {} }, 10 * 60000);
  for (let slot = 0; slot < 3; slot++) loop(slot);
}

export function taggerStatus() {
  const db = getDb();
  const en = enabledSources();
  const where = en ? `AND source IN (${en.map((s) => `'${s}'`).join(',') || "''"})` : '';
  const counts = Object.fromEntries(db.prepare(`SELECT ai_status, COUNT(*) c FROM items WHERE blocked = 0 ${where} GROUP BY ai_status`).all().map((r) => [r.ai_status, r.c]));
  const deepQueue = db.prepare(`SELECT COUNT(*) c FROM items WHERE ai_deep IN (2, 4) AND blocked = 0 ${where}`).get().c;
  const deepDone = db.prepare(`SELECT COUNT(*) c FROM items WHERE ai_deep IN (1, 6) AND blocked = 0 ${where}`).get().c;
  const perMin = tagger.rate.length ? tagger.rate.reduce((a, b) => a + b.n, 0) / Math.max(1, (Date.now() - tagger.rate[0].at) / 60000) : 0;
  const pending = (counts.pending || 0) + (counts.retry || 0);
  return {
    ...tagger, rate: undefined, pending, tagged: counts.done || 0, failedTotal: counts.failed || 0, deepQueue, deepDone,
    perMin: Math.round(perMin * 10) / 10, etaMin: perMin > 0 ? Math.round(pending / perMin) : null,
    on: getSetting('taggerOn', config.taggerEnabled), vision: getSetting('taggerVision', true), pace: getSetting('taggerPace', 'normal'),
    model: fastModel(), deepModel: deepModel(), mainModel: activeModel(), busy: tagger.workers > 0
  };
}

export { lexicon, fetchImage, framesFor, cleanTags, metaTag };
