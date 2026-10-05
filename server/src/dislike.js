import { getDb, now, normalizeTag } from './db.js';
import { getItem, itemTags } from './store.js';
import { affinityMap, boostTags, LIKED_AT } from './profile.js';
import { chat, deepModel, modelInfo } from './ai/ollama.js';
import { framesFor, cleanTags, metaTag } from './ai/tagger.js';
import { conceptsOf } from './concepts.js';
import { isBlocked } from './safety.js';
import { replyIn, tr } from './i18n.js';
import { config } from './config.js';
import { log } from './log.js';

// When you hide or dislike a post, the bigger local model looks at it again (frames from the video when it can) to
// find what you probably did not like. What you already like is taken out first, so a post you hid because of one
// thing never makes you see less of what you love. Only what stays counts against future posts.

const PENALTY = -0.6;
const queue = [];
let busy = false;

function table() {
  getDb().exec('CREATE TABLE IF NOT EXISTS dislikes (item_id INTEGER PRIMARY KEY, status TEXT, reasons TEXT, note TEXT, kind TEXT, ts INTEGER)');
}

export function dislikeOf(itemId) {
  table();
  const r = getDb().prepare('SELECT * FROM dislikes WHERE item_id = ?').get(Number(itemId));
  if (!r) return { status: 'none', reasons: [] };
  let reasons = [];
  try { reasons = JSON.parse(r.reasons || '[]'); } catch {}
  return { status: r.status, reasons, note: r.note || null, kind: r.kind };
}

function save(itemId, patch) {
  table();
  const cur = getDb().prepare('SELECT * FROM dislikes WHERE item_id = ?').get(itemId) || {};
  const row = { item_id: itemId, status: cur.status || 'waiting', reasons: cur.reasons || '[]', note: cur.note || null, kind: cur.kind || 'less', ts: now(), ...patch };
  getDb().prepare('INSERT INTO dislikes(item_id, status, reasons, note, kind, ts) VALUES(@item_id, @status, @reasons, @note, @kind, @ts) ON CONFLICT(item_id) DO UPDATE SET status = @status, reasons = @reasons, note = @note, kind = @kind, ts = @ts').run(row);
}

// What you clearly like, as tag names and as concepts (so "hairy chest" covers "chest hair" too).
function likedNow() {
  const aff = affinityMap();
  const ids = [];
  for (const [key, v] of aff) if (key.startsWith('t:') && v.long >= LIKED_AT) ids.push(Number(key.slice(2)));
  const names = new Set();
  const q = getDb().prepare('SELECT name FROM tags WHERE id = ?');
  for (const id of ids) { const n = q.get(id)?.name; if (n) names.add(n); }
  const concepts = new Set([...names].flatMap((n) => conceptsOf(n)));
  return { names, concepts };
}

const isLiked = (tag, liked) => liked.names.has(tag) || conceptsOf(tag).some((c) => liked.concepts.has(c));

export function queueDislike(itemId, kind = 'less') {
  const id = Number(itemId);
  if (!id) return;
  const cur = dislikeOf(id);
  if (cur.status === 'running' || cur.status === 'waiting') return;
  save(id, { status: 'waiting', kind, reasons: '[]', note: null });
  queue.push(id);
  setTimeout(() => work().catch(() => {}), 50);
}

async function work() {
  if (busy) return;
  busy = true;
  try {
    while (queue.length) {
      const id = queue.shift();
      try { await analyse(id); } catch (err) {
        log('warn', `Looking at a hidden post failed: ${err.message}`);
        save(id, { status: 'failed', note: err.unavailable ? tr('The local AI is not running, so only the tags you do not already like count against it.') : tr('Could not look at it more closely, so only the tags you do not already like count against it.') });
      }
    }
  } finally {
    busy = false;
  }
}

const SCHEMA = {
  type: 'object',
  properties: {
    reasons: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' }
  },
  required: ['reasons', 'note']
};

async function analyse(id) {
  const item = getItem(id);
  if (!item) return;
  const kind = dislikeOf(id).kind;
  save(id, { status: 'running' });
  const tags = itemTags(id).filter((t) => t.kind !== 'performer' && t.weight >= 0.3).map((t) => t.name);
  const liked = likedNow();
  const left = tags.filter((t) => !isLiked(t, liked));
  const likes = [...liked.names].slice(0, 40);
  const model = deepModel();
  const info = config.mock ? null : await modelInfo(model).catch(() => null);
  const frames = info?.vision ? await framesFor(item, 4).catch(() => []) : [];
  const system = `You help a private, local adult-content browser learn from one adult user. He just ${kind === 'down' ? 'gave this post a thumbs down' : 'hid this post'}: he did not like it.
Find what in this post he probably did not like. Things he clearly likes are listed: never name any of them, or anything that means the same.
${frames.length > 1 ? `The images are ${frames.length} frames from across the video, in order.` : frames.length ? 'The image is from the post.' : 'There are no images, only the text.'}
Only name what is really written in the post or visible in it. Each reason is a short plain English tag, the way porn sites tag (1 to 3 words): a person's look, an act, a setting, a style, the sound, the quality. Give 1 to 5 reasons, the most likely first, and none at all when nothing clear stands out.
note: one short sentence for him about what probably put him off. ${replyIn()}`;
  const user = `Title: ${item.title || ''}
${item.body ? `Text: ${String(item.body).slice(0, 600)}\n` : ''}Source: ${item.source}${item.community ? ` · ${item.community}` : ''}
Tags on the post: ${tags.slice(0, 30).join(', ') || 'none'}
Tags on the post he does not already like: ${left.join(', ') || 'none'}
He likes: ${likes.join(', ') || 'nothing known yet'}`;
  const out = await chat({ kind: 'dislike', model, system, user, images: frames.length ? frames : undefined, schema: SCHEMA, temperature: 0.2, numPredict: 300, numCtx: frames.length > 2 ? 12288 : 8192 });
  let reasons = cleanTags((out?.reasons || []).map((r) => String(r).toLowerCase().trim()).filter(Boolean), 5)
    .map((r) => normalizeTag(r.name)).filter((r) => r && !isLiked(r, liked) && !metaTag(r, item) && !isBlocked({ tags: [r] }).blocked);
  reasons = [...new Set(reasons)].slice(0, 5);
  if (reasons.length) boostTags(reasons, PENALTY);
  save(id, { status: 'done', reasons: JSON.stringify(reasons), note: String(out?.note || '').slice(0, 240) || null });
  log('info', `Hidden post ${id}: probably not for him because of ${reasons.join(', ') || 'nothing clear'}`);
}

// "That was not it": takes one reason back.
export function dropReason(itemId, reason) {
  const cur = dislikeOf(itemId);
  const name = normalizeTag(reason);
  if (!name || !cur.reasons.includes(name)) return cur;
  boostTags([name], -PENALTY);
  save(Number(itemId), { reasons: JSON.stringify(cur.reasons.filter((r) => r !== name)) });
  return dislikeOf(itemId);
}
