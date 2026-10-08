import { config } from './config.js';
import { getDb, getSetting, setSetting, now, normalizeTag } from './db.js';
import { chat, deepModel, fastModel, health } from './ai/ollama.js';
import { affinityMap, topTags } from './profile.js';
import { tagSpecificity } from './store.js';
import { listKinks, listFantasies } from './kinks.js';
import { conceptsOf, conceptName, isKinkConcept, knownVariants } from './concepts.js';
import { conceptLabel } from './vocab.js';
import { userLimits } from './safety.js';
import { dislikedTags } from './dislike.js';
import { listMemory } from './memory.js';
import { evidence } from './suggest.js';
import { postsFor } from './deeper.js';
import { log } from './log.js';
import { isSourceName } from './sourcenames.js';
import { lang, tr, replyIn } from './i18n.js';

// A discovery journey: somewhere you have never been that you are likely to love. The destination is never made
// up: it is a real kind of post here that you have not opened, that sits right next to what you clearly like
// (posts carry both far more often than chance), and that nothing you dislike points away from. The bigger model
// looks at everything you did and picks the one it thinks you would never have thought of yourself, then plans the
// way there through a few stepping stones you already like. Every step is checked to have posts. At the end you
// say whether it was for you; either way the next journey goes somewhere else.

const NEVER = ['step family', 'incest'];
// Family roleplay or anything that sounds young never leads a journey, whatever the posts say.
const NEVER_RE = /\b(step ?(sis|sister|bro|brother|mom|mother|dad|father|daughter|son|family)|step ?fantasy|stepdad|stepmom|stepsis|incest|daddy'?s girl|little|teen|teens|young|schoolgirl|innocent)\b|^r /;
const label = (name) => { const c = conceptsOf(name)[0] || name; return conceptLabel(c, lang(), conceptName(c)); };

// What you have done with each journey's destination, so a new one always goes somewhere new.
function journeyLog() { return getSetting('journeyLog', []) || []; }
export function journeyOutcome(dest, verdict) {
  const prev = journeyLog();
  // A journey being planned is noted without a verdict; it never overwrites one you gave.
  if (!verdict && prev.some((x) => x.dest === dest && x.verdict)) return { ok: true };
  const log2 = prev.filter((x) => x.dest !== dest);
  log2.unshift({ dest, verdict, at: now() });
  setSetting('journeyLog', log2.slice(0, 80));
  return { ok: true };
}

// Tags you are clearly into, strongest first, with how strongly.
function likedTags(anchor = []) {
  const db = getDb();
  const idOf = db.prepare('SELECT id FROM tags WHERE name = ?');
  const aff = affinityMap();
  const out = new Map();
  const kindOf = db.prepare('SELECT kind FROM tags WHERE id = ?');
  // Performers are people, not something to step through: only kinds of posts.
  for (const t of topTags({ by: 'long', limit: 50 })) if (t.name && t.long > 0.1 && kindOf.get(t.id)?.kind !== 'performer') out.set(t.name, { id: t.id, name: t.name, w: t.long + 0.5 * (t.lately || 0) });
  for (const k of listKinks()) {
    if (k.isGroup || k.status !== 'active') continue;
    for (const t of k.tags.slice(0, 4)) if (!out.has(t.name)) out.set(t.name, { id: t.id, name: t.name, w: 0.25 + ((k.allTime + k.lately) / 200) * 0.3 });
  }
  // A journey from one kink or fantasy starts from its tags, strongest.
  for (const a of anchor) {
    const name = normalizeTag(a);
    const id = idOf.get(name)?.id;
    if (id) out.set(name, { id, name, w: Math.max(out.get(name)?.w || 0, 1.2) + ((aff.get(`t:${id}`)?.long || 0) > 0 ? 0.2 : 0) });
  }
  // One per kind of thing ("deepthroat", "throated" and "throat" are one), and only what could be a kink.
  const byConcept = new Map();
  for (const l of [...out.values()].sort((a, b) => b.w - a.w)) {
    const c = conceptsOf(l.name)[0] || l.name;
    if ((!isKinkConcept(c) || isSourceName(l.name) || NEVER_RE.test(l.name)) && !anchor.includes(l.name)) continue;
    if (!byConcept.has(c)) byConcept.set(c, l);
  }
  return [...byConcept.values()].slice(0, anchor.length ? 12 : 18);
}

// Real kinds of posts you have not opened, scored by how strongly they go with what you like.
export function discoveryCandidates({ anchor = [], limit = 24, minLift = 1.3 } = {}) {
  const db = getDb();
  const liked = likedTags(anchor);
  if (!liked.length) return { liked, candidates: [] };
  const aff = affinityMap();
  const spec = tagSpecificity();
  const total = spec.n || 1;
  const df = new Map(db.prepare("SELECT it.tag_id id, COUNT(DISTINCT it.item_id) c FROM item_tags it JOIN items i ON i.id = it.item_id WHERE i.blocked = 0 AND it.weight >= 0.44 GROUP BY it.tag_id").all().map((r) => [r.id, r.c]));
  // Not new to you: your kinks (also hidden ones), what you said never, what you disliked, earlier destinations.
  const known = new Set();
  for (const k of listKinks({ includeHidden: true })) { for (const t of k.tags) known.add(t.name); for (const c of k.concepts || []) known.add(c); }
  for (const t of userLimits()) known.add(t);
  for (const d of dislikedTags()) known.add(d.tag);
  // Earlier destinations: never again once you said no or loved it (it is a kink then), not for a month after a
  // maybe, not for two weeks after a journey you left without saying.
  const past = journeyLog();
  const day = 86400000;
  for (const j of past) if (j.verdict === 'no' || j.verdict === 'love' || now() - j.at < (j.verdict === 'maybe' ? 30 : 14) * day) known.add(j.dest);
  const knownConcepts = new Set([...known].flatMap((n) => conceptsOf(n)));
  // Opened in any spelling counts as opened: someone into "blowjob" posts gets no "amateur blowjob" journey.
  const names = new Map(db.prepare('SELECT id, name FROM tags').all().map((r) => [r.id, r.name]));
  for (const [key, v] of aff) if (key.startsWith('t:') && Math.abs(v.long || 0) > 0.08) for (const c of conceptsOf(names.get(Number(key.slice(2))) || '')) knownConcepts.add(c);
  // Never family roleplay, whatever the posts say.
  for (const c of NEVER) knownConcepts.add(c);
  const knownWords = [...new Set([...knownConcepts].flatMap((c) => [c, ...knownVariants(c)]))].filter((w) => w && w.length >= 4);
  const co = db.prepare(`SELECT b.tag_id id, t.name, t.kind, COUNT(DISTINCT b.item_id) c FROM item_tags a JOIN item_tags b ON b.item_id = a.item_id AND b.tag_id != a.tag_id JOIN tags t ON t.id = b.tag_id JOIN items i ON i.id = a.item_id
    WHERE a.tag_id = ? AND a.weight >= 0.44 AND b.weight >= 0.44 AND i.blocked = 0 AND t.kind != 'performer' GROUP BY b.tag_id HAVING c >= 2 ORDER BY c DESC LIMIT 120`);
  const by = new Map();
  for (const l of liked) {
    const dl = df.get(l.id) || 1;
    for (const r of co.all(l.id)) {
      const name = r.name;
      if (!name || known.has(name) || liked.some((x) => x.name === name)) continue;
      const concept = conceptsOf(name)[0] || name;
      if (knownConcepts.has(concept) || liked.some((x) => (conceptsOf(x.name)[0] || x.name) === concept)) continue;
      if (!isKinkConcept(concept) || name.length < 3 || isSourceName(name) || NEVER_RE.test(name)) continue;
      // "best blowjob ever" is blowjob for someone who already opened blowjob.
      const flat = ` ${name} `;
      if (knownWords.some((w) => flat.includes(` ${w} `) || name.replace(/ /g, '').includes(w.replace(/ /g, '')))) continue;
      const a = aff.get(`t:${r.id}`);
      // Opened before: not a discovery.
      if ((a?.long || 0) > 0.08 || (a?.long || 0) < -0.05) continue;
      const d = df.get(r.id) || 0;
      // Enough posts to make a journey, and not something on a third of everything.
      if (d < 4 || d > total * 0.33) continue;
      const lift = r.c / Math.max(0.5, (d * dl) / total);
      if (lift < minLift) continue;
      const s = l.w * Math.log1p(r.c) * Math.min(6, lift) * (spec.map.get(r.id) || 0.5);
      const cur = by.get(concept) || { tag: name, concept, posts: d, score: 0, bridges: [] };
      cur.score += s;
      if (d > cur.posts) { cur.tag = name; cur.posts = d; }
      const had = cur.bridges.find((b) => b.name === l.name);
      if (had) { had.together = Math.max(had.together, r.c); had.lift = Math.max(had.lift, Math.round(lift * 10) / 10); } else cur.bridges.push({ name: l.name, together: r.c, lift: Math.round(lift * 10) / 10 });
      by.set(concept, cur);
    }
  }
  // Posts from many people, not one creator's batch that all carry the same tags.
  const spread = db.prepare(`SELECT COUNT(DISTINCT COALESCE(i.author, i.community, i.id)) a, COUNT(DISTINCT i.id) n FROM item_tags it JOIN tags t ON t.id = it.tag_id JOIN items i ON i.id = it.item_id WHERE t.name = ? AND it.weight >= 0.44 AND i.blocked = 0`);
  const ranked = [...by.values()].sort((a, b) => b.score - a.score).slice(0, limit * 2);
  for (const c of ranked) {
    const sp = spread.get(c.tag);
    const share = sp?.n ? sp.a / sp.n : 1;
    if (sp && (sp.a < 3 || share < 0.25)) c.score *= 0.3;
    // Supported by more than one thing you love is stronger evidence.
    if (c.bridges.length >= 2) c.score *= 1.25;
  }
  const candidates = ranked.map((c) => ({ ...c, name: label(c.tag), bridges: c.bridges.sort((a, b) => b.together * b.lift - a.together * a.lift).slice(0, 4) }))
    .sort((a, b) => b.score - a.score).slice(0, limit);
  // Few posts here yet: things that simply go with what you like, even if not more often than chance.
  if (candidates.length < 3 && minLift > 1) return discoveryCandidates({ anchor, limit, minLift: 1 });
  return { liked, candidates };
}

// Posts for a step (the feed already keeps to your balance of women and men) that no earlier step used.
function stepPosts(tags, used, n, focus) {
  const out = [];
  for (const it of postsFor(tags, focus, 40)) {
    if (out.length >= n) break;
    if (used.has(it.id)) continue;
    // The same post reposted under another id is still the same post.
    const key = String(it.title || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (key && used.has(`t:${key}`)) continue;
    // A journey never shows family roleplay or anything that sounds young, even when the post also fits.
    if (NEVER_RE.test(String(it.title || '').toLowerCase()) || (it.tags || []).some((x) => NEVER_RE.test(String(x).toLowerCase()) || /\b(family|taboo|stepbro|stepbrother|stepsister|in law)\b/.test(String(x).toLowerCase()))) continue;
    // A stepping stone has both what you like and where you are heading.
    if (tags.length > 1 && (it.deeperHits || 0) < 2) continue;
    used.add(it.id);
    if (key) used.add(`t:${key}`);
    out.push(it);
  }
  return out;
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    destination: { type: 'string' },
    title: { type: 'string' },
    teaser: { type: 'string' },
    reveal: { type: 'string' },
    stages: { type: 'array', items: { type: 'object', properties: { from: { type: 'string' }, title: { type: 'string' }, why: { type: 'string' } }, required: ['from', 'title', 'why'] } }
  },
  required: ['destination', 'title', 'teaser', 'reveal', 'stages']
};

// The plan without the model: the best candidate, reached through the things you like that go with it most.
function quickPlan(cands, liked) {
  // The best one; earlier destinations are already left out, so the next journey goes somewhere else.
  const pick = cands[0];
  const bridges = pick.bridges.slice(0, 3).map((b) => b.name);
  return {
    dest: pick,
    title: tr('Journey to something new'),
    teaser: tr('A few steps from what you already love, toward something you have not opened yet.'),
    reveal: tr('{name} sits right next to {list} in the posts here, and you have never opened it.', { name: pick.name, list: bridges.map(label).join(', ') }),
    stages: bridges.map((b, k) => ({ from: b, title: tr(k === 0 ? 'Starting from {name}' : 'Through {name}', { name: label(b) }), why: tr('You keep coming back to {name}.', { name: label(b) }) }))
  };
}

export async function planDiscovery({ anchor = [], anchorName = '' } = {}) {
  const { liked, candidates } = discoveryCandidates({ anchor });
  if (!candidates.length) return { title: tr('Nothing new nearby yet'), description: tr('Like, heat or save a few more posts first: the journey needs to know what you love to find what is next to it.'), steps: [], stages: [], byAi: false };
  let plan = null;
  let byAi = false;
  if (!config.mock && (await health()).ok) {
    const kinks = listKinks().filter((k) => !k.isGroup && k.status === 'active').slice(0, 14);
    const mem = listMemory({ status: 'active' }).slice(0, 12).map((m) => `- ${m.category}: ${m.content}`);
    const dis = dislikedTags().slice(0, 12).map((d) => d.tag);
    const fant = listFantasies().slice(0, 6).map((f) => `- ${f.name}: ${f.description || ''}`);
    const past = journeyLog().slice(0, 10).map((j) => `${j.dest} (${j.verdict || 'no answer'})`);
    const user = [
      anchorName ? `This journey starts from: ${anchorName}` : '',
      `Their kinks (strongest first): ${kinks.map((k) => `${k.label || k.name} ${Math.round((k.allTime + k.lately) / 2)}%`).join(', ')}`,
      `Tags they love most: ${liked.slice(0, 14).map((l) => l.name).join(', ')}`,
      `Rising lately: ${topTags({ by: 'lately', limit: 10 }).filter((t) => t.name && t.lately > 0.1).map((t) => t.name).join(', ') || 'nothing in particular'}`,
      mem.length ? `What they told the assistant:\n${mem.join('\n')}` : '',
      fant.length ? `Their fantasies:\n${fant.join('\n')}` : '',
      dis.length ? `They disliked: ${dis.join(', ')}` : '',
      userLimits().length ? `Hard limits, never: ${userLimits().join(', ')}` : '',
      past.length ? `Earlier journeys went to (do not repeat): ${past.join('; ')}` : '',
      `Posts they engaged with most:\n${evidence(18).join('\n')}`,
      `Destinations you may choose from (real kinds of posts here they have NEVER opened; "with" lists the things they love that appear in the same posts far more often than chance):\n${candidates.slice(0, 18).map((c) => `- ${c.tag}${conceptName(c.concept).toLowerCase() !== c.tag ? ` (means: ${conceptName(c.concept)})` : ''} (${c.posts} posts; with ${c.bridges.map((b) => `${b.name} x${b.lift}`).join(', ')})`).join('\n')}`,
      replyIn()
    ].filter(Boolean).join('\n\n');
    const system = `You plan a discovery journey for one adult on a private porn browser: you lead them to a kink or kind of scene they have never explored but that you have good reason to believe they will love. Think like someone who knows their taste deeply: look at what they keep coming back to, what those things have in common (a dynamic, a body type, a setting, a feeling), and which destination would scratch that same itch in a way they would not have thought of. Prefer a destination that is surprising but well supported by the evidence over an obvious one. Everyone is a consenting adult; nothing about minors, family, animals or non-consent; never their dislikes or limits.
destination: copied exactly from the destination list.
stages: 3 stepping stones from what they already love toward the destination, in order; each "from" is copied exactly from the "with" list of that destination (a thing they love that appears together with it). title: 2 to 5 words for the stage. why: one short sentence in second person about why this step, referring to what they actually did.
title: 2 to 5 words naming the whole journey (not a stage, no numbering), without naming the destination.
teaser: one sentence that makes them curious, without naming the destination.
reveal: two short sentences naming the destination and explaining, from the evidence, why they will probably love it.
Plain, direct words, like a friend who knows their taste: no purple prose, no big promises. Never guess what an abbreviation means: use the meaning given in the list. Never mention numbers, statistics, lift or "the data": talk about what they like.
${replyIn()}${lang() === 'fr' ? ' Vouvoie la personne (vous, votre), jamais tu.' : ''}`;
    const models = [...new Set([deepModel(), fastModel()].filter(Boolean))];
    for (const [i, model] of models.entries()) {
      try {
        const out = await Promise.race([
          chat({ kind: 'summary', model, temperature: 0.55, numPredict: 900, numCtx: 8192, schema: PLAN_SCHEMA, system, user }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), i === 0 && models.length > 1 ? 150000 : 60000))
        ]);
        const dest = candidates.find((c) => c.tag === normalizeTag(out?.destination || '') || c.name.toLowerCase() === String(out?.destination || '').toLowerCase());
        if (!dest) { log('info', `Journey: ${model} chose "${out?.destination}", not one of the real destinations`); continue; }
        // A stepping stone is something they love; the posts check below makes sure it really meets the destination.
        const okFrom = new Set([...dest.bridges.map((b) => b.name), ...liked.map((l) => l.name)]);
        const stages = (out.stages || []).filter((s) => okFrom.has(normalizeTag(s.from))).slice(0, 3).map((s) => ({ from: normalizeTag(s.from), title: String(s.title || '').slice(0, 50), why: String(s.why || '').slice(0, 200) }));
        for (const b of dest.bridges) if (stages.length < 2 && !stages.some((s) => s.from === b.name)) stages.push({ from: b.name, title: label(b.name), why: tr('You keep coming back to {name}.', { name: label(b.name) }) });
        plan = { dest, title: String(out.title || '').slice(0, 60), teaser: String(out.teaser || '').slice(0, 220), reveal: String(out.reveal || '').slice(0, 400), stages };
        byAi = true;
        log('info', `Journey planned by ${model}: to ${dest.tag} via ${stages.map((s) => s.from).join(', ')}`);
        break;
      } catch (e) { log('info', `Journey: ${model} did not answer (${e.message})`); }
    }
  }
  if (!plan) plan = quickPlan(candidates, liked);
  // The way there, checked: every stage has posts with both the stepping stone and the destination, the end has
  // the best posts of the destination itself.
  const used = new Set();
  const destTags = [...new Set([plan.dest.tag, ...knownVariants(plan.dest.concept)])].slice(0, 8);
  const stages = [];
  const steps = [];
  for (const s of plan.stages) {
    const items = stepPosts([s.from, plan.dest.tag], used, 2, plan.dest.tag);
    if (!items.length) continue;
    stages.push({ ...s, label: label(s.from), n: items.length });
    for (const it of items) steps.push({ ...it, stage: stages.length - 1 });
  }
  const end = stepPosts(destTags, used, 4, plan.dest.tag);
  if (!end.length && !steps.length) return { title: tr('Nothing new nearby yet'), description: tr('Like, heat or save a few more posts first: the journey needs to know what you love to find what is next to it.'), steps: [], stages: [], byAi };
  stages.push({ from: plan.dest.tag, title: plan.dest.name, why: plan.reveal, label: plan.dest.name, n: end.length, destination: true });
  journeyOutcome(plan.dest.tag, null);
  for (const it of end) steps.push({ ...it, stage: stages.length - 1 });
  return {
    kind: 'discovery', title: plan.title || tr('Journey to something new'), description: plan.teaser, reveal: plan.reveal,
    destination: { tag: plan.dest.tag, name: plan.dest.name, tags: destTags, posts: plan.dest.posts, bridges: plan.dest.bridges.map((b) => b.name) },
    stages, steps, byAi
  };
}
