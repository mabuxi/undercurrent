import { config } from './config.js';
import { getDb, normalizeTag } from './db.js';
import { ensureKinkSchema, locksOf, modeOf, addTags } from './kinkengine.js';
import { isBlocked } from './safety.js';
import { chat, fastModel } from './ai/ollama.js';
import { log } from './log.js';

// Tags that make a kink find more of its posts: the same thing written another way ("gay bondage", "gay-bondage",
// "male bondage" for Bondage), plurals and word forms ("muscles", "muscular" for Muscle), and parts or kinds that are
// clearly inside it ("biceps", "pecs"). Never things that only come along with it. Two sources: tags in your posts
// that have the kink's name in them, and the local model, given the name and the tags the kink already has.

const words = (s) => String(s || '').toLowerCase().split(/[\s\-_/]+/).filter(Boolean);
// "muscles" → "muscle", "bodies" → "body", so word forms of the name are recognised.
const stem = (w) => w.replace(/(ies)$/, 'y').replace(/(sses|shes|ches|xes)$/, (m) => m.slice(0, -2)).replace(/([^s])s$/, '$1');

function kinkRow(id) {
  ensureKinkSchema();
  const db = getDb();
  const k = db.prepare('SELECT * FROM kinks WHERE id = ?').get(Number(id));
  if (!k || k.is_group) return null;
  const tags = db.prepare("SELECT t.name, COALESCE(kt.origin, 'ai') origin FROM kink_tags kt JOIN tags t ON t.id = kt.tag_id WHERE kt.kink_id = ?").all(k.id);
  return { ...k, tags, noTags: locksOf(k).noTags || [] };
}

function postsWith(names) {
  if (!names.length) return new Map();
  const db = getDb();
  const out = new Map();
  for (let i = 0; i < names.length; i += 200) {
    const chunk = names.slice(i, i + 200);
    for (const r of db.prepare(`SELECT t.name, COUNT(DISTINCT it.item_id) c FROM tags t JOIN item_tags it ON it.tag_id = t.id WHERE t.name IN (${chunk.map(() => '?').join(',')}) AND it.weight >= 0.3 GROUP BY t.id`).all(...chunk)) out.set(r.name, r.c);
  }
  return out;
}

// Tags in your posts with the kink's name (or a form of it) in them as a word.
function nameTags(k, minPosts = 2) {
  const stems = [...new Set(words(k.name).filter((w) => w.length >= 4).map(stem))];
  if (!stems.length) return [];
  const db = getDb();
  const cands = new Map();
  for (const s of stems) {
    for (const r of db.prepare("SELECT t.name, COUNT(DISTINCT it.item_id) c FROM tags t JOIN item_tags it ON it.tag_id = t.id WHERE t.name LIKE ? AND t.kind != 'performer' AND it.weight >= 0.3 GROUP BY t.id HAVING c >= ? ORDER BY c DESC LIMIT 60").all(`%${s}%`, minPosts)) {
      // Every word of the name has to be in the tag, each starting a word ("male bondage" for Bondage), so a long
      // name never brings in tags that only share one of its words.
      if (!stems.every((x) => words(r.name).some((w) => w.startsWith(x)))) continue;
      if (words(r.name).length > 4) continue;
      cands.set(r.name, Math.max(cands.get(r.name) || 0, r.c));
    }
  }
  return [...cands.entries()].map(([name, posts]) => ({ name, posts }));
}

const SCHEMA = {
  type: 'object',
  properties: { tags: { type: 'array', items: { type: 'object', properties: { tag: { type: 'string' }, sure: { type: 'integer' } }, required: ['tag', 'sure'] } } },
  required: ['tags']
};
const RULES = `You help tag adult posts for one kink, so a search finds more posts about exactly that kink.

Give tags that mean the SAME thing as the kink, written the way people tag posts:
- other spellings and forms: plural and singular, with a space, with a hyphen, joined, common abbreviations
- the kink with a common qualifier people add ("gay bondage", "male bondage" for Bondage)
- close synonyms, and parts or kinds that are clearly inside it ("biceps", "pecs" for Muscle)

Never things that only come along with it (a place, an act or a body type that is a different kink). Never anything about minors, age, family, non-consent or animals.
Lowercase, one to three words each. sure: 0 to 100, how sure you are it means this kink.`;

async function fromModel(k, exclude, n, interactive) {
  if (config.mock) return [];
  const user = [
    `Kink: ${k.name}`,
    k.tags.length ? `Tags it already has: ${k.tags.map((t) => t.name).slice(0, 40).join(', ')}` : '',
    exclude.length ? `Do not repeat: ${exclude.slice(0, 80).join(', ')}` : '',
    `Give up to ${n} tags.`
  ].filter(Boolean).join('\n');
  try {
    const out = await chat({ kind: interactive ? 'kink-tags' : 'discover-ai', system: RULES, user, schema: SCHEMA, temperature: 0.2, model: fastModel(), numPredict: 500 });
    return (out?.tags || []).map((x) => ({ name: normalizeTag(x.tag), sure: Math.max(0, Math.min(100, Number(x.sure) || 0)) })).filter((x) => x.name && x.name.length >= 3 && x.name.split(' ').length <= 3);
  } catch (e) {
    if (!e.yielded) log('warn', `Tag ideas for ${k.name} failed: ${e.message}`);
    return [];
  }
}

// The ideas for one kink are kept for a while, and the refresh button pages through them before asking again.
const POOL = new Map();

export async function tagIdeas(id, { skip = [], count = 10 } = {}) {
  const k = kinkRow(id);
  if (!k) return [];
  const have = new Set([...k.tags.map((t) => t.name), ...k.noTags].map((x) => x.toLowerCase()));
  const shown = new Set(skip.map((x) => normalizeTag(x)));
  const ok = (x) => x.name && !have.has(x.name) && !isBlocked({ title: x.name, tags: [x.name] }).blocked;
  let pool = POOL.get(k.id);
  if (!pool || Date.now() - pool.at > 30 * 60000 || pool.sig !== k.tags.length) {
    const byName = nameTags(k).map((x) => ({ ...x, why: 'name', sure: 90 }));
    const ai = await fromModel(k, [...have], 24, true);
    const counts = postsWith(ai.map((x) => x.name));
    const list = new Map();
    for (const x of byName) list.set(x.name, x);
    for (const x of ai) if (!list.has(x.name)) list.set(x.name, { name: x.name, posts: counts.get(x.name) || 0, why: 'ai', sure: x.sure });
    pool = { at: Date.now(), sig: k.tags.length, items: [...list.values()].filter((x) => x.sure >= 40) };
    POOL.set(k.id, pool);
  }
  // Surest and most used first.
  const ranked = pool.items.filter(ok).sort((a, b) => (b.sure >= 80) - (a.sure >= 80) || b.posts - a.posts || b.sure - a.sure);
  let next = ranked.filter((x) => !shown.has(x.name));
  if (!next.length && ranked.length) {
    // Everything was shown: ask for more, then start over.
    const more = await fromModel(k, [...have, ...ranked.map((x) => x.name)], 16, true);
    const counts = postsWith(more.map((x) => x.name));
    for (const x of more) if (!pool.items.some((y) => y.name === x.name) && x.sure >= 40) pool.items.push({ name: x.name, posts: counts.get(x.name) || 0, why: 'ai', sure: x.sure });
    next = pool.items.filter(ok).filter((x) => !shown.has(x.name));
    if (!next.length) next = ranked;
  }
  return next.slice(0, count);
}

// For kinks that may grow: the tags the app is sure about join by themselves (the kink's name in them, used in
// a few posts; or the model very sure and the tag in your posts).
export async function growKinkTags(id) {
  const k = kinkRow(id);
  if (!k || modeOf(k) !== 'grow') return 0;
  POOL.delete(k.id);
  const ideas = await tagIdeas(id, { count: 40 });
  const sure = ideas.filter((x) => (x.why === 'name' && x.posts >= 3) || (x.sure >= 85 && x.posts >= 2)).slice(0, 12);
  const n = addTags(k.id, sure.map((x) => ({ name: x.name, weight: 0.9 })), k.noTags);
  if (n) { POOL.delete(k.id); log('info', `Tags for ${k.name}: added ${sure.map((x) => x.name).join(', ')}`); }
  return n;
}

// Right away for a kink you just made (without waiting for the model when it is busy).
export function growSoon(id) {
  setTimeout(() => { growKinkTags(id).catch(() => {}); }, 50).unref?.();
}

// From the hourly round: one kink that may grow and was not looked at for two weeks.
export async function growRound() {
  const { getSetting, setSetting } = await import('./db.js');
  const runs = getSetting('kinkTagsAt', {}) || {};
  const db = getDb();
  const next = db.prepare("SELECT * FROM kinks WHERE is_group = 0 AND status != 'hidden'").all().filter((k) => modeOf(k) === 'grow').find((k) => !runs[k.id] || Date.now() - runs[k.id] > 14 * 86400000);
  if (!next) return null;
  runs[next.id] = Date.now();
  setSetting('kinkTagsAt', runs);
  await growKinkTags(next.id);
  return next.name;
}
