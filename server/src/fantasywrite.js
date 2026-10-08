import { config } from './config.js';
import { normalizeTag } from './db.js';
import { chat, deepModel, fastModel, health } from './ai/ollama.js';
import { conceptsOf, knownVariants } from './concepts.js';
import { conceptLabel, frenchTagsIn } from './vocab.js';
import { ALL_CONCEPTS } from './setup.js';
import { fantasyIdeas } from './fantasyideas.js';
import { userLimits, isBlocked } from './safety.js';
import { log } from './log.js';
import { replyIn } from './i18n.js';

// Writing one fantasy from the tags you chose: "refine" keeps the scene and reworks it so it is about these tags
// now, "new" writes a different scene from the same tags. And the tags a story you typed is about, as you type it.

const RULES = `A fantasy is ONE short, explicit sentence (at most 30 words, second person "you"), written like a porn scene description, not like a story: direct and dirty, no poetic language, no metaphors, no feelings. It names a setting, who it is with, the sex act, and one thrill when the tags give one (public or getting caught means risk, a straight guy means a first time, a partner means someone watching). Good example for muscle, public and blowjob: "In a spa's shared steam shower where anyone could walk in, a muscular stranger drops to his knees and sucks you off." Everyone is a consenting adult; nothing about family members, age, animals or non-consent.`;

const SCHEMA = { type: 'object', properties: { title: { type: 'string' }, scenario: { type: 'string' } }, required: ['title', 'scenario'] };

const cleanTags = (tags) => [...new Set((tags || []).map((t) => normalizeTag(String(t || ''))).filter(Boolean))].slice(0, 16);
const clip = (s, n) => String(s || '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim().slice(0, n);

// What a set of tags means as concepts the quick idea writer knows.
export function conceptsFor(tags) {
  const out = [];
  for (const t of tags) for (const c of [...conceptsOf(t), ...frenchTagsIn(t).flatMap((x) => conceptsOf(x))]) if (ALL_CONCEPTS.includes(c) && !out.includes(c)) out.push(c);
  return out;
}

function fallback(tags, { gender = 'both', avoid = [], scenario = '' } = {}) {
  const picked = conceptsFor(tags);
  const ideas = fantasyIdeas(picked.length ? picked : ['kissing'], { gender, max: 8 });
  const seen = new Set([...avoid, scenario].map((x) => String(x || '').toLowerCase()));
  const fresh = ideas.find((f) => !seen.has(f.description.toLowerCase())) || ideas[0];
  return fresh ? { title: fresh.name, scenario: fresh.description } : null;
}

export async function writeFantasy({ tags = [], scenario = '', title = '', mode = 'new', male, avoid = [] } = {}) {
  const list = cleanTags(tags);
  const m = Number(male);
  const gender = Number.isFinite(m) ? (m >= 70 ? 'men' : m <= 30 ? 'women' : 'both') : 'both';
  const limits = userLimits();
  const want = list.filter((t) => !limits.includes(t));
  if (!want.length) return { title, scenario, tags: list, byAi: false };
  if (!config.mock && (await health()).ok) {
    const models = [...new Set([deepModel(), fastModel()].filter(Boolean))];
    const refine = mode === 'refine' && scenario;
    const user = [
      `Tags: ${want.join(', ')}`,
      refine ? `The fantasy as it is now: "${clip(scenario, 300)}"${title ? ` (title: ${clip(title, 60)})` : ''}` : '',
      !refine && avoid.length ? `Already written, do something clearly different (other setting, other person, other act): ${avoid.slice(0, 6).map((a) => `"${clip(a, 200)}"`).join(' ')}` : '',
      limits.length ? `Never include: ${limits.join(', ')}` : '',
      gender === 'men' ? 'They want to see men.' : gender === 'women' ? 'They want to see women.' : ''
    ].filter(Boolean).join('\n');
    const task = refine
      ? 'Rewrite this fantasy so it is about these tags now: use every tag that fits the scene, drop what is no longer in the tags, keep the parts of the scene that still fit. Same rules, one sentence.'
      : 'Write one new fantasy built on these tags: use the tags that fit together best (all of them when they can). Same rules, one sentence.';
    for (const [i, model] of models.entries()) {
      try {
        const out = await Promise.race([
          chat({ kind: 'summary', model, temperature: refine ? 0.6 : 0.95, numPredict: 260, schema: SCHEMA, system: `${RULES}\n${task}\ntitle: 2 to 4 words naming the scene, not the tags. ${replyIn()}`, user }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), i === 0 && models.length > 1 ? 100000 : 45000))
        ]);
        const s = clip(out?.scenario, 260);
        if (s.split(/\s+/).length >= 6 && !isBlocked({ title: out?.title || '', body: s, tags: want }).blocked) {
          log('info', `Fantasy ${refine ? 'refined' : 'written'} from ${want.length} tags by ${model}`);
          return { title: clip(out.title, 50) || title, scenario: s, tags: list, byAi: true };
        }
      } catch (e) { log('info', `Fantasy writing: ${model} did not answer (${e.message})`); }
    }
  }
  const f = fallback(want, { gender, avoid, scenario });
  return f ? { ...f, tags: list, byAi: false } : { title, scenario, tags: list, byAi: false };
}

// Tags a typed story is about. The quick pass finds known kinks and tags in the words themselves (also in French),
// at once; with ai, the quick model reads it too and adds what the words imply.
function wordsIn(text) {
  const t = ` ${String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  const found = [];
  for (const c of ALL_CONCEPTS) {
    const names = [...knownVariants(c), conceptLabel(c, 'fr', '')].filter((x) => x && x.length >= 3).map((x) => x.toLowerCase());
    if (names.some((n) => t.includes(` ${n} `) || (n.length >= 5 && t.includes(` ${n}s `)))) found.push(c);
  }
  for (const c of frenchTagsIn(text)) for (const x of conceptsOf(c)) if (!found.includes(x)) found.push(x);
  return found;
}

export async function tagsForText(text, { ai = false } = {}) {
  const words = String(text || '').trim();
  if (words.length < 8) return { tags: [], ai: [] };
  const quick = wordsIn(words).slice(0, 10);
  let more = [];
  if (ai) {
    if (config.mock) more = ['dominant', 'teasing'].filter((x) => !quick.includes(x));
    else {
      try {
        const out = await Promise.race([
          chat({ kind: 'summary', model: fastModel(), temperature: 0.2, numPredict: 120, schema: { type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } } }, required: ['tags'] },
            system: 'You tag a sexual fantasy someone wrote, like a porn site tags a video. Give 3 to 8 short lowercase English tags (1 to 3 words each) for what is in it: the people, the setting, the acts, the mood. Only what the text says or clearly implies. No sentences.',
            user: words.slice(0, 800) }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 25000))
        ]);
        more = cleanTags(out?.tags).filter((x) => x.split(' ').length <= 3 && !quick.includes(x));
      } catch (e) { log('info', `Fantasy tags: the quick model did not answer (${e.message})`); }
    }
  }
  const limits = userLimits();
  return { tags: quick.filter((x) => !limits.includes(x)), ai: more.filter((x) => !limits.includes(x)).slice(0, 8) };
}

