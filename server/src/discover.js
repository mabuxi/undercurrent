import { config } from './config.js';
import { getDb, getSetting, setSetting, now } from './db.js';
import { request } from './http.js';
import { listKinks } from './kinks.js';
import { topTags, engagement, points, affinityMap } from './profile.js';
import { tagSpecificity } from './store.js';
import { providerState } from './sources/providers.js';
import { lemmyInstance } from './sources/lemmy.js';
import * as redgifs from './sources/redgifs.js';
import * as bluesky from './sources/bluesky.js';
import { chat, fastModel } from './ai/ollama.js';
import { userLimits, isBlocked } from './safety.js';
import { log } from './log.js';
import { genderPrefs, genderMode, genderTerm } from './gender.js';

// Automatic sources. Everything added here is marked "auto": it is refreshed often, follows what you are into
// right now, and is removed again when its posts get few views or interactions. Sources you follow yourself are
// never touched.

const SUBS = {
  redhead: ['redheads', 'ginger', 'FireCrotch'], ginger: ['redheads', 'ginger'], freckles: ['FrecklesGW', 'redheads'],
  'big ass': ['ass', 'pawg', 'asstastic', 'booty'], pawg: ['pawg', 'pawgtastic'], ass: ['ass', 'asstastic'], booty: ['ass', 'booty'],
  'big tits': ['boobs', 'hugeboobs', 'BustyPetite', 'Boobies'], busty: ['BustyPetite', 'boobs'], 'huge tits': ['hugeboobs'], 'small tits': ['TinyTits', 'petite', 'smallboobs'],
  petite: ['petite', 'PetiteGoneWild', 'xsmallgirls'], milf: ['milf', 'MILFs'], mature: ['milf', 'maturemilf'], curvy: ['curvy', 'thick', 'voluptuous'], thick: ['thick', 'curvy', 'thickthighs'], bbw: ['BBW'],
  blowjob: ['blowjobs', 'Blowjobs', 'blowjobsandwich'], deepthroat: ['DeepThroat'], handjob: ['handjobs'], cumshot: ['cumsluts', 'GirlsFinishingTheJob'], facial: ['facials'],
  creampie: ['creampies'], anal: ['anal', 'AnalGW'], squirting: ['squirting'], lesbian: ['lesbians', 'Lesbian_gifs'], threesome: ['threesome'], orgy: ['groupsex'],
  pov: ['POV', 'NSFW_GIF'], amateur: ['RealGirls', 'Amateur', 'gonewild'], homemade: ['Amateur', 'homemadexxx'], couple: ['gonewildcouples', 'GWCouples', 'RealAhegao'],
  asian: ['AsiansGoneWild', 'AsianHotties'], japanese: ['AsiansGoneWild', 'NSFW_Japan'], latina: ['latinas', 'LatinasGW'], ebony: ['ebony', 'Ebony'], interracial: ['Interracial'],
  lingerie: ['lingerie', 'LingerieGW'], stockings: ['stockings'], 'thigh highs': ['thighhighs'], 'yoga pants': ['yogapants'], cosplay: ['nsfwcosplay', 'cosplaygirls'],
  feet: ['feet', 'FootFetish'], bdsm: ['BDSMGW', 'bdsm'], bondage: ['Bondage', 'shibari'], femdom: ['femdom'], rough: ['rough'], choking: ['BreathPlay'],
  hentai: ['hentai', 'HENTAI_GIF'], animated: ['HENTAI_GIF'], '3d animation': ['rule34'], trans: ['Tgirls'], gay: ['gayporn'],
  public: ['public', 'NotSafeForNature', 'PublicFlashing'], outdoor: ['NotSafeForNature', 'outside'], shower: ['showering'], massage: ['MassageXXX'], oil: ['OiledWomen'],
  'tan lines': ['tanlines'], tattoos: ['altgonewild', 'SuicideGirls'], piercings: ['altgonewild'], hairy: ['hairypussy'], glasses: ['GirlsWithGlasses'],
  hotwife: ['HotWife', 'hotwifecaption'], cuckold: ['cuckold'], 'dirty talk': ['holdthemoan'], moaning: ['holdthemoan'], orgasm: ['holdthemoan', 'OnOff'],
  riding: ['NSFW_GIF', 'ridingxxx'], 'reverse cowgirl': ['NSFW_GIF'], 'jerk off instruction': ['JOI'], asmr: ['GoneWildAudio'], audio: ['GoneWildAudio'],
  'eye contact': ['EyeContact', 'Ahegao_IRL'], ahegao: ['AhegaoGirls', 'Ahegao_IRL'], teasing: ['tease', 'OnOff'], strip: ['stripgirls'], legs: ['legs', 'thighs'],
  thighs: ['thighs', 'thickthighs'], selfie: ['selfie', 'SnapchatGW'], mirror: ['selfie'], bikini: ['bikinis'], dress: ['dresses'], 'sundress': ['dresses'],
  romantic: ['sensualsex'], sensual: ['sensualsex'], passionate: ['sensualsex'], kissing: ['kissing'], story: ['sexystories', 'eroticliterature'], confession: ['sexstories', 'AskRedditAfterDark']
};
const BASE_SUBS = ['NSFW_GIF', 'porninfifteenseconds', 'RealGirls', 'gonewild'];
const GAY_SUBS = ['gayporn', 'GayGifs', 'gaybrosgonewild', 'twinks', 'broslikeus', 'bearsgonewild', 'MaleUnderwear', 'gaynsfw', 'penis', 'ladybonersgw'];
const LESBIAN_SUBS = ['lesbians', 'Lesbian_gifs', 'dykesgonewild', 'girlskissing', 'LesbianGoneWild'];
const STORY_SUBS = ['sexystories', 'gonewildstories', 'eroticliterature'];
const DISCUSSION_SUBS = ['AskRedditAfterDark', 'sex', 'sexover30', 'BDSMcommunity', 'kinky'];
const LIMITS = { reddit: 50, redditUsers: 15, lemmy: 20, bluesky: 30, redgifs: 25, searches: 70 };

function norm(s) {
  return String(s || '').toLowerCase().replace(/-/g, ' ').trim();
}

// Right-now interests first, then this week, then all time.
export function interestTerms(limit = 10) {
  const out = [];
  const push = (t) => { const v = norm(t); if (v && v.length > 2 && !out.includes(v) && !isBlocked({ title: v, tags: [v] }).blocked) out.push(v); };
  for (const t of topTags({ by: 'short', limit: 8 }).filter((x) => x.short > 0.1)) push(t.name);
  for (const t of topTags({ by: 'lately', limit: 10 }).filter((x) => x.lately > 0.15)) push(t.name);
  const kinks = listKinks({ includeHidden: false }).filter((k) => !k.isGroup).sort((a, b) => b.lately - a.lately).slice(0, 8);
  for (const k of kinks) for (const t of (k.tags || []).slice(0, 2)) push(t.name);
  for (const t of topTags({ by: 'long', limit: 20 }).filter((x) => x.long > 0.2)) push(t.name);
  for (const s of (getSetting('recentSearches', []) || []).slice(0, 5)) push(s.q);
  const gp = genderPrefs();
  if (gp.male >= 70) { out.unshift('gay'); if (gp.male >= 85) out.unshift('men'); }
  return [...new Set(out)].slice(0, limit);
}

function autoFollows(provider, kind = null) {
  return getDb().prepare("SELECT * FROM follows WHERE synced_from = 'auto'").all()
    .filter((f) => (f.value.startsWith(`${provider}|`) || (provider === 'reddit' && f.kind === 'subreddit')) && (!kind || f.kind === kind));
}

function removed() {
  return new Set(getSetting('autoRemoved', []) || []);
}

export function noteRemoved(f) {
  if (f?.synced_from !== 'auto') return;
  const list = getSetting('autoRemoved', []) || [];
  list.push(`${f.kind}:${f.value}`.toLowerCase());
  setSetting('autoRemoved', [...new Set(list)].slice(-500));
}

function addAuto(kind, value, label, topic = null) {
  const key = `${kind}:${value}`.toLowerCase();
  if (removed().has(key)) return false;
  if (isBlocked({ title: value, tags: [value.split('|').pop()] }).blocked) return false;
  const db = getDb();
  const exists = db.prepare('SELECT id, synced_from, active, topic FROM follows WHERE lower(kind) = lower(?) AND lower(value) = lower(?)').get(kind, value);
  if (exists) {
    if (topic && !exists.topic) db.prepare('UPDATE follows SET topic = ? WHERE id = ?').run(topic, exists.id);
    return false;
  }
  db.prepare("INSERT INTO follows(kind, value, label, synced_from, active, created, topic) VALUES(?, ?, ?, 'auto', 1, ?, ?)").run(kind, value, label, now(), topic);
  return true;
}

// How much you are into a topic now (0 to 1) and over all time, from the tags it is made of.
function topicInterest(topic) {
  const names = String(topic || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!names.length) return null;
  const aff = affinityMap();
  const ids = getDb().prepare(`SELECT id, name FROM tags WHERE name IN (${names.map(() => '?').join(',')})`).all(...names);
  let lately = 0;
  let long = 0;
  for (const t of ids) {
    const v = aff.get(`t:${t.id}`);
    lately = Math.max(lately, Math.tanh((v?.lately || 0) / 1.5));
    long = Math.max(long, Math.tanh((v?.long || 0) / 2));
  }
  return { lately, long };
}

// Sources for one interest: a community where one exists, plus searches, which bring more variety.
export async function sourcesForTopic(name, tags, { origin = 'auto', st = providerState(), searches = 2, withNiche = true } = {}) {
  const t = norm(name);
  const topic = [...new Set([t, ...(tags || []).map(norm)])].filter(Boolean).slice(0, 6).join(', ');
  const added = [];
  const why = origin === 'ask' ? 'you asked for it' : `for ${name}`;
  const terms = [...new Set([...(tags || []).map(norm), t])].filter((x) => x && x.length > 2).slice(0, 3);
  if (st.reddit?.enabled) for (const [sub] of subsFor(terms).slice(0, 2)) if (addAuto('community', `reddit|${sub}`, `r/${sub} · ${why}`, topic)) added.push(`r/${sub}`);
  if (withNiche && st.redgifs?.enabled) {
    try {
      const list = await redgifs.searchNiches(terms[0] || t, 6);
      const n = list.filter((x) => x.gifs >= 200 && !isBlocked({ title: x.name, tags: x.tags }).blocked).sort((a, b) => b.subscribers - a.subscribers)[0];
      if (n && addAuto('community', `redgifs|${n.name}`, `RedGIFs niche: ${n.name} · ${why}`, topic)) added.push(`RedGIFs niche ${n.name}`);
    } catch {}
  }
  // Searches go to every site that can search, taking turns, so Pornhub, RedTube and Eporner get sources too.
  const all = ['redgifs', 'pornhub', 'eporner', 'redtube', 'lemmy'].filter((p) => st[p]?.enabled);
  let h = 0;
  for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const providers = all.map((_, i) => all[(i + h) % all.length]);
  const term = genderTerm(terms[0] || t);
  for (const p of providers.slice(0, origin === 'ask' ? Math.min(4, providers.length) : searches)) if (addAuto('search', `${p}|${term}`, `Search "${term}" on ${p} · ${why}`, topic)) added.push(`search "${term}" on ${p}`);
  if (origin === 'ask') getDb().prepare("UPDATE follows SET active = 1, dormant_since = NULL WHERE synced_from = 'auto' AND topic LIKE ?").run(`%${t}%`);
  return added;
}

// Every kink and strong tag from all time gets its own sources.
async function discoverTopics(st) {
  const db = getDb();
  const have = db.prepare("SELECT COUNT(*) c FROM follows WHERE synced_from = 'auto' AND kind = 'search'").get().c;
  let room = LIMITS.searches - have;
  const added = [];
  const kinks = listKinks({ includeHidden: false }).filter((k) => !k.isGroup).sort((a, b) => (b.allTime + b.lately) - (a.allTime + a.lately)).slice(0, 15);
  const covered = new Set(db.prepare("SELECT topic FROM follows WHERE topic IS NOT NULL").all().flatMap((r) => r.topic.split(',').map((x) => x.trim())));
  const spec = tagSpecificity().map;
  const topics = [
    ...kinks.map((k) => ({ name: k.name, tags: k.tags.slice().sort((a, b) => (spec.get(b.id) ?? 1) * b.weight - (spec.get(a.id) ?? 1) * a.weight).slice(0, 3).map((x) => x.name) })),
    ...topTags({ by: 'long', limit: 30 }).filter((x) => x.name && x.long > 0.3 && (spec.get(x.id) ?? 1) >= 0.5).slice(0, 15).map((x) => ({ name: x.name, tags: [x.name] }))
  ];
  for (const tp of topics) {
    if (room <= 0) break;
    const isCovered = tp.tags.some((x) => covered.has(norm(x))) || covered.has(norm(tp.name));
    const searchesNow = db.prepare("SELECT COUNT(*) c FROM follows WHERE kind = 'search' AND synced_from = 'auto' AND topic LIKE ?").get(`%${norm(tp.name)}%`).c;
    if (isCovered && searchesNow >= 2) continue;
    const a = await sourcesForTopic(tp.name, tp.tags, { st, searches: 2, withNiche: !isCovered && added.length < 12 });
    for (const x of a) { added.push(x); covered.add(norm(tp.name)); }
    room -= a.filter((x) => x.startsWith('search')).length;
  }
  return added;
}

// Interests fade and come back. Sources for a topic you stopped engaging with go dormant (kept, not fetched),
// and wake up again when that topic comes back in what you watch, like and search.
export function reviveAndRest() {
  const db = getDb();
  const woke = [];
  const rested = [];
  for (const f of db.prepare("SELECT * FROM follows WHERE synced_from = 'auto' AND topic IS NOT NULL").all()) {
    const ti = topicInterest(f.topic);
    if (!ti) continue;
    if (!f.active && f.dormant_since && ti.lately >= 0.35 && now() - f.dormant_since > 2 * 86400000) {
      db.prepare("UPDATE follows SET active = 1, dormant_since = NULL, why = 'woke up: you are into it again' WHERE id = ?").run(f.id);
      woke.push(f.label || f.value);
    } else if (f.active && ti.lately < 0.03 && ti.long < 0.25 && now() - f.created > 10 * 86400000) {
      db.prepare("UPDATE follows SET active = 0, dormant_since = ?, why = 'resting: you moved on from it' WHERE id = ?").run(now(), f.id);
      rested.push(f.label || f.value);
    }
  }
  if (woke.length) log('info', `Woke up sources: ${woke.join(', ')}`);
  if (rested.length) log('info', `Resting sources: ${rested.join(', ')}`);
  return { woke, rested };
}

function subsFor(terms) {
  const wanted = [];
  for (const t of terms) {
    const tw = ` ${t} `;
    for (const [key, subs] of Object.entries(SUBS)) if (tw.includes(` ${key} `) || (` ${key} `.includes(tw) && t.length > 3)) for (const s of subs) wanted.push([s, t]);
  }
  return wanted;
}

function discoverReddit(terms) {
  const have = autoFollows('reddit', 'community').length + autoFollows('reddit', 'subreddit').length;
  let room = LIMITS.reddit - have;
  const added = [];
  const wanted = subsFor(terms);
  const mode = genderMode();
  if (mode) for (const sub of mode === 'men' ? GAY_SUBS : LESBIAN_SUBS) wanted.unshift([sub, mode === 'men' ? 'men only' : 'women only']);
  if (have < 6 && !mode) {
    for (const s of BASE_SUBS) wanted.push([s, 'popular']);
    for (const s of STORY_SUBS) wanted.push([s, 'stories']);
    for (const s of DISCUSSION_SUBS) wanted.push([s, 'threads']);
  }
  for (const [sub, why] of wanted) {
    if (room <= 0) break;
    if (addAuto('community', `reddit|${sub}`, `r/${sub} · ${why === 'threads' ? 'sexual discussion threads' : why === 'stories' ? 'stories' : `matches ${why}`}`, ['popular', 'stories', 'threads'].includes(why) ? null : why)) { added.push(sub); room--; }
  }
  return added;
}

const AI_SUBS_SCHEMA = {
  type: 'object',
  properties: {
    subs: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, kind: { type: 'string', enum: ['media', 'discussion'] }, for: { type: 'string' } }, required: ['name', 'kind', 'for'] } }
  },
  required: ['subs']
};

const AI_SUBS_RULES = `You know Reddit's adult (NSFW) communities well. Suggest real subreddits for one adult, based on what they are into.

Two kinds:
- media: image, GIF or video subreddits focused on a specific look, act or setting that matches one of their interests.
- discussion: text-first communities where adults post sexual confessions, questions, opinions or experiences and others reply (the kind of place where someone asks what their partner's biggest turn-on is).

Rules:
- Only subreddits you are confident exist and are active. Write the exact name without "r/".
- Prefer specific niche communities over huge general ones.
- Never anything about minors, teens, "barely legal", schools, non-consent, incest, animals, or their hard limits. No personal-ad or meetup communities (r4r, hookups, snapchat trading).
- Do not repeat names from the lists you are given.
- for: the interest it matches, in two or three words.`;

async function aiSubreddits(terms) {
  const db = getDb();
  const have = db.prepare("SELECT value FROM follows WHERE kind IN ('community', 'subreddit')").all().map((r) => r.value.replace(/^reddit\|/, '')).filter((x) => !x.includes('|'));
  const gone = [...removed()].filter((x) => x.includes('reddit|')).map((x) => x.split('reddit|')[1]).slice(-40);
  const user = [
    `Their interests right now (strongest first): ${terms.join(', ')}`,
    `Their kinks: ${listKinks({ includeHidden: false }).filter((k) => !k.isGroup).slice(0, 10).map((k) => k.name).join(', ')}`,
    userLimits().length ? `Hard limits: ${userLimits().join(', ')}` : '',
    `Already followed (do not repeat): ${have.slice(0, 60).join(', ') || 'none'}`,
    gone.length ? `Removed before because they got little attention (do not repeat): ${gone.join(', ')}` : '',
    'Suggest 6 media subreddits and 4 discussion subreddits.'
  ].filter(Boolean).join('\n');
  if (config.mock) return [];
  const out = await chat({ kind: 'discover-ai', system: AI_SUBS_RULES, user, schema: AI_SUBS_SCHEMA, temperature: 0.3, model: fastModel(), numPredict: 700 });
  return (out?.subs || []).map((s) => ({ name: String(s.name || '').replace(/^\/?r\//i, '').replace(/[^A-Za-z0-9_]/g, ''), kind: s.kind === 'discussion' ? 'discussion' : 'media', for: String(s.for || '').slice(0, 40) }))
    .filter((s) => s.name.length >= 3 && !have.some((h) => h.toLowerCase() === s.name.toLowerCase()));
}

// Only keeps an AI pick after Reddit confirms the subreddit exists and has posts.
async function validateSubs(picks, room) {
  const { queueRedditCheck } = await import('./ingest.js');
  let n = 0;
  for (const s of picks.slice(0, Math.min(room, rssBudget()))) {
    queueRedditCheck(s.name, (list) => {
      if ((list?.length || 0) >= 5) {
        const label = s.kind === 'discussion' ? `r/${s.name} · AI pick for sexual threads` : `r/${s.name} · AI pick for ${s.for}`;
        if (addAuto('community', `reddit|${s.name}`, label, s.kind === 'discussion' ? null : s.for)) log('info', `Auto-follow (AI pick, checked): r/${s.name}`);
      } else {
        noteRemoved({ synced_from: 'auto', kind: 'community', value: `reddit|${s.name}` });
      }
    });
    n++;
  }
  return n;
}

function rssBudget() {
  const tok = getSetting('redditFeed', null);
  return tok?.feed && tok?.user ? 8 : 3;
}

// Reddit users whose posts you keep engaging with (by points: likes, heat and saves count most).
function discoverRedditUsers() {
  let room = LIMITS.redditUsers - autoFollows('reddit', 'creator').length;
  if (room <= 0) return [];
  const eng = engagement(now() - 45 * 86400000, { limit: 3000, minPoints: 1 });
  const db = getDb();
  const per = new Map();
  for (const e of eng) {
    const it = db.prepare("SELECT author FROM items WHERE id = ? AND source = 'reddit' AND author IS NOT NULL AND author NOT IN ('[deleted]', 'AutoModerator')").get(e.item_id);
    if (!it) continue;
    const x = per.get(it.author) || { p: 0, n: 0 };
    x.p += e.p;
    x.n++;
    per.set(it.author, x);
  }
  const added = [];
  for (const [author, x] of [...per.entries()].filter(([, v]) => v.n >= 2 && v.p >= 6).sort((a, b) => b[1].p - a[1].p)) {
    if (room <= 0) break;
    if (addAuto('creator', `reddit|${author}`, `u/${author} · you liked ${x.n} of their posts`)) { added.push(author); room--; }
  }
  return added;
}

async function discoverNiches(terms) {
  let room = LIMITS.redgifs - autoFollows('redgifs', 'community').length;
  const added = [];
  for (const t of terms.slice(0, 8)) {
    if (room <= 0) break;
    let list = [];
    try { list = await redgifs.searchNiches(t, 6); } catch { continue; }
    const good = list.filter((n) => n.gifs >= 200 && !isBlocked({ title: n.name, tags: n.tags }).blocked)
      .map((n) => ({ ...n, fit: n.tags.some((x) => norm(x).includes(t) || t.includes(norm(x))) ? 1 : 0 }))
      .sort((a, b) => b.fit - a.fit || b.subscribers - a.subscribers).slice(0, 2);
    for (const n of good) {
      if (room <= 0) break;
      if (addAuto('community', `redgifs|${n.name}`, `RedGIFs niche: ${n.name} · matches ${t}`, t)) { added.push(n.name); room--; }
    }
  }
  return added;
}

// Saved searches for what you are into right now; the oldest ones rotate out as interests move.
async function lemmyApi(path, params) {
  const q = new URLSearchParams({ show_nsfw: 'true', ...params });
  return request(`https://${lemmyInstance()}/api/v3${path}?${q}`, { purpose: 'Lemmy discovery', headers: { Accept: 'application/json' }, timeout: 15000 });
}

async function discoverLemmy(terms) {
  let room = LIMITS.lemmy - autoFollows('lemmy').length;
  const added = [];
  const queries = [...terms.slice(0, 8), 'stories', 'confessions', 'sex'];
  for (const t of queries) {
    if (room <= 0) break;
    let data;
    try { data = await lemmyApi('/search', { q: t, type_: 'Communities', listing_type: 'All', sort: 'TopAll', limit: '6' }); } catch { continue; }
    const comms = (data?.communities || []).filter((c) => (c.community?.nsfw) && (c.counts?.subscribers || 0) >= 30 && (c.counts?.posts || 0) >= 20 && !isBlocked({ title: `${c.community.name} ${c.community.title || ''}`, tags: [] }).blocked)
      .sort((a, b) => (b.counts?.subscribers || 0) - (a.counts?.subscribers || 0)).slice(0, 2);
    for (const c of comms) {
      if (room <= 0) break;
      const host = (() => { try { return new URL(c.community.actor_id).host; } catch { return lemmyInstance(); } })();
      const name = `${c.community.name}@${host}`;
      if (addAuto('community', `lemmy|${name}`, `${name} · matches ${t}`, ['stories', 'confessions', 'sex'].includes(t) ? null : t)) { added.push(name); room--; }
    }
  }
  return added;
}

const ADULT = /(18\+|🔞|nsfw|onlyfans|fansly|lewd|adult content|porn|x-rated|explicit|smut|erotic)/i;
const ADULT_LABEL = new Set(['porn', 'sexual', 'nudity']);

// Creators and reposters on Bluesky: popular accounts that post or repost adult content matching your interests.
async function discoverBluesky(terms) {
  let room = LIMITS.bluesky - autoFollows('bluesky').length;
  const added = [];
  const seen = new Set();
  const candidates = [];
  for (const t of [...terms.slice(0, 8), 'nsfw reposts', 'nsfw art']) {
    let data;
    try { data = await request(`https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?${new URLSearchParams({ q: t.includes('nsfw') ? t : `${t} nsfw`, limit: '25' })}`, { purpose: 'Bluesky discovery', headers: { Accept: 'application/json' }, timeout: 15000 }); } catch { continue; }
    for (const a of data?.actors || []) {
      if (seen.has(a.did)) continue;
      seen.add(a.did);
      const adult = ADULT.test(`${a.displayName || ''} ${a.description || ''}`) || (a.labels || []).some((l) => ADULT_LABEL.has(l.val));
      if (a.avatar && adult && !isBlocked({ title: `${a.displayName || ''} ${a.description || ''}`, tags: [] }).blocked) candidates.push({ ...a, term: t });
    }
  }
  if (!candidates.length) return added;
  const profiles = new Map();
  for (let i = 0; i < candidates.length; i += 25) {
    const q = new URLSearchParams();
    for (const c of candidates.slice(i, i + 25)) q.append('actors', c.did);
    try { const d = await request(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?${q}`, { purpose: 'Bluesky discovery', headers: { Accept: 'application/json' } }); for (const p of d.profiles || []) profiles.set(p.did, p); } catch {}
  }
  const ranked = candidates.map((c) => ({ ...c, followers: profiles.get(c.did)?.followersCount || 0, posts: profiles.get(c.did)?.postsCount || 0 }))
    .filter((c) => c.posts >= 20).sort((a, b) => b.followers - a.followers).slice(0, Math.max(0, room) + 6);
  for (const c of ranked) {
    if (room <= 0) break;
    let kind = 'creator';
    try {
      const st = bluesky.repostStats(await bluesky.rawFeed(c.handle, 50));
      if (st.adultReposts >= 8 && st.adultReposts >= st.total * 0.3) kind = 'reposter';
      else if (st.total && st.reposts > st.total * 0.7 && st.adultReposts < 3) continue;
    } catch { continue; }
    const followers = c.followers >= 1000 ? `${Math.round(c.followers / 100) / 10}k` : c.followers;
    if (addAuto('creator', `bluesky|${c.handle}`, `@${c.handle} · ${kind === 'reposter' ? 'reposts' : 'posts'} ${c.term.replace(/ ?nsfw ?/, '') || 'adult content'} · ${followers} followers`, /nsfw/.test(c.term) ? null : c.term)) { added.push(c.handle); room--; }
  }
  return added;
}

// Drop auto sources whose posts you scroll past: many fetched and seen, almost no engagement.
export function pruneAutoSources() {
  const db = getDb();
  const autos = db.prepare("SELECT * FROM follows WHERE synced_from = 'auto' AND active = 1 AND created < ? AND (dormant_since IS NULL)").all(now() - 2 * 86400000);
  const pruned = [];
  const evq = db.prepare("SELECT e.type, e.value, i.format, i.title, i.body FROM events e JOIN items i ON i.id = e.item_id WHERE i.via = ? AND e.type != 'impression'");
  for (const f of autos) {
    const via = `f:${f.id}`;
    const st = db.prepare('SELECT COUNT(*) n, SUM(CASE WHEN COALESCE(s.seen, 0) = 1 THEN 1 ELSE 0 END) seen FROM items i LEFT JOIN item_state s ON s.item_id = i.id WHERE i.via = ?').get(via);
    let pts = 0;
    for (const e of evq.all(via)) pts += Math.max(0, points(e.type, e.value, e));
    const fetched = st.n || 0;
    const seen = st.seen || 0;
    const weak = (seen >= 10 && pts < 2 + seen * 0.05) || (fetched >= 40 && seen <= 2 && now() - f.created > 7 * 86400000);
    if (weak && f.active) {
      db.prepare("UPDATE follows SET active = 0, dormant_since = ?, why = ? WHERE id = ?").run(now(), `resting: ${seen} seen, ${Math.round(pts)} pts`, f.id);
      pruned.push(`${f.label || f.value} (${seen} seen, ${Math.round(pts)} pts)`);
    } else db.prepare('UPDATE follows SET label = ? WHERE id = ?').run(`${String(f.label || f.value).replace(/ · \d+ seen · \d+ pts$/, '')}${seen ? ` · ${seen} seen · ${Math.round(pts)} pts` : ''}`, f.id);
  }
  if (pruned.length) log('info', `Resting weak auto sources (kept for later): ${pruned.join(', ')}`);
  return pruned;
}

let running = null;
export async function autoDiscover({ force = false } = {}) {
  if (config.mock || !getSetting('autoFollow', true)) return { skipped: true };
  if (running) return running;
  const last = getSetting('autoDiscoverAt', 0) || 0;
  if (!force && Date.now() - last < 50 * 60000) return { skipped: true };
  running = (async () => {
    const st = providerState();
    const terms = interestTerms(14);
    const out = { reddit: [], redditUsers: [], aiChecked: 0, lemmy: [], bluesky: [], redgifs: [], searches: [], pruned: [], terms };
    try { out.pruned = pruneAutoSources(); } catch (e) { log('warn', `Pruning failed: ${e.message}`); }
    if (st.reddit?.enabled) {
      out.reddit = discoverReddit(terms);
      out.redditUsers = discoverRedditUsers();
      const room = LIMITS.reddit - autoFollows('reddit', 'community').length;
      const aiAt = getSetting('aiSubsAt', 0) || 0;
      if (room > 0 && (force || Date.now() - aiAt > 5 * 3600000)) {
        try { out.aiChecked = await validateSubs(await aiSubreddits(terms), room); setSetting('aiSubsAt', Date.now()); } catch (e) { if (!e.yielded) log('warn', `AI subreddit picks failed: ${e.message}`); }
      }
    }
    if (st.redgifs?.enabled) out.redgifs = await discoverNiches(terms);
    try { out.revive = reviveAndRest(); } catch (e) { log('warn', `Source revival failed: ${e.message}`); }
    out.searches = await discoverTopics(st);
    if (st.lemmy?.enabled) out.lemmy = await discoverLemmy(terms);
    if (st.bluesky?.enabled) out.bluesky = await discoverBluesky(terms);
    setSetting('autoDiscoverAt', Date.now());
    const names = [...out.reddit.map((x) => `r/${x}`), ...out.redditUsers.map((x) => `u/${x}`), ...out.redgifs.map((x) => `niche ${x}`), ...out.searches, ...out.lemmy, ...out.bluesky.map((x) => `@${x}`)];
    if (names.length) log('info', `Auto-follow: ${names.join(', ')}`);
    out.added = names.length;
    return out;
  })().finally(() => { running = null; });
  return running;
}
