import { getDb, now } from './db.js';
import { config } from './config.js';
import { chat, fastModel } from './ai/ollama.js';
import { listKinks } from './kinks.js';
import { topTags } from './profile.js';
import { listMemory } from './memory.js';
import { userLimits } from './safety.js';
import { getItem } from './store.js';
import * as lemmy from './sources/lemmy.js';
import * as rss from './sources/redditRss.js';
import * as reddit from './sources/reddit.js';
import * as bluesky from './sources/bluesky.js';
import { log } from './log.js';
import { genderPrefs } from './gender.js';

// Threads: a statement or question from a sexual discussion community plus its two most upvoted replies.
// The fast model reads new threads in batches, throws out anything that is not an actual sexual
// discussion (or is a moderator post), and scores how well each fits this person.

const clean = (s, n = 600) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

function goodReply(c) {
  const a = String(c.author || '').toLowerCase();
  const b = String(c.body || '').trim();
  if (!b || b.length < 3 || /^\[(deleted|removed)\]$/i.test(b)) return false;
  if (a === 'automoderator' || /modteam$/.test(a)) return false;
  if (/^(i am a bot|this action was performed automatically)/i.test(b)) return false;
  return true;
}

export async function topReplies(item, { waitMs = 8000, n = 2 } = {}) {
  if (n <= 2 && item.media?.top && now() - (item.media.topAt || 0) < 12 * 3600000) return item.media.top;
  if (n > 2) return moreReplies(item, n, waitMs);
  let list = [];
  if (config.mock) {
    list = [
      { author: 'amber_tide12', body: 'Honestly the anticipation is the best part for me. Knowing it is coming later that night.', score: 212 },
      { author: 'silk_echo19', body: 'Same here. We started leaving each other notes during the day and it changed everything.', score: 96 }
    ];
  } else if (item.source === 'lemmy' && (item.media?.lemmyId)) {
    list = (await lemmy.comments(item.media.lemmyId, 8)).sort((a, b) => (b.score || 0) - (a.score || 0));
  } else if (item.source === 'bluesky') {
    list = await bluesky.topReplies(item.extId, 4);
  } else if (item.source === 'reddit') {
    if (reddit.redditConfigured()) list = await reddit.comments(item.extId, 6);
    else list = await rss.comments(item.extId, 4, { maxWaitMs: waitMs });
  }
  const top = list.filter(goodReply).slice(0, 2).map((c) => ({ author: c.author, body: clean(c.body, 700), score: c.score ?? null }));
  const db = getDb();
  const cur = getItem(item.id);
  if (cur) db.prepare('UPDATE items SET media = ? WHERE id = ?').run(JSON.stringify({ ...cur.media, top, topAt: now() }), item.id);
  return top;
}

async function moreReplies(item, n, waitMs) {
  let list = [];
  if (config.mock) list = Array.from({ length: Math.min(n, 9) }, (_, i) => ({ author: `reader_${i + 1}`, body: `Reply number ${i + 1} with its own take on it.`, score: 90 - i * 9 }));
  else if (item.source === 'lemmy' && item.media?.lemmyId) list = (await lemmy.comments(item.media.lemmyId, n)).sort((a, b) => (b.score || 0) - (a.score || 0));
  else if (item.source === 'bluesky') list = await bluesky.topReplies(item.extId, n);
  else if (item.source === 'reddit') list = reddit.redditConfigured() ? await reddit.comments(item.extId, n) : await rss.comments(item.extId, n, { maxWaitMs: waitMs });
  return list.filter(goodReply).slice(0, n).map((c) => ({ author: c.author, body: clean(c.body, 1500), score: c.score ?? null, replies: (c.replies || []).slice(0, 3).map((r) => ({ author: r.author, body: clean(r.body, 600), score: r.score ?? null })) }));
}

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          sexual: { type: 'boolean' },
          mod: { type: 'boolean' },
          match: { type: 'integer' },
          hook: { type: 'string' },
          kinks: { type: 'array', items: { type: 'string' } }
        },
        required: ['id', 'sexual', 'mod', 'match', 'hook']
      }
    }
  },
  required: ['items']
};

export function tasteBrief() {
  const kinks = listKinks().filter((k) => !k.isGroup && k.status !== 'hidden').sort((a, b) => (b.allTime + b.lately) - (a.allTime + a.lately)).slice(0, 10);
  const tags = topTags({ by: 'long', limit: 30 }).filter((t) => t.name && t.long > 0.1).slice(0, 18).map((t) => t.name);
  const now = topTags({ by: 'short', limit: 10 }).filter((t) => t.name && t.short > 0.1).slice(0, 6).map((t) => t.name);
  const mem = listMemory({ status: 'active' }).filter((m) => /kink|interest|fantas|turn|limit|now/i.test(m.category)).slice(0, 12).map((m) => `${m.category}: ${m.content}`);
  const gp = genderPrefs();
  const balance = gp.male >= 85 ? 'Wants men only; women should be rare.' : gp.male >= 62 ? `Prefers men (${gp.male}% men, ${100 - gp.male}% women).` : gp.male <= 15 ? 'Wants women only; men should be rare.' : gp.male <= 38 ? `Prefers women (${100 - gp.male}% women, ${gp.male}% men).` : '';
  return {
    kinks: kinks.map((k) => k.name),
    text: [
      balance,
      gp.trans ? '' : 'Does not want trans content.',
      kinks.length ? `Strongest kinks: ${kinks.map((k) => `${k.name} (${Math.round((k.allTime + k.lately) / 2)}%)`).join(', ')}` : '',
      tags.length ? `Tags they respond to most: ${tags.join(', ')}` : '',
      now.length ? `Into right now: ${now.join(', ')}` : '',
      mem.length ? `What they told us:\n${mem.map((m) => `- ${m}`).join('\n')}` : '',
      userLimits().length ? `Hard limits (score 0 if the thread is about these): ${userLimits().join(', ')}` : ''
    ].filter(Boolean).join('\n')
  };
}

const RULES = `You pick discussion threads for one adult's private feed. Each thread is a post from a community where adults talk about sex: a statement, confession, question or opinion, sometimes with a short body.

For every thread return:
- sexual: true only when the thread itself is about sex, desire, kinks, fantasies, sexual experiences, turn-ons or a sexual question. False for relationship drama with no sexual angle, general chat, selling or promotion, people looking for partners (r4r, "looking for", meetups, DMs, snap or kik), verification, and anything that involves or hints at minors or school ages.
- mod: true for moderator posts, rules, announcements, weekly or daily threads, megathreads, meta posts about the community.
- match: 0 to 100, how much this person would want to read it, using their tastes below. 85 or more only when it is squarely about one of their strongest kinks or current interests. Around 50 for a good sexual thread on a neutral topic. Under 25 when it is about something outside their tastes, and 0 for their hard limits.
- hook: at most 9 plain words saying what the thread is about.
- kinks: up to 3 of their kink names (copy them exactly) that the thread is about, or none.
Judge the actual topic, not single words in it. Be strict: most threads are not a 90.`;

let running = false;
export async function rankThreads({ batch = 8 } = {}) {
  if (running) return 0;
  running = true;
  try {
    const db = getDb();
    const rows = db.prepare(`SELECT i.id, i.title, i.body, i.community, i.source FROM items i LEFT JOIN item_state s ON s.item_id = i.id
      WHERE i.format = 'discussion' AND i.blocked = 0 AND i.thread_ok IS NULL AND COALESCE(s.hidden, 0) = 0 ORDER BY COALESCE(s.seen, 0), i.fetched_at DESC LIMIT ?`).all(batch);
    if (!rows.length) return 0;
    const brief = tasteBrief();
    const user = `${brief.text || 'No taste profile yet: score on general appeal.'}\n\nThreads:\n${rows.map((r) => `#${r.id} [${r.community || r.source}] ${clean(r.title, 220)}${r.body ? ` | ${clean(r.body, 380)}` : ''}`).join('\n')}`;
    let out;
    if (config.mock) out = { items: rows.map((r, i) => ({ id: r.id, sexual: !/rules|weekly/i.test(r.title), mod: /rules|weekly/i.test(r.title), match: 55 + ((r.id * 37) % 40), hook: clean(r.title, 50), kinks: brief.kinks.slice(i % 2, (i % 2) + 1) })) };
    else out = await chat({ kind: 'threads', system: RULES, user, schema: SCHEMA, temperature: 0.1, model: fastModel(), numPredict: 90 * rows.length + 60 });
    const byId = new Map((out?.items || []).map((x) => [Number(x.id), x]));
    const upd = db.prepare('UPDATE items SET thread_ok = ?, thread_match = ?, ai_summary = COALESCE(ai_summary, ?) WHERE id = ?');
    const block = db.prepare("UPDATE items SET blocked = 1, block_reason = 'announcement' WHERE id = ?");
    let n = 0;
    db.transaction(() => {
      for (const r of rows) {
        const x = byId.get(r.id);
        if (!x) { upd.run(0, 0, null, r.id); continue; }
        if (x.mod) { block.run(r.id); upd.run(0, 0, null, r.id); continue; }
        upd.run(x.sexual ? 1 : 0, Math.max(0, Math.min(100, Math.round(Number(x.match) || 0))), clean(x.hook, 80) || null, r.id);
        n++;
      }
    })();
    return n;
  } catch (err) {
    if (!err.yielded) log('warn', `Thread ranking failed: ${err.message}`);
    return 0;
  } finally {
    running = false;
  }
}

export function hotThreads({ limit = 5, exclude = [] } = {}) {
  const ex = new Set(exclude.map(Number));
  return getDb().prepare(`SELECT i.id FROM items i LEFT JOIN item_state s ON s.item_id = i.id
    WHERE i.format = 'discussion' AND i.blocked = 0 AND i.thread_ok = 1 AND COALESCE(s.hidden, 0) = 0 AND COALESCE(s.seen, 0) = 0
    ORDER BY i.thread_match DESC, i.score DESC LIMIT ?`).all(limit + ex.size + 10).map((r) => r.id).filter((id) => !ex.has(id)).slice(0, limit);
}

let lastRedditReplies = 0;
async function fillReplies() {
  const ids = hotThreads({ limit: 12 });
  for (const id of ids) {
    const it = getItem(id);
    if (!it || it.media?.topAt) continue;
    if (it.source === 'reddit' && !reddit.redditConfigured()) {
      const gap = rss.feedToken() ? 20000 : 10 * 60000;
      if (now() - lastRedditReplies < gap) continue;
      lastRedditReplies = now();
    }
    try { await topReplies(it, { waitMs: 5 * 60000 }); } catch (err) { if (!/rate|busy|slot/i.test(err.message)) log('warn', `Replies for thread ${id} failed: ${err.message}`); }
  }
}

let timer = null;
export function startThreads() {
  if (timer) return;
  const tick = async () => {
    try { await rankThreads(); await fillReplies(); } catch {}
  };
  setTimeout(tick, 30000);
  timer = setInterval(tick, 2 * 60000);
}
