import { getSetting } from '../db.js';
import { logNet } from '../db.js';
import { tr } from '../i18n.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const state = { lastAt: 0, backoffUntil: 0, chain: Promise.resolve(), waiting: 0, lastError: null, requests: 0 };

export function feedToken() {
  const t = getSetting('redditFeed', null);
  return t?.feed && t?.user ? t : null;
}

export function gapMs() {
  return feedToken() ? 2500 : 62000;
}

export function rssStatus() {
  const next = Math.max(state.lastAt + gapMs(), state.backoffUntil);
  return { authenticated: !!feedToken(), waiting: state.waiting, nextInSec: Math.max(0, Math.round((next - Date.now()) / 1000)), lastError: state.lastError, requests: state.requests };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function schedule(fn, { maxWaitMs = Infinity } = {}) {
  const wait = Math.max(0, Math.max(state.lastAt + gapMs(), state.backoffUntil) - Date.now()) + state.waiting * gapMs();
  if (wait > maxWaitMs) {
    const err = new Error(tr('Reddit only allows one feed request per minute without a feed key; next slot in {s} s.', { s: Math.round(wait / 1000) }));
    err.busy = true;
    return Promise.reject(err);
  }
  state.waiting++;
  const run = state.chain.then(async () => {
    const delay = Math.max(state.lastAt + gapMs(), state.backoffUntil) - Date.now();
    if (delay > 0) await sleep(delay);
    state.lastAt = Date.now();
    state.waiting--;
    return fn();
  });
  state.chain = run.catch(() => {});
  return run;
}

async function getFeed(path, params = {}, opts = {}) {
  return schedule(async () => {
    const tok = feedToken();
    const q = new URLSearchParams({ limit: '50', ...params, ...(tok ? { feed: tok.feed, user: tok.user } : {}) });
    const url = `https://www.reddit.com${path}.rss?${q}`;
    state.requests++;
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/atom+xml,application/xml' } });
    const text = await res.text();
    logNet('www.reddit.com', 'Reddit RSS', path.length + 40, text.length, res.status);
    if (res.status === 403 || res.status === 429) {
      state.backoffUntil = Date.now() + 3 * 60000;
      state.lastError = tr('Reddit said {status}, waiting 3 minutes', { status: res.status });
      throw Object.assign(new Error(tr('Reddit is rate limiting feeds right now ({status}). Trying again in a few minutes.', { status: res.status })), { rateLimited: true });
    }
    if (!res.ok) { state.lastError = tr('Reddit said {status}', { status: res.status }); throw new Error(tr('Reddit answered {status}', { status: res.status })); }
    state.lastError = null;
    return parseAtom(text);
  }, opts);
}

function decode(s) {
  return String(s || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
}

function stripHtml(html) {
  return decode(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<li>/gi, '• ').replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function parseAtom(xml) {
  const entries = String(xml).split('<entry>').slice(1).map((e) => e.split('</entry>')[0]);
  return entries.map((e) => {
    const tag = (name) => { const m = e.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? m[1] : ''; };
    const content = decode(tag('content'));
    return {
      id: tag('id'),
      title: decode(tag('title')),
      author: tag('name').replace(/^\/?u\//, ''),
      community: (e.match(/<category term="([^"]+)"/) || [])[1] || '',
      published: tag('published') || tag('updated'),
      link: (e.match(/<link href="([^"]+)"/) || [])[1] || '',
      thumb: decode((e.match(/<media:thumbnail url="([^"]+)"/) || [])[1] || ''),
      content
    };
  });
}

const IMG = /\.(jpe?g|png|webp)(\?|$)/i;
const REDGIFS = /redgifs\.com\/(?:watch|ifr|i)\/([a-z]+)/i;

function fullImageFromPreview(thumb) {
  const m = String(thumb || '').match(/^https:\/\/(?:preview|i)\.redd\.it\/([a-z0-9]+)\.(jpe?g|png|webp|gif)/i);
  return m ? `https://i.redd.it/${m[1]}.${m[2]}` : null;
}

export function normalizeEntry(x) {
  if (!x?.id?.startsWith('t3_')) return null;
  const id = x.id.slice(3);
  const linkMatch = x.content.match(/<a href="([^"]+)">\[link\]<\/a>/);
  const url = linkMatch ? decode(linkMatch[1]) : '';
  const md = x.content.match(/<div class="md">([\s\S]*?)<\/div>/);
  const text = md ? stripHtml(md[1]) : '';
  const base = {
    source: 'reddit', ext_id: id, url: x.link || `https://www.reddit.com/comments/${id}`, title: x.title, body: '', author: x.author || null,
    community: x.community ? `r/${x.community}` : null, flair: null, score: 0, comments: 0,
    created_utc: Math.round(Date.parse(x.published) / 1000) || 0, nsfw: 1, tags: []
  };
  const thumb = x.thumb || (x.content.match(/<img src="([^"]+)"/) || [])[1] || '';
  const extra = { via: 'rss' };
  const rg = url.match(REDGIFS);
  if (rg) return { ...base, body: text.slice(0, 2000), format: 'short', media: { kind: 'redgifs', redgifsId: rg[1].toLowerCase(), poster: thumb || null, ...extra } };
  const v = url.match(/^https:\/\/v\.redd\.it\/([a-z0-9]+)/i);
  if (v) {
    const hls = `https://v.redd.it/${v[1]}/HLSPlaylist.m3u8`;
    return { ...base, body: text.slice(0, 2000), format: 'short', media: { kind: 'video', hls, src: hls, poster: thumb || null, hasAudio: true, ...extra } };
  }
  if (/imgur\.com\/.+\.gifv$/i.test(url)) return { ...base, format: 'gif', media: { kind: 'video', src: url.replace(/\.gifv$/i, '.mp4'), poster: thumb || null, hasAudio: false, loop: true, ...extra } };
  if (/^https:\/\/i\.redd\.it\/.+\.gif(\?|$)/i.test(url)) return { ...base, format: 'gif', media: { kind: 'image', src: url, mid: url, ...extra } };
  if (/^https:\/\/i\.redd\.it\//i.test(url) || (IMG.test(url) && /imgur|redd/.test(url))) return { ...base, body: text.slice(0, 2000), format: 'image', media: { kind: 'image', src: url, mid: url, ...extra } };
  if (/reddit\.com\/gallery\//i.test(url)) {
    const first = fullImageFromPreview(thumb);
    if (first) return { ...base, body: text.slice(0, 2000), format: 'set', media: { kind: 'image', src: first, mid: first, link: url, galleryOnReddit: true, ...extra } };
  }
  if (text && (!url || /reddit\.com\/r\/.+\/comments\//.test(url))) {
    const words = text.split(/\s+/).filter(Boolean).length;
    return { ...base, body: text.slice(0, 30000), format: words > 350 ? 'story' : 'discussion', media: { kind: 'text', words, readMin: Math.max(1, Math.round(words / 230)), ...extra } };
  }
  const img = fullImageFromPreview(thumb) || thumb;
  if (img) return { ...base, body: text.slice(0, 2000), format: 'image', media: { kind: 'image', src: img, mid: img, link: url, ...extra } };
  return null;
}

const SORT = { hot: ['hot', null], week: ['top', 'week'], month: ['top', 'month'], new: ['new', null], day: ['top', 'day'] };

export async function subreddit(sub, sort = 'hot', opts = {}) {
  const [s, t] = SORT[sort] || SORT.hot;
  const name = String(sub).replace(/^\/?r\//i, '');
  const list = await getFeed(`/r/${encodeURIComponent(name)}/${s}/`, t ? { t } : {}, opts);
  return list.map(normalizeEntry).filter(Boolean);
}

export async function user(name, opts = {}) {
  const list = await getFeed(`/user/${encodeURIComponent(String(name).replace(/^\/?u\//i, ''))}/submitted/`, {}, opts);
  return list.map(normalizeEntry).filter(Boolean);
}

export async function search(q, sort = 'hot', opts = {}) {
  const [s, t] = SORT[sort] || SORT.hot;
  const list = await getFeed('/search/', { q, sort: s === 'hot' ? 'relevance' : s, ...(t ? { t } : {}), include_over_18: 'on' }, opts);
  return list.map(normalizeEntry).filter(Boolean);
}

export async function comments(postId, limit = 10, { maxWaitMs } = {}) {
  const list = await getFeed(`/comments/${encodeURIComponent(postId)}/`, { limit: String(limit + 1), sort: 'top' }, { maxWaitMs: maxWaitMs ?? (feedToken() ? 20000 : 8000) });
  return list.filter((x) => x.id.startsWith('t1_')).slice(0, limit).map((x) => ({
    id: x.id, author: x.author, body: stripHtml((x.content.match(/<div class="md">([\s\S]*?)<\/div>/) || [])[1] || x.content), score: null, created: Math.round(Date.parse(x.published) / 1000), replies: []
  }));
}

// Subreddits and users whose names match a search (through the same RSS feeds, so the same one-a-minute limit).
export async function searchSubreddits(q, opts = {}) {
  const list = await getFeed('/subreddits/search/', { q, include_over_18: 'on', limit: '25' }, opts);
  return list.map((x) => {
    const m = String(x.link || x.id).match(/\/r\/([A-Za-z0-9_]+)/);
    return m ? { name: m[1], title: x.title, about: String(x.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160), subscribers: Number((String(x.content || '').match(/([\d,.]+)\s+(?:subscribers|members)/i) || [])[1]?.replace(/[,.]/g, '')) || null } : null;
  }).filter(Boolean);
}

export async function searchUsers(q, opts = {}) {
  const list = await getFeed('/users/search/', { q, limit: '25' }, opts);
  return list.map((x) => {
    const m = String(x.link || x.id).match(/\/(?:user|u)\/([A-Za-z0-9_-]+)/);
    return m ? { name: m[1], title: x.title } : null;
  }).filter(Boolean);
}
