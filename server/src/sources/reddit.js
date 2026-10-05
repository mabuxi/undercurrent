import { request, HttpError } from '../http.js';
import { getSetting, setSetting } from '../db.js';
import { tr } from '../i18n.js';

const AUTH_URL = 'https://www.reddit.com/api/v1/access_token';
const API = 'https://oauth.reddit.com';
let token = null;
let tokenExp = 0;

export function redditCreds() {
  return getSetting('reddit', null);
}

export function redditConfigured() {
  const c = redditCreds();
  return !!(c && c.clientId && c.clientSecret && c.username && c.password);
}

export function resetRedditToken() {
  token = null;
  tokenExp = 0;
}

async function getToken() {
  if (token && Date.now() < tokenExp - 60000) return token;
  const c = redditCreds();
  if (!c) throw new HttpError(400, tr('Reddit is not connected yet. Add your app details in Settings.'));
  const body = new URLSearchParams({ grant_type: 'password', username: c.username, password: c.password });
  const data = await request(AUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body,
    purpose: 'reddit login'
  });
  if (!data.access_token) throw new HttpError(401, tr('Reddit refused the login: {error}', { error: data.error || tr('unknown error') }));
  token = data.access_token;
  tokenExp = Date.now() + (data.expires_in || 3600) * 1000;
  return token;
}

async function api(path, { method = 'GET', form, purpose = 'reddit content' } = {}) {
  const t = await getToken();
  const opts = { method, headers: { Authorization: `Bearer ${t}` }, purpose };
  if (form) {
    opts.body = new URLSearchParams(form);
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  const sep = path.includes('?') ? '&' : '?';
  return request(`${API}${path}${method === 'GET' ? `${sep}raw_json=1` : ''}`, opts);
}

export async function me() {
  return api('/api/v1/me', { purpose: 'reddit account' });
}

async function paginate(path, max = 500) {
  const out = [];
  let after = null;
  while (out.length < max) {
    const sep = path.includes('?') ? '&' : '?';
    const data = await api(`${path}${sep}limit=100${after ? `&after=${after}` : ''}`);
    const children = data?.data?.children || [];
    out.push(...children);
    after = data?.data?.after;
    if (!after || !children.length) break;
  }
  return out;
}

export async function subscriptions() {
  const list = await paginate('/subreddits/mine/subscriber', 1000);
  return list.map((c) => ({ name: c.data.display_name, title: c.data.title, nsfw: !!c.data.over18, subscribers: c.data.subscribers, icon: c.data.icon_img || c.data.community_icon || '' }));
}

export async function listing(sub, sort = 'hot', limit = 50, t = 'week') {
  const path = sub.startsWith('u/') ? `/user/${sub.slice(2)}/submitted?sort=new&limit=${limit}` : `/r/${sub}/${sort}?limit=${limit}${sort === 'top' ? `&t=${t}` : ''}`;
  const data = await api(path);
  return (data?.data?.children || []).filter((c) => c.kind === 't3').map((c) => c.data);
}

export async function userHistory(kind = 'upvoted', max = 300) {
  const c = redditCreds();
  const list = await paginate(`/user/${c.username}/${kind}`, max);
  return list.filter((x) => x.kind === 't3').map((x) => x.data);
}

export async function vote(fullname, dir) {
  return api('/api/vote', { method: 'POST', form: { id: fullname, dir: String(dir) }, purpose: 'reddit vote' });
}

export async function save(fullname, on) {
  return api(on ? '/api/save' : '/api/unsave', { method: 'POST', form: { id: fullname }, purpose: 'reddit save' });
}

export async function subscribe(sub, on) {
  return api('/api/subscribe', { method: 'POST', form: { action: on ? 'sub' : 'unsub', sr_name: sub }, purpose: 'reddit follow' });
}

export async function comments(id, limit = 8) {
  const data = await api(`/comments/${id}?limit=${limit}&depth=2&sort=top`);
  const list = Array.isArray(data) ? data[1]?.data?.children || [] : [];
  return list.filter((c) => c.kind === 't1').slice(0, limit).map((c) => ({
    id: c.data.id,
    author: c.data.author,
    body: c.data.body,
    score: c.data.score,
    created: c.data.created_utc,
    replies: (c.data.replies?.data?.children || []).filter((r) => r.kind === 't1').slice(0, 2).map((r) => ({ author: r.data.author, body: r.data.body, score: r.data.score }))
  }));
}

export async function diagnose() {
  const out = { login: false, account: null, subscriptions: 0, nsfwSubscriptions: 0, nsfwPostsVisible: null, sample: null, error: null };
  try {
    resetRedditToken();
    const m = await me();
    out.login = true;
    out.account = m.name;
    out.accountOver18 = !!m.over_18;
    const subs = await subscriptions();
    out.subscriptions = subs.length;
    const nsfw = subs.filter((s) => s.nsfw);
    out.nsfwSubscriptions = nsfw.length;
    if (nsfw.length) {
      const posts = await listing(nsfw[0].name, 'hot', 10);
      const withMedia = posts.filter((p) => p.over_18 && (p.preview || p.is_video || p.is_gallery || /redgifs|i\.redd\.it|imgur/.test(p.url || '')));
      out.nsfwPostsVisible = withMedia.length > 0;
      out.sample = { subreddit: nsfw[0].name, returned: posts.length, withMedia: withMedia.length };
    }
  } catch (err) {
    out.error = err.message;
  }
  return out;
}

const REDGIFS_RE = /redgifs\.com\/(?:watch|ifr|i)\/([a-z0-9]+)/i;
const IMG_RE = /\.(jpe?g|png|webp)(\?|$)/i;

function previewImage(p) {
  const img = p.preview?.images?.[0];
  if (!img) return null;
  const res = img.resolutions || [];
  const mid = res.find((r) => r.width >= 640) || res[res.length - 1] || img.source;
  return { src: img.source?.url, mid: mid?.url, w: img.source?.width, h: img.source?.height, mp4: img.variants?.mp4?.source?.url, gif: img.variants?.gif?.source?.url };
}

export function classifyVideo(duration, width, height, hasAudio = true) {
  if (!hasAudio && duration && duration <= 20) return 'gif';
  if (duration && duration > 180) return 'long';
  return 'short';
}

export function normalizePost(raw) {
  const p = raw.crosspost_parent_list?.[0] && !raw.is_self ? { ...raw.crosspost_parent_list[0], id: raw.id, subreddit: raw.subreddit, permalink: raw.permalink, score: raw.score, num_comments: raw.num_comments, title: raw.title, created_utc: raw.created_utc } : raw;
  const prev = previewImage(p);
  const base = {
    source: 'reddit',
    ext_id: raw.id,
    stickied: !!raw.stickied, distinguished: raw.distinguished || null, oc: !!raw.is_original_content,
    url: `https://www.reddit.com${raw.permalink}`,
    title: raw.title || '',
    body: '',
    author: raw.author,
    community: `r/${raw.subreddit}`,
    flair: raw.link_flair_text || null,
    score: raw.ups ?? raw.score ?? 0,
    comments: raw.num_comments || 0,
    created_utc: Math.round(raw.created_utc || 0),
    nsfw: raw.over_18 ? 1 : 0,
    tags: [raw.link_flair_text].filter(Boolean)
  };
  const url = p.url_overridden_by_dest || p.url || '';
  const rv = p.secure_media?.reddit_video || p.media?.reddit_video || p.preview?.reddit_video_preview;
  if (rv && (p.is_video || p.preview?.reddit_video_preview)) {
    const fmt = classifyVideo(rv.duration, rv.width, rv.height, !rv.is_gif);
    return { ...base, format: fmt, width: rv.width, height: rv.height, duration: rv.duration, media: { kind: 'video', hls: rv.hls_url, src: rv.fallback_url, poster: prev?.mid || prev?.src, hasAudio: !rv.is_gif } };
  }
  const rg = url.match(REDGIFS_RE) || (p.media?.oembed?.html || '').match(REDGIFS_RE);
  if (rg || /redgifs\.com/i.test(p.domain || '')) {
    const id = (rg?.[1] || url.split('/').pop().split(/[?#.-]/)[0]).toLowerCase();
    return { ...base, format: 'short', width: prev?.w, height: prev?.h, duration: null, media: { kind: 'redgifs', redgifsId: id, poster: prev?.mid || prev?.src || p.media?.oembed?.thumbnail_url } };
  }
  if (p.is_gallery && p.media_metadata) {
    const order = p.gallery_data?.items?.map((i) => i.media_id) || Object.keys(p.media_metadata);
    const items = order.map((mid) => {
      const m = p.media_metadata[mid];
      if (!m || m.status !== 'valid') return null;
      const pick = (m.p || []).find((x) => x.x >= 640) || m.s;
      if (m.e === 'AnimatedImage') return { type: 'video', src: m.s?.mp4 || m.s?.gif, w: m.s?.x, h: m.s?.y };
      return { type: 'image', src: m.s?.u, mid: pick?.u, w: m.s?.x, h: m.s?.y };
    }).filter(Boolean);
    if (items.length) return { ...base, format: items.length > 1 ? 'set' : 'image', width: items[0].w, height: items[0].h, media: { kind: 'gallery', items } };
  }
  if (/\.gifv$/i.test(url) && /imgur\.com/i.test(url)) {
    return { ...base, format: 'gif', width: prev?.w, height: prev?.h, media: { kind: 'video', src: url.replace(/\.gifv$/i, '.mp4'), poster: prev?.mid, hasAudio: false, loop: true } };
  }
  if (/\.gif(\?|$)/i.test(url) || prev?.mp4) {
    return { ...base, format: 'gif', width: prev?.w, height: prev?.h, media: { kind: 'video', src: prev?.mp4 || url, poster: prev?.mid, hasAudio: false, loop: true, fallbackImage: url } };
  }
  if (p.post_hint === 'image' || IMG_RE.test(url)) {
    return { ...base, format: 'image', width: prev?.w, height: prev?.h, media: { kind: 'image', src: url, mid: prev?.mid || url } };
  }
  if (raw.is_self) {
    const body = (raw.selftext || '').slice(0, 30000);
    const words = body.split(/\s+/).filter(Boolean).length;
    return { ...base, body, format: words > 350 ? 'story' : 'discussion', media: { kind: 'text', words, readMin: Math.max(1, Math.round(words / 230)) } };
  }
  if (prev) return { ...base, format: 'image', width: prev.w, height: prev.h, media: { kind: 'image', src: prev.src, mid: prev.mid, link: url } };
  return null;
}
