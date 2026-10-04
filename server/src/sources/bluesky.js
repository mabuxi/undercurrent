import { request } from '../http.js';

const API = 'https://public.api.bsky.app/xrpc';
const ADULT = new Set(['porn', 'sexual', 'nudity', 'graphic-media']);

// Own posts plus reposts. A repost only counts when it carries an adult label, so a reposter's
// everyday art or memes stay out; the post keeps its original author and remembers who shared it.
export async function authorFeed(actor, limit = 60) {
  const handle = String(actor).replace(/^@/, '').trim();
  const q = new URLSearchParams({ actor: handle, limit: String(limit), filter: 'posts_no_replies' });
  const data = await request(`${API}/app.bsky.feed.getAuthorFeed?${q}`, { purpose: 'Bluesky', headers: { Accept: 'application/json' } });
  const out = [];
  for (const f of data.feed || []) {
    const repost = f.reason?.$type?.includes('reasonRepost');
    const n = normalize(f.post, { text: !repost });
    if (!n) continue;
    if (repost) {
      if (!n.nsfw) continue;
      n.via = `repost:bluesky|${f.reason.by?.handle || handle}`;
      n.media = { ...n.media, repostedBy: f.reason.by?.handle || handle };
    }
    out.push(n);
  }
  return out;
}

export function repostStats(feed) {
  const list = feed || [];
  const reposts = list.filter((f) => f.reason?.$type?.includes('reasonRepost'));
  const adult = reposts.filter((f) => [...(f.post?.labels || []), ...(f.post?.author?.labels || [])].some((l) => ADULT.has(l.val)));
  return { total: list.length, reposts: reposts.length, adultReposts: adult.length };
}

export async function rawFeed(actor, limit = 50) {
  const q = new URLSearchParams({ actor: String(actor).replace(/^@/, ''), limit: String(limit), filter: 'posts_no_replies' });
  return (await request(`${API}/app.bsky.feed.getAuthorFeed?${q}`, { purpose: 'Bluesky discovery', headers: { Accept: 'application/json' } })).feed || [];
}

export async function topReplies(uri, n = 2) {
  const q = new URLSearchParams({ uri, depth: '1', parentHeight: '0' });
  const data = await request(`${API}/app.bsky.feed.getPostThread?${q}`, { purpose: 'Bluesky replies', headers: { Accept: 'application/json' } });
  return (data.thread?.replies || []).filter((r) => r.post?.record?.text).sort((a, b) => (b.post.likeCount || 0) - (a.post.likeCount || 0)).slice(0, n)
    .map((r) => ({ author: r.post.author.handle, body: r.post.record.text, score: r.post.likeCount || 0 }));
}

export async function profile(actor) {
  return request(`${API}/app.bsky.actor.getProfile?actor=${encodeURIComponent(String(actor).replace(/^@/, ''))}`, { purpose: 'Bluesky' });
}

export function normalize(p, { text: allowText = true } = {}) {
  if (!p?.record) return null;
  const labels = [...(p.labels || []), ...(p.author?.labels || [])].map((l) => l.val);
  const text = p.record.text || '';
  const rkey = p.uri.split('/').pop();
  const base = {
    source: 'bluesky', ext_id: p.uri, url: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`,
    title: text.split('\n')[0].slice(0, 200) || `Post by ${p.author.displayName || p.author.handle}`,
    body: text.length > 200 ? text : '', author: p.author.handle, community: 'Bluesky', flair: null,
    score: p.likeCount || 0, comments: p.replyCount || 0, created_utc: Math.round(Date.parse(p.record.createdAt || p.indexedAt) / 1000) || 0,
    nsfw: labels.some((l) => ADULT.has(l)) ? 1 : 0,
    tags: [...labels.filter((l) => ADULT.has(l) === false && !l.startsWith('!')), ...(text.match(/#[\p{L}\p{N}_]+/gu) || []).map((h) => h.slice(1))],
    media: null
  };
  const extra = { avatar: p.author.avatar || null, displayName: p.author.displayName || null };
  const e = p.embed?.media || p.embed;
  if (e?.$type?.startsWith('app.bsky.embed.images')) {
    const imgs = (e.images || []).map((i) => ({ type: 'image', src: i.fullsize, mid: i.thumb, w: i.aspectRatio?.width, h: i.aspectRatio?.height }));
    if (!imgs.length) return null;
    return { ...base, format: imgs.length > 1 ? 'set' : 'image', media: imgs.length > 1 ? { kind: 'gallery', items: imgs, ...extra } : { kind: 'image', src: imgs[0].src, mid: imgs[0].mid, ...extra } };
  }
  if (e?.$type?.startsWith('app.bsky.embed.video')) {
    return { ...base, format: 'short', width: e.aspectRatio?.width, height: e.aspectRatio?.height, media: { kind: 'video', hls: e.playlist, src: e.playlist, poster: e.thumbnail, hasAudio: true, ...extra } };
  }
  if (allowText && !e && text.length >= 60) {
    const words = text.split(/\s+/).filter(Boolean).length;
    return { ...base, title: text.length > 200 ? `${text.slice(0, 197).replace(/\s+\S*$/, '')}…` : text, body: text.length > 200 ? text : '', format: words > 350 ? 'story' : 'discussion', media: { kind: 'text', words, readMin: Math.max(1, Math.round(words / 230)), ...extra } };
  }
  return null;
}
