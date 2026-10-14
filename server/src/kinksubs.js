import { config } from './config.js';
import { getDb, getSetting, setSetting, now } from './db.js';
import { listKinks } from './kinks.js';
import { ensureKinkSchema } from './kinkengine.js';
import { tagsForItems } from './store.js';
import { isBlocked, hardBlockList, userLimits } from './safety.js';
import { subsFor } from './discover.js';
import { chat, fastModel } from './ai/ollama.js';
import * as rss from './sources/redditRss.js';
import { log } from './log.js';
import { tr } from './i18n.js';

// Reddit communities for a kink. You can add and remove them yourself; the app also looks for them on its own, from
// the kink's name and every tag in it: where your own posts with those tags come from, Reddit's subreddit search,
// a short list of well-known ones and the local model, and then it reads a page of each one to see whether its posts
// are really about the kink. The ones it is sure about are added right away, the others are suggested.

const NAME_RE = /^[A-Za-z0-9_]{2,21}$/;
const ADD_AT = 0.72;
const SUGGEST_AT = 0.38;
const AUTO_MAX = 3;
const SUGGEST_MAX = 8;
// Communities that are about meeting people, trading or selling, never about a kink.
const NOT_A_KINK = /(r4r|4r$|hookup|meetup|snapchat|kik|sexting|selling|onlyfans|promo|trade|dating|personals|swap|verification|^nsfw$|^porn$|^gonewild$)/i;

const clean = (s) => String(s || '').replace(/^\/?r\//i, '').trim();
const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const words = (s) => ` ${String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

function safeName(name, extra = '') {
  if (!NAME_RE.test(name)) return false;
  const low = name.toLowerCase();
  if (NOT_A_KINK.test(low)) return false;
  for (const h of hardBlockList()) { const sq = squash(h); if (sq.length >= 4 && low.includes(sq)) return false; }
  for (const l of userLimits()) { const sq = squash(l); if (sq.length >= 4 && low.includes(sq)) return false; }
  return !isBlocked({ title: `${name.replace(/_/g, ' ')} ${extra}`, tags: [] }).blocked;
}

// Whether a community really exists (and has posts), remembered: a month for ones that do, two weeks for missing
// ones. Only communities seen to exist are ever suggested or added.
const EXISTS_KEY = 'subExists';
function existsKnown(name) {
  const x = (getSetting(EXISTS_KEY, {}) || {})[String(name).toLowerCase()];
  if (!x) return undefined;
  if (Date.now() - x.at > (x.ok ? 30 : 14) * 86400000) return undefined;
  return x.ok;
}
function rememberExists(name, ok) {
  const all = getSetting(EXISTS_KEY, {}) || {};
  all[String(name).toLowerCase()] = { ok, at: Date.now() };
  const keys = Object.keys(all);
  if (keys.length > 3000) for (const k of keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - 3000)) delete all[k];
  setSetting(EXISTS_KEY, all);
}

function kinkOf(id) {
  return listKinks({ includeHidden: true }).find((k) => k.id === Number(id)) || null;
}
// Just whether it is a kink (not a group), without working out every kink's points.
function kinkRowOf(id) {
  const r = getDb().prepare('SELECT id, is_group FROM kinks WHERE id = ?').get(Number(id));
  return r ? { id: r.id, isGroup: !!r.is_group } : null;
}

// What the kink is about, strongest first: its name, then its tags by weight.
function termsOf(k) {
  const tags = [...(k.tags || [])].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1)).map((t) => String(t.name).toLowerCase());
  return [...new Set([String(k.name).toLowerCase(), ...tags])].filter((x) => x && x.length >= 3);
}

export function kinkSubs(id) {
  ensureKinkSchema();
  const rows = getDb().prepare('SELECT * FROM kink_subs WHERE kink_id = ? ORDER BY score DESC, name').all(Number(id));
  const map = (r) => ({ name: r.name, origin: r.origin, why: r.why, members: r.members, score: r.score == null ? null : Math.round(r.score * 100) });
  const runs = getSetting('kinkSubsAt', {}) || {};
  return {
    added: rows.filter((r) => r.status === 'added').map(map),
    suggested: rows.filter((r) => r.status === 'suggested' && existsKnown(r.name) !== false).map(map),
    searching: RUNNING.has(Number(id)) || QUEUE.includes(Number(id)),
    searchedAt: runs[id] || null,
    slow: !rss.feedToken()
  };
}

// The subreddit follows the feed fetches; a kink's communities are fetched like any subreddit you follow.
function ensureFollow(name) {
  const db = getDb();
  const auto = db.prepare("SELECT id FROM follows WHERE kind = 'community' AND lower(value) = lower(?)").get(`reddit|${name}`);
  if (auto) db.prepare('DELETE FROM follows WHERE id = ?').run(auto.id);
  const f = db.prepare("SELECT id, active FROM follows WHERE kind = 'subreddit' AND lower(value) = lower(?)").get(name);
  if (f) { if (!f.active) db.prepare('UPDATE follows SET active = 1, dormant_since = NULL WHERE id = ?').run(f.id); return; }
  db.prepare("INSERT INTO follows(kind, value, label, synced_from, active, created) VALUES('subreddit', ?, ?, 'kink', 1, ?)").run(name, `r/${name}`, now());
}

function dropFollowIfUnused(name) {
  const db = getDb();
  const used = db.prepare("SELECT COUNT(*) c FROM kink_subs WHERE status = 'added' AND name = ?").get(name).c;
  if (!used) db.prepare("DELETE FROM follows WHERE kind = 'subreddit' AND lower(value) = lower(?) AND synced_from = 'kink'").run(name);
}

export function addKinkSub(id, raw, { origin = 'user', why = null, score = null, members = null } = {}) {
  ensureKinkSchema();
  const name = clean(raw);
  if (!NAME_RE.test(name)) throw Object.assign(new Error(tr('That is not a subreddit name.')), { status: 400 });
  if (!safeName(name)) throw Object.assign(new Error(tr('That community is blocked by your limits or the safety filter.')), { status: 400 });
  const k = kinkRowOf(id);
  if (!k || k.isGroup) throw Object.assign(new Error(tr('Pick a kink first.')), { status: 400 });
  const db = getDb();
  db.prepare(`INSERT INTO kink_subs(kink_id, name, status, origin, score, why, members, created) VALUES(?, ?, 'added', ?, ?, ?, ?, ?)
    ON CONFLICT(kink_id, name) DO UPDATE SET status = 'added', origin = excluded.origin, why = COALESCE(excluded.why, why), score = COALESCE(excluded.score, score), members = COALESCE(excluded.members, members)`)
    .run(k.id, name, origin, score, why, members, now());
  ensureFollow(name);
  if (origin === 'user' && !config.mock) {
    import('./ingest.js').then(({ queueRedditCheck }) => queueRedditCheck(name, () => {})).catch(() => {});
  }
  return name;
}

export function removeKinkSub(id, raw) {
  ensureKinkSchema();
  const name = clean(raw);
  getDb().prepare("UPDATE kink_subs SET status = 'removed' WHERE kink_id = ? AND name = ?").run(Number(id), name);
  dropFollowIfUnused(name);
}

export function dismissKinkSub(id, raw) {
  ensureKinkSchema();
  getDb().prepare("UPDATE kink_subs SET status = 'removed' WHERE kink_id = ? AND name = ? AND status = 'suggested'").run(Number(id), clean(raw));
}

// ---------- Finding them ----------

// Your own posts: subreddits where posts carrying the kink's tags (or saying them in the title) keep turning up.
function fromYourPosts(k) {
  const db = getDb();
  const rows = db.prepare("SELECT id, community, title FROM items WHERE source = 'reddit' AND community LIKE 'r/%' AND blocked = 0 ORDER BY fetched_at DESC LIMIT 6000").all();
  if (!rows.length) return new Map();
  const tagIds = new Set((k.tags || []).map((t) => t.id));
  const names = termsOf(k).map((n) => n.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()).filter((n) => n.length >= 3);
  const tagMap = tagsForItems(rows.map((r) => r.id));
  const per = new Map();
  for (const r of rows) {
    const name = r.community.slice(2);
    const x = per.get(name.toLowerCase()) || { name, n: 0, hit: 0 };
    x.n++;
    const tags = tagMap.get(r.id) || [];
    const text = words(r.title);
    if (tags.some((t) => tagIds.has(t.id) && t.weight >= 0.42) || names.some((n) => text.includes(` ${n} `))) x.hit++;
    per.set(name.toLowerCase(), x);
  }
  for (const [key, x] of per) if (x.n < 3 || x.hit < 2) per.delete(key);
  return per;
}

// How much a community's name says the kink: the kink's name or a tag written into it ("feetpics" for feet).
function nameFit(name, terms) {
  const low = name.toLowerCase();
  let best = 0;
  terms.forEach((t, i) => {
    const sq = squash(t);
    if (sq.length < 3) return;
    if (low.includes(sq)) best = Math.max(best, i === 0 ? 0.36 : 0.26);
    else {
      const parts = t.split(/\s+/).filter((w) => w.length >= 4);
      if (parts.length > 1 && parts.every((w) => low.includes(squash(w)))) best = Math.max(best, i === 0 ? 0.3 : 0.2);
    }
  });
  return best;
}

const AI_SCHEMA = {
  type: 'object',
  properties: { subs: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, sure: { type: 'integer' } }, required: ['name', 'sure'] } } },
  required: ['subs']
};
const AI_RULES = `You know Reddit's adult (NSFW) communities well. Name real subreddits that are specifically about one kink.

Rules:
- Only subreddits you are confident exist and are active. Exact name, without "r/".
- Specific communities for this kink first; no huge general porn subreddits.
- Never anything about minors, teens, "barely legal", schools, non-consent, incest, animals or the hard limits given. No personal ads, meetups, trading or selling.
- sure: 0 to 100, how sure you are it exists and is about this kink.`;

async function fromModel(k, terms) {
  if (config.mock) return [];
  const user = [
    `Kink: ${k.name}`,
    `What it is made of (its tags, strongest first): ${terms.slice(1, 16).join(', ') || k.name}`,
    k.description ? `Description: ${k.description}` : '',
    userLimits().length ? `Hard limits: ${userLimits().join(', ')}` : '',
    'Name up to 8 subreddits.'
  ].filter(Boolean).join('\n');
  try {
    const out = await chat({ kind: 'discover-ai', system: AI_RULES, user, schema: AI_SCHEMA, temperature: 0.2, model: fastModel(), numPredict: 400 });
    return (out?.subs || []).map((s) => ({ name: clean(s.name).replace(/[^A-Za-z0-9_]/g, ''), sure: Math.max(0, Math.min(100, Number(s.sure) || 0)) })).filter((s) => NAME_RE.test(s.name));
  } catch (e) {
    if (!e.yielded) log('warn', `Kink communities from the model failed: ${e.message}`);
    return [];
  }
}

async function fromSearch(q, budget) {
  if (budget.left <= 0) return [];
  budget.left--;
  if (config.mock) {
    const base = squash(q).slice(0, 14);
    return [{ name: `mock_${base}`, title: q, about: `All about ${q}`, subscribers: 24000 }, { name: `${base}_nsfw`, title: `${q} lovers`, about: `${q} pics and videos`, subscribers: 8000 }];
  }
  try { return await rss.searchSubreddits(q, { maxWaitMs: 5 * 60000 }); } catch (e) { log('warn', `Subreddit search for “${q}” failed: ${e.message}`); return []; }
}

// Reads a page of the community: it has to exist and have posts, and the more of them say the kink, the better.
async function checkSub(name, terms) {
  const { queueRedditCheck } = await import('./ingest.js');
  const list = await new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve(null); } }, 8 * 60000);
    t.unref?.();
    queueRedditCheck(name, (l) => { if (!done) { done = true; clearTimeout(t); resolve(l || []); } });
  });
  if (!list) return null;
  rememberExists(name, list.length > 0);
  const names = terms.map((n) => n.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()).filter((n) => n.length >= 3);
  const hits = list.filter((p) => { const text = words(`${p.title} ${(p.tags || []).join(' ')} ${String(p.body || '').slice(0, 300)}`); return names.some((n) => text.includes(` ${n} `)); }).length;
  return { posts: list.length, ratio: list.length ? hits / list.length : 0 };
}

async function findFor(id) {
  const k = kinkOf(id);
  if (!k || k.isGroup) return;
  const terms = termsOf(k);
  const db = getDb();
  const known = new Map(db.prepare('SELECT name, status FROM kink_subs WHERE kink_id = ?').all(k.id).map((r) => [r.name.toLowerCase(), r.status]));
  const cand = new Map();
  const get = (name) => {
    const key = name.toLowerCase();
    if (!cand.has(key)) cand.set(key, { name, s: 0, why: [], members: null, own: null, search: false, model: 0, list: false });
    return cand.get(key);
  };

  for (const x of fromYourPosts(k).values()) {
    const c = get(x.name);
    const prec = x.hit / x.n;
    c.own = x;
    c.s += Math.min(0.62, prec * 0.75) + (x.hit >= 8 ? 0.1 : x.hit >= 4 ? 0.05 : 0);
    c.why.push(tr('{hit} of the {n} posts you got from it are about this', { hit: x.hit, n: x.n }));
  }
  for (const [sub, term] of subsFor(terms.slice(0, 12))) {
    const c = get(sub);
    if (!c.list) { c.list = true; c.s += 0.22; c.why.push(tr('known for {what}', { what: term })); }
  }
  const budget = { left: rss.feedToken() ? 4 : 2 };
  const queries = [k.name, ...terms.slice(1).filter((x) => x !== k.name.toLowerCase())].slice(0, 4);
  for (const [qi, q] of queries.entries()) {
    const found = await fromSearch(q, budget);
    found.slice(0, 10).forEach((x, rank) => {
      const c = get(x.name);
      if (c.search) return;
      c.search = true;
      rememberExists(x.name, true);
      c.members = x.subscribers || c.members;
      c.about = `${x.title || ''} ${x.about || ''}`;
      c.s += (qi === 0 ? 0.24 : 0.14) / (1 + rank * 0.35);
      const text = words(c.about);
      if (terms.some((t) => text.includes(` ${t.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `))) c.s += 0.08;
      c.why.push(tr('Reddit finds it for “{q}”', { q }));
    });
  }
  for (const m of await fromModel(k, terms)) {
    const c = get(m.name);
    c.model = m.sure;
    c.s += (m.sure / 100) * 0.26;
    if (m.sure >= 50) c.why.push(tr('the model knows it for this'));
  }
  for (const c of cand.values()) {
    const nf = nameFit(c.name, terms);
    if (nf) { c.s += nf; c.why.unshift(tr('its name says it')); }
    // Huge general communities are not about one kink, unless their name says it.
    if (c.members && c.members > 1500000 && !nf) c.s -= 0.15;
  }

  // Suggestions from before that were never seen to exist are checked now; missing ones are taken off.
  let reads = config.mock ? 6 : rss.feedToken() ? 8 : 4;
  for (const r of db.prepare("SELECT name FROM kink_subs WHERE kink_id = ? AND status = 'suggested'").all(k.id)) {
    if (existsKnown(r.name) !== undefined || reads <= 0) continue;
    reads--;
    const check = await checkSub(r.name, terms);
    if (check && check.posts < 1) db.prepare("UPDATE kink_subs SET status = 'removed' WHERE kink_id = ? AND name = ? AND status = 'suggested'").run(k.id, r.name);
  }

  const pool = [...cand.values()].filter((c) => !known.has(c.name.toLowerCase()) && existsKnown(c.name) !== false && safeName(c.name, c.about || '')).sort((a, b) => b.s - a.s);
  // Only the promising ones are read, the strongest first (each read is one Reddit request). A community the app
  // has not seen exist (only the model or the list knows it) is always read first, or left for next time.
  let added = 0;
  let suggested = 0;
  for (const c of pool.slice(0, 14)) {
    if (c.s < SUGGEST_AT - 0.12) break;
    let check = null;
    const seen = !!(c.own || c.search || existsKnown(c.name) === true);
    if (reads > 0 && !(c.own && c.own.hit >= 5)) {
      reads--;
      check = await checkSub(c.name, terms);
      if (check && check.posts < 5) continue;
      if (check) {
        c.s += Math.min(0.3, check.ratio * 0.6);
        if (check.ratio >= 0.2) c.why.push(tr('{p}% of its newest posts say it', { p: Math.round(check.ratio * 100) }));
      }
    }
    if (!seen && !check) continue;
    const proven = (c.own && c.own.hit >= 5) || (check && check.ratio >= 0.2) || (c.list && check);
    // A locked kink only gets suggestions: the app adds nothing to it by itself.
    const status = c.s >= ADD_AT && proven && added < AUTO_MAX && k.mode !== 'lock' ? 'added' : c.s >= SUGGEST_AT && suggested < SUGGEST_MAX ? 'suggested' : null;
    if (!status) continue;
    const why = [...new Set(c.why)].slice(0, 2).join(' · ');
    if (status === 'added') {
      addKinkSub(k.id, c.name, { origin: 'auto', why, score: Math.min(1, c.s), members: c.members });
      added++;
    } else {
      db.prepare("INSERT OR IGNORE INTO kink_subs(kink_id, name, status, origin, score, why, members, created) VALUES(?, ?, 'suggested', 'auto', ?, ?, ?, ?)").run(k.id, c.name, Math.min(1, c.s), why, c.members, now());
      suggested++;
    }
  }
  if (added || suggested) log('info', `Communities for ${k.name}: ${added} added, ${suggested} suggested`);
}

// One search at a time: they share Reddit's request limit with the feed.
const QUEUE = [];
const RUNNING = new Set();
let working = false;

export function searchKinkSubs(id) {
  id = Number(id);
  if (RUNNING.has(id) || QUEUE.includes(id)) return;
  QUEUE.push(id);
  if (working) return;
  working = true;
  (async () => {
    while (QUEUE.length) {
      const next = QUEUE.shift();
      RUNNING.add(next);
      try { await findFor(next); } catch (e) { log('warn', `Finding communities failed: ${e.message}`); }
      RUNNING.delete(next);
      const runs = getSetting('kinkSubsAt', {}) || {};
      runs[next] = now();
      setSetting('kinkSubsAt', runs);
    }
    working = false;
  })().catch(() => { working = false; });
}

// The page of a kink asks once; after that it runs again every two weeks by itself.
export function maybeSearch(id) {
  const runs = getSetting('kinkSubsAt', {}) || {};
  if (!runs[id] || now() - runs[id] > 14 * 86400000) searchKinkSubs(id);
}

// From the hourly round: the kink you are most into that has not been looked at lately.
export function kinkSubsRound() {
  const runs = getSetting('kinkSubsAt', {}) || {};
  const next = listKinks({ includeHidden: false }).filter((k) => !k.isGroup && k.status !== 'proposed').find((k) => !runs[k.id] || now() - runs[k.id] > 14 * 86400000);
  if (next) searchKinkSubs(next.id);
  return next?.name || null;
}
