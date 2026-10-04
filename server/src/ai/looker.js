import { config } from '../config.js';
import { getDb, now, getSetting } from '../db.js';
import { chat, fastModel, deepModel } from './ollama.js';
import { invalidatePool } from '../searchstate.js';
import { getItem, addTags } from '../store.js';
import { isBlocked } from '../safety.js';
import { setGender } from '../gender.js';
import { fetchImage, framesFor, cleanTags, VERIFIED } from './tagger.js';
import { shrinkImage } from './frames.js';
import { log } from '../log.js';

// A quick look at the picture itself for posts about to be shown: who is really in it (men, women, trans)
// and what the image shows. Four posts per call, so it keeps up with scrolling. Gender from the image wins
// over anything guessed from titles and tags.

const SCHEMA = {
  type: 'object',
  properties: {
    posts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { image: { type: 'integer' }, men: { type: 'integer' }, women: { type: 'integer' }, trans: { type: 'boolean' }, tags: { type: 'array', items: { type: 'string' } }, youngest_age: { type: 'integer' } },
        required: ['image', 'men', 'women', 'trans', 'tags', 'youngest_age']
      }
    }
  },
  required: ['posts']
};

const RULES = `You look at images from posts in a private adult-content browser used by one adult. For every image, in order:
- men: how many men are visible (a male body part counts as a man). 0 when none.
- women: how many women are visible (a female body part counts as a woman). 0 when none.
- trans: true only when a trans person is clearly shown.
- tags: 3 to 8 short lowercase tags for what is clearly visible in this image: the people, their bodies, what they wear, what they do, the place. Only things you can point at in the picture. When you are not sure something is there, leave it out. Fewer correct tags are much better than many guesses.
- youngest_age: your estimate of the age of the youngest visible person, from face and body. 0 when no person is visible.
Judge only from what you see. Do not guess from style or colours. If the image is not a photo of people (text, a logo, a drawing of nothing), give 0 men and 0 women and no tags.`;

// The old instructions gave five example tags, and the quick look kept answering with them whether they were in
// the picture or not ("shower" on a third of everything). Those are removed again unless something else on the
// post (its title, its site tags, the deeper look) says the same.
export const VISION_ECHOES = ['close up', 'shower', 'hairy chest', 'doggystyle', 'jockstrap'];
export function cleanVisionEchoes() {
  const db = getDb();
  let removed = 0;
  for (const name of VISION_ECHOES) {
    const tid = db.prepare('SELECT id FROM tags WHERE name = ?').get(name)?.id;
    if (!tid) continue;
    removed += db.prepare(`DELETE FROM item_tags WHERE tag_id = ? AND origin = 'vision'
      AND item_id NOT IN (SELECT item_id FROM item_tags WHERE tag_id = ? AND origin != 'vision')`).run(tid, tid).changes;
  }
  return removed;
}

// A tag the model gives to every picture in a batch is an echo, not something it saw.
function dropBatchEchoes(lists, picked) {
  if (lists.length < 3) return lists;
  const count = new Map();
  for (const l of lists) for (const t of new Set(l)) count.set(t, (count.get(t) || 0) + 1);
  return lists.map((l, i) => {
    const said = `${picked[i]?.it.title || ''} ${(picked[i]?.it.sourceTags || []).join(' ')}`.toLowerCase();
    return l.filter((t) => count.get(t) < lists.length || said.includes(t));
  });
}

export function queueLook(ids) {
  if (!ids?.length) return;
  getDb().prepare(`UPDATE items SET look_q = ? WHERE id IN (${ids.map(() => '?').join(',')}) AND COALESCE(look_q, 0) >= 0 AND COALESCE(g_src, '') != 'vision'`).run(now(), ...ids);
}

async function oneImage(item) {
  const m = item.media || {};
  const u = m.poster || m.thumbs?.[Math.floor((m.thumbs?.length || 1) / 2)] || m.mid || (m.kind === 'image' ? m.src : null) || m.items?.find((g) => g.type !== 'video')?.mid || m.thumb;
  if (u) { const img = await fetchImage(u); if (img) return shrinkImage(img, 448); }
  const frames = await framesFor(item, 1).catch(() => []);
  return frames[0] ? shrinkImage(frames[0], 448) : null;
}

let busy = false;
let lookSize = 4;
export async function lookBatch(size = lookSize) {
  if (busy || config.mock || !getSetting('taggerVision', true)) return 0;
  busy = true;
  const db = getDb();
  try {
    const rows = db.prepare("SELECT id FROM items WHERE look_q > 0 AND blocked = 0 AND COALESCE(g_src, '') != 'vision' ORDER BY look_q DESC LIMIT ?").all(size * 2);
    if (!rows.length) return 0;
    const picked = [];
    for (const r of rows) {
      if (picked.length >= size) break;
      const it = getItem(r.id);
      const img = it ? await Promise.race([oneImage(it).catch(() => null), new Promise((res) => setTimeout(() => res(null), 20000))]) : null;
      if (!img) { db.prepare('UPDATE items SET look_q = -1 WHERE id = ?').run(r.id); continue; }
      picked.push({ it, img });
    }
    if (!picked.length) return 0;
    const out = await chat({ kind: 'look', system: RULES, user: `There are ${picked.length} images, one per post, in this order: ${picked.map((p, i) => `image ${i + 1} (${String(p.it.title).slice(0, 60)})`).join('; ')}. Answer for every image.`, images: picked.map((p) => p.img), schema: SCHEMA, temperature: 0.1, model: fastModel(), numPredict: 150 * picked.length + 60, numCtx: 8192 });
    let n = 0;
    let flagged = 0;
    const list = out?.posts || [];
    const zeroBased = list.some((x) => Number(x.image) === 0);
    const cleaned = dropBatchEchoes(list.map((x) => (x.tags || []).map((t) => String(t).toLowerCase().trim())), list.map((x, i) => {
      const idx = Number.isFinite(Number(x.image)) ? Number(x.image) - (zeroBased ? 0 : 1) : i;
      return picked[idx] || (list.length === picked.length ? picked[i] : null);
    }));
    for (const [i, x] of list.entries()) {
      const idx = Number.isFinite(Number(x.image)) ? Number(x.image) - (zeroBased ? 0 : 1) : i;
      const p = picked[idx] || (list.length === picked.length ? picked[i] : null);
      if (!p) continue;
      const id = p.it.id;
      // The age-verified video sites are not checked; elsewhere anyone who looks under 18 waits for the bigger model.
      if (!VERIFIED.has(p.it.source) && Number(x.youngest_age) > 0 && Number(x.youngest_age) < 18) { db.prepare("UPDATE items SET blocked = 1, block_reason = 'safety_check', look_q = -1 WHERE id = ?").run(id); flagged++; continue; }
      const men = Math.max(0, Math.min(9, Number(x.men) | 0));
      const women = Math.max(0, Math.min(9, Number(x.women) | 0));
      setGender(id, { men, women, trans: !!x.trans }, 'vision');
      const tags = cleanTags(cleaned[i] || [], 8);
      if (tags.length && !isBlocked({ title: '', tags: tags.map((t) => t.name) }).blocked) addTags(id, tags.map((t) => ({ ...t, weight: Math.min(0.85, t.weight) })), 'vision');
      db.prepare('UPDATE items SET look_q = -1 WHERE id = ?').run(id);
      n++;
    }
    for (const p of picked) db.prepare('UPDATE items SET look_q = -1 WHERE id = ? AND look_q > 0').run(p.it.id);
    log('info', `Quick look: ${n} of ${picked.length} posts checked for who is in them${flagged ? `, ${flagged} held back for a second safety check` : ''}`);
    if (flagged) invalidatePool();
    return n;
  } catch (err) {
    if (!err.yielded) log('warn', `Quick look failed: ${String(err.message).slice(0, 160)}`);
    if (/context size/.test(err.message)) lookSize = Math.max(1, lookSize - 1);
    return 0;
  } finally {
    busy = false;
  }
}

// When nothing is waiting, look ahead at posts that could be shown next, starting with the ones whose people
// are least certain, so the gender balance has real answers to work with.
function lookAhead(n = 16) {
  const db = getDb();
  const rows = db.prepare(`SELECT i.id FROM items i LEFT JOIN item_state s ON s.item_id = i.id
    WHERE i.blocked = 0 AND COALESCE(s.seen, 0) = 0 AND COALESCE(i.look_q, 0) = 0 AND COALESCE(i.g_src, '') != 'vision'
      AND i.format IN ('image', 'set', 'short', 'gif', 'long') AND i.fetched_at > ?
    ORDER BY (i.g_src = 'guess' AND (i.g_men IS NULL OR i.g_women IS NULL)) DESC, i.fetched_at DESC LIMIT ?`).all(now() - 4 * 86400000, n);
  if (rows.length) db.prepare(`UPDATE items SET look_q = 1 WHERE id IN (${rows.map(() => '?').join(',')})`).run(...rows.map((r) => r.id));
  return rows.length;
}

// Second opinion. Anything the quick 4B look (or the tagger) thinks could be under 18 stays hidden until the bigger
// model has looked at the same picture. A clear "adult" brings it back, if the text rules agree too.
const SAFETY_SCHEMA = {
  type: 'object',
  properties: { images: { type: 'array', items: { type: 'object', properties: { image: { type: 'integer' }, youngest_age: { type: 'integer' }, clearly_adult: { type: 'boolean' }, people: { type: 'integer' } }, required: ['image', 'youngest_age', 'clearly_adult', 'people'] } } },
  required: ['images']
};
let reviewing = false;
export async function reviewSafety(size = 4) {
  if (reviewing || config.mock) return 0;
  const db = getDb();
  const rows = db.prepare("SELECT id FROM items WHERE blocked = 1 AND block_reason = 'safety_check' ORDER BY id DESC LIMIT ?").all(size);
  if (!rows.length) return 0;
  reviewing = true;
  try {
    const picked = [];
    for (const r of rows) {
      const it = getItem(r.id);
      const img = it ? await Promise.race([oneImage(it).catch(() => null), new Promise((res) => setTimeout(() => res(null), 20000))]) : null;
      if (!img) { db.prepare("UPDATE items SET block_reason = 'safety' WHERE id = ?").run(r.id); continue; }
      picked.push({ it, img });
    }
    if (!picked.length) return rows.length;
    const out = await chat({ kind: 'look', model: deepModel(), images: picked.map((p) => p.img), schema: SAFETY_SCHEMA, temperature: 0, numPredict: 60 * picked.length + 40,
      system: 'You check images for an adult-content browser. For every image, in order: estimate the age of the youngest visible person from face and body; clearly_adult is true only when every visible person is unmistakably an adult; when no person is visible, people is 0 and clearly_adult is true.',
      user: `There are ${picked.length} images. Answer for every image, numbered from 1.` });
    const list = out?.images || [];
    const zero = list.some((x) => Number(x.image) === 0);
    let back = 0;
    picked.forEach((p, i) => {
      const x = list.find((y) => Number(y.image) - (zero ? 0 : 1) === i) || (list.length === picked.length ? list[i] : null);
      const adult = x && x.clearly_adult === true && (x.people === 0 || Number(x.youngest_age) >= 18);
      const text = isBlocked({ title: p.it.title, body: p.it.body, tags: [] });
      if (adult && !text.blocked) { db.prepare('UPDATE items SET blocked = 0, block_reason = NULL WHERE id = ?').run(p.it.id); back++; }
      else if (x) db.prepare("UPDATE items SET block_reason = 'safety' WHERE id = ?").run(p.it.id);
    });
    if (back) invalidatePool();
    log('info', `Safety second look: ${back} of ${picked.length} clearly adults and shown again, the rest stay blocked`);
    return picked.length;
  } catch (err) {
    if (!err.yielded) log('warn', `Safety second look failed: ${String(err.message).slice(0, 120)}`);
    return 0;
  } finally {
    reviewing = false;
  }
}

let timer = null;
export function startLooker() {
  if (timer) return;
  // Posts the feed is about to show come first. Looking ahead at the rest only happens every 40 seconds,
  // so tagging and judging still get their turn on the model.
  let aheadAt = 0;
  const tick = async () => {
    if (!getDb().prepare('SELECT 1 FROM items WHERE look_q > 1 LIMIT 1').get()) {
      if (Date.now() - aheadAt < 40000) return;
      aheadAt = Date.now();
      if (!getDb().prepare('SELECT 1 FROM items WHERE look_q = 1 LIMIT 1').get()) lookAhead();
      await lookBatch();
      return;
    }
    for (let i = 0; i < 3; i++) if (!(await lookBatch())) break;
  };
  timer = setInterval(() => { tick().catch(() => {}); }, 8000);
  setInterval(() => { reviewSafety().catch(() => {}); }, 10000);
}
