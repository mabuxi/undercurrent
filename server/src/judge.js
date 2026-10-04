import { getDb, now } from './db.js';
import { config } from './config.js';
import { chat, fastModel, holdTagging } from './ai/ollama.js';
import { tagsForItems, tagSpecificity } from './store.js';
import { tasteBrief } from './threads.js';
import { log } from './log.js';

// After a post is tagged, the fast model reads what it actually is and judges how well it fits you.
// Clear mismatches never reach the feed; good fits rise. Works for every source, big video sites included.

const SCHEMA = {
  type: 'object',
  properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, fit: { type: 'integer' } }, required: ['id', 'fit'] } } },
  required: ['items']
};

const RULES = `You decide how well posts fit one adult's taste, for their private feed. You get their taste, then for each post its title, what happens in it, and its tags.
fit is 0 to 100:
- 80 or more: squarely one of their strongest kinks or current interests.
- 55 to 75: touches something they like.
- 40 to 50: generic, or nothing to go on.
- below 25: mostly things they never engage with, or the opposite of what they like.
- 0: involves one of their hard limits.
Read what actually happens and who is in it, not single words. Generic content from big video sites that has nothing to do with their tastes belongs around 30 to 45. Be strict with high scores. For stories, read the story itself: judge what actually happens in it, its dynamic and who is in it.`;

let running = false;
export async function judgeBatch(size = 12) {
  if (running || config.mock || holdTagging()) return 0;
  running = true;
  try {
    const db = getDb();
    const rows = db.prepare(`SELECT i.id, i.title, i.ai_summary, i.source, i.format, i.body FROM items i LEFT JOIN item_state s ON s.item_id = i.id
      WHERE i.ai_status = 'done' AND i.ai_fit IS NULL AND i.blocked = 0 AND COALESCE(s.seen, 0) = 0 AND (i.fetched_at > ? OR i.format = 'story') ORDER BY (i.format = 'story') DESC, i.fetched_at DESC LIMIT ?`).all(now() - 5 * 86400000, size);
    if (rows.length < 3) return 0;
    const brief = tasteBrief();
    if (!brief.kinks.length && !brief.text) return 0;
    const spec = tagSpecificity().map;
    const tagMap = tagsForItems(rows.map((r) => r.id));
    const lines = rows.map((r) => {
      const tags = (tagMap.get(r.id) || []).filter((t) => t.kind !== 'performer').sort((a, b) => b.weight * (spec.get(b.id) ?? 1) - a.weight * (spec.get(a.id) ?? 1)).slice(0, 16).map((t) => t.name);
      const text = r.format === 'story' ? ` | the story: ${String(r.body || '').replace(/\s+/g, ' ').slice(0, 900)}` : '';
      return `#${r.id} [${r.format}, ${r.source}] ${String(r.title).slice(0, 140)}${r.ai_summary ? ` | happens: ${String(r.ai_summary).slice(0, 160)}` : ''} | tags: ${tags.join(', ')}${text}`;
    });
    const out = await chat({ kind: 'judge', system: RULES, user: `${brief.text}\n\nPosts:\n${lines.join('\n')}`, schema: SCHEMA, temperature: 0.1, model: fastModel(), numPredict: 30 * rows.length + 60, numCtx: 8192 });
    const byId = new Map((out?.items || []).map((x) => [Number(x.id), Math.max(0, Math.min(100, Math.round(Number(x.fit) || 0)))]));
    const upd = db.prepare('UPDATE items SET ai_fit = ? WHERE id = ?');
    let n = 0;
    db.transaction(() => { for (const r of rows) if (byId.has(r.id)) { upd.run(byId.get(r.id), r.id); n++; } })();
    return n;
  } catch (err) {
    if (!err.yielded) log('warn', `Fit judging failed: ${err.message}`);
    return 0;
  } finally {
    running = false;
  }
}

let timer = null;
export function startJudge() {
  if (timer) return;
  timer = setInterval(() => { judgeBatch().catch(() => {}); }, 45000);
}
