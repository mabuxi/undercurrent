import { request } from '../http.js';
import { getSetting } from '../db.js';

export function lemmyInstance() {
  return String(getSetting('lemmyInstance', 'lemmynsfw.com') || 'lemmynsfw.com').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

async function api(path, params = {}) {
  const q = new URLSearchParams({ show_nsfw: 'true', ...params });
  return request(`https://${lemmyInstance()}/api/v3${path}?${q}`, { purpose: 'Lemmy', headers: { Accept: 'application/json' } });
}

const SORT = { trending: 'TopDay', top: 'TopWeek', new: 'New', hot: 'Hot', day: 'TopDay', week: 'TopWeek', month: 'TopMonth' };

export async function posts({ community = '', sort = 'hot', page = 1, limit = 40 } = {}) {
  const params = { type_: 'All', sort: SORT[sort] || 'Hot', limit: String(limit), page: String(page) };
  if (community) params.community_name = community;
  const data = await api('/post/list', params);
  return (data.posts || []).map(normalize).filter(Boolean);
}

export async function search(q, { page = 1, sort = 'month' } = {}) {
  const data = await api('/search', { q, type_: 'Posts', sort: SORT[sort] || 'TopMonth', limit: '40', page: String(page), listing_type: 'All' });
  return (data.posts || []).map(normalize).filter(Boolean);
}

export async function byUser(name) {
  const data = await api('/user', { username: name, sort: 'New', limit: '40' });
  return (data.posts || []).map(normalize).filter(Boolean);
}

export async function comments(postId, limit = 10) {
  const data = await api('/comment/list', { post_id: String(postId), sort: 'Top', limit: String(limit * 3), max_depth: '2', type_: 'All' });
  const all = (data.comments || []).filter((c) => !c.comment.deleted && !c.comment.removed);
  const top = all.filter((c) => c.comment.path.split('.').length === 2).slice(0, limit);
  return top.map((c) => ({
    id: String(c.comment.id),
    author: who(c.creator),
    body: c.comment.content,
    score: c.counts?.score || 0,
    created: Math.round(Date.parse(c.comment.published) / 1000),
    replies: all.filter((r) => r.comment.path.startsWith(`${c.comment.path}.`) && r.comment.path.split('.').length === 3).slice(0, 2)
      .map((r) => ({ author: who(r.creator), body: r.comment.content, score: r.counts?.score || 0 }))
  }));
}

function who(p) {
  if (!p) return null;
  const host = (() => { try { return new URL(p.actor_id).host; } catch { return ''; } })();
  return host && host !== lemmyInstance() ? `${p.name}@${host}` : p.name;
}

function communityName(c) {
  const host = (() => { try { return new URL(c.actor_id).host; } catch { return ''; } })();
  return host ? `${c.name}@${host}` : c.name;
}

const IMG_RE = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;

export function normalize(v) {
  const p = v.post;
  if (!p || p.deleted || p.removed) return null;
  const url = p.url || '';
  const type = p.url_content_type || '';
  const body = p.body || '';
  const bodyImages = [...body.matchAll(IMG_RE)].map((m) => m[1]);
  const base = {
    source: 'lemmy', ext_id: String(p.ap_id || p.id), url: p.ap_id || `https://${lemmyInstance()}/post/${p.id}`,
    title: p.name || '', body: '', author: who(v.creator), community: communityName(v.community), flair: null,
    score: v.counts?.score ?? 0, comments: v.counts?.comments ?? 0, created_utc: Math.round(Date.parse(p.published) / 1000) || 0,
    nsfw: p.nsfw || v.community?.nsfw ? 1 : 0, tags: [v.community?.title, v.community?.name].filter(Boolean),
    lemmyId: p.id
  };
  const extra = { lemmyId: p.id, avatar: v.creator?.avatar || null };
  const rg = (url.match(/redgifs\.com\/(?:watch|ifr|i)\/([a-z]+)/i) || body.match(/redgifs\.com\/(?:watch|ifr|i)\/([a-z]+)/i));
  if (rg) return { ...base, body: body.replace(/https?:\/\/\S*redgifs\.com\S*/gi, '').trim().slice(0, 4000), format: 'short', media: { kind: 'redgifs', redgifsId: rg[1].toLowerCase(), poster: p.thumbnail_url || null, ...extra } };
  if (/imgur\.com\/.+\.gifv$/i.test(url)) return { ...base, format: 'gif', media: { kind: 'video', src: url.replace(/\.gifv$/i, '.mp4'), poster: p.thumbnail_url, hasAudio: false, loop: true, ...extra } };
  const vr = url.match(/^https:\/\/v\.redd\.it\/([a-z0-9]+)/i);
  if (vr) { const hls = `https://v.redd.it/${vr[1]}/HLSPlaylist.m3u8`; return { ...base, format: 'short', media: { kind: 'video', hls, src: hls, poster: p.thumbnail_url, hasAudio: true, ...extra } }; }
  if (/^video\//.test(type) || /\.(mp4|webm|mov)(\?|$)/i.test(url)) {
    return { ...base, format: 'short', media: { kind: 'video', src: url, poster: p.thumbnail_url, hasAudio: true, ...extra } };
  }
  if (type === 'image/gif' || /\.gifv?(\?|$)/i.test(url)) {
    return { ...base, format: 'gif', media: { kind: 'image', src: url, mid: url, ...extra } };
  }
  const images = [/^image\//.test(type) || /\.(jpe?g|png|webp)(\?|$)/i.test(url) ? url : null, ...bodyImages].filter(Boolean);
  if (images.length > 1) {
    return { ...base, format: 'set', body: body.replace(IMG_RE, '').trim().slice(0, 4000), media: { kind: 'gallery', items: images.slice(0, 20).map((src) => ({ type: /\.(mp4|webm)(\?|$)/i.test(src) ? 'video' : 'image', src, mid: src })), ...extra } };
  }
  if (images.length === 1) {
    return { ...base, format: 'image', body: body.slice(0, 4000), media: { kind: 'image', src: images[0], mid: images[0], ...extra } };
  }
  if (body) {
    const words = body.split(/\s+/).filter(Boolean).length;
    return { ...base, body: body.slice(0, 30000), format: words > 350 ? 'story' : 'discussion', media: { kind: 'text', words, readMin: Math.max(1, Math.round(words / 230)), ...extra } };
  }
  if (p.thumbnail_url) return { ...base, format: 'image', media: { kind: 'image', src: p.thumbnail_url, mid: p.thumbnail_url, link: url, ...extra } };
  return null;
}
