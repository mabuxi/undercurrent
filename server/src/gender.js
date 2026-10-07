import { getDb, getSetting, setSetting, now } from './db.js';
import { engagement } from './profile.js';

// Who is in a post: men, women, trans people. The AI fills this in when it tags a post; until then a quick guess
// from the title and tags stands in. The balance slider then shapes the whole site around it.

const F = /\b(women|woman|girls?|gf|girlfriend|wife|wifey|milfs?|mom|mommy|mother|stepmom|stepsis(?:ter)?|sister|her|she|hers|lesbians?|sapphic|pussy|pussies|clit|vagina|labia|tits|titties|boobs|breasts|busty|nipples?|bikini|lingerie|bra|panties|thong|skirt|dress|heels|ladies|lady|babe|chick|goddess|queen|latina|asian girl|redhead girl|blonde|brunette|curvy|pawg|bbw|thick girl|ahegao|squirt(?:ing)?|femdom|she-?male)\b/i;
const M = /\b(men|man|guys?|dudes?|boyfriend|bf|husband|hubby|daddy|dad|stepdad|stepbro(?:ther)?|brother|his|he|him|gay|twinks?|bears?|otters?|jocks?|hunks?|str8|bro|bros|beard(?:ed)?|muscle (?:man|guy)|daddies|femboy|sissy)\b/i;
// Words that say a man is there, but not that he is alone (straight porn uses them all the time).
const M_PART = /\b(cock|cocks|dick|dicks|penis|foreskin|uncut|balls|testicles|bulge|precum|cum(?:shot)?|jerk(?:ing)? off|stroking|blowjob|bj|handjob|creampie|facial)\b/i;
const SOLO_F = /\b(solo|selfie|masturbat\w*|fingering|toy|dildo|vibrator|posing|nudes?|gonewild|gw|onlyfans|of)\b/i;
const GAY = /\b(gay|twinks?|m4m|men on men|bareback(?:ing)? (?:twinks?|men)|bear(?:s)? fuck|mm|\[mm\]|\(mm\)|bromance|frot|docking)\b/i;
const LES = /\b(lesbians?|sapphic|girl on girl|ff|\[ff\]|\(ff\)|scissoring|tribbing)\b/i;
const TRANS = /\b(trans(?:gender)?|tgirls?|tgirl|ts|t-girl|shemale|she-male|ladyboy|futa(?:nari)?|femboy|trans (?:woman|man|girl|guy)|mtf|ftm)\b/i;
const TAG_F = /\[(?:\d+\s*)?f(?:\d+)?\]|\((?:\d+\s*)?f(?:\d+)?\)|\b\d{2}\s?f\b|\bf\d{2}\b|\bf4[mf]\b|\b[mf]4f\b/i;
const TAG_M = /\[(?:\d+\s*)?m(?:\d+)?\]|\((?:\d+\s*)?m(?:\d+)?\)|\b\d{2}\s?m\b|\bm\d{2}\b|\bm4[mf]\b|\b[mf]4m\b/i;
const MIX = /\[mf\]|\(mf\)|\[fm\]|\(fm\)|\bm\/f\b|\bf\/m\b|\bcouples?\b|\bthreesome\b|\bmfm\b|\bffm\b|\bgangbang\b|\bhetero\b|\bstraight\b/i;

// A guess from words only. When the words do not settle it, the unknown side stays null (not 0), so an extreme
// balance setting does not trust it; the quick look at the image settles it later.
export function guessGender(text) {
  const t = String(text || '').toLowerCase();
  const trans = TRANS.test(t);
  const gay = GAY.test(t);
  const les = LES.test(t);
  const f = F.test(t) || TAG_F.test(t);
  const m = M.test(t) || TAG_M.test(t);
  const part = M_PART.test(t);
  const mix = MIX.test(t);
  if (gay && !f) return { men: 2, women: 0, trans };
  if (les && !m && !part) return { men: 0, women: 2, trans };
  if (mix || (f && (m || part))) return { men: 1, women: 1, trans };
  if (f) return { men: SOLO_F.test(t) ? 0 : null, women: 1, trans };
  if (m) return { men: 1, women: null, trans };
  if (part) return { men: 1, women: null, trans };
  return trans ? { men: null, women: null, trans } : null;
}

export function ensureGenderSchema() {
  const db = getDb();
  const cols = db.prepare('PRAGMA table_info(items)').all().map((c) => c.name);
  if (!cols.includes('g_men')) db.exec('ALTER TABLE items ADD COLUMN g_men INTEGER');
  if (!cols.includes('g_women')) db.exec('ALTER TABLE items ADD COLUMN g_women INTEGER');
  if (!cols.includes('g_trans')) db.exec('ALTER TABLE items ADD COLUMN g_trans INTEGER');
  if (!cols.includes('g_src')) db.exec('ALTER TABLE items ADD COLUMN g_src TEXT');
}

const RANK = { none: 0, guess: 1, ai: 2, vision: 3 };
// A better source of truth replaces a weaker one: what the image shows beats the AI reading text, which beats a guess.
export function setGender(id, g, src = 'ai') {
  if (!g) return;
  const cur = getDb().prepare('SELECT g_src FROM items WHERE id = ?').get(id);
  if (cur && (RANK[cur.g_src] || 0) > (RANK[src] || 0)) return;
  getDb().prepare('UPDATE items SET g_men = ?, g_women = ?, g_trans = ?, g_src = ? WHERE id = ?').run(g.men ?? null, g.women ?? null, g.trans ? 1 : 0, src, id);
}

// Guesses for every post the AI has not looked at yet (title, text and tags).
export function backfillGender(limit = 20000) {
  ensureGenderSchema();
  const db = getDb();
  const rows = db.prepare("SELECT id, title, body, source_tags FROM items WHERE g_src IS NULL ORDER BY id DESC LIMIT ?").all(limit);
  const tagQ = db.prepare('SELECT t.name FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = ? AND it.weight >= 0.4');
  const upd = db.prepare("UPDATE items SET g_men = ?, g_women = ?, g_trans = ?, g_src = 'guess' WHERE id = ?");
  const none = db.prepare("UPDATE items SET g_src = 'none' WHERE id = ?");
  let n = 0;
  db.transaction(() => {
    for (const r of rows) {
      const g = guessGender(`${r.title} ${String(r.body || '').slice(0, 600)} ${r.source_tags || ''} ${tagQ.all(r.id).map((x) => x.name).join(', ')}`);
      if (g) { upd.run(g.men, g.women, g.trans ? 1 : 0, r.id); n++; } else none.run(r.id);
    }
  })();
  return n;
}

export function kindOf(it) {
  const m = it.gMen;
  const w = it.gWomen;
  if (m == null && w == null) return 'unknown';
  if ((m || 0) > 0 && (w || 0) > 0) return 'mixed';
  if ((m || 0) > 0) return w === 0 ? 'men' : 'men?';
  if ((w || 0) > 0) return m === 0 ? 'women' : 'women?';
  return 'unknown';
}

export function sureOf(it) {
  return it.gSrc === 'vision' ? 1 : it.gSrc === 'ai' ? 0.8 : it.gSrc === 'guess' ? 0.5 : 0;
}

export function genderPrefs() {
  const p = getSetting('genderPrefs', null) || {};
  // "Everyone" is no longer an option in the app (0.20.2); it is only kept for tests that are not about the balance.
  const out = { male: Number.isFinite(p.male) ? p.male : 50, auto: !!p.auto, trans: p.trans !== false, everyone: !!p.everyone };
  if (out.auto) out.male = autoMale();
  return out;
}

export function setGenderPrefs(patch) {
  const cur = getSetting('genderPrefs', null) || {};
  const next = { ...cur, ...patch };
  if (patch.male !== undefined) next.male = Math.max(0, Math.min(100, Math.round(Number(patch.male))));
  setSetting('genderPrefs', next);
  autoCache = { at: 0, v: 50 };
  return genderPrefs();
}

// Auto: how your likes, heat, saves and watching split between men, women and both, pulled toward 50/50 until there is enough to go on.
let autoCache = { at: 0, v: 50 };
export function autoMale() {
  if (now() - autoCache.at < 5 * 60000) return autoCache.v;
  const db = getDb();
  const eng = engagement(now() - 7 * 86400000, { limit: 3000, minPoints: 1 });
  const q = db.prepare('SELECT g_men, g_women FROM items WHERE id = ?');
  let men = 0;
  let women = 0;
  let total = 0;
  for (const e of eng) {
    const r = q.get(e.item_id);
    if (!r || (r.g_men == null && r.g_women == null)) continue;
    const k = kindOf({ gMen: r.g_men, gWomen: r.g_women });
    if (k === 'men') men += e.p;
    else if (k === 'women') women += e.p;
    else if (k === 'mixed') { men += e.p / 2; women += e.p / 2; }
    total += e.p;
  }
  const raw = total ? (men / (men + women || 1)) * 100 : 50;
  const trust = Math.min(1, total / 80);
  const v = Math.round(50 + (raw - 50) * trust);
  autoCache = { at: now(), v };
  return v;
}

// How much of each kind of post is let through at a given balance. At 50/50 everything is.
// Toward one side, posts with only the other gender become rare, and that gender mostly appears together with the favoured one.
// How much of each kind of post is let through at a given balance. At 50/50 everything is.
// Toward one side, posts with only the other gender become rare, and that gender mostly appears together with the favoured one.
// From 90% on it is a mode of its own: only posts clearly with just men (or just women) are shown, plus very rarely something else.
// Between 45% and 55% men (centred on the middle) the slider means hetero only: posts with a man and a woman together.
export const HETERO = [45, 55];
export const isHetero = (male) => male >= HETERO[0] && male <= HETERO[1];

export function allowance(male, kind, trans, allowTrans, sure = 0.5, everyone = false) {
  if (trans && !allowTrans) return 0;
  if (everyone) return 1;
  if (isHetero(male)) {
    if (kind === 'mixed') return sure >= 0.8 ? 1 : 0.85;
    if (kind === 'men?' || kind === 'women?') return 0.3;
    if (kind === 'unknown') return 0.2;
    return 0;
  }
  const pm = male / 100;
  const pf = 1 - pm;
  const extreme = Math.max(pm, pf) >= 0.9;
  if (extreme) {
    const menMode = pm >= 0.9;
    const own = menMode ? 'men' : 'women';
    const other = menMode ? 'women' : 'men';
    const rare = Math.max(0, (100 - Math.max(male, 100 - male)) / 100);
    if (kind === own) return sure >= 0.8 ? 1 : 0.6;
    if (kind === other || kind === `${other}?`) return 0;
    if (kind === `${own}?`) return 0.35;
    return rare;
  }
  const side = (p) => (p >= 0.5 ? 1 : Math.pow(p / 0.5, 2.5));
  const aMen = side(pm);
  const aWomen = side(pf);
  const aMixed = Math.pow(Math.min(1, Math.min(pm, pf) / 0.5), 0.7);
  if (kind === 'men') return aMen;
  if (kind === 'women') return aWomen;
  if (kind === 'mixed') return aMixed;
  if (kind === 'men?') return (aMen + aMixed) / 2;
  if (kind === 'women?') return (aWomen + aMixed) / 2;
  return Math.max(0.2, (aMen + aWomen + aMixed) / 3);
}

// Search words and communities that fit a balance of 90% or more.
export function genderMode() {
  const g = genderPrefs();
  if (g.everyone) return null;
  return g.male >= 90 ? 'men' : g.male <= 10 ? 'women' : isHetero(g.male) ? 'hetero' : null;
}

export function genderTerm(term) {
  const mode = genderMode();
  const t = String(term || '').trim();
  if (mode === 'men' && !/\b(gay|men|twinks?|male)\b/i.test(t)) return `gay ${t}`.trim();
  if (mode === 'women' && !/\b(lesbians?|girls?|women|solo)\b/i.test(t)) return `lesbian ${t}`.trim();
  if (mode === 'hetero' && !/\b(straight|couples?|hetero)\b/i.test(t)) return `straight ${t}`.trim();
  return t;
}

export function stableRand(id) {
  let h = (Number(id) * 2654435761) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h % 10000) / 10000;
}
