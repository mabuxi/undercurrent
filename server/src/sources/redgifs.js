import { request } from '../http.js';
import { classifyVideo } from './reddit.js';

const API = 'https://api.redgifs.com/v2';
let auth = null;
let authPending = null;
const cache = new Map();
const CACHE_MS = 30 * 60 * 1000;

async function getAuth() {
  if (auth && Date.now() < auth.exp) return auth;
  if (!authPending) {
    authPending = request(`${API}/auth/temporary`, { purpose: 'redgifs token' })
      .then((data) => { auth = { token: data.token, exp: Date.now() + 20 * 60 * 60 * 1000 }; return auth; })
      .finally(() => { authPending = null; });
  }
  return authPending;
}

async function api(path, purpose = 'redgifs content') {
  const a = await getAuth();
  try {
    return await request(`${API}${path}`, { headers: { Authorization: `Bearer ${a.token}` }, purpose });
  } catch (err) {
    if (err.status === 401) {
      auth = null;
      const b = await getAuth();
      return request(`${API}${path}`, { headers: { Authorization: `Bearer ${b.token}` }, purpose });
    }
    throw err;
  }
}

function remember(g) {
  if (g?.id) cache.set(g.id, { at: Date.now(), gif: g });
}

export async function resolveOne(id, fresh = false) {
  const key = String(id).toLowerCase();
  const c = cache.get(key);
  if (!fresh && c && Date.now() - c.at < CACHE_MS) return c.gif;
  try {
    const data = await api(`/gifs/${encodeURIComponent(key)}`, 'redgifs media links');
    remember(data.gif);
    return data.gif || null;
  } catch (err) {
    if (err.status === 404 || err.status === 410) return null;
    throw err;
  }
}

export async function resolve(ids, { max = 40 } = {}) {
  const want = [...new Set(ids.map((i) => String(i).toLowerCase()))].slice(0, max);
  const out = {};
  let i = 0;
  const worker = async () => {
    while (i < want.length) {
      const id = want[i++];
      try {
        const g = await resolveOne(id);
        if (g) out[id] = g;
      } catch {}
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return out;
}

export async function search({ tag = '', order = 'trending', count = 40, page = 1 } = {}) {
  const q = new URLSearchParams({ order, count: String(count), page: String(page) });
  if (tag) q.set('search_text', tag);
  const data = await api(`/gifs/search?${q}`);
  (data.gifs || []).forEach(remember);
  return data.gifs || [];
}

export async function userInfo(user) {
  const data = await api(`/users/${encodeURIComponent(String(user).toLowerCase())}/search?order=new&count=1`, 'redgifs profile');
  return (data.users || []).find((u) => String(u.username).toLowerCase() === String(user).toLowerCase()) || null;
}

export async function byUser(user, count = 40) {
  const data = await api(`/users/${encodeURIComponent(user)}/search?order=new&count=${count}`);
  (data.gifs || []).forEach(remember);
  return data.gifs || [];
}

export const nicheSlug = (name) => String(name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function searchNiches(query, count = 8) {
  const data = await api(`/niches/search?${new URLSearchParams({ query, count: String(count) })}`, 'redgifs discovery');
  return (data.niches || []).map((n) => ({ id: n.id, name: n.name, gifs: n.gifs || 0, subscribers: n.subscribers || 0, tags: n.tags || [], thumbnail: n.thumbnail || null }));
}

export async function nicheGifs(niche, { order = 'top', count = 40, page = 1 } = {}) {
  const q = new URLSearchParams({ count: String(count), page: String(page) });
  if (order) q.set('order', order);
  const data = await api(`/niches/${encodeURIComponent(nicheSlug(niche))}/gifs?${q}`);
  (data.gifs || []).forEach(remember);
  return data.gifs || [];
}

export async function popularTags() {
  const data = await api('/tags');
  return (data.tags || []).map((t) => ({ name: t.name, count: t.count }));
}

function mediaFromGif(g, extra = {}) {
  return {
    kind: 'redgifs', redgifsId: g.id, hasAudio: g.hasAudio !== false,
    hd: g.urls?.hd || null, sd: g.urls?.sd || null, poster: g.urls?.poster || g.urls?.thumbnail || extra.poster || null,
    urlsAt: Date.now()
  };
}

export function normalizeGif(g) {
  const fmt = g.type === 2 ? 'image' : classifyVideo(g.duration, g.width, g.height, g.hasAudio !== false);
  return {
    source: 'redgifs',
    ext_id: g.id,
    url: `https://www.redgifs.com/watch/${g.id}`,
    title: g.description || (g.tags || []).slice(0, 4).join(', ') || g.id,
    body: '',
    author: g.userName || null,
    community: 'RedGIFs',
    flair: null,
    format: fmt,
    width: g.width,
    height: g.height,
    duration: g.duration || null,
    score: g.likes || 0,
    comments: 0,
    created_utc: g.createDate || 0,
    nsfw: 1,
    tags: [...(g.tags || []), ...(g.niches || [])],
    media: g.type === 2 ? { kind: 'image', src: g.urls?.hd || g.urls?.sd, mid: g.urls?.sd || g.urls?.hd, redgifsId: g.id } : mediaFromGif(g)
  };
}

export function enrichFromGif(item, g) {
  if (!g) return item;
  const fmt = classifyVideo(g.duration, g.width, g.height, g.hasAudio !== false);
  return { ...item, format: fmt, width: g.width, height: g.height, duration: g.duration, tags: [...(item.tags || []), ...(g.tags || [])], media: mediaFromGif(g, { poster: item.media?.poster }) };
}
