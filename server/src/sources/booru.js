import { request } from '../http.js';
import { getSetting } from '../db.js';
import { booruExclusions } from '../safety.js';

export const BOORUS = {
  rule34: { label: 'Rule34', api: 'https://api.rule34.xxx/index.php', site: 'https://rule34.xxx/index.php?page=post&s=view&id=' },
  gelbooru: { label: 'Gelbooru', api: 'https://gelbooru.com/index.php', site: 'https://gelbooru.com/index.php?page=post&s=view&id=' }
};

export function booruCreds(name) {
  return getSetting(`booru.${name}`, null);
}

export async function fetchPosts(name, query, { limit = 60, page = 0 } = {}) {
  const b = BOORUS[name];
  const creds = booruCreds(name);
  if (!b) throw new Error(`Unknown board ${name}`);
  const tags = [query.trim(), ...booruExclusions()].filter(Boolean).join(' ');
  const q = new URLSearchParams({ page: 'dapi', s: 'post', q: 'index', json: '1', limit: String(limit), pid: String(page), tags });
  if (creds?.apiKey) q.set('api_key', creds.apiKey);
  if (creds?.userId) q.set('user_id', creds.userId);
  const data = await request(`${b.api}?${q}`, { purpose: `${b.label} content` });
  const list = Array.isArray(data) ? data : Array.isArray(data?.post) ? data.post : [];
  return list;
}

const VIDEO_RE = /\.(mp4|webm)(\?|$)/i;

export function normalizeBooru(name, p) {
  const b = BOORUS[name];
  const file = p.file_url || '';
  const tags = String(p.tags || '').split(/\s+/).filter(Boolean);
  const isVideo = VIDEO_RE.test(file);
  const isGif = /\.gif(\?|$)/i.test(file);
  const long = tags.some((t) => /long|longer_than|duration/i.test(t) && /\d|long/.test(t));
  const format = isVideo ? (long ? 'long' : 'short') : isGif ? 'gif' : 'image';
  const title = tags.filter((t) => !/^(tagme|highres|absurdres|\d+)$/i.test(t)).slice(0, 5).map((t) => t.replace(/_/g, ' ')).join(', ');
  return {
    source: name,
    ext_id: String(p.id),
    url: `${b.site}${p.id}`,
    title: title || `Post ${p.id}`,
    body: '',
    author: p.owner || p.creator_id || null,
    community: b.label,
    flair: null,
    format,
    width: Number(p.width) || null,
    height: Number(p.height) || null,
    duration: null,
    score: Number(p.score) || 0,
    comments: Number(p.comment_count) || 0,
    created_utc: p.change ? Number(p.change) : Math.round(Date.parse(p.created_at || '') / 1000) || 0,
    nsfw: p.rating === 'safe' || p.rating === 'general' ? 0 : 1,
    tags,
    media: isVideo || isGif
      ? { kind: 'video', src: file, poster: p.preview_url || p.sample_url, hasAudio: tags.includes('sound') || tags.includes('has_audio'), loop: !long }
      : { kind: 'image', src: file, mid: p.sample_url || file, thumb: p.preview_url }
  };
}
