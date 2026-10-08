import { getDb, now, getSetting, setSetting } from './db.js';
import { config } from './config.js';
import { chat, deepModel, fastModel } from './ai/ollama.js';
import { listKinks, listFantasies, kinkPairs } from './kinks.js';
import { engagement, topTags } from './profile.js';
import { tagsForItems, tagSpecificity } from './store.js';
import { userLimits, isBlocked } from './safety.js';
import { listMemory, memoryUpkeep } from './memory.js';
import { onNewSession } from './sessions.js';
import { log } from './log.js';
import { replyIn } from './i18n.js';

// Suggestions the AI writes in the background: fantasies and kink combinations.
// Stored in the suggestions table so widgets can show them instantly and the user can save or dismiss them.

export function listSuggestions(kind, { status = 'new', limit = 20 } = {}) {
  return getDb().prepare('SELECT * FROM suggestions WHERE kind = ? AND status = ? ORDER BY confidence DESC, created DESC LIMIT ?').all(kind, status, limit)
    .map((r) => ({ ...r, data: (() => { try { return JSON.parse(r.data || '{}'); } catch { return {}; } })() }));
}

export function setSuggestion(id, status) {
  getDb().prepare('UPDATE suggestions SET status = ? WHERE id = ?').run(status, id);
}

function put(kind, title, body, data, confidence) {
  if (isBlocked({ title, body, tags: data?.tags || [] }).blocked) return false;
  const r = getDb().prepare("INSERT INTO suggestions(kind, title, body, data, confidence, status, created) VALUES(?, ?, ?, ?, ?, 'new', ?) ON CONFLICT(kind, title) DO NOTHING")
    .run(kind, title, body, JSON.stringify(data || {}), confidence, now());
  return r.changes > 0;
}

function evidence(limit = 24) {
  const eng = engagement(now() - 30 * 86400000, { limit: 400, minPoints: 2 }).sort((a, b) => b.p - a.p).slice(0, limit);
  const tagMap = tagsForItems(eng.map((e) => e.item_id));
  const spec = tagSpecificity().map;
  const db = getDb();
  return eng.map((e) => {
    const it = db.prepare('SELECT title, format, ai_summary FROM items WHERE id = ?').get(e.item_id);
    const tags = (tagMap.get(e.item_id) || []).filter((t) => t.kind !== 'performer').sort((a, b) => b.weight * (spec.get(b.id) ?? 1) - a.weight * (spec.get(a.id) ?? 1)).slice(0, 7).map((t) => t.name);
    return it ? `- [${it.format}, ${Math.round(e.p)} pts] ${String(it.title).slice(0, 90)} | ${tags.join(', ')}${it.ai_summary ? ` | ${String(it.ai_summary).slice(0, 110)}` : ''}` : null;
  }).filter(Boolean);
}

const FANTASY_SCHEMA = {
  type: 'object',
  properties: {
    fantasies: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          scenario: { type: 'string' },
          kinks: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'integer' },
          why: { type: 'string' }
        },
        required: ['title', 'scenario', 'kinks', 'tags', 'confidence', 'why']
      }
    }
  },
  required: ['fantasies']
};

const FANTASY_RULES = `You suggest sexual fantasies to one adult, based only on what they actually engaged with. All people involved are consenting adults.

Write each fantasy as a mini story: two or three sentences, second person ("you"), that someone would daydream about: a specific setting that is hard to come by, who is there, what happens, and one twist that makes it thrilling. It must feel personal: build it from the few picks that fit together best, not from all of them, and let the twist come from their picks (public or getting caught means risk, a straight guy means he is crossing a line for the first time, a partner means someone watching). Never a list of the kinks, never "scenes where X and Y come together", never generic ("a muscular man in the shower"). Good example for someone who picked muscle, public and blowjob: "In a spa's shared showers, where anyone could walk in, a muscular stranger keeps holding your gaze. He drops to his knees anyway. Footsteps pass the door twice and he does not stop." Every fantasy in a set has its own setting, its own person and its own twist, so they are clearly different stories. Explicit is fine; everyone is a consenting adult; nothing about family members, age, animals or non-consent.

Rules:
- Only suggest a fantasy when several of their strongest signals point to it. Combine two or three things they clearly like into one situation; do not cram in everything they like.
- confidence 0 to 100: how sure you are this person wants it, judged from the evidence. Use 80+ only when the evidence is strong and consistent. Most ideas are 60 to 75.
- title: 2 to 6 words.
- kinks: names copied exactly from their kink list, 1 to 3.
- tags: 2 to 5 short lowercase tags that describe it.
- why: one short sentence naming the evidence.
- Do not repeat their existing fantasies. Nothing involving minors, non-consent, animals, or their hard limits.`;

let fantRun = null;
export async function suggestFantasies({ force = false } = {}) {
  if (fantRun) return fantRun;
  if (!force && now() - (getSetting('suggestFantasiesAt', 0) || 0) < 6 * 3600000) return 0;
  fantRun = (async () => {
    const kinks = listKinks().filter((k) => !k.isGroup && k.status !== 'hidden').slice(0, 14);
    const ev = evidence();
    if (ev.length < 5 || !kinks.length) return 0;
    const existing = [...listFantasies().map((f) => f.name), ...listSuggestions('fantasy', { status: 'new', limit: 30 }).map((s) => s.title), ...listSuggestions('fantasy', { status: 'dismissed', limit: 30 }).map((s) => s.title), ...listSuggestions('fantasy', { status: 'stale', limit: 30 }).map((s) => s.title)];
    const mem = listMemory({ status: 'active' }).slice(0, 12).map((m) => `- ${m.category}: ${m.content}`);
    const user = [
      `Their kinks (strongest first): ${kinks.map((k) => `${k.name} (${Math.round((k.allTime + k.lately) / 2)}%)`).join(', ')}`,
      `Tags rising lately: ${topTags({ by: 'lately', limit: 12 }).filter((t) => t.name && t.lately > 0.1).map((t) => t.name).join(', ') || 'none'}`,
      mem.length ? `What they told us:\n${mem.join('\n')}` : '',
      userLimits().length ? `Hard limits: ${userLimits().join(', ')}` : '',
      existing.length ? `Already suggested or saved (do not repeat): ${existing.join('; ')}` : '',
      `Posts they engaged with most (points: likes, heat and saves count most):\n${ev.join('\n')}`,
      'Suggest up to 4 fantasies.'
    ].filter(Boolean).join('\n\n');
    let out;
    if (config.mock) {
      out = { fantasies: [{ title: 'Sunset in the dunes', scenario: `On a hidden beach between the dunes at sunset, a stranger who has been watching you all afternoon finally walks over. It turns into slow ${kinks[0].name.toLowerCase()} in the warm sand. Voices drift over from the path, and neither of you stops.`, kinks: [kinks[0].name], tags: ['outdoor', 'sunset', 'public'], confidence: 82, why: 'You keep saving outdoor posts.' }] };
    } else {
      out = await chat({ kind: 'suggest', system: `${FANTASY_RULES}
${replyIn()}`, user, schema: FANTASY_SCHEMA, temperature: 0.6, model: deepModel(), numPredict: 1100, numCtx: 8192 });
    }
    const names = new Map(kinks.map((k) => [k.name.toLowerCase(), k]));
    let n = 0;
    for (const f of out?.fantasies || []) {
      const conf = Math.round(Number(f.confidence) || 0);
      if (conf < 75 || !f.scenario || String(f.scenario).split(/\s+/).length < 6) continue;
      const ks = (f.kinks || []).map((x) => names.get(String(x).toLowerCase())).filter(Boolean);
      if (put('fantasy', String(f.title).slice(0, 60), String(f.scenario).slice(0, 600), { kinks: ks.map((k) => ({ id: k.id, name: k.name, color: k.color })), tags: (f.tags || []).slice(0, 5).map((t) => String(t).toLowerCase()), why: String(f.why || '').slice(0, 200) }, Math.min(99, conf))) n++;
    }
    setSetting('suggestFantasiesAt', now());
    if (n) log('info', `Suggested ${n} new fantasies`);
    return n;
  })().catch((err) => { if (!err.yielded) log('warn', `Fantasy suggestions failed: ${err.message}`); return 0; }).finally(() => { fantRun = null; });
  return fantRun;
}

const COMBO_SCHEMA = {
  type: 'object',
  properties: {
    combos: {
      type: 'array',
      items: {
        type: 'object',
        properties: { a: { type: 'string' }, b: { type: 'string' }, distance: { type: 'string', enum: ['close', 'far'] }, match: { type: 'integer' }, why: { type: 'string' } },
        required: ['a', 'b', 'distance', 'match', 'why']
      }
    }
  },
  required: ['combos']
};

const COMBO_RULES = `You propose combinations of two kinks for one adult to explore together. Some should be close (same family or group, a natural deepening) and some far apart (different families that could still click, a surprising but believable mix).

- a and b: kink names copied exactly from the list.
- distance: "close" when they share a group or theme, "far" when they come from different groups.
- match 0 to 100: how likely this person enjoys the two together, from their scores and the pairs they already like. Be strict: 85+ only when both kinks are strong for them and the mix makes sense. Far combos are usually 55 to 75.
- why: one short sentence, plain words.
Do not repeat pairs listed as already known. Never combine anything with minors, non-consent or their hard limits.`;

let comboRun = null;
export async function suggestCombos({ force = false } = {}) {
  if (comboRun) return comboRun;
  if (!force && now() - (getSetting('suggestCombosAt', 0) || 0) < 4 * 3600000) return 0;
  comboRun = (async () => {
    const all = listKinks();
    const groups = new Map(all.filter((k) => k.isGroup).map((g) => [g.id, g.name]));
    const kinks = all.filter((k) => !k.isGroup && k.status !== 'hidden').slice(0, 18);
    if (kinks.length < 3) return 0;
    const pairs = kinkPairs(kinks);
    const user = [
      `Kinks with their group and score:\n${kinks.map((k) => `- ${k.name} | group: ${groups.get(k.parentId) || 'none'} | ${Math.round((k.allTime + k.lately) / 2)}%`).join('\n')}`,
      pairs.length ? `Pairs they already enjoy together (already known): ${pairs.slice(0, 8).map((p) => `${p.a.name} + ${p.b.name}`).join('; ')}` : '',
      userLimits().length ? `Hard limits: ${userLimits().join(', ')}` : '',
      'Propose 6 combinations: 3 close and 3 far.'
    ].filter(Boolean).join('\n\n');
    let out;
    if (config.mock) out = { combos: [{ a: kinks[0].name, b: kinks[1].name, distance: 'close', match: 78, why: 'Both are strong for you.' }, { a: kinks[0].name, b: kinks[2].name, distance: 'far', match: 64, why: 'Different moods that could meet.' }] };
    else out = await chat({ kind: 'combos', system: `${COMBO_RULES}
${replyIn()}`, user, schema: COMBO_SCHEMA, temperature: 0.4, model: fastModel(), numPredict: 900 });
    const names = new Map(kinks.map((k) => [k.name.toLowerCase(), k]));
    let n = 0;
    for (const c of out?.combos || []) {
      const a = names.get(String(c.a).toLowerCase());
      const b = names.get(String(c.b).toLowerCase());
      if (!a || !b || a.id === b.id) continue;
      const [x, y] = a.id < b.id ? [a, b] : [b, a];
      const conf = Math.max(0, Math.min(97, Math.round(Number(c.match) || 0)));
      if (conf < 50) continue;
      if (put('combo', `${x.label || x.name} + ${y.label || y.name}`, String(c.why || '').slice(0, 200), { a: { id: x.id, name: x.label || x.name, color: x.color }, b: { id: y.id, name: y.label || y.name, color: y.color }, distance: c.distance === 'far' ? 'far' : 'close' }, conf)) n++;
    }
    setSetting('suggestCombosAt', now());
    return n;
  })().catch((err) => { if (!err.yielded) log('warn', `Kink combos failed: ${err.message}`); return 0; }).finally(() => { comboRun = null; });
  return comboRun;
}

// Kinks that appeared in the last ten days and that you have not confirmed yet.
export function newKinks() {
  const since = now() - 10 * 86400000;
  const rows = getDb().prepare("SELECT id FROM kinks WHERE created > ? AND COALESCE(is_group, 0) = 0 AND status != 'hidden' AND (status = 'proposed' OR origin IN ('ai', 'tag'))").all(since).map((r) => r.id);
  const ks = listKinks({ includeHidden: false }).filter((k) => rows.includes(k.id));
  return ks.sort((a, b) => b.lately - a.lately);
}

// Fantasy ideas: at most four at a time, a fresh set every two sessions.
export const FANTASY_MAX = 4;
export async function refreshFantasyIdeas() {
  getDb().prepare("UPDATE suggestions SET status = 'stale' WHERE kind = 'fantasy' AND status = 'new'").run();
  return suggestFantasies({ force: true });
}

let timer = null;
export function startSuggestions() {
  if (timer) return;
  const tick = async () => {
    try { await suggestCombos(); } catch {}
    // Only to fill an empty list; the set itself changes every two sessions.
    try { if (!listSuggestions('fantasy', { limit: 1 }).length) await suggestFantasies(); } catch {}
  };
  onNewSession(async (n) => {
    // "Still true?" for old or cooled-down memories, and new memory suggestions to review now and then.
    const cooling = topTags({ by: 'long', limit: 40 }).filter((t) => t.name && t.long > 0.2 && t.lately < t.long * 0.4).map((t) => t.name);
    const asked = memoryUpkeep({ cooling });
    if (asked) log('info', `Asking again about ${asked} older memories`);
    const proposed = listMemory({ status: 'proposed' }).length;
    const lastReflect = getSetting('reflectSession', 0) || 0;
    if (proposed < 3 && n - lastReflect >= 2 && !config.mock) {
      setSetting('reflectSession', n);
      const { reflect } = await import('./ai/assistant.js');
      const ids = await reflect().catch(() => []);
      if (ids.length) log('info', `Suggested ${ids.length} new memories to review`);
    }
    const lastFant = getSetting('fantasySession', 0) || 0;
    if (n - lastFant >= 2) { setSetting('fantasySession', n); await refreshFantasyIdeas(); }
  });
  setTimeout(tick, 90000);
  timer = setInterval(tick, 30 * 60000);
}
