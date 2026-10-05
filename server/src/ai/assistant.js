import { getDb, now } from '../db.js';
import { chat, fastModel } from './ollama.js';
import { listKinks, listFantasies } from '../kinks.js';
import { syncKinks, syncGroups, learnFamilies, logSummary } from '../kinkengine.js';
import { topTags } from '../profile.js';
import { memoryForPrompt, addMemory, listMemory, CATEGORIES } from '../memory.js';
import { itemTags } from '../store.js';
import { tr, trn, replyIn } from '../i18n.js';

const FORMATS = ['long', 'short', 'gif', 'image', 'set', 'story', 'discussion'];

const ASK_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['feed', 'journey', 'map', 'memory', 'answer'] },
    filters: {
      type: 'object',
      properties: {
        formats: { type: 'array', items: { type: 'string', enum: FORMATS } },
        length: { type: 'string', enum: ['any', 'quick', 'medium', 'long'] },
        tags: { type: 'array', items: { type: 'string' } },
        kink: { type: 'string' },
        fantasy: { type: 'string' },
        onlyNew: { type: 'boolean' },
        following: { type: 'boolean' },
        saved: { type: 'boolean' },
        minMatch: { type: 'number' }
      }
    },
    journey: { type: 'object', properties: { kink: { type: 'string' }, fantasy: { type: 'string' }, mode: { type: 'string', enum: ['close', 'branch', 'surprise'] } } },
    reply: { type: 'string' }
  },
  required: ['action', 'reply']
};

export function fallbackParse(q, kinks = listKinks(), fantasies = listFantasies()) {
  const s = q.toLowerCase();
  const out = { action: 'feed', filters: {}, reply: '' };
  const fan = fantasies.find((f) => s.includes(f.name.toLowerCase()));
  const kink = kinks.find((k) => s.includes(k.name.toLowerCase()) || (k.label && s.includes(k.label.toLowerCase())));
  if (/journey|guide me|take me/.test(s)) {
    out.action = 'journey';
    out.journey = { fantasy: fan?.name, kink: kink?.name, mode: /branch|new|different|explore/.test(s) ? 'branch' : fan || kink ? 'close' : 'surprise' };
    out.reply = tr('Starting a journey.');
    return out;
  }
  if (/lately|my map|pattern|what (am i|do i) (into|like)/.test(s)) return { action: 'map', filters: {}, reply: tr('Opening your map.') };
  if (/memory|remember/.test(s)) return { action: 'memory', filters: {}, reply: tr('Opening your memory.') };
  const f = out.filters;
  if (fan) f.fantasy = fan.name;
  if (kink) f.kink = kink.name;
  const fm = [];
  if (/\bgifs?\b|loops?/.test(s)) fm.push('gif');
  if (/short[- ]?form|shorts\b|clips?/.test(s)) fm.push('short');
  if (/long[- ]?form|full videos?|long videos?/.test(s)) fm.push('long');
  if (/\bvideos?\b/.test(s) && !fm.length) fm.push('long', 'short');
  if (/image sets?|galler/.test(s)) fm.push('set');
  else if (/images?|photos?|pictures?|pics/.test(s)) fm.push('image', 'set');
  if (/stor(y|ies)|to read|written/.test(s)) fm.push('story');
  if (/discussion|threads?/.test(s)) fm.push('discussion');
  if (fm.length) f.formats = [...new Set(fm)];
  if (/\blong\b/.test(s) && !fm.includes('long')) f.length = 'long';
  if (/\bquick\b|\bshort\b(?!-)/.test(s) && !fm.includes('short')) f.length = 'quick';
  if (/\bnew\b|discover|surprise|something different/.test(s)) f.onlyNew = true;
  if (/follow/.test(s)) f.following = true;
  if (/saved/.test(s)) f.saved = true;
  const known = new Set(topTags({ by: 'long', limit: 400, positive: true }).map((t) => t.name).filter(Boolean));
  const words = s.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/);
  const tagHits = [];
  for (let i = 0; i < words.length; i++) for (const len of [3, 2, 1]) {
    const w = words.slice(i, i + len).join(' ');
    if (w.length > 2 && known.has(w)) tagHits.push(w);
  }
  const kn = kink ? kink.name.toLowerCase() : '';
  const hits = tagHits.filter((h) => !kn.includes(h));
  if (hits.length) f.tags = [...new Set(hits)];
  const any = Object.keys(f).length;
  out.reply = any ? tr('Center feed updated.') : tr('I couldn’t turn that into a view. Try a kink, a format, a length, a mood, or ask for a journey.');
  if (!any) out.action = 'answer';
  return out;
}

export async function parseAsk(q) {
  const kinks = listKinks();
  const fantasies = listFantasies();
  const tags = topTags({ by: 'long', limit: 120 }).map((t) => t.name).filter(Boolean);
  const system = `You control the dashboard of a private, local adult-content browser for one adult user. Turn the user's request into an action.
action "feed" sets filters on the center feed, "journey" starts a guided finite sequence, "map" opens their preference map, "memory" opens their memory, "answer" just replies.
Formats: long (long-form video), short (short-form video), gif, image, set (image sets), story, discussion. Length: quick, medium, long.
Their kinks: ${kinks.map((k) => k.name).join(', ') || 'none yet'}.
Their fantasies: ${fantasies.map((f) => f.name).join(', ') || 'none yet'}.
Tags they know: ${tags.join(', ') || 'none yet'}.
What you remember about them:
${memoryForPrompt() || '- nothing yet'}
Use kink and fantasy names exactly as listed. Put anything else specific in filters.tags. reply is one short sentence saying what you did. ${replyIn()}`;
  try {
    const out = await chat({ kind: 'ask-parse', system, user: q, schema: ASK_SCHEMA, temperature: 0.1 });
    if (out && out.action) return { ...out, engine: 'model' };
  } catch (err) {
    return { ...fallbackParse(q, kinks, fantasies), engine: 'rules', note: err.message };
  }
  return { ...fallbackParse(q, kinks, fantasies), engine: 'rules' };
}

export async function askItem(item, question, comments = []) {
  const tags = itemTags(item.id).map((t) => t.name).slice(0, 25);
  const system = `You answer questions about one post in a private, local adult-content browser used by one adult. Be direct and specific, under 120 words. Use only the post details and comments given; say so when something isn't in them. ${replyIn()}
What you remember about the user:
${memoryForPrompt(20) || '- nothing yet'}`;
  const user = [
    `Post: ${item.title}`,
    `Where: ${item.community || item.source}${item.author ? ` by ${item.author}` : ''}`,
    `Format: ${item.format}${item.duration ? `, ${Math.round(item.duration)}s` : ''}`,
    `Tags: ${tags.join(', ')}`,
    item.aiSummary ? `Description: ${item.aiSummary}` : '',
    item.body ? `Text: ${item.body.slice(0, 3000)}` : '',
    comments.length ? `Top comments:\n${comments.slice(0, 6).map((c) => `- ${c.author}: ${String(c.body).slice(0, 300)}`).join('\n')}` : '',
    `Question: ${question}`
  ].filter(Boolean).join('\n');
  return chat({ kind: 'ask-item', system, user, temperature: 0.4 });
}

export function sessionStats(sessionId, sinceMs = 3 * 3600 * 1000) {
  const db = getDb();
  const since = now() - sinceMs;
  const where = sessionId ? 'session_id = ? AND ts > ?' : 'ts > ?';
  const args = sessionId ? [sessionId, since] : [since];
  const counts = Object.fromEntries(db.prepare(`SELECT type, COUNT(*) c, COALESCE(SUM(value),0) v FROM events WHERE ${where} GROUP BY type`).all(...args).map((r) => [r.type, { n: r.c, sum: r.v }]));
  const first = db.prepare(`SELECT MIN(ts) t FROM events WHERE ${where}`).get(...args).t;
  const formats = db.prepare(`SELECT i.format, COUNT(DISTINCT e.item_id) n FROM events e JOIN items i ON i.id = e.item_id WHERE ${where.replace(/session_id/g, 'e.session_id').replace(/ts >/g, 'e.ts >')} AND e.type = 'dwell' GROUP BY i.format`).all(...args);
  const topTagsNow = topTags({ by: 'short', limit: 6 }).filter((t) => t.short > 0.05).map((t) => t.name);
  const longMs = db.prepare(`SELECT COALESCE(SUM(e.value),0) ms FROM events e JOIN items i ON i.id = e.item_id WHERE ${where.replace(/session_id/g, 'e.session_id').replace(/ts >/g, 'e.ts >')} AND e.type = 'dwell' AND i.format IN ('long','story')`).get(...args).ms;
  const totalMs = counts.dwell?.sum || 0;
  return {
    minutes: first ? Math.round((now() - first) / 60000) : 0,
    seen: counts.impression?.n || 0,
    saved: counts.save?.n || 0,
    rated: counts.rate?.n || 0,
    upvoted: counts.up?.n || 0,
    longShare: totalMs ? Math.round((longMs / totalMs) * 100) : 0,
    formats,
    topTagsNow
  };
}

export async function summarizeSession(sessionId) {
  const s = sessionStats(sessionId);
  const plain = tr("{minutes}, {seen}, {saved} saved, {rated} rated. Right now you're drawn to {tags}.", { minutes: trn(s.minutes, '{n} minute', '{n} minutes'), seen: trn(s.seen, '{n} post seen', '{n} posts seen'), saved: s.saved, rated: s.rated, tags: s.topTagsNow.slice(0, 3).join(', ') || tr('a bit of everything') });
  try {
    const text = await chat({
      kind: 'summary',
      system: `Summarize one evening session of a private adult-content browser for its adult user in two or three plain sentences, second person, no judgement. ${replyIn()}`,
      user: JSON.stringify(s),
      temperature: 0.5
    });
    return { text, stats: s };
  } catch {
    return { text: plain, stats: s };
  }
}

const REFLECT_SCHEMA = {
  type: 'object',
  properties: {
    memories: { type: 'array', items: { type: 'object', properties: { category: { type: 'string', enum: CATEGORIES }, content: { type: 'string' }, evidence: { type: 'string' } }, required: ['category', 'content'] } }
  },
  required: ['memories']
};

export async function reflect() {
  const all = topTags({ by: 'long', limit: 15 }).filter((t) => t.long > 0.1);
  const lately = topTags({ by: 'lately', limit: 30 });
  const rising = lately.filter((t) => t.lately > 0.15 && t.lately > t.long * 1.3).slice(0, 8);
  const falling = all.filter((t) => t.lately < t.long * 0.5).slice(0, 6);
  const negative = topTags({ by: 'long', limit: 10, positive: false }).filter((t) => t.long < -0.3);
  const rated = getDb().prepare('SELECT i.title, i.community, s.rating FROM item_state s JOIN items i ON i.id = s.item_id WHERE s.rating >= 4 ORDER BY s.rowid DESC LIMIT 12').all();
  const existing = listMemory().map((m) => `- [${m.category}] ${m.content}`).join('\n');
  const user = [
    'All-time strongest tags:', ...all.map((t) => `- ${t.name} (${t.long.toFixed(2)})`),
    'Rising lately:', ...rising.map((t) => `- rising: ${t.name} (lately ${t.lately.toFixed(2)} vs all-time ${t.long.toFixed(2)})`),
    'Cooling:', ...falling.map((t) => `- cooling: ${t.name}`),
    'Consistently skipped:', ...negative.map((t) => `- ${t.name}`),
    'Rated 4 or 5 flames:', ...rated.map((r) => `- ${r.title} (${r.community}, ${r.rating})`),
    'Already remembered:', existing || '- nothing'
  ].join('\n');
  const system = `You maintain the memory of a private, local adult-content browser for one adult user. From the behaviour data, propose at most 6 new, specific memories that are not already remembered. Each memory is one sentence in plain language about the user's tastes, fantasies, dislikes, format preferences or favourite creators. Include short evidence. Don't repeat or rephrase existing memories. Keep an open mind: note shifts, not just constants. ${replyIn()}`;
  let proposals = [];
  try {
    const out = await chat({ kind: 'reflect', system, user, schema: REFLECT_SCHEMA, temperature: 0.4 });
    proposals = out?.memories || [];
  } catch (err) {
    proposals = rising.slice(0, 3).map((t) => ({ category: 'Kinks and interests', content: tr('Lately more into {tag} than usual.', { tag: t.name }), evidence: tr('Rising over the last week') }));
    if (!proposals.length) throw err;
  }
  const ids = [];
  for (const p of proposals.slice(0, 6)) ids.push(addMemory({ category: CATEGORIES.includes(p.category) ? p.category : 'Notes', content: p.content, origin: 'ai', status: 'proposed', evidence: p.evidence || null }));
  return ids;
}

// Kinks come from the kink engine: clear evidence in what you liked, plain names, families once there are two.
// The local model is only asked which family an unfamiliar concept belongs to.
export async function refreshKinks() {
  const s = syncKinks();
  try { const fams = await learnFamilies(chat, fastModel()); if (fams) syncGroups(fams); } catch {}
  logSummary(s);
  return s;
}

export async function organizeKinks() {
  return refreshKinks();
}

export async function reviewKinkNames() {
  return [];
}
