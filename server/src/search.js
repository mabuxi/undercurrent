import { config } from './config.js';
import { getDb, getSetting, setSetting, now, normalizeTag } from './db.js';
import { upsertItem, recheckBlocks, addTags } from './store.js';
import { isBlocked } from './safety.js';
import { PROVIDERS, providerState, setProvider } from './sources/providers.js';
import * as redgifs from './sources/redgifs.js';
import * as rss from './sources/redditRss.js';
import * as bluesky from './sources/bluesky.js';
import { performerInfo, ensureStarsTable } from './sources/stars.js';
import { chat, fastModel, deepModel, activeModel } from './ai/ollama.js';
import { listKinks, createKink, updateKink, listFantasies, saveFantasy, deleteFantasy } from './kinks.js';
import { addMemory, listMemory, updateMemory, memoryForPrompt, CATEGORIES, logPrompt } from './memory.js';
import { boostTags, topTags, applyEvent } from './profile.js';
import { follow, listFollows } from './ingest.js';
import { genderPrefs, setGenderPrefs, genderMode } from './gender.js';
import { JOBS, pruneJobs, invalidatePool } from './searchstate.js';
import { postTagOk, displayTag } from './tagquality.js';
import { runCommand, rulesParse } from './ai/agent.js';
import { mockItems } from './sources/mock.js';
import { lev, mentions } from './names.js';
import { log } from './log.js';
import { tr, trn, replyIn, lang } from './i18n.js';
import { searchVariants, EN_SEARCH_FR } from './vocab.js';

// The search bar. Short terms ("woman with big tits") are split into tags, widened with synonyms and searched
// for right away on every source that is switched on, next to what is already here. Sentences ("I want to see
// videos about...", "remove the jet ski kink and show me more hairy guys") go to a bigger model that can do
// several things at once. Each step shows up in the search bar while it runs.

let seq = 0;
const newId = () => `q${Date.now().toString(36)}${(seq++).toString(36)}`;

function step(job, key, label, state = 'run', detail = null) {
  let s = job.steps.find((x) => x.key === key);
  if (!s) { s = { key, label, state, detail, at: now() }; job.steps.push(s); }
  else Object.assign(s, { label: label || s.label, state, detail: detail ?? s.detail });
  job.rev++;
  return s;
}

// ---------- Reading the query ----------

const MINOR = /\b(teens?|teenagers?|teenie|young|younger|youngest|schoolgirls?|schoolboys?|jailbait|underage|minors?|kids?|child|children|loli|lolita|shota|barely legal|little girls?|little boys?|highschool|high school)\b/gi;
const MINOR_TEST = new RegExp(MINOR.source, 'i');
const WOMEN = new Set(['woman', 'women', 'girl', 'girls', 'female', 'females', 'lady', 'ladies', 'wife', 'gf', 'girlfriend', 'chick', 'chicks', 'babe', 'babes', 'she', 'her']);
const MEN = new Set(['man', 'men', 'guy', 'guys', 'male', 'males', 'dude', 'dudes', 'bro', 'bros', 'husband', 'bf', 'boyfriend', 'boy', 'boys', 'he', 'him']);
const GAY = new Set(['gay', 'homo', 'm4m', 'mm']);
const LES = new Set(['lesbian', 'lesbians', 'sapphic', 'ff', 'wlw']);
const BOTH = new Set(['hetero', 'straight', 'couple', 'couples', 'mf', 'fm', 'bi', 'bisexual']);
const TRANS = new Set(['trans', 'tgirl', 'tgirls', 'ts', 'transgender', 'ladyboy', 'shemale', 'femboy']);
const FORMAT_WORDS = [
  [/\b(long videos?|full videos?|full length|long form|movies?)\b/, ['long']],
  [/\b(short videos?|clips?|shorts|short form)\b/, ['short', 'gif']],
  [/\b(videos?|vids?|porn videos?)\b/, ['long', 'short', 'gif']],
  [/\bgifs?\b/, ['gif']],
  [/\b(pics?|photos?|pictures?|images?|nudes?|selfies?|albums?|galler(?:y|ies))\b/, ['image', 'set']],
  [/\b(stor(?:y|ies)|erotica|to read|written)\b/, ['story']],
  [/\b(threads?|discussions?|conversations?)\b/, ['discussion']]
];
const NOISE = new Set(['naked', 'nude', 'nudes', 'sexy', 'hot', 'porn', 'porno', 'xxx', 'nsfw', 'content', 'stuff', 'posts', 'post', 'some', 'any', 'more', 'please', 'the', 'a', 'an', 'my', 'me', 'of', 'videos', 'video', 'vids', 'clips', 'clip', 'pics', 'pic', 'photos', 'photo', 'pictures', 'images', 'image', 'gifs', 'gif', 'stories', 'story', 'threads', 'thread', 'full', 'long', 'short', 'form', 'real', 'amazing', 'best', 'good', 'nice']);
const SEP = new Set(['with', 'and', 'in', 'on', 'plus', 'while', 'who', 'that', 'having', 'having', 'getting', 'being', '+', '&', ',', 'or', 'by', 'from', 'at']);
const YOUNG = { name: '18 25', label: 'Young adults 18+', syn: ['college', 'coed', '18 year old'], remote: 'college' };

let lexCache = { at: 0, set: new Set() };
function lexicon() {
  if (Date.now() - lexCache.at < 10 * 60000 && lexCache.set.size) return lexCache.set;
  const rows = getDb().prepare('SELECT t.name FROM tags t JOIN (SELECT tag_id, COUNT(*) c FROM item_tags GROUP BY tag_id HAVING c >= 3) x ON x.tag_id = t.id').all();
  lexCache = { at: Date.now(), set: new Set(rows.map((r) => r.name).filter((n) => postTagOk(n))) };
  return lexCache.set;
}

function safeTerm(t) {
  const v = isBlocked({ title: t, tags: [t] });
  return v.blocked ? v.reason : null;
}

// Split a run of words into known tags, longest first ("hairy muscular daddy" → hairy, muscular, daddy).
function segment(words, lex) {
  const out = [];
  let i = 0;
  let loose = [];
  const flush = () => { if (loose.length) { out.push(loose.join(' ')); loose = []; } };
  while (i < words.length) {
    let hit = 0;
    for (let len = Math.min(4, words.length - i); len >= 1; len--) {
      const phrase = words.slice(i, i + len).join(' ');
      if (lex.has(phrase) && (len > 1 || phrase.length > 2)) { hit = len; break; }
    }
    if (hit) { flush(); out.push(words.slice(i, i + hit).join(' ')); i += hit; } else { loose.push(words[i]); i++; }
  }
  flush();
  return out;
}

export function localParse(q) {
  const notes = [];
  let s = ` ${String(q || '').toLowerCase()} `;
  const people = [];
  s = s.replace(/(?:^|\s)(?:@|\/?u\/)([a-z0-9_.-]{3,40})/gi, (m, h) => { people.push(h); return ' '; });
  let young = false;
  let minors = false;
  s = s.replace(MINOR, (w) => { if (/^(teens?|teenagers?|teenie|young|younger|youngest|barely legal)$/i.test(w.trim())) young = true; else minors = true; return ' '; });
  if (minors) notes.push(tr('Searching for minors is never allowed. Everything here is 18 or older.'));
  if (young) notes.push(tr('Everyone here is an adult: "teen" and "young" are read as young adults, 18 and over.'));
  const formats = new Set();
  for (const [re, fm] of FORMAT_WORDS) if (re.test(s)) { fm.forEach((x) => formats.add(x)); break; }
  const words = s.replace(/[^a-z0-9+&,'\s-]/g, ' ').replace(/,/g, ' , ').split(/\s+/).filter(Boolean);
  let women = false; let men = false; let gay = false; let les = false; let both = false; let trans = false;
  const runs = [];
  let cur = [];
  const end = () => { if (cur.length) { runs.push(cur); cur = []; } };
  for (const w of words) {
    if (WOMEN.has(w)) { women = true; end(); continue; }
    if (MEN.has(w)) { men = true; end(); continue; }
    if (GAY.has(w)) { gay = true; end(); continue; }
    if (LES.has(w)) { les = true; end(); continue; }
    if (BOTH.has(w)) { both = true; end(); continue; }
    if (TRANS.has(w)) { trans = true; end(); continue; }
    if (SEP.has(w)) { end(); continue; }
    if (NOISE.has(w)) { end(); continue; }
    cur.push(w.replace(/^'+|'+$/g, ''));
  }
  end();
  const lex = lexicon();
  const concepts = [];
  const seen = new Set();
  for (const run of runs) for (const c of segment(run, lex)) {
    const name = normalizeTag(c);
    if (!name || seen.has(name) || name.length < 2) continue;
    const bad = safeTerm(name);
    if (bad) { notes.push(bad === 'safety' ? tr('Left out "{name}": never allowed.', { name }) : tr('Left out "{name}": you blocked it.', { name })); continue; }
    seen.add(name);
    concepts.push({ name, syn: [], label: displayTag(name) });
  }
  if (young) concepts.push({ ...YOUNG, label: tr(YOUNG.label), syn: [...YOUNG.syn] });
  let gender = null;
  if (gay) gender = 'men-only';
  else if (les) gender = 'women-only';
  else if (both || (women && men)) gender = 'both';
  else if (women) gender = 'women';
  else if (men) gender = 'men';
  // "guys" with the balance on men only means only men; the same for women.
  const mode = genderMode();
  if (gender === 'men' && mode === 'men') gender = 'men-only';
  if (gender === 'women' && mode === 'women') gender = 'women-only';
  if (trans) concepts.push({ name: 'trans', syn: ['tgirl', 'transgender'], label: 'Trans' });
  if (both && !concepts.length && /\bsex\b/.test(s)) concepts.push({ name: 'sex', syn: ['fucking'], label: 'Sex' });
  return { concepts, gender, trans: trans ? true : null, formats: [...formats], people, notes };
}

// Real sentences go to the bigger model; lists of terms are searched right away.
const NL_FR = /(?:^|\s)(je|j'\S+|moi|montre|montre-moi|trouve|cherche|veux|voudrais|ajoute|supprime|retire|enlève|bloque|oublie|souviens|pourquoi|comment|quoi|qui|où|aime|adore|déteste|suis|suivre|plus de|moins de|jamais|arrête|affiche|mets|peux|pourrais|s'il)(?=\s|$)/i;
const NL_WORDS = /\b(i|i'm|im|i've|me|my|want|wanna|show|find|give|can|could|would|please|remove|add|delete|stop|don't|dont|never|remember|forget|what|why|how|who|where|which|like|love|hate|into|looking|see|watch|follow|unfollow|block|turn|enable|disable|switch|make|create|set|less|should|help|tell|explain|about|lately|anymore)\b/i;
export function isNatural(q) {
  const s = String(q || '').trim();
  if (/\?$/.test(s)) return true;
  const n = s.split(/\s+/).length;
  if (n >= 8) return true;
  return (NL_WORDS.test(s) || NL_FR.test(s)) && n >= 3;
}

const PERSON_RE = /^(?:(?:i'?m|i am)\s+)?(?:(?:looking|searching)\s+for\s+|find\s+(?:me\s+)?|show\s+(?:me\s+)?|search\s+(?:for\s+)?|i\s+want\s+(?:to\s+see\s+)?)?(?:(?:all\s+)?(?:the\s+|more\s+)?(?:content|videos?|posts?|stuff|pics?|photos?|clips?|everything|porn|scenes?)\s+(?:from|by|featuring|starring)|who\s+is|profiles?\s+(?:of|for))\s+@?(?:u\/)?([a-z0-9_.' -]{2,40}?)\s*[?.!]*$/i;
export function personIn(q) {
  const s = String(q || '').trim();
  const m = s.match(PERSON_RE);
  if (m) {
    const name = m[1].trim();
    if (name.split(/\s+/).length <= 4 && !MINOR_TEST.test(name) && !safeTerm(name)) return name;
  }
  const at = s.match(/^@([a-z0-9_.-]{3,40})$/i) || s.match(/^\/?u\/([a-z0-9_-]{3,40})$/i);
  return at ? at[1] : null;
}

const PARSE_SCHEMA = {
  type: 'object',
  properties: {
    concepts: { type: 'array', items: { type: 'object', properties: { tag: { type: 'string' }, synonyms: { type: 'array', items: { type: 'string' } } }, required: ['tag', 'synonyms'] } },
    gender: { type: 'string', enum: ['none', 'women', 'men', 'both', 'women-only', 'men-only'] },
    people: { type: 'array', items: { type: 'string' } }
  },
  required: ['concepts', 'gender', 'people']
};

const PARSE_RULES = `You turn a search typed into a private adult-content browser (one adult user) into tags.
- Split the search into the separate things asked for. Each becomes one short lowercase tag of 1 to 3 words, the way porn sites tag videos: "woman with big tits" gives the tag "big tits"; "hairy muscular daddy" gives "hairy", "muscular", "daddy".
- Words about who is in it are not tags, they set gender: woman/girl = women (at least one woman), man/guy = men, "hetero" or "straight" = both (at least one man and one woman), "gay" = men-only, "lesbian" = women-only. Otherwise "none".
- For every tag give 4 to 8 synonyms and close variants that sites really use, lowercase: "big dick" gives "big cock", "huge cock", "thick cock", "big penis", "monster cock", "hung".
- people: names of performers, creators or usernames in the search. Empty when there are none.
- Everyone is an adult. Never output tags or synonyms suggesting anyone under 18 ("teen", "young", "school"...). Use "college" instead.
- Leave out filler like "naked", "sexy", "porn", "videos".`;

async function refine(job, q, local) {
  try {
    const out = await Promise.race([
      chat({ kind: 'search-parse', model: fastModel(), schema: PARSE_SCHEMA, temperature: 0.2, numPredict: 500, system: PARSE_RULES, user: `Search: ${q}\nA quick split found: ${local.concepts.map((c) => c.name).join(', ') || 'nothing'}${local.gender ? ` (gender: ${local.gender})` : ''}.` }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 15000))
    ]);
    if (!out) return local;
    const concepts = [];
    const seen = new Set();
    for (const c of out.concepts || []) {
      const name = normalizeTag(c.tag);
      if (!name || seen.has(name) || MINOR_TEST.test(name) || safeTerm(name)) continue;
      if (WOMEN.has(name) || MEN.has(name) || GAY.has(name) || LES.has(name) || BOTH.has(name) || NOISE.has(name)) continue;
      seen.add(name);
      const lex = lexicon();
      const key = name.split(' ').pop();
      // Only synonyms that sites really use: tags that exist here, or variants built on the same word.
      const syn = [...new Set((c.synonyms || []).map(normalizeTag).filter((x) => x && x !== name && x.split(' ').length <= 4 && postTagOk(x) && !safeTerm(x) && !/\b(teen|young|school)/.test(x) && (lex.has(x) || x.split(' ').includes(key))))].slice(0, 8);
      concepts.push({ name, syn, label: displayTag(name) });
    }
    for (const c of local.concepts) if (c.name === YOUNG.name || c.name === 'trans') { if (!concepts.some((x) => x.name === c.name)) concepts.push(c); }
    // Keep what the quick split found when the model drops something.
    const covered = (c) => concepts.some((x) => x.name === c.name || x.syn.includes(c.name)) || c.name.split(' ').every((w) => concepts.some((x) => x.name.split(' ').includes(w)));
    for (const c of local.concepts) if (!covered(c)) concepts.push(c);
    // Gender only ever comes from words in the search itself; the small model guesses it too freely.
    const gender = local.gender;
    const people = [...new Set([...local.people, ...(out.people || []).map((p) => String(p).trim()).filter((p) => p && p.length < 40)])];
    return { ...local, concepts: concepts.slice(0, 6), gender, people };
  } catch (err) {
    if (err.message !== 'slow') step(job, 'syn', tr('Finding similar tags'), 'fail', tr('the local model did not answer, searching with your words'));
    return local;
  }
}

// Tags already here that contain the searched words ("big tits" → "natural big tits").
function localSynonyms(name) {
  const lex = lexicon();
  const out = [];
  const re = new RegExp(`(^| )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`);
  for (const t of lex) {
    if (t === name || out.length >= 5) continue;
    if (re.test(t) && t.split(' ').length <= 3 && !safeTerm(t)) out.push(t);
  }
  return out;
}

function chipsFor(spec) {
  const chips = [];
  const G = { women: tr('At least one woman'), men: tr('At least one man'), both: tr('Man and woman'), 'women-only': tr('Only women'), 'men-only': tr('Only men') };
  if (spec.gender) chips.push({ kind: 'gender', text: G[spec.gender], value: spec.gender });
  for (const c of spec.concepts) {
    chips.push({ kind: 'tag', text: c.label || c.name, value: c.name });
    for (const s of c.syn.slice(0, 6)) chips.push({ kind: 'syn', text: s, value: s, of: c.name });
  }
  for (const p of spec.people) chips.push({ kind: 'person', text: p, value: p });
  for (const id of spec.sources || []) chips.push({ kind: 'source', text: PROVIDERS[id]?.label || id, value: id });
  for (const f of spec.formats || []) chips.push({ kind: 'format', text: { long: tr('Long form'), short: tr('Short form'), gif: tr('GIFs'), image: tr('Images'), set: tr('Image sets'), story: tr('Stories'), discussion: tr('Threads') }[f] || f, value: f });
  return chips;
}

// ---------- Searching the sources ----------

function storeFound(job, list, provider, term, { strong = true } = {}) {
  const ids = [];
  let added = 0;
  getDb().transaction(() => {
    for (const n of list || []) {
      const r = upsertItem({ ...n, via: `q:${provider}|${term}`.slice(0, 120) });
      if (r.blocked) continue;
      ids.push(r.id);
      if (r.created) added++;
    }
  })();
  for (const id of ids) (strong ? job.spec.fetched : job.spec.weak).add(id);
  job.found += ids.length;
  job.added += added;
  return { ids, added };
}

function remoteTerms(spec) {
  const g = spec.gender === 'men-only' ? 'gay' : spec.gender === 'women-only' ? 'lesbian' : '';
  const names = spec.concepts.map((c) => (c.name === YOUNG.name ? YOUNG.remote : c.name)).filter((n) => !safeTerm(n));
  const withG = (t) => {
    if (g) return `${g} ${t}`.trim();
    if (!spec.gender) {
      const m = genderMode();
      if (m === 'men' && !/\b(gay|men|man|guy|male)\b/.test(t)) return `gay ${t}`;
      if (m === 'women' && !/\b(lesbian|women|girl|woman|solo)\b/.test(t)) return `lesbian ${t}`;
    }
    return t;
  };
  const terms = [];
  if (names.length) terms.push(withG(names.slice(0, 3).join(' ')));
  if (names.length > 1) for (const n of names.slice(0, 3)) terms.push(withG(n));
  const lex = lexicon();
  const firstSyn = spec.concepts[0]?.syn?.find((x) => lex.has(x));
  if (firstSyn && !safeTerm(firstSyn)) terms.push(withG(firstSyn));
  if (!terms.length && g) terms.push(g);
  return [...new Set(terms.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 4);
}

const TUBES = ['pornhub', 'redtube', 'eporner', 'xvideos', 'xnxx', 'xhamster', 'youporn', 'txxx'];

// In test mode the sources answer with made-up posts, so a search never goes to the internet.
function fetchFrom(id, args) {
  if (config.mock) return Promise.resolve(mockItems(`search:${id}:${args.mode}:${args.value}:${args.page || 1}:${args.sort || ''}`, 10, 0, id).map((n) => ({ ...n, title: `${n.title} ${args.value}` })));
  return PROVIDERS[id].fetch(args);
}

async function withTimeout(p, ms) {
  return Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
}

async function searchProviders(job, terms, { page = 1 } = {}) {
  const st = providerState();
  const spec = job.spec;
  const named = spec.sources?.length ? new Set(spec.sources) : null;
  const on = (id) => (named ? named.has(id) : true) && (config.mock ? id === 'redgifs' || id === 'pornhub' || !!named : !!st[id]?.enabled);
  const found = { communities: new Map(), users: new Map(), performers: new Map() };
  const tasks = [];
  const run = (key, label, fn) => tasks.push((async () => {
    step(job, key, label);
    try {
      const r = await withTimeout(fn(), 30000);
      if (r === null) step(job, key, label, 'fail', tr('took too long'));
      else step(job, key, label, 'done', r);
    } catch (err) {
      const msg = String(err.message || err);
      if (err.busy || err.rateLimited || /one feed request per minute|rate limit|429/i.test(msg)) step(job, key, label, 'skip', tr('Reddit allows one request a minute without a feed key, skipped this time'));
      else step(job, key, label, 'fail', msg.slice(0, 80));
    }
  })());
  const note = (list) => {
    for (const n of list || []) {
      for (const pf of n.performers || []) {
        const k = `${n.source}|${String(pf).toLowerCase()}`;
        const cur = found.performers.get(k) || { source: n.source, name: pf, hits: 0 };
        cur.hits++;
        found.performers.set(k, cur);
      }
      if (n.community && n.source === 'reddit' && !/^r\/u_|^u\//i.test(n.community)) {
        const k = `reddit|${n.community.replace(/^r\//, '')}`;
        const cur = found.communities.get(k) || { provider: 'reddit', mode: 'community', value: n.community.replace(/^r\//, ''), label: n.community, hits: 0 };
        cur.hits = (cur.hits || 0) + 1;
        found.communities.set(k, cur);
      }
      if (n.author && ['reddit', 'redgifs', 'bluesky', 'lemmy'].includes(n.source)) {
        const k = `${n.source}|${n.author}`.toLowerCase();
        const cur = found.users.get(k) || { provider: n.source, mode: 'creator', value: n.author, label: `${PROVIDERS[n.source]?.label || n.source}: ${n.author}`, hits: 0 };
        cur.hits++;
        found.users.set(k, cur);
      }
    }
  };
  for (const id of TUBES) {
    if (!on(id) || !terms.length) continue;
    const label = PROVIDERS[id].label;
    run(`${id}-${page}`, terms.length > 1 ? tr('Searching {source} for “{term}” and {n} more', { source: label, term: terms[0], n: terms.length - 1 }) : tr('Searching {source} for “{term}”', { source: label, term: terms[0] }), async () => {
      let n = 0; let added = 0;
      // The whole search first; single words only when the whole search finds little, and what they bring
      // must still match the search here.
      for (const [i, term] of terms.entries()) {
        if (i > 0 && n >= 25) break;
        const sorts = i === 0 ? ['week', 'month'] : ['month'];
        for (const sort of sorts) {
          const list = await fetchFrom(id, { mode: 'search', value: term, page, sort }).catch(() => []);
          note(list);
          const r = storeFound(job, list, id, term, { strong: i === 0 });
          n += r.ids.length; added += r.added;
        }
      }
      return added ? tr('{n} found, {added} new', { n, added }) : tr('{n} found', { n });
    });
  }
  if (on('redgifs') && terms.length && !config.mock) {
    run(`redgifs-${page}`, tr('Searching RedGIFs tags and niches for “{term}”', { term: terms[0] }), async () => {
      let n = 0;
      for (const [i, term] of terms.slice(0, 3).entries()) {
        if (i > 0 && n >= 25) break;
        const list = (await redgifs.search({ tag: term, order: 'top28', count: 40, page }).catch(() => [])).map(redgifs.normalizeGif);
        note(list);
        n += storeFound(job, list, 'redgifs', term, { strong: i === 0 }).ids.length;
      }
      const words = new Set(spec.concepts.flatMap((c) => [c.name, ...c.syn]).join(' ').split(' ').filter((w) => w.length > 3));
      const niches = page === 1 ? (await redgifs.searchNiches(terms[0], 8).catch(() => [])).filter((ni) => String(ni.name).toLowerCase().split(/[^a-z]+/).some((w) => words.has(w))) : [];
      for (const ni of niches.slice(0, 2)) {
        found.communities.set(`redgifs|${ni.id}`, { provider: 'redgifs', mode: 'community', value: ni.id, label: `RedGIFs niche: ${ni.name}` });
        const list = (await redgifs.nicheGifs(ni.id, { order: 'top', count: 30 }).catch(() => [])).map((g) => ({ ...redgifs.normalizeGif(g), community: ni.id }));
        n += storeFound(job, list, 'redgifs', ni.name).ids.length;
      }
      return niches.length ? tr('{n} found, niches: {list}', { n, list: niches.slice(0, 2).map((x) => x.name).join(', ') }) : tr('{n} found', { n });
    });
  }
  if (on('lemmy') && terms.length && !config.mock) {
    run(`lemmy-${page}`, tr('Searching Lemmy communities for “{term}”', { term: terms[0] }), async () => {
      const list = await PROVIDERS.lemmy.fetch({ mode: 'search', value: terms[0], page, sort: 'month' }).catch(() => []);
      note(list);
      for (const n of list) if (n.community) found.communities.set(`lemmy|${n.community}`, { provider: 'lemmy', mode: 'community', value: n.community, label: `Lemmy: ${n.community}` });
      return tr('{n} found', { n: storeFound(job, list, 'lemmy', terms[0]).ids.length });
    });
  }
  for (const id of ['rule34', 'gelbooru']) {
    if (!on(id) || !terms.length) continue;
    run(`${id}-${page}`, tr('Searching {source} for “{term}”', { source: PROVIDERS[id].label, term: terms[0] }), async () => tr('{n} found', { n: storeFound(job, await PROVIDERS[id].fetch({ mode: 'search', value: terms[0] }).catch(() => []), id, terms[0]).ids.length }));
  }
  if (on('reddit') && terms.length && !config.mock) {
    run(`reddit-${page}`, tr('Searching Reddit posts, users and subreddits for “{term}”', { term: terms[0] }), async () => {
      const list = await rss.search(terms[0], page > 1 ? 'month' : 'hot', { maxWaitMs: 30000 });
      note(list);
      const r = storeFound(job, list, 'reddit', terms[0]);
      const subs = [...found.communities.values()].filter((c) => c.provider === 'reddit' && c.hits >= 2).length;
      return subs ? tr('{n} found, {subs} subreddits', { n: r.ids.length, subs }) : tr('{n} found', { n: r.ids.length });
    });
  }
  await Promise.all(tasks);
  // Profiles from the results themselves: the performers the video sites name most, the creators who posted
  // several of the results, and the communities they came from.
  ensureStarsTable();
  const perfs = [...found.performers.values()].sort((a, b) => b.hits - a.hits).slice(0, 10);
  for (const pf of perfs) {
    const info = performerInfo(pf.name);
    addProfile(job, { platform: pf.source, kind: 'performer', value: pf.name, handle: tr('{n} in these results', { n: pf.hits }), name: info?.display || pf.name, url: pf.source === 'pornhub' ? `https://www.pornhub.com/pornstar/${normalizeTag(pf.name).replace(/\s+/g, '-')}` : null, avatar: info?.thumb || null, posts: info?.videos ?? null, provider: pf.source, mode: 'creator' });
  }
  const makers = [...found.users.values()].filter((u) => u.hits >= 2).sort((a, b) => b.hits - a.hits).slice(0, 8);
  await Promise.all(makers.map(async (u) => {
    let followers = null; let posts = null; let avatar = null;
    if (u.provider === 'redgifs') { const x = await redgifs.userInfo(u.value).catch(() => null); followers = x?.followers ?? null; posts = x?.publishedGifs ?? x?.gifs ?? null; avatar = x?.profileImageUrl || null; }
    addProfile(job, { platform: u.provider, kind: 'user', value: u.value, handle: tr('{n} in these results', { n: u.hits }), name: u.value, url: LINK[u.provider]?.(u.value) || null, followers, posts, avatar, provider: u.provider, mode: 'creator' });
  }));
  for (const c of [...found.communities.values()].filter((x) => (x.hits ?? 2) >= 2)) {
    addProfile(job, { platform: c.provider, kind: 'community', value: c.value, handle: c.hits ? tr('{n} in these results', { n: c.hits }) : '', name: c.label.replace(/^(RedGIFs niche|Lemmy): /, ''), url: c.provider === 'reddit' ? `https://www.reddit.com/r/${c.value}/` : null, provider: c.provider, mode: 'community' });
  }
  const strip = ({ hits, ...x }) => ({ ...x, label: String(x.label).replace(/^RedGIFs niche: (.*)$/s, (m, name) => tr('RedGIFs niche: {name}', { name })) });
  job.sources = [...[...found.communities.values()].filter((c) => (c.hits ?? 2) >= 2).sort((a, b) => (b.hits ?? 2) - (a.hits ?? 2)), ...[...found.users.values()].filter((u) => u.hits >= 2).sort((a, b) => b.hits - a.hits)].map(strip).slice(0, 10);
  invalidatePool();
}

// ---------- Web search (Ollama's web search API, only with your key) ----------

export function webKey() {
  return getSetting('ollamaApiKey', null) || process.env.OLLAMA_API_KEY || null;
}

export async function webSearch(query, max = 6) {
  const key = webKey();
  if (!key || config.mock) return [];
  const { request } = await import('./http.js');
  const data = await request('https://ollama.com/api/web_search', { method: 'POST', body: { query, max_results: Math.min(10, max) }, headers: { Authorization: `Bearer ${key}` }, purpose: 'Web search', timeout: 15000 });
  return (data?.results || []).map((r) => ({ title: String(r.title || '').slice(0, 160), url: r.url, content: String(r.content || '').slice(0, 700) }));
}

// ---------- Finding a person ----------

const TUBE_SEARCH = {
  pornhub: (q) => `https://www.pornhub.com/video/search?search=${encodeURIComponent(q)}`,
  redtube: (q) => `https://www.redtube.com/?search=${encodeURIComponent(q)}`,
  eporner: (q) => `https://www.eporner.com/search/${encodeURIComponent(q)}/`,
  xvideos: (q) => `https://www.xvideos.com/?k=${encodeURIComponent(q)}`,
  xnxx: (q) => `https://www.xnxx.com/search/${encodeURIComponent(q)}`,
  xhamster: (q) => `https://xhamster.com/search/${encodeURIComponent(q)}`,
  youporn: (q) => `https://www.youporn.com/search/?query=${encodeURIComponent(q)}`,
  txxx: (q) => `https://txxx.com/search/?s=${encodeURIComponent(q)}`
};
const tubeSearchUrl = (id, q) => TUBE_SEARCH[id]?.(q) || null;

const HANDLES_SCHEMA = {
  type: 'object',
  properties: { handles: { type: 'array', items: { type: 'object', properties: { platform: { type: 'string', enum: ['reddit', 'redgifs', 'bluesky', 'onlyfans', 'fansly', 'x', 'pornhub', 'other'] }, handle: { type: 'string' } }, required: ['platform', 'handle'] } } },
  required: ['handles']
};

const LINK = { onlyfans: (h) => `https://onlyfans.com/${h}`, fansly: (h) => `https://fansly.com/${h}`, x: (h) => `https://x.com/${h}`, reddit: (h) => `https://www.reddit.com/user/${h}`, redgifs: (h) => `https://www.redgifs.com/users/${h.toLowerCase()}`, bluesky: (h) => `https://bsky.app/profile/${h}` };

// ---------- Profiles and communities ----------

// The spelling the sources use when it is close to what was typed.
function spellingIn(list, name) {
  const flat = name.toLowerCase().replace(/\s+/g, '');
  if (flat.length < 5 || name.includes(' ')) return null;
  const max = flat.length >= 8 ? 2 : 1;
  const count = new Map();
  for (const n of list) for (const w of `${n.title} ${(n.performers || []).join(' ')}`.split(/[^A-Za-z0-9]+/)) {
    const low = w.toLowerCase();
    if (low !== flat && Math.abs(low.length - flat.length) <= max && lev(low, flat) <= max) count.set(w, (count.get(w) || 0) + 1);
  }
  const best = [...count].sort((x, y) => y[1] - x[1])[0];
  return best && best[1] >= 2 ? best[0] : null;
}

function addProfile(job, p) {
  const key = `${p.platform}|${p.kind}|${String(p.value).toLowerCase()}`;
  if (job.profiles.some((x) => x.key === key)) return;
  job.profiles.push({ key, followers: null, posts: null, avatar: null, about: '', ...p });
  // By reach: followers where the site has them, otherwise video views (tube sites have no followers), then posts.
  const reach = (x) => x.followers ?? (x.views ? Math.round(x.views / 100) : null) ?? (x.posts ? x.posts * 10 : -1);
  job.profiles.sort((x, y) => reach(y) - reach(x) || (y.posts ?? -1) - (x.posts ?? -1));
  job.rev++;
}

// Profiles and communities whose names fit the search, on every source that is switched on, with their follower counts.
async function profileSearch(job, q, run) {
  const st = providerState();
  const on = (id) => !config.mock && !!st[id]?.enabled;
  const flat = q.replace(/\s+/g, '');
  if (config.mock) {
    addProfile(job, { platform: 'bluesky', kind: 'user', value: `${flat.toLowerCase()}.bsky.social`, handle: `@${flat.toLowerCase()}.bsky.social`, name: q, followers: 12400, posts: 310, provider: 'bluesky', mode: 'creator', url: LINK.bluesky(`${flat.toLowerCase()}.bsky.social`) });
    addProfile(job, { platform: 'reddit', kind: 'community', value: `${flat}Fans`, handle: `r/${flat}Fans`, name: `r/${flat}Fans`, followers: 3100, provider: 'reddit', mode: 'community', url: `https://www.reddit.com/r/${flat}Fans/` });
    addProfile(job, { platform: 'redgifs', kind: 'user', value: flat.toLowerCase(), handle: flat.toLowerCase(), name: q, followers: 880, posts: 42, provider: 'redgifs', mode: 'creator', url: LINK.redgifs(flat) });
    return;
  }
  const { request } = await import('./http.js');
  if (on('bluesky')) run(`p-bs-${q}`, tr('Finding Bluesky profiles for “{q}”', { q }), async () => {
    const d = await request(`https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?${new URLSearchParams({ q, limit: '25' })}`, { purpose: 'Bluesky profiles' });
    const actors = (d.actors || []).slice(0, 25);
    if (!actors.length) return tr('none');
    const pr = await request(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?${actors.map((x) => `actors=${encodeURIComponent(x.did)}`).join('&')}`, { purpose: 'Bluesky profiles' }).catch(() => ({ profiles: [] }));
    const byDid = new Map((pr.profiles || []).map((x) => [x.did, x]));
    for (const x of actors) {
      const full = byDid.get(x.did) || x;
      addProfile(job, { platform: 'bluesky', kind: 'user', value: x.handle, handle: x.handle, name: full.displayName || x.handle, url: LINK.bluesky(x.handle), avatar: full.avatar || null, followers: full.followersCount ?? null, posts: full.postsCount ?? null, about: String(full.description || '').slice(0, 140), provider: 'bluesky', mode: 'creator' });
    }
    return trn(actors.length, '{n} profile', '{n} profiles');
  });
  if (on('lemmy')) run(`p-lm-${q}`, tr('Finding Lemmy users and communities for “{q}”', { q }), async () => {
    const inst = (await import('./sources/lemmy.js')).lemmyInstance();
    const base = `https://${inst}/api/v3/search`;
    const [u, c] = await Promise.all([
      request(`${base}?${new URLSearchParams({ q, type_: 'Users', limit: '10', show_nsfw: 'true' })}`, { purpose: 'Lemmy profiles' }).catch(() => ({})),
      request(`${base}?${new URLSearchParams({ q, type_: 'Communities', limit: '10', show_nsfw: 'true' })}`, { purpose: 'Lemmy profiles' }).catch(() => ({}))
    ]);
    for (const x of u.users || []) addProfile(job, { platform: 'lemmy', kind: 'user', value: x.person.name, handle: x.person.name, name: x.person.display_name || x.person.name, url: x.person.actor_id, avatar: x.person.avatar || null, posts: x.counts?.post_count ?? null, provider: 'lemmy', mode: 'creator' });
    for (const x of c.communities || []) addProfile(job, { platform: 'lemmy', kind: 'community', value: x.community.name, handle: x.community.name, name: x.community.title || x.community.name, url: x.community.actor_id, avatar: x.community.icon || null, followers: x.counts?.subscribers ?? null, posts: x.counts?.posts ?? null, provider: 'lemmy', mode: 'community' });
    return tr('{users} users, {communities} communities', { users: (u.users || []).length, communities: (c.communities || []).length });
  });
  if (on('redgifs')) run(`p-rg-${q}`, tr('Finding RedGIFs creators and niches for “{q}”', { q }), async () => {
    const [u, niches] = await Promise.all([redgifs.userInfo(flat).catch(() => null), redgifs.searchNiches(q, 8).catch(() => [])]);
    if (u) addProfile(job, { platform: 'redgifs', kind: 'user', value: u.username, handle: u.username, name: u.name || u.username, url: LINK.redgifs(u.username), avatar: u.profileImageUrl || null, followers: u.followers ?? null, posts: u.publishedGifs ?? u.gifs ?? null, provider: 'redgifs', mode: 'creator' });
    for (const ni of niches) addProfile(job, { platform: 'redgifs', kind: 'community', value: ni.id, handle: ni.id, name: ni.name, url: `https://www.redgifs.com/niches/${ni.id}`, avatar: ni.thumbnail || null, followers: ni.subscribers ?? null, posts: ni.gifs ?? null, provider: 'redgifs', mode: 'community' });
    return tr('{creators} creator, {niches} niches', { creators: u ? 1 : 0, niches: niches.length });
  });
  ensureStarsTable();
  const low = q.toLowerCase();
  for (const r of getDb().prepare("SELECT * FROM performers WHERE name LIKE ? OR replace(name, ' ', '') LIKE ? ORDER BY videos DESC LIMIT 8").all(`%${low}%`, `%${flat.toLowerCase()}%`)) {
    addProfile(job, { platform: 'pornhub', kind: 'performer', value: r.display || r.name, handle: r.display || r.name, name: r.display || r.name, url: `https://www.pornhub.com/pornstar/${String(r.name).replace(/\s+/g, '-')}`, avatar: r.thumb || null, posts: r.videos || null, provider: 'pornhub', mode: 'creator' });
  }
  // Without a Reddit feed key Reddit allows one request a minute, which goes to posts; with the key, subreddits and users too.
  if (on('reddit') && rss.feedToken()) run(`p-rd-${q}`, tr('Finding subreddits and Reddit users for “{q}”', { q }), async () => {
    const subs = await rss.searchSubreddits(q, { maxWaitMs: 60000 });
    for (const x of subs.slice(0, 12)) addProfile(job, { platform: 'reddit', kind: 'community', value: x.name, handle: `r/${x.name}`, name: x.title && x.title !== x.name ? x.title : `r/${x.name}`, url: `https://www.reddit.com/r/${x.name}/`, followers: x.subscribers, about: x.about, provider: 'reddit', mode: 'community' });
    let users = [];
    try { users = await rss.searchUsers(q, { maxWaitMs: 60000 }); } catch {}
    for (const x of users.slice(0, 12)) addProfile(job, { platform: 'reddit', kind: 'user', value: x.name, handle: `u/${x.name}`, name: `u/${x.name}`, url: LINK.reddit(x.name), provider: 'reddit', mode: 'creator' });
    return tr('{subs} subreddits, {users} users', { subs: subs.length, users: users.length });
  });
}

// Show only what one profile or community posted: fetch their posts now and filter the search to them.
export async function openProfile(id, key) {
  const j = JOBS.get(String(id));
  const p = j?.profiles.find((x) => x.key === key);
  if (!p) return null;
  j.profileItems = j.profileItems || new Map();
  const ids = j.profileItems.get(key) || new Set();
  j.profileItems.set(key, ids);
  const keep = (list) => { getDb().transaction(() => { for (const n of list || []) { const r = upsertItem(n); if (!r.blocked) ids.add(r.id); } })(); };
  try {
    if (config.mock) keep(mockItems(`profile:${key}`, 12, 0, p.platform === 'pornhub' ? 'pornhub' : 'redgifs'));
    else if (p.kind === 'name') { /* already fetched with the search */ }
    else if (p.platform === 'bluesky') keep(await bluesky.authorFeed(p.value));
    else if (p.platform === 'redgifs' && p.kind === 'user') keep((await redgifs.byUser(p.value, 60)).map(redgifs.normalizeGif));
    else if (p.platform === 'redgifs') keep((await redgifs.nicheGifs(p.value, { order: 'top', count: 60 })).map((g) => ({ ...redgifs.normalizeGif(g), community: p.value })));
    else if (p.platform === 'reddit' && p.kind === 'community') keep(await rss.subreddit(p.value, 'hot', { maxWaitMs: 60000 }));
    else if (p.platform === 'reddit') keep(await rss.user(p.value, { maxWaitMs: 60000 }));
    else if (p.platform === 'lemmy') keep(await PROVIDERS.lemmy.fetch({ mode: p.mode, value: p.value }));
    else if (p.platform === 'pornhub') { keep(await PROVIDERS.pornhub.fetch({ mode: 'creator', value: p.value, sort: 'top' })); keep(await PROVIDERS.redtube.fetch({ mode: 'creator', value: p.value, sort: 'top' }).catch(() => [])); }
  } catch (err) {
    log('warn', `Could not load ${p.name}: ${err.message}`);
    if (!ids.size) throw err;
  }
  // Posts already here from the same account count too.
  const local = p.kind === 'community'
    ? getDb().prepare('SELECT id FROM items WHERE blocked = 0 AND lower(community) IN (?, ?)').all(String(p.value).toLowerCase(), `r/${String(p.value).toLowerCase()}`)
    : getDb().prepare('SELECT id FROM items WHERE blocked = 0 AND source = ? AND lower(author) = ?').all(p.platform, String(p.value).toLowerCase());
  for (const r of local) ids.add(r.id);
  invalidatePool();
  j.rev++;
  return { filter: { search: j.id, searchLabel: j.q, profile: key, profileLabel: p.name }, count: ids.size };
}

export function profileItems(id, key) {
  return JOBS.get(String(id))?.profileItems?.get(key) || null;
}

// ---------- Finding a person ----------

async function personSearch(job, rawName) {
  let name = String(rawName).replace(/^@|^\/?u\//i, '').replace(/['’]s$/i, '').trim();
  const spec = job.spec;
  const person = { name, display: name, avatar: null, videos: null, views: null, profiles: [], links: [] };
  job.person = person;
  const st = providerState();
  const on = (id) => config.mock || !!st[id]?.enabled;
  const tasks = [];
  const run = (key, label, fn) => tasks.push((async () => {
    step(job, key, label);
    try { const r = await withTimeout(fn(), /rd-/.test(key) ? 75000 : 35000); step(job, key, label, r === null ? 'fail' : 'done', r === null ? tr('took too long') : r); } catch (e) {
      const msg = String(e.message || e);
      if (e.busy || e.rateLimited || /one feed request per minute|rate limit|429/i.test(msg)) step(job, key, label, 'skip', tr('Reddit is rate limiting right now, try again in a few minutes'));
      else step(job, key, label, 'fail', msg.slice(0, 80));
    }
  })());

  // 1. Videos that name them on the tube sites, all time, most viewed first. This also tells how they really spell it.
  step(job, 'who', tr('Looking for {name} on the video sites', { name }));
  const found = [];
  await Promise.all(TUBES.filter(on).map(async (id) => {
    const list = await fetchFrom(id, { mode: 'name', value: name }).catch(() => []);
    for (const n of list) found.push({ ...n, _src: id });
  }));
  const spelled = spellingIn(found, name);
  if (spelled) { job.notes.push(tr('Showing results for {spelled} (you typed {name}).', { spelled, name })); name = spelled; person.display = spelled; }
  const flat = name.replace(/\s+/g, '');
  const handles = new Set([flat]);
  ensureStarsTable();
  const perf = performerInfo(name) || getDb().prepare("SELECT * FROM performers WHERE replace(name, ' ', '') = ? LIMIT 1").get(flat.toLowerCase());
  if (perf) { person.display = perf.display || name; person.avatar = perf.thumb; person.videos = perf.videos; }
  const mine = found.filter((n) => mentions(`${n.title} ${(n.performers || []).join(' ')} ${(n.tags || []).join(' ')}`, name) || (perf && (n.performers || []).some((p) => p.toLowerCase() === String(perf.display).toLowerCase())));
  for (const id of TUBES) {
    const ids = storeFound(job, mine.filter((x) => x._src === id).map(({ _src, ...n }) => n), id, name).ids;
    j_itemsFor(job, `${id}|name|${flat.toLowerCase()}`, ids);
    // They are in these videos: the name is set on each one.
    for (const pid of ids) addTags(pid, [{ name: person.display, kind: 'performer', weight: 0.6 }], 'title');
  }
  if (mine.length) {
    const views = mine.reduce((a, n) => a + (Number(n.media?.views) || 0), 0);
    person.views = views;
    for (const id of TUBES) {
      const n = mine.filter((x) => x._src === id).length;
      if (n) addProfile(job, { platform: id, kind: 'name', value: flat.toLowerCase(), handle: name, name: tr('{name} on {source}', { name: person.display, source: PROVIDERS[id].label }), url: tubeSearchUrl(id, name), posts: n, provider: id, mode: 'search', views: mine.filter((x) => x._src === id).reduce((a, x) => a + (Number(x.media?.views) || 0), 0) });
    }
  }
  step(job, 'who', null, 'done', `${trn(mine.length, '{n} video names {name}', '{n} videos name {name}', { name: person.display })}${perf ? trn(perf.videos, ', Pornhub performer with {n} video', ', Pornhub performer with {n} videos') : ''}`);

  // 2. Their usernames elsewhere, from the web (only with a key).
  if (webKey()) {
    step(job, 'web', tr("Searching the web for {name}'s profiles", { name }));
    try {
      const results = await webSearch(`${name} profiles reddit redgifs onlyfans`, 6);
      if (results.length) {
        const out = await withTimeout(chat({ kind: 'search-parse', model: fastModel(), schema: HANDLES_SCHEMA, temperature: 0.1, numPredict: 300,
          system: 'From web search results, list the usernames this adult creator or performer publicly uses on each platform. Only usernames and handles that appear in the results for this same person, never a legal or real name, never guesses.',
          user: `Person: ${name}\n\n${results.map((r, i) => `${i + 1}. ${r.title} (${r.url})\n${r.content}`).join('\n\n')}` }), 20000);
        for (const h of out?.handles || []) {
          const handle = String(h.handle || '').replace(/^@|^\/?u\//i, '').trim();
          if (!/^[A-Za-z0-9_.-]{3,30}$/.test(handle)) continue;
          if (['reddit', 'redgifs', 'bluesky'].includes(h.platform)) handles.add(handle);
          if (LINK[h.platform] && !person.links.some((l) => l.url === LINK[h.platform](handle))) person.links.push({ platform: h.platform, handle, url: LINK[h.platform](handle) });
        }
        step(job, 'web', null, 'done', trn(person.links.length, '{n} profile named on the web', '{n} profiles named on the web'));
      } else step(job, 'web', null, 'done', tr('nothing found'));
    } catch (err) { step(job, 'web', null, 'fail', err.message.slice(0, 80)); }
  }
  spec.people = [...new Set([name, ...handles, ...(spelled ? [String(rawName).trim()] : [])])];

  // 3. Profiles with that name (or close to it) everywhere, and their posts when a profile clearly is them.
  await profileSearch(job, name, run);
  for (const h of [...handles].slice(0, 3)) {
    if (on('reddit') && !config.mock) run(`rd-${h}`, tr('Finding Reddit user u/{name}', { name: h }), async () => {
      let list = [];
      try { list = await rss.user(h, { maxWaitMs: 60000 }); } catch (e) {
        if (e.status === 404 || /404|not found/i.test(e.message)) return tr('no such user');
        throw e;
      }
      if (!list.length) return tr('no posts');
      person.profiles.push({ platform: 'reddit', handle: h, url: LINK.reddit(h), posts: list.length, avatar: null });
      addProfile(job, { platform: 'reddit', kind: 'user', value: h, handle: `u/${h}`, name: `u/${h}`, url: LINK.reddit(h), posts: list.length, provider: 'reddit', mode: 'creator' });
      j_itemsFor(job, `reddit|user|${h.toLowerCase()}`, storeFound(job, list, 'reddit', h).ids);
      return trn(list.length, '{n} post', '{n} posts');
    });
  }
  if (perf) for (const id of ['pornhub', 'redtube']) if (on(id)) run(`star-${id}`, tr('Finding {source} videos with {name}', { source: PROVIDERS[id].label, name: person.display }), async () => {
    const list = await fetchFrom(id, { mode: 'creator', value: person.display, sort: 'top' }).catch(() => []);
    return trn(storeFound(job, list, id, person.display).ids.length, '{n} video', '{n} videos');
  });
  if (on('redgifs') && !config.mock) run('name-redgifs', tr('Searching {source} for “{term}”', { source: 'RedGIFs', term: name }), async () => {
    const list = (await redgifs.search({ tag: name, order: 'top28', count: 40 }).catch(() => [])).map(redgifs.normalizeGif);
    const hit = list.filter((n) => mentions(`${n.title} ${n.author || ''} ${(n.tags || []).join(' ')}`, name));
    return trn(storeFound(job, hit, 'redgifs', name, { strong: false }).ids.length, '{n} mentions {name}', '{n} mention {name}', { name });
  });
  await Promise.all(tasks);
  // A profile whose handle is the name itself is them: their posts join the results.
  const own = job.profiles.filter((p) => p.kind === 'user' && String(p.value).toLowerCase().replace(/[^a-z0-9]/g, '').startsWith(flat.toLowerCase()) && String(p.value).toLowerCase().split('.')[0].replace(/[^a-z0-9]/g, '') === flat.toLowerCase());
  for (const p of own.slice(0, 2)) {
    try {
      const r = await openProfile(job.id, p.key);
      if (r) { for (const id of profileItems(job.id, p.key) || []) spec.fetched.add(id); person.profiles.push({ platform: p.platform, handle: p.handle, url: p.url, posts: p.posts, avatar: p.avatar }); if (!person.avatar && p.avatar) person.avatar = p.avatar; }
    } catch {}
  }
  if (perf) spec.concepts.push({ name: normalizeTag(perf.display), syn: [], label: perf.display });
  invalidatePool();
}

function j_itemsFor(job, key, ids) {
  job.profileItems = job.profileItems || new Map();
  const set = job.profileItems.get(key) || new Set();
  for (const id of ids) set.add(id);
  job.profileItems.set(key, set);
}

// ---------- Plain terms ----------

async function termsSearch(job, text, { presetFormats = null, extraPeople = [] } = {}) {
  step(job, 'split', tr('Reading your search'));
  // In French, French words are read as the English tags the sources use, and the French word is searched too.
  const variants = searchVariants(text, lang());
  const local = localParse(variants[0]);
  if (presetFormats?.length) local.formats = presetFormats;
  local.people.push(...extraPeople);
  Object.assign(job.spec, { concepts: local.concepts, gender: local.gender, trans: local.trans, formats: local.formats });
  job.notes.push(...local.notes);
  job.chips = chipsFor({ ...job.spec, people: local.people });
  step(job, 'split', null, 'done', local.concepts.map((c) => c.label || c.name).join(', ') || tr('no tags'));
  job.filter = { search: job.id, searchLabel: text };
  step(job, 'syn', tr('Finding similar tags with the local model'));
  const r = await refine(job, text, local);
  // Synonyms that point at the other gender than the one asked for (or set in the balance) are left out.
  const side = r.gender || (genderMode() === 'men' ? 'men-only' : genderMode() === 'women' ? 'women-only' : null);
  const FEM = /\b(pussy|pussies|futa|girls?|woman|women|wife|milf|mom|mommy|lesbians?|tits|boobs|breasts|female|she|her|ladies|lady|busty)\b/;
  const MASC = /\b(cock|dick|penis|guys?|man|men|male|husband|dad|daddy|gay|twinks?|bears?|jocks?|hunks?)\b/;
  const fits = (t) => !((side === 'men-only' || side === 'men') && FEM.test(t) && !(side === 'men' && MASC.test(t))) && !((side === 'women-only' || side === 'women') && MASC.test(t) && !(side === 'women' && FEM.test(t)));
  for (const c of r.concepts) if (c.name !== YOUNG.name) c.syn = [...new Set([...c.syn, ...localSynonyms(c.name)])].filter(fits).slice(0, 8);
  if (lang() === 'fr') for (const c of r.concepts) { const fr = c.name !== YOUNG.name ? EN_SEARCH_FR[c.name] : null; if (fr && !c.syn.includes(fr)) c.syn = [fr, ...c.syn].slice(0, 8); }
  Object.assign(job.spec, { concepts: r.concepts, gender: r.gender, trans: r.trans, formats: r.formats });
  job.chips = chipsFor({ ...job.spec, people: r.people });
  if (job.steps.find((s) => s.key === 'syn')?.state === 'run') step(job, 'syn', null, 'done', trn(r.concepts.reduce((a, c) => a + c.syn.length, 0), '{n} similar tag', '{n} similar tags'));
  step(job, 'local', tr('Filtering what is already here'));
  step(job, 'local', null, 'done');
  const people = r.people.filter(Boolean);
  if (people.length && !r.concepts.length) { await personSearch(job, people[0]); job.chips = chipsFor(job.spec); return; }
  job.spec.people = people;
  // Posts, and at the same time profiles and communities that fit the search.
  const tasks = [];
  const run = (key, label, fn) => tasks.push((async () => {
    step(job, key, label);
    try { const r = await withTimeout(fn(), 75000); step(job, key, label, r === null ? 'fail' : 'done', r === null ? tr('took too long') : r); } catch (e) {
      const msg = String(e.message || e);
      const limited = e.busy || e.rateLimited || /one feed request per minute|rate limit|429/i.test(msg);
      step(job, key, label, limited ? 'skip' : 'fail', limited ? tr('Reddit is rate limiting right now') : msg.slice(0, 80));
    }
  })());
  const terms = remoteTerms(job.spec);
  // The French version of the search as a whole, after the English ones, so French posts turn up as well.
  if (lang() === 'fr' && variants.length > 1) { const other = variants.find((v) => v !== variants[0]); if (other && !safeTerm(other) && !terms.includes(other)) terms.push(other); }
  await Promise.all([searchProviders(job, terms), profileSearch(job, (terms[0] || text).replace(/^(gay|lesbian) /, ''), run)]);
  await Promise.all(tasks);
  if (people.length) await personSearch(job, people[0]);
  job.chips = chipsFor(job.spec);
}

// ---------- Sentences: the assistant ----------

const ACTIONS = ['search', 'person', 'filter', 'kink_add', 'kink_remove', 'tags_like', 'tags_less', 'tags_block', 'fantasy_add', 'fantasy_remove', 'memory_add', 'memory_remove', 'source_add', 'source_toggle', 'provider_toggle', 'gender', 'open'];
const FORMATS = ['long', 'short', 'gif', 'image', 'set', 'story', 'discussion'];
const AGENT_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ACTIONS },
          terms: { type: 'string' }, name: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } },
          formats: { type: 'array', items: { type: 'string', enum: FORMATS } }, window: { type: 'string', enum: ['mixed', 'new:day', 'new:week', 'new:month', 'popular:day', 'popular:week', 'popular:month', 'popular:year'] },
          following: { type: 'boolean' }, saved: { type: 'boolean' }, only_new: { type: 'boolean' },
          description: { type: 'string' }, kinks: { type: 'array', items: { type: 'string' } }, category: { type: 'string', enum: CATEGORIES }, text: { type: 'string' },
          provider: { type: 'string', enum: Object.keys(PROVIDERS) }, mode: { type: 'string', enum: ['community', 'creator', 'search'] }, value: { type: 'string' },
          on: { type: 'boolean' }, male: { type: 'integer' }, auto: { type: 'boolean' }, trans: { type: 'boolean' }, view: { type: 'string', enum: ['feed', 'map', 'memory', 'settings'] }
        },
        required: ['type']
      }
    }
  },
  required: ['answer', 'actions']
};

function agentSystem() {
  const kinks = listKinks({ includeHidden: false }).filter((k) => !k.isGroup);
  const fans = listFantasies();
  const st = providerState();
  const follows = listFollows().filter((f) => f.active).slice(0, 40);
  const g = genderPrefs();
  const tags = topTags({ by: 'long', limit: 40 }).map((t) => t.name).filter(Boolean);
  return `You run the search bar of a private, local adult-content browser for one adult user. Read what he writes, answer him, and do what he asks. You can do several things at once.

Actions (use only the fields each one needs):
- search: find posts right now on all his sources. terms = the things to find as short tags separated by commas, the way porn sites tag videos ("big cock, hairy chest"). formats = only when he asks for a kind of post.
- person: find everything from one performer or creator. name = the stage name or username he gives.
- filter: change the feed without searching. formats, window, following, saved, only_new.
- kink_add: name (1 to 3 plain words) and tags. kink_remove: name. Only when he asks, or clearly says he is (or no longer is) into something for good.
- tags_like: show more of these tags. tags_less: show less. tags_block: never show again (a hard limit).
- fantasy_add: name, description, kinks (names of his kinks). fantasy_remove: name.
- memory_add: category and text, only for lasting facts about his taste that he states. memory_remove: text to forget.
- source_add: provider, mode (community, creator or search) and value. source_toggle: name of one of his sources and on (true or false). provider_toggle: provider and on.
- gender: male from 0 to 100 (100 means only men), auto, trans (allowed or not).
- open: view (feed, map, memory, settings).

Rules:
- Wanting to see something is a search, never memory. "videos about X" is a search for X with formats long, short and gif.
- Everyone is an adult. Never search for anything that suggests someone under 18; "teen" or "young" become "college".
- answer: one or two short plain sentences: what you did, or the answer to his question. Never use em dashes. ${replyIn()}
- He may write in French or English. Everything inside actions (terms, tags, kink names for new kinks, memory text) is always in English, because the sources and his tags are English. Only the answer follows his language.${lang() === 'fr' ? ' For a search, also add the French word for the main thing at the end of terms when there is a common one (for example "feet, pieds"), so French posts are found too.' : ''}
- When he names one of his kinks, fantasies or sources, use the exact name from the lists below.
- A question about himself ("what am I into lately?") is answered from the context below, with no actions.

His kinks: ${kinks.map((k) => `${k.name}${k.label && k.label !== k.name ? ` (${k.label})` : ''}${k.status === 'proposed' ? ' (suggested)' : ''}`).join(', ') || 'none yet'}
His fantasies: ${fans.map((f) => f.name).join(', ') || 'none yet'}
Tags he responds to most: ${tags.join(', ') || 'not known yet'}
Sources switched on: ${Object.keys(st).filter((k) => st[k].enabled).map((k) => PROVIDERS[k].label).join(', ')}
Some of his sources: ${follows.map((f) => f.label || f.value).join(', ') || 'none'}
Gender balance: ${g.auto ? 'automatic' : `${g.male}% men`}, trans ${g.trans ? 'allowed' : 'hidden'}
Memory:
${memoryForPrompt(20) || '- nothing yet'}

Examples:
"i want to see videos about the profile example" → {"answer":"Searching all your sources for videos about the profile example.","actions":[{"type":"search","terms":"profile example","formats":["long","short","gif"]}]}
"remove the jet ski kink and show me more hairy guys" → {"answer":"Removed Jet-Ski and showing more hairy men.","actions":[{"type":"kink_remove","name":"Jet-Ski"},{"type":"tags_like","tags":["hairy"]},{"type":"search","terms":"hairy men"}]}
"im looking for content from tobrinz" → {"answer":"Looking for tobrinz on every source.","actions":[{"type":"person","name":"tobrinz"}]}
"never show me feet again" → {"answer":"Feet are blocked for good.","actions":[{"type":"tags_block","tags":["feet","foot fetish"]}]}`;
}

function findKink(name) {
  const n = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const all = listKinks({ includeHidden: false });
  return all.find((k) => k.name.toLowerCase().replace(/[^a-z0-9]/g, '') === n || String(k.label || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '') === n) || all.find((k) => { const x = k.name.toLowerCase().replace(/[^a-z0-9]/g, ''); return n.length > 3 && (x.includes(n) || n.includes(x)); });
}

async function doAction(job, a, i) {
  const key = `a${i}`;
  const tags = (a.tags || []).map(normalizeTag).filter((t) => t && !safeTerm(t) && !/\b(teen|young|school)/.test(t));
  switch (a.type) {
    case 'search': {
      await termsSearch(job, a.terms || job.q, { presetFormats: a.formats?.length ? a.formats : null });
      return;
    }
    case 'person': {
      job.filter = { search: job.id, searchLabel: a.name };
      job.chips = [{ kind: 'person', text: a.name, value: a.name }];
      await personSearch(job, a.name || job.q);
      job.chips = chipsFor(job.spec);
      return;
    }
    case 'filter': {
      step(job, key, tr('Changing the feed'));
      const f = {};
      if (a.formats?.length) f.formats = a.formats;
      if (a.window && a.window !== 'mixed') f.window = a.window;
      if (a.following) f.following = true;
      if (a.saved) f.saved = true;
      if (a.only_new) f.onlyNew = true;
      job.client.push({ type: 'filter', filters: f });
      step(job, key, null, 'done');
      return;
    }
    case 'kink_add': {
      const nm = String(a.name || tags[0] || '').trim();
      step(job, key, tr('Adding the kink {name}', { name: nm }));
      if (!nm) return step(job, key, null, 'fail', tr('no name'));
      const ex = findKink(nm);
      if (ex) { updateKink(ex.id, { status: 'active' }); return step(job, key, null, 'done', tr('already there, marked as yours')); }
      createKink({ name: nm.slice(0, 40), tags: tags.length ? tags : [normalizeTag(nm)], origin: 'user', status: 'active' });
      job.client.push({ type: 'meta' });
      return step(job, key, null, 'done');
    }
    case 'kink_remove': {
      step(job, key, tr('Removing the kink {name}', { name: a.name }));
      const k = findKink(a.name);
      if (!k) return step(job, key, null, 'fail', tr('no kink with that name'));
      updateKink(k.id, { status: 'hidden' });
      job.client.push({ type: 'meta' });
      return step(job, key, null, 'done', k.label || k.name);
    }
    case 'tags_like': case 'tags_less': {
      step(job, key, a.type === 'tags_like' ? tr('Showing more {tags}', { tags: tags.join(', ') }) : tr('Showing less {tags}', { tags: tags.join(', ') }));
      if (!tags.length) return step(job, key, null, 'fail', tr('no tags'));
      boostTags(tags, a.type === 'tags_like' ? 1.5 : -1.5);
      job.client.push({ type: 'refresh' });
      return step(job, key, null, 'done');
    }
    case 'tags_block': {
      step(job, key, tr('Blocking {tags} for good', { tags: tags.join(', ') }));
      if (!tags.length) return step(job, key, null, 'fail', tr('no tags'));
      for (const t of tags) getDb().prepare('INSERT OR IGNORE INTO limits(tag, created) VALUES(?, ?)').run(t, now());
      const r = recheckBlocks();
      boostTags(tags, -2);
      addMemory({ category: 'Turn-offs and limits', content: tr('Never show {what}', { what: tags.join(', ') }), origin: 'user', status: 'active' });
      job.client.push({ type: 'refresh' });
      return step(job, key, null, 'done', r.blocked ? trn(r.blocked, '{n} post hidden', '{n} posts hidden') : null);
    }
    case 'fantasy_add': {
      step(job, key, tr('Saving the fantasy {name}', { name: a.name }));
      if (!a.name) return step(job, key, null, 'fail', tr('no name'));
      const ids = (a.kinks || []).map(findKink).filter(Boolean).map((k) => k.id);
      saveFantasy({ name: a.name.slice(0, 60), description: a.description || '', kinks: ids, saved: 1, origin: 'user' });
      job.client.push({ type: 'meta' });
      return step(job, key, null, 'done');
    }
    case 'fantasy_remove': {
      step(job, key, tr('Removing the fantasy {name}', { name: a.name }));
      const n = String(a.name || '').toLowerCase();
      const f = listFantasies().find((x) => x.name.toLowerCase() === n) || listFantasies().find((x) => n && x.name.toLowerCase().includes(n));
      if (!f) return step(job, key, null, 'fail', tr('not found'));
      deleteFantasy(f.id);
      job.client.push({ type: 'meta' });
      return step(job, key, null, 'done', f.name);
    }
    case 'memory_add': {
      step(job, key, tr('Saving to your memory'));
      if (!a.text) return step(job, key, null, 'fail', tr('nothing to save'));
      addMemory({ category: CATEGORIES.includes(a.category) ? a.category : 'Notes', content: a.text.slice(0, 300), origin: 'user', status: 'active' });
      return step(job, key, null, 'done', a.text.slice(0, 60));
    }
    case 'memory_remove': {
      step(job, key, tr('Removing from your memory'));
      const words = String(a.text || '').toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const m = listMemory({ status: 'active' }).map((x) => ({ x, hit: words.filter((w) => x.content.toLowerCase().includes(w)).length })).filter((y) => y.hit >= Math.max(1, Math.ceil(words.length / 2))).sort((p, q) => q.hit - p.hit)[0];
      if (!m) return step(job, key, null, 'fail', tr('no matching memory'));
      updateMemory(m.x.id, { status: 'archived' });
      return step(job, key, null, 'done', m.x.content.slice(0, 60));
    }
    case 'source_add': {
      const p = a.provider;
      const v = String(a.value || '').replace(/^\/?r\//i, '').replace(/^\/?u\//i, '').trim();
      step(job, key, tr('Adding {source}: {value}', { source: PROVIDERS[p]?.label || p, value: v }));
      if (!PROVIDERS[p] || !v) return step(job, key, null, 'fail', tr('unclear source'));
      const mode = a.mode || 'search';
      if (p === 'reddit' && mode === 'community') follow('subreddit', v, { label: `r/${v}` });
      else if (p === 'reddit' && mode === 'creator') follow('reddit_user', v, { label: `u/${v}` });
      else follow(mode, `${p}|${v}`, { label: `${PROVIDERS[p].label}: ${v}` });
      job.client.push({ type: 'fetch' });
      return step(job, key, null, 'done');
    }
    case 'source_toggle': {
      step(job, key, a.on === false ? tr('Pausing {name}', { name: a.name }) : tr('Switching on {name}', { name: a.name }));
      const n = String(a.name || '').toLowerCase();
      const f = listFollows().find((x) => `${x.label || ''} ${x.value}`.toLowerCase().includes(n));
      if (!f) return step(job, key, null, 'fail', tr('no source with that name'));
      getDb().prepare('UPDATE follows SET active = ?, dormant_since = NULL WHERE id = ?').run(a.on === false ? 0 : 1, f.id);
      return step(job, key, null, 'done', f.label || f.value);
    }
    case 'provider_toggle': {
      step(job, key, a.on === false ? tr('Switching off {name}', { name: PROVIDERS[a.provider]?.label || a.provider }) : tr('Switching on {name}', { name: PROVIDERS[a.provider]?.label || a.provider }));
      if (!PROVIDERS[a.provider]) return step(job, key, null, 'fail', tr('unknown source'));
      setProvider(a.provider, { enabled: a.on !== false });
      invalidatePool();
      job.client.push({ type: 'refresh' });
      return step(job, key, null, 'done');
    }
    case 'gender': {
      step(job, key, tr('Changing the gender balance'));
      const patch = {};
      if (Number.isFinite(a.male)) patch.male = a.male;
      if (typeof a.auto === 'boolean') patch.auto = a.auto;
      if (typeof a.trans === 'boolean') patch.trans = a.trans;
      setGenderPrefs(patch);
      invalidatePool();
      job.client.push({ type: 'gender' }, { type: 'refresh' });
      return step(job, key, null, 'done');
    }
    case 'open': {
      job.client.push({ type: 'open', view: a.view || 'feed' });
      return null;
    }
    default: return null;
  }
}

// One clear command ("stop showing me anime", "remember I like slow builds", "follow X") is done right away by
// the rules; anything with more than one request, or anything unclear, goes to the model.
function quickCommand(q) {
  if (/\b(and|also|then|plus|but)\b|[,;]/i.test(q)) return false;
  const r = rulesParse(q, null);
  return !!r && r.actions.length === 1 && !['filter', 'open', 'journey', 'like', 'into_now'].includes(r.actions[0].type);
}

async function agentSearch(job, q, deep) {
  if (!deep && quickCommand(q)) {
    step(job, 'think', tr('Doing it right away'));
    const r = await runCommand(q, { sessionId: job.sessionId });
    step(job, 'think', null, 'done');
    job.answer = r.reply;
    job.client.push(...(r.client || []));
    return;
  }
  const model = deep ? activeModel() : deepModel();
  step(job, 'think', deep ? tr('Thinking it through with the big model') : tr('Thinking'));
  let out = null;
  try {
    out = await chat({ kind: 'search-agent', model, schema: AGENT_SCHEMA, temperature: 0.2, numPredict: deep ? 2500 : 700, think: !!deep, system: agentSystem(), user: q });
  } catch (err) {
    step(job, 'think', null, 'fail', tr('the local model did not answer'));
  }
  if (!out) {
    // Without the model the old rules still handle clear commands; everything else becomes a plain search.
    const r = await runCommand(q, { sessionId: job.sessionId }).catch(() => null);
    const filt = (r?.client || []).find((c) => c.type === 'filter');
    if (r && r.engine === 'rules' && !(filt && (filt.filters?.q || filt.filters?.tags))) {
      job.answer = r.reply;
      job.client.push(...(r.client || []));
      return;
    }
    await termsSearch(job, q);
    job.answer = null;
    return;
  }
  step(job, 'think', null, 'done');
  job.answer = String(out.answer || '').replace(/\s*[—–]\s*/g, ', ').trim() || null;
  const actions = (out.actions || []).filter((a) => ACTIONS.includes(a.type)).slice(0, 8);
  // Changes first, the searches last, so the feed shows results with the changes already made.
  const order = (a) => (a.type === 'search' || a.type === 'person' ? 1 : 0);
  let searched = false;
  for (const [i, a] of actions.sort((x, y) => order(x) - order(y)).entries()) {
    if ((a.type === 'search' || a.type === 'person') && searched) continue;
    try { await doAction(job, a, i); } catch (err) { step(job, `a${i}`, a.type, 'fail', err.message.slice(0, 80)); }
    if (a.type === 'search' || a.type === 'person') searched = true;
  }
  // The answer never claims something that did not work.
  const failed = job.steps.filter((x) => /^a\d+$/.test(x.key) && x.state === 'fail');
  if (failed.length) job.answer = `${job.answer ? `${job.answer} ` : ''}${tr('Not done: {list}.', { list: failed.map((x) => `${x.label.charAt(0).toLowerCase()}${x.label.slice(1)} (${x.detail})`).join('; ') })}`;
}

// ---------- Jobs ----------

// A bare name ("tobinz", "Drew Sebastian"): a known performer, or one word that is no tag anyone uses.
function looksLikePerson(text) {
  const n = normalizeTag(text);
  if (!n || n.split(' ').length > 3 || isNatural(text) || MINOR_TEST.test(n)) return false;
  const row = getDb().prepare('SELECT kind FROM tags WHERE name = ?').get(n);
  if (row) return row.kind === 'performer';
  ensureStarsTable();
  if (getDb().prepare('SELECT 1 FROM performers WHERE name = ?').get(n)) return true;
  return n.split(' ').length === 1 && n.length >= 4 && !lexicon().has(n) && !WOMEN.has(n) && !MEN.has(n) && !GAY.has(n) && !LES.has(n) && !BOTH.has(n) && !TRANS.has(n) && !NOISE.has(n);
}

// ---------- Only some sources ----------

// "only bluesky", "show me content from bluesky and reddit", "bluesky, reddit", "seulement reddit".
const SOURCE_ALIASES = {
  redgifs: ['redgifs', 'red gifs', 'redgif'], pornhub: ['pornhub', 'porn hub'], redtube: ['redtube', 'red tube'], eporner: ['eporner'],
  lemmy: ['lemmy'], bluesky: ['bluesky', 'blue sky', 'bsky'], rule34: ['rule34', 'rule 34', 'r34'], gelbooru: ['gelbooru'],
  xvideos: ['xvideos', 'x videos'], xnxx: ['xnxx'], xhamster: ['xhamster', 'x hamster'], youporn: ['youporn', 'you porn'], txxx: ['txxx'],
  reddit: ['reddit', 'subreddits']
};
const SOURCE_FILLER = new Set(['show', 'me', 'only', 'just', 'content', 'contents', 'posts', 'post', 'stuff', 'from', 'on', 'of', 'the', 'give', 'i', 'want', 'to', 'see', 'display', 'everything', 'all', 'and', 'or', 'plus', 'with', 'in', 'feed', 'my', 'source', 'sources', 'site', 'sites', 'please',
  'montre', 'montre-moi', 'moi', 'seulement', 'uniquement', 'que', 'du', 'de', 'des', 'd', 'le', 'la', 'les', 'contenu', 'publications', 'publication', 'sur', 'en', 'provenance', 'venant', 'juste', 'et', 'ou', 'tout', 'affiche', 'mon', 'fil', 'je', 'veux', 'voir', 'sites']);

export function sourcesIn(text) {
  let s = ` ${String(text || '').toLowerCase().replace(/[,;/&+|]/g, ' , ')} `;
  const ids = [];
  for (const [id, names] of Object.entries(SOURCE_ALIASES)) {
    for (const n of names.sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`(^|[\\s,])${n.replace(/ /g, '\\s+')}(?=[\\s,]|$)`, 'g');
      if (re.test(s)) { if (!ids.includes(id)) ids.push(id); s = s.replace(re, '$1 '); }
    }
  }
  if (!ids.length) return null;
  const rest = s.split(/[\s,]+/).filter(Boolean).filter((w) => !SOURCE_FILLER.has(w.replace(/[’']/g, '')) && !/^[.!?:]+$/.test(w)).join(' ').trim();
  return { ids, rest };
}

const sourceLabels = (ids) => ids.map((id) => PROVIDERS[id]?.label || id);

export function startSearch({ q, deep = false, sessionId = null }) {
  pruneJobs();
  const text = String(q || '').trim().slice(0, 400);
  const job = {
    id: newId(), q: text, deep: !!deep, sessionId, at: now(), rev: 0, steps: [], answer: null, notes: [], chips: [], person: null, filter: null,
    client: [], sources: [], profiles: [], found: 0, added: 0, done: false, error: null, mode: 'terms',
    spec: { concepts: [], gender: null, trans: null, formats: [], people: [], fetched: new Set(), weak: new Set() }
  };
  JOBS.set(job.id, job);
  // A search can name the sources it is about; the rest of what was typed is searched only there.
  const src = sourcesIn(text);
  const query = src ? src.rest : text;
  if (src) job.spec.sources = src.ids;
  (async () => {
    try {
      if (src && !query) {
        job.mode = 'sources';
        const list = sourceLabels(src.ids).join(', ');
        step(job, 'sources', tr('Only posts from {list}', { list }), 'done');
        job.filter = { sources: src.ids, sourcesLabel: list };
        job.chips = chipsFor(job.spec);
        job.answer = tr('Showing only posts from {list} for now. Remove it above to see all your sources again.', { list });
        const off = src.ids.filter((id) => !providerState()[id]?.enabled);
        if (off.length) job.notes.push(tr('{list} is switched off in Settings: you see what was already fetched from it.', { list: sourceLabels(off).join(', ') }));
        return;
      }
      const text = query;
      const who = personIn(text) || (looksLikePerson(text) ? text.trim() : null);
      if (who) { job.mode = 'person'; job.filter = { search: job.id, searchLabel: who }; job.chips = [{ kind: 'person', text: who, value: who }]; await personSearch(job, who); job.chips = chipsFor(job.spec); }
      else if (isNatural(text) || deep) { job.mode = 'assistant'; await agentSearch(job, text, deep); }
      else await termsSearch(job, text);
      if (job.filter && !job.answer) job.answer = summaryFor(job);
      applyEvent({ itemId: null, type: 'search', value: null, sessionId });
      // Only what was searched for (the tags or the name), never the whole sentence: these feed the automatic source searches.
      const terms = job.person ? [job.person.display] : job.spec.concepts.filter((c) => c.name !== YOUNG.name).map((c) => c.name).slice(0, 3);
      const recent = (getSetting('recentSearches', []) || []).filter((x) => !terms.includes(x.q) && x.q.split(' ').length <= 4);
      if (terms.length) setSetting('recentSearches', [...terms.map((q) => ({ q, at: now() })), ...recent].slice(0, 15));
      try { logPrompt({ text, kind: job.mode === 'assistant' ? 'command' : 'search', result: job.answer }); } catch {}
    } catch (err) {
      job.error = err.message;
      log('warn', `Search failed: ${err.message}`);
    } finally {
      job.done = true;
      job.rev++;
    }
  })();
  return job.id;
}

function summaryFor(job) {
  const s = job.spec;
  if (job.person && !job.found) {
    const skipped = job.steps.some((x) => x.state === 'skip');
    return `${tr('Nothing from {name} turned up: no RedGIFs or Bluesky profile under that name and no videos on the tube sites{more}.', { name: job.person.display, more: skipped ? tr(', and Reddit was rate limiting, so try again in a few minutes') : '' })}${webKey() ? '' : ` ${tr('With a web search key in Settings I can also find the other usernames they use.')}`}`;
  }
  const what = job.person ? job.person.display : [s.gender && { women: tr('women'), men: tr('men'), both: tr('men and women'), 'women-only': tr('only women'), 'men-only': tr('only men') }[s.gender], ...s.concepts.map((c) => c.label || c.name)].filter(Boolean).join(', ');
  const failed = job.steps.filter((x) => x.state === 'fail' && !['split', 'local', 'who', 'think'].includes(x.key) && !/^a\d+$/.test(x.key)).length;
  const head = what ? tr('Showing {what}', { what }) : tr('Showing your search');
  return `${tr('{head}: {posts} from your sources{added}, plus what already matched.', { head, posts: trn(job.found, '{n} post', '{n} posts'), added: job.added ? tr(', {n} of them new here', { n: job.added }) : '' })}${failed ? ` ${trn(failed, '{n} source did not answer.', '{n} sources did not answer.')}` : ''}${job.notes.length ? ` ${job.notes.join(' ')}` : ''}`;
}

export function jobView(id) {
  const j = JOBS.get(String(id));
  if (!j) return null;
  return {
    id: j.id, q: j.q, mode: j.mode, rev: j.rev, done: j.done, error: j.error, answer: j.answer, notes: j.notes, chips: j.chips, person: j.person,
    filter: j.filter ? { ...j.filter, ...(j.spec.sources?.length ? { sources: j.spec.sources, sourcesLabel: sourceLabels(j.spec.sources).join(', ') } : {}) } : null, client: j.client, sources: j.sources, profiles: j.profiles, found: j.found, added: j.added, steps: j.steps.map((s) => ({ key: s.key, label: s.label, state: s.state, detail: s.detail }))
  };
}

// Taking a chip away (or putting it back) changes what the search matches, without searching again.
export function editChip(id, { kind, value, remove = true }) {
  const j = JOBS.get(String(id));
  if (!j) return null;
  const s = j.spec;
  if (kind === 'gender' && remove) s.gender = null;
  if (kind === 'tag' && remove) s.concepts = s.concepts.filter((c) => c.name !== value);
  if (kind === 'syn' && remove) for (const c of s.concepts) c.syn = c.syn.filter((x) => x !== value);
  if (kind === 'person' && remove) s.people = s.people.filter((p) => p !== value);
  if (kind === 'format' && remove) s.formats = (s.formats || []).filter((f) => f !== value);
  if (kind === 'source' && remove) { s.sources = (s.sources || []).filter((x) => x !== value); if (j.filter?.sources) j.filter = { ...j.filter, sources: s.sources }; }
  j.chips = chipsFor(s);
  j.rev++;
  return jobView(id);
}

export async function searchMore(id) {
  const j = JOBS.get(String(id));
  if (!j || !j.done) return jobView(id);
  j.done = false;
  j.page = (j.page || 1) + 1;
  (async () => {
    try {
      if (j.person && !j.spec.concepts.length) await searchProviders(j, [j.person.display, ...j.spec.people.slice(1, 2)], { page: j.page });
      else await searchProviders(j, remoteTerms(j.spec), { page: j.page });
    } catch (err) { j.error = err.message; } finally { j.done = true; j.rev++; }
  })();
  return jobView(id);
}

// A search result you liked, saved or heated keeps its search as a resting source: it can wake up later
// when it fits what you are into, instead of every search becoming a source right away.
export function keepSearchSource(itemId) {
  const row = getDb().prepare('SELECT via FROM items WHERE id = ?').get(itemId);
  const m = String(row?.via || '').match(/^q:([a-z0-9]+)\|(.+)$/);
  if (!m || !PROVIDERS[m[1]]) return false;
  const [, provider, term] = m;
  const value = `${provider}|${term}`;
  const kind = 'search';
  const existing = getDb().prepare('SELECT id, active FROM follows WHERE kind = ? AND value = ?').get(kind, value);
  if (existing) return false;
  follow(kind, value, { label: `${PROVIDERS[provider].label}: ${term}`, synced: 'auto', active: 0 });
  getDb().prepare('UPDATE follows SET dormant_since = ?, topic = ?, why = ? WHERE kind = ? AND value = ?').run(now(), term, tr('You liked a result of your search for "{term}"', { term }), kind, value);
  return true;
}
