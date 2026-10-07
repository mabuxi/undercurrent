import { getDb, normalizeTag } from '../db.js';
import { performerNames } from '../sources/stars.js';
import { namesIn, handlesIn, cleanPersonName } from '../names.js';
import { detectLang } from '../langdetect.js';
import { frenchTagsIn } from '../vocab.js';

const STOP = new Set([
  'hd', 'porn', 'sex', 'video', 'videos', 'xxx', 'free', 'new', 'full', 'best', 'hot', 'sexy', 'the', 'and', 'with', 'for', 'her', 'his', 'she', 'he',
  'my', 'me', 'you', 'your', 'this', 'that', 'on', 'in', 'of', 'to', 'a', 'an', 'is', 'it', 'at', 'by', 'from', 'get', 'gets', 'got', 'girl', 'girls',
  'guy', 'man', 'woman', 'women', 'men', 'part', 'scene', 'clip', 'movie', 'film', 'watch', 'online', 'porno', 'pornhub', 'redtube', 'eporner',
  'verified', 'models', 'model', 'exclusive', 'premium', '4k', '1080p', '60fps', 'vr', 'hot girl', 'first', 'time', 'day', 'night', 'f', 'm', 'oc',
  'fucked', 'fucks', 'fuck', 'fucking', 'hard', 'good', 'big', 'little', 'small', 'young', 'old', 'real', 'love', 'like', 'want', 'more', 'again'
]);

const SYNONYMS = {
  bj: 'blowjob', 'blow job': 'blowjob', bbc: 'big black cock', pov: 'pov', 'point of view': 'pov', milf: 'milf', cim: 'cum in mouth',
  'cream pie': 'creampie', creampie: 'creampie', 'hand job': 'handjob', handjob: 'handjob', 'foot job': 'footjob', footjob: 'footjob',
  'titty fuck': 'titfuck', titjob: 'titfuck', 'tit job': 'titfuck', 'reverse cowgirl': 'reverse cowgirl', cowgirl: 'cowgirl', doggy: 'doggystyle',
  'doggy style': 'doggystyle', doggystyle: 'doggystyle', anal: 'anal', dp: 'double penetration', 'double penetration': 'double penetration',
  'face fuck': 'facefuck', facefuck: 'facefuck', deepthroat: 'deepthroat', 'deep throat': 'deepthroat', squirt: 'squirting', squirting: 'squirting',
  facial: 'facial', cumshot: 'cumshot', 'cum shot': 'cumshot', riding: 'riding', rides: 'riding', ride: 'riding', massage: 'massage', oiled: 'oil',
  oily: 'oil', oil: 'oil', lingerie: 'lingerie', stockings: 'stockings', heels: 'high heels', 'high heels': 'high heels', latex: 'latex',
  redhead: 'redhead', ginger: 'redhead', blonde: 'blonde', brunette: 'brunette', busty: 'big tits', 'big tits': 'big tits', 'big boobs': 'big tits',
  'huge tits': 'huge tits', 'small tits': 'small tits', petite: 'petite', curvy: 'curvy', thick: 'thick', pawg: 'pawg', 'big ass': 'big ass',
  asian: 'asian', latina: 'latina', ebony: 'ebony', teen: null, teens: null, schoolgirl: null, 'step sister': 'step fantasy', stepsister: 'step fantasy',
  'step mom': 'step fantasy', stepmom: 'step fantasy', 'step bro': 'step fantasy', stepbro: 'step fantasy', 'step dad': 'step fantasy',
  stepdad: 'step fantasy', 'step son': 'step fantasy', stepson: 'step fantasy', threesome: 'threesome', ffm: 'threesome ffm', mmf: 'threesome mmf',
  orgy: 'orgy', gangbang: 'gangbang', lesbian: 'lesbian', lesbians: 'lesbian', solo: 'solo', masturbation: 'masturbation', masturbating: 'masturbation',
  fingering: 'fingering', toy: 'toys', toys: 'toys', dildo: 'dildo', vibrator: 'vibrator', 'hitachi': 'vibrator', joi: 'jerk off instruction',
  'jerk off instruction': 'jerk off instruction', femdom: 'femdom', bondage: 'bondage', bdsm: 'bdsm', choking: 'choking', spanking: 'spanking',
  rough: 'rough', sensual: 'sensual', romantic: 'romantic', passionate: 'passionate', outdoor: 'outdoor', outdoors: 'outdoor', public: 'public',
  shower: 'shower', bathroom: 'bathroom', kitchen: 'kitchen', car: 'car', office: 'office', hotel: 'hotel', beach: 'beach', pool: 'pool', gym: 'gym',
  yoga: 'yoga', cosplay: 'cosplay', roleplay: 'roleplay', 'role play': 'roleplay', nurse: 'nurse', maid: 'maid', teacher: 'teacher roleplay',
  boss: 'boss roleplay', amateur: 'amateur', homemade: 'homemade', couple: 'couple', couples: 'couple', 'real couple': 'real couple',
  cuckold: 'cuckold', hotwife: 'hotwife', swinger: 'swingers', swingers: 'swingers', interracial: 'interracial', casting: 'casting',
  'first time': null, virgin: null, tease: 'teasing', teasing: 'teasing', striptease: 'striptease', strip: 'striptease', dancing: 'dancing',
  twerk: 'twerking', twerking: 'twerking', 'dirty talk': 'dirty talk', moaning: 'moaning', orgasm: 'orgasm', orgasms: 'orgasm', 'multiple orgasms': 'multiple orgasms',
  edging: 'edging', ruined: 'ruined orgasm', 'ruined orgasm': 'ruined orgasm', feet: 'feet', foot: 'feet', pantyhose: 'pantyhose', nylon: 'pantyhose',
  tattoo: 'tattoos', tattooed: 'tattoos', tattoos: 'tattoos', piercing: 'piercings', pierced: 'piercings', glasses: 'glasses', hairy: 'hairy',
  shaved: 'shaved', bbw: 'bbw', mature: 'mature', granny: null, pregnant: 'pregnant', lactating: 'lactating', 'tan lines': 'tan lines',
  'yoga pants': 'yoga pants', leggings: 'leggings', skirt: 'skirt', 'mini skirt': 'skirt', bikini: 'bikini', uniform: 'uniform', 'fishnet': 'fishnets',
  fishnets: 'fishnets', corset: 'corset', 'thigh highs': 'thigh highs', 'booty': 'big ass', 'bubble butt': 'big ass', webcam: 'webcam', cam: 'webcam',
  hentai: 'hentai', animated: 'animated', '3d': '3d animation', futanari: 'futanari', trans: 'trans', transgender: 'trans', gay: 'gay', bisexual: 'bisexual',
  compilation: 'compilation', pmv: 'pmv', hypno: 'hypno', asmr: 'asmr', 'slow motion': 'slow motion', closeup: 'close up', 'close up': 'close up',
  missionary: 'missionary', 'standing sex': 'standing', 'spooning': 'spooning', '69': 'sixty nine', sixtynine: 'sixty nine', rimming: 'rimming',
  'ass to mouth': 'ass to mouth', atm: 'ass to mouth', swallow: 'swallowing', swallowing: 'swallowing', 'cum swallow': 'swallowing',
  'cum on tits': 'cum on tits', 'cum on face': 'facial', bukkake: 'bukkake', pegging: 'pegging', strapon: 'strapon', 'strap on': 'strapon',
  sloppy: 'sloppy', gagging: 'gagging', 'eye contact': 'eye contact', 'girlfriend experience': 'girlfriend experience', gfe: 'girlfriend experience',
  'morning sex': 'morning sex', 'lazy sunday': 'lazy morning', 'wake up': 'wake up sex', sleepover: 'sleepover', vacation: 'vacation', 'road trip': 'road trip'
};

let cache = { at: 0, phrases: new Map(), performers: new Map(), maxLen: 4 };

function tokens(text) {
  return String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9']+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

export function lexicon(force = false) {
  if (!force && Date.now() - cache.at < 10 * 60000 && cache.phrases.size) return cache;
  const db = getDb();
  const phrases = new Map();
  for (const [k, v] of Object.entries(SYNONYMS)) phrases.set(tokens(k).join(' '), v);
  const rows = db.prepare(`SELECT t.name, t.kind, COUNT(*) c FROM item_tags it JOIN tags t ON t.id = it.tag_id
    WHERE it.origin IN ('source','ai','user') GROUP BY t.id HAVING c >= 2 ORDER BY c DESC LIMIT 4000`).all();
  const performers = new Map();
  for (const r of rows) {
    const key = tokens(r.name).join(' ');
    if (!key || key.length < 3 || key.length > 40 || /^\d+$/.test(key)) continue;
    if (r.kind === 'performer') {
      if (key.split(' ').length >= 2) performers.set(key, r.name);
      continue;
    }
    if (STOP.has(key) || phrases.has(key)) continue;
    phrases.set(key, r.name);
  }
  const perfRows = db.prepare("SELECT name FROM tags WHERE kind = 'performer'").all();
  for (const r of perfRows) {
    const key = tokens(r.name).join(' ');
    if (key.split(' ').length >= 2 && key.length >= 6) performers.set(key, r.name);
  }
  try {
    for (const r of performerNames(8)) {
      const key = tokens(r.name).join(' ');
      if (key.split(' ').length >= 2 && key.length >= 6 && !phrases.has(key)) performers.set(key, r.display || r.name);
    }
  } catch {}
  cache = { at: Date.now(), phrases, performers, maxLen: 4 };
  return cache;
}

// Usernames and performer names already seen here (authors of posts, names set on posts).
let known = { at: 0, set: new Set() };
function knownHandle(w) {
  if (Date.now() - known.at > 10 * 60000) {
    const db = getDb();
    const set = new Set(db.prepare("SELECT DISTINCT lower(author) a FROM items WHERE author IS NOT NULL AND length(author) >= 3").all().map((r) => r.a));
    for (const r of db.prepare("SELECT name FROM tags WHERE kind = 'performer' AND name NOT LIKE '% %'").all()) set.add(r.name);
    known = { at: Date.now(), set };
  }
  return known.set.has(w);
}

// Hashtags (#BigBalls, #hairy_chest, #gayforpay): split into words so they match known tags, and kept as tags of
// their own when they are real words. Noise tags people add to everything are left out.
const HASH_NOISE = new Set(['fyp', 'foryou', 'for you', 'foryoupage', 'viral', 'trending', 'explore', 'onlyfans', 'of', 'fansly', 'link in bio', 'nsfw',
  'nsfw content', 'porn', 'xxx', 'sex', 'hot', 'sexy', 'new', 'follow', 'follow me', 'like', 'likes', 'subscribe', 'dm', 'dm me', 'content', 'creator',
  'model', 'onlyfans model', 'reddit', 'bluesky', 'adult', 'adult content', 'eighteen plus', 'free', 'promo', 'link', 'bio', 'repost', 'tbt', 'ootd']);
export function hashtagsIn(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/(?:^|[^\p{L}\p{N}&/])#([\p{L}][\p{L}\p{N}_]{1,40})/gu)) {
    const words = m[1].replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/(\p{L})(\d)/gu, '$1 $2').toLowerCase().trim().replace(/\s+/g, ' ');
    if (!words || words.length < 3 || /^\d/.test(words) || words.split(' ').length > 4) continue;
    if (HASH_NOISE.has(words) || HASH_NOISE.has(words.replace(/ /g, '')) || STOP.has(words) || /\d{2,}/.test(words)) continue;
    if (!out.includes(words)) out.push(words);
  }
  return out;
}

export function extractFromText(title, body = '') {
  const lex = lexicon();
  const hashes = hashtagsIn(`${title || ''}\n${String(body || '').slice(0, 1500)}`);
  const toks = tokens(`${title || ''} ${String(body || '').slice(0, 1500)} ${hashes.join(' . ')}`);
  const tags = new Map();
  const people = new Set();
  const used = new Set();
  for (let n = lex.maxLen; n >= 1; n--) {
    for (let i = 0; i + n <= toks.length; i++) {
      if (n === 1 && used.has(i)) continue;
      const gram = toks.slice(i, i + n).join(' ');
      if (n >= 2 && lex.performers.has(gram)) {
        people.add(lex.performers.get(gram));
        for (let k = i; k < i + n; k++) used.add(k);
        continue;
      }
      let hit = lex.phrases.get(gram);
      if (hit === undefined && n === 1 && gram.length > 4 && gram.endsWith('s')) hit = lex.phrases.get(gram.slice(0, -1));
      if (hit === undefined || hit === null) continue;
      if (n === 1 && STOP.has(gram)) continue;
      const name = normalizeTag(hit);
      if (!name) continue;
      tags.set(name, Math.max(tags.get(name) || 0, n > 1 ? 0.55 : 0.45));
      if (n > 1) for (let k = i; k < i + n; k++) used.add(k);
    }
  }
  // A hashtag nobody has used here yet still says what the post is about, a little less surely than a known tag.
  for (const h of hashes) {
    const hit = lex.phrases.get(h) ?? lex.phrases.get(h.replace(/ /g, ''));
    const name = normalizeTag(hit || h);
    if (name && !tags.has(name) && !(h.split(' ').length === 1 && h.length < 4)) tags.set(name, hit ? 0.55 : 0.5);
  }
  // A French title or text gives the same English tags as an English one would.
  const text = `${title || ''} ${String(body || '').slice(0, 1500)}`;
  if (detectLang(text, { min: 2 }) === 'fr') for (const tag of frenchTagsIn(text)) { const name = normalizeTag(tag); if (name && !tags.has(name)) tags.set(name, 0.45); }
  // Names written out in the title or text ("Drew Sebastian", "PIERCE PARIS") that are not on the performer list yet.
  for (const n of namesIn(`${title || ''}\n${String(body || '').slice(0, 1500)}`)) if (![...people].some((p) => cleanPersonName(p) === n)) people.add(n.replace(/(^|\s)\S/g, (m) => m.toUpperCase()));
  for (const h of handlesIn(`${title || ''}\n${String(body || '').slice(0, 600)}`, { isWord: (w) => lex.phrases.has(w) || STOP.has(w), isKnown: (w) => lex.performers.has(w) || knownHandle(w) })) if (![...people].some((p) => p.toLowerCase() === h.toLowerCase())) people.add(h);
  return { tags: [...tags].map(([name, weight]) => ({ name, weight })), performers: [...people] };
}

export function extractInto(itemId, addTags) {
  const db = getDb();
  const row = db.prepare('SELECT title, body, format FROM items WHERE id = ?').get(itemId);
  if (!row) return { tags: [], performers: [] };
  const r = extractFromText(row.title, row.format === 'story' || row.format === 'discussion' ? row.body.slice(0, 800) : row.body);
  if (r.tags.length) addTags(itemId, r.tags, 'title');
  if (r.performers.length) addTags(itemId, r.performers.map((p) => ({ name: p, kind: 'performer', weight: 0.55 })), 'title');
  return r;
}

export async function backfillExtraction(addTags, { version = 3 } = {}) {
  const db = getDb();
  const done = Number(db.prepare("SELECT value FROM settings WHERE key = 'extractVersion'").get()?.value || 0);
  if (done >= version) return 0;
  lexicon(true);
  const ids = db.prepare('SELECT id FROM items WHERE blocked = 0').all().map((r) => r.id);
  let n = 0;
  for (let i = 0; i < ids.length; i += 200) {
    db.transaction(() => { for (const id of ids.slice(i, i + 200)) { extractInto(id, addTags); n++; } })();
    await new Promise((r) => setImmediate(r));
  }
  db.prepare("INSERT INTO settings(key, value) VALUES('extractVersion', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(version));
  return n;
}
