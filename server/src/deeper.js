import { config } from './config.js';
import { getDb, normalizeTag } from './db.js';
import { chat, fastModel, health } from './ai/ollama.js';
import { buildFeed } from './rank.js';
import { familyOf, knownVariants, conceptName, isKinkConcept } from './concepts.js';
import { conceptLabel } from './vocab.js';
import { suggestFor, fitsGender, genderModeOf, ALL_CONCEPTS } from './setup.js';
import { conceptsFor } from './fantasywrite.js';
import { userLimits } from './safety.js';
import { genderPrefs } from './gender.js';
import { log } from './log.js';
import { lang, tr, replyIn } from './i18n.js';

// Going deeper into a fantasy: one quick choice at a time (where, with whom, what happens, how rough, how it
// ends...), each answer sharpens it, the posts follow every answer, and at the end it is one sharper fantasy you
// can keep. The choices come from what really goes with it in the posts here (and what you like), so every
// choice leads to posts; the quick model puts the hottest choices first and may add one of its own that has posts.

const DIMS = [
  { key: 'setting', fams: ['places'], q: 'Where does it happen?' },
  { key: 'who', fams: ['types'], q: 'Who is it with?' },
  { key: 'act', fams: ['oral', 'sex', 'positions'], q: 'What happens first?' },
  { key: 'mood', fams: ['dynamic'], q: 'How does it feel?' },
  { key: 'look', fams: ['body', 'ethnicity'], q: 'What catches your eye about them?' },
  { key: 'wear', fams: ['clothing'], q: 'What are they wearing?' },
  { key: 'twist', fams: ['scenarios', 'group', 'camera'], q: 'Add a twist?' },
  { key: 'finish', fams: ['cum'], q: 'How does it end?' }
];
export const DEEPER_STEPS = 5;

const label = (c) => conceptLabel(c, lang(), conceptName(c));

function variantsOf(tag) {
  const cs = conceptsFor([tag]);
  return [...new Set([normalizeTag(tag), ...cs.flatMap((c) => knownVariants(c))].filter(Boolean))];
}

// How many posts here have this choice and something of the fantasy too.
function countWith(opt, core) {
  const a = variantsOf(opt);
  const b = [...new Set(core.flatMap(variantsOf))].slice(0, 60);
  if (!a.length) return 0;
  const db = getDb();
  const q = (n) => n.map(() => '?').join(',');
  try {
    if (!b.length) return db.prepare(`SELECT COUNT(DISTINCT it.item_id) c FROM item_tags it JOIN tags t ON t.id = it.tag_id JOIN items i ON i.id = it.item_id WHERE t.name IN (${q(a)}) AND it.weight >= 0.44 AND i.blocked = 0`).get(...a).c;
    return db.prepare(`SELECT COUNT(DISTINCT x.item_id) c FROM item_tags x JOIN tags tx ON tx.id = x.tag_id JOIN items i ON i.id = x.item_id
      WHERE tx.name IN (${q(a)}) AND x.weight >= 0.44 AND i.blocked = 0 AND x.item_id IN (SELECT y.item_id FROM item_tags y JOIN tags ty ON ty.id = y.tag_id WHERE ty.name IN (${q(b)}) AND y.weight >= 0.44)`).get(...a, ...b).c;
  } catch { return 0; }
}

// The posts that have the most of the fantasy, the newest answer first among equals.
export function postsFor(tags, focus = null, limit = 6) {
  const sets = tags.map((t) => ({ t, v: new Set(variantsOf(t)) }));
  const all = [...new Set(sets.flatMap((s) => [...s.v]))].slice(0, 80);
  if (!all.length) return [];
  const pool = buildFeed({ tags: all, includeSeen: true }, { limit: 80, mix: 0 }).items;
  const scored = pool.map((it) => {
    const names = new Set((it.tags || []).map((x) => String(x).toLowerCase()));
    const text = ` ${String(it.title || '').toLowerCase()} `;
    const hit = (s) => [...s.v].some((v) => names.has(v) || (v.length > 3 && text.includes(` ${v} `)));
    const hits = sets.filter(hit).length;
    const f = focus ? sets.find((s) => s.t === focus) : null;
    return { it, hits, focus: f && hit(f) ? 1 : 0 };
  });
  scored.sort((a, b) => b.hits - a.hits || b.focus - a.focus || (b.it.match || 0) - (a.it.match || 0));
  return scored.slice(0, limit).map((x) => ({ ...x.it, deeperHits: x.hits }));
}

function candidates(dim, tags, { male, avoid }) {
  const mode = genderModeOf(male);
  const have = conceptsFor(tags);
  const limits = new Set(userLimits());
  const out = [];
  const ok = (c) => c && !have.includes(c) && !avoid.has(c) && !limits.has(c) && dim.fams.includes(familyOf(c)) && fitsGender(c, mode) && isKinkConcept(c) && !out.includes(c);
  for (const s of suggestFor(have, have[have.length - 1] || null, { male })) if (ok(s.concept)) out.push(s.concept);
  for (const c of ALL_CONCEPTS) if (out.length < 14 && ok(c)) out.push(c);
  return out.slice(0, 14);
}

// The next question without the model: what the fantasy does not say yet comes first, and the choices are the ones
// that go with it in the posts here. Quick enough for a window in the feed.
export function deeperQuick({ tags = [], answers = [], male } = {}) {
  male = male ?? genderPrefs().male;
  const core = [...new Set(tags.map((t) => normalizeTag(String(t))).filter(Boolean))];
  const chosen = answers.filter((a) => a.tag).map((a) => normalizeTag(a.tag));
  const all = [...new Set([...core, ...chosen])];
  const asked = new Set(answers.map((a) => a.dim));
  const posts = postsFor(all, chosen[chosen.length - 1] || null);
  if (answers.length >= DEEPER_STEPS) return { done: true, tags: all, posts };
  const have = conceptsFor(all);
  const open = DIMS.filter((d) => !asked.has(d.key));
  const ordered = [...open.filter((d) => !have.some((c) => d.fams.includes(familyOf(c)))), ...open.filter((d) => have.some((c) => d.fams.includes(familyOf(c))))];
  const avoid = new Set(answers.flatMap((a) => (a.shown || []).filter((x) => x !== a.tag)));
  for (const dim of ordered) {
    const cands = candidates(dim, all, { male, avoid });
    const counted = cands.map((c) => ({ tag: c, label: label(c), count: countWith(c, all) }));
    const opts = [...counted.filter((o) => o.count > 0), ...counted.filter((o) => !o.count)].slice(0, 6);
    if (opts.length < 2) continue;
    return { done: false, dim: dim.key, question: tr(dim.q), options: opts, tags: all, posts, step: answers.length + 1, of: DEEPER_STEPS };
  }
  return { done: true, tags: all, posts };
}

// The same, with the quick model putting the hottest choices for this fantasy first and
// maybe adding one of its own.
export async function deeperStep({ tags = [], scenario = '', title = '', answers = [], male } = {}) {
  const step = deeperQuick({ tags, answers, male });
  if (step.done) return step;
  let opts = step.options;
  if (!config.mock && (await health()).ok) {
    try {
      const out = await Promise.race([
        chat({
          kind: 'summary', model: fastModel(), temperature: 0.7, numPredict: 220,
          schema: { type: 'object', properties: { pick: { type: 'array', items: { type: 'string' } }, own: { type: 'string' } }, required: ['pick'] },
          system: `You help one adult sharpen a sexual fantasy, one quick choice at a time, like a playful friend who gets what they crave. Everyone is a consenting adult. The question is about: ${step.dim}. pick: the 4 options from the list that would make this fantasy hottest, most exciting first, copied exactly. own: optionally one more short option (1 to 3 words, a porn tag) that is not in the list but would fit perfectly, or empty. ${replyIn()}`,
          user: `Fantasy: ${scenario || title || step.tags.join(', ')}\nAlready chosen: ${step.tags.join(', ')}\nOptions: ${opts.map((o) => o.label).join(', ')}`
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 20000))
      ]);
      // The small model's own wording was often clumsy (and in shaky French): the questions stay ours, it only
      // orders the choices and may add one that has posts here.
      const picked = (out?.pick || []).map((p) => opts.find((o) => o.label.toLowerCase() === String(p).toLowerCase() || o.tag === String(p).toLowerCase())).filter(Boolean);
      if (picked.length >= 2) opts = [...new Set([...picked, ...opts])];
      opts = opts.slice(0, 5);
      const own = normalizeTag(String(out?.own || ''));
      if (own && own.split(' ').length <= 3 && !opts.some((o) => o.tag === own) && !userLimits().includes(own)) { const c = countWith(own, step.tags); if (c >= 3) opts.push({ tag: own, label: own, count: c, ai: true }); }
    } catch (e) { log('info', `Go deeper: the quick model did not answer (${e.message})`); opts = opts.slice(0, 5); }
  } else opts = opts.slice(0, 5);
  return { ...step, options: opts.slice(0, 6) };
}

// The tags a fantasy is about: its own, or what its kinks stand for when it has none (older fantasies).
export function fantasyTags(f, kinks = []) {
  if (f?.tags?.length) return f.tags;
  const ids = new Set((f?.kinks || []).map((k) => k.id));
  return [...new Set(kinks.filter((k) => ids.has(k.id)).flatMap((k) => (k.concepts?.length ? k.concepts.slice(0, 2) : [String(k.name).toLowerCase()])))].slice(0, 6);
}
