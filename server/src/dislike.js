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
const BLOCK_PENALTY = -0.9;
const queue = [];
// A block looks at several posts of the creator together: the first one keeps the result, the others are context.
const GROUP = new Map();
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

// Blocking a creator: the bigger model looks at up to five of their posts together.
export function queueBlock(itemIds) {
  const ids = [...new Set((itemIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return;
  GROUP.set(ids[0], ids.slice(1, 5));
  save(ids[0], { status: 'waiting', kind: 'block', reasons: '[]', note: null });
  queue.push(ids[0]);
  setTimeout(() => work().catch(() => {}), 50);
}

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
  if (kind === 'block') return analyseBlock(id, item);
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
  boostTags([name], cur.kind === 'block' ? -BLOCK_PENALTY : -PENALTY);
  save(Number(itemId), { reasons: JSON.stringify(cur.reasons.filter((r) => r !== name)) });
  return dislikeOf(itemId);
}

// Several posts of a blocked creator at once: what they have in common that you do not already like.
async function analyseBlock(id, item) {
  save(id, { status: 'running' });
  const others = (GROUP.get(id) || []).map((x) => getItem(x)).filter(Boolean);
  GROUP.delete(id);
  const posts = [item, ...others].slice(0, 5);
  const liked = likedNow();
  const counts = new Map();
  for (const p of posts) for (const t of new Set(itemTags(p.id).filter((x) => x.kind !== 'performer' && x.weight >= 0.3).map((x) => x.name))) counts.set(t, (counts.get(t) || 0) + 1);
  const common = [...counts].filter(([t, n]) => (posts.length < 2 || n >= 2) && !isLiked(t, liked)).sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 25);
  const model = deepModel();
  const info = config.mock ? null : await modelInfo(model).catch(() => null);
  const frames = [];
  if (info?.vision) for (const p of posts.slice(0, 4)) { const f = await framesFor(p, posts.length > 2 ? 2 : 3).catch(() => []); frames.push(...f); if (frames.length >= 8) break; }
  const system = `You help a private, local adult-content browser learn from one adult user. He just blocked a creator: he never wants to see them again, which is stronger than hiding one post.
Below are ${posts.length} of their posts${frames.length ? ` and ${frames.length} images taken from them` : ''}. Find what these posts have in common that he probably did not like: the creator's look, the acts, the setting, the style, the sound, the quality.
Things he clearly likes are listed: never name any of them, or anything that means the same.
Only name what is really written in the posts or visible in them. Each reason is a short plain English tag, the way porn sites tag (1 to 3 words). Give 1 to 6 reasons, the most likely first, and none at all when nothing clear stands out.
note: one short sentence for him about what probably put him off this creator. ${replyIn()}`;
  const user = `${posts.map((p, i) => `Post ${i + 1}: ${p.title || ''}${p.body ? ` (${String(p.body).slice(0, 200)})` : ''}`).join('\n')}
Tags most of their posts share that he does not already like: ${common.join(', ') || 'none'}
He likes: ${[...liked.names].slice(0, 40).join(', ') || 'nothing known yet'}`;
  const out = await chat({ kind: 'dislike', model, system, user, images: frames.length ? frames : undefined, schema: SCHEMA, temperature: 0.2, numPredict: 360, numCtx: frames.length > 3 ? 16384 : 8192 });
  let reasons = cleanTags((out?.reasons || []).map((r) => String(r).toLowerCase().trim()).filter(Boolean), 6)
    .map((r) => normalizeTag(r.name)).filter((r) => r && !isLiked(r, liked) && !metaTag(r, item) && !isBlocked({ tags: [r] }).blocked);
  reasons = [...new Set(reasons)].slice(0, 6);
  if (reasons.length) boostTags(reasons, BLOCK_PENALTY);
  save(id, { status: 'done', reasons: JSON.stringify(reasons), note: String(out?.note || '').slice(0, 240) || null });
  log('info', `Blocked creator of post ${id}: probably because of ${reasons.join(', ') || 'nothing clear'}`);
}

// "Did not like": what the closer looks after hides, thumbs down and blocks found, and only what still counts
// against posts now: a tag you have liked since then, or that is back to neutral, is left out.
export function dislikedTags() {
  table();
  const rows = getDb().prepare("SELECT item_id, reasons, kind, ts FROM dislikes WHERE status = 'done'").all();
  const aff = affinityMap();
  const liked = likedNow();
  const by = new Map();
  for (const r of rows) {
    let reasons = [];
    try { reasons = JSON.parse(r.reasons || '[]'); } catch {}
    for (const tag of reasons) {
      const cur = by.get(tag) || { tag, n: 0, kinds: {}, last: 0, items: [] };
      cur.n++;
      cur.kinds[r.kind || 'less'] = (cur.kinds[r.kind || 'less'] || 0) + 1;
      cur.last = Math.max(cur.last, r.ts || 0);
      cur.items.push(r.item_id);
      by.set(tag, cur);
    }
  }
  const q = getDb().prepare('SELECT id FROM tags WHERE name = ?');
  const out = [];
  for (const d of by.values()) {
    if (isLiked(d.tag, liked)) continue;
    const id = q.get(d.tag)?.id;
    const long = id ? (aff.get(`t:${id}`)?.long || 0) : 0;
    if (long > -0.05) continue;
    out.push({ ...d, strength: Math.round(-long * 100) / 100 });
  }
  return out.sort((a, b) => b.n - a.n || b.strength - a.strength).slice(0, 60);
}

// "That is fine": takes a tag back from every closer look that named it.
export function forgiveTag(tag) {
  const name = normalizeTag(tag);
  if (!name) return 0;
  table();
  let n = 0;
  for (const r of getDb().prepare("SELECT item_id, reasons, kind FROM dislikes WHERE status = 'done'").all()) {
    let reasons = [];
    try { reasons = JSON.parse(r.reasons || '[]'); } catch {}
    if (!reasons.includes(name)) continue;
    boostTags([name], r.kind === 'block' ? -BLOCK_PENALTY : -PENALTY);
    save(r.item_id, { reasons: JSON.stringify(reasons.filter((x) => x !== name)) });
    n++;
  }
  return n;
}
