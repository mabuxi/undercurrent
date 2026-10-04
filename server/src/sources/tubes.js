import { request } from '../http.js';

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

function secs(d) {
  if (typeof d === 'number') return d;
  const parts = String(d || '').split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  return parts.reduce((a, b) => a * 60 + b, 0) || null;
}

function formatFor(duration) {
  if (!duration) return 'long';
  return duration > 180 ? 'long' : 'short';
}

function unix(date) {
  const t = Date.parse(String(date || '').replace(' ', 'T'));
  return Number.isNaN(t) ? 0 : Math.round(t / 1000);
}

const BAD_THUMB = /\/videos\/\/|\/\/original|^$/;
export const goodThumb = (u) => typeof u === 'string' && /^https:\/\//.test(u) && !BAD_THUMB.test(u.replace(/^https:\/\//, ''));
function previewable(n) {
  if (!n) return null;
  const m = n.media;
  m.thumbs = (m.thumbs || []).filter(goodThumb);
  if (!goodThumb(m.poster)) m.poster = m.thumbs[0] || null;
  if (!m.poster) return null;
  m.thumbsAt = Date.now();
  return n;
}

const clean = (t) => String(t || '').replace(/-/g, ' ').trim();

async function get(url, purpose) {
  return request(url, { purpose, headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' } });
}

const PH_ORDER = { all: ['mostviewed', ''], trending: ['mostviewed', 'weekly'], top: ['rating', 'monthly'], new: ['newest', ''], hot: ['featured', ''], week: ['mostviewed', 'weekly'], month: ['mostviewed', 'monthly'] };

export const pornhub = {
  async list({ query = '', order = 'trending', page = 1, star = '' } = {}) {
    const [ordering, period] = PH_ORDER[order] || PH_ORDER.trending;
    const q = new URLSearchParams({ thumbsize: 'large', page: String(page), ordering });
    if (period) q.set('period', period);
    if (query) q.set('search', query);
    if (star) q.append('stars[]', star);
    const data = await get(`https://www.pornhub.com/webmasters/search?${q}`, 'Pornhub search');
    return (data?.videos || []).map((v) => previewable(pornhub.normalize(v))).filter(Boolean);
  },
  async byId(id) {
    const data = await get(`https://www.pornhub.com/webmasters/video_by_id?${new URLSearchParams({ id, thumbsize: 'large' })}`, 'Pornhub refresh');
    return data?.video ? previewable(pornhub.normalize(data.video)) : null;
  },
  normalize(v) {
    const duration = secs(v.duration);
    const stars = (v.pornstars || []).map((p) => p.pornstar_name).filter(Boolean);
    return {
      source: 'pornhub', ext_id: String(v.video_id), url: v.url, title: v.title || '', body: '',
      author: null, community: 'Pornhub', flair: null, format: formatFor(duration), width: null, height: null, duration,
      score: Number(v.views) || 0, comments: 0, created_utc: unix(v.publish_date), nsfw: 1,
      tags: [...(v.tags || []).map((t) => clean(t.tag_name)), ...(v.categories || []).map((c) => clean(c.category))],
      performers: stars,
      media: { kind: 'embed', embed: `https://www.pornhub.com/embed/${v.video_id}`, poster: v.thumb || v.default_thumb, thumbs: (v.thumbs || []).map((t) => t.src).slice(0, 16), provider: 'Pornhub', rating: Number(v.rating) || null, votes: Number(v.ratings) || null, views: Number(v.views) || null, performers: stars }
    };
  }
};

const RT_ORDER = { all: ['mostviewed', ''], trending: ['mostviewed', 'weekly'], top: ['rating', 'monthly'], new: ['newest', ''], hot: ['mostviewed', 'weekly'], week: ['rating', 'weekly'], month: ['mostviewed', 'monthly'] };

export const redtube = {
  async list({ query = '', order = 'trending', page = 1, star = '' } = {}) {
    const [ordering, period] = RT_ORDER[order] || RT_ORDER.trending;
    const q = new URLSearchParams({ data: 'redtube.Videos.searchVideos', output: 'json', thumbsize: 'big', page: String(page), ordering });
    if (period) q.set('period', period);
    if (query) q.set('search', query);
    if (star) q.append('stars[]', star);
    const data = await get(`https://api.redtube.com/?${q}`, 'RedTube search');
    return (data?.videos || []).map((x) => previewable(redtube.normalize(x.video || x))).filter(Boolean);
  },
  async byId(id) {
    const data = await get(`https://api.redtube.com/?${new URLSearchParams({ data: 'redtube.Videos.getVideoById', output: 'json', thumbsize: 'big', video_id: id })}`, 'RedTube refresh');
    return data?.video ? previewable(redtube.normalize(data.video)) : null;
  },
  normalize(v) {
    const duration = secs(v.duration);
    return {
      source: 'redtube', ext_id: String(v.video_id), url: v.url, title: v.title || '', body: '',
      author: null, community: 'RedTube', flair: null, format: formatFor(duration), width: null, height: null, duration,
      score: Number(v.views) || 0, comments: 0, created_utc: unix(v.publish_date), nsfw: 1,
      tags: (v.tags || []).map((t) => clean(t.tag_name)).filter((t) => t && t.toLowerCase() !== 'hd'),
      performers: (v.pornstars || []).map((p) => p.pornstar_name).filter(Boolean),
      media: { kind: 'embed', embed: v.embed_url || `https://embed.redtube.com/?id=${v.video_id}`, poster: v.thumb || v.default_thumb, thumbs: (v.thumbs || []).map((t) => t.src).slice(0, 16), provider: 'RedTube', rating: Number(v.rating) || null, votes: Number(v.ratings) || null, views: Number(v.views) || null, performers: (v.pornstars || []).map((p) => p.pornstar_name).filter(Boolean) }
    };
  }
};

const EP_ORDER = { all: 'most-popular', trending: 'top-weekly', top: 'top-monthly', new: 'latest', hot: 'top-weekly', week: 'top-weekly', month: 'top-monthly' };

export const eporner = {
  async list({ query = '', order = 'trending', page = 1 } = {}) {
    const q = new URLSearchParams({ query: query || 'all', per_page: '40', page: String(page), thumbsize: 'big', order: EP_ORDER[order] || EP_ORDER.trending, gay: /\bgay\b/i.test(query) ? '2' : '0', lq: '0', format: 'json' });
    const data = await get(`https://www.eporner.com/api/v2/video/search/?${q}`, 'Eporner search');
    return (data?.videos || []).map((v) => previewable(eporner.normalize(v))).filter(Boolean);
  },
  async byId(id) {
    const data = await get(`https://www.eporner.com/api/v2/video/id/?${new URLSearchParams({ id, thumbsize: 'big', format: 'json' })}`, 'Eporner refresh');
    return data?.id ? previewable(eporner.normalize(data)) : null;
  },
  normalize(v) {
    const duration = Number(v.length_sec) || secs(v.length_min);
    const kw = String(v.keywords || '').split(',').map((s) => s.trim()).filter((s) => s && s.length < 40 && s.toLowerCase() !== String(v.title || '').toLowerCase());
    return {
      source: 'eporner', ext_id: String(v.id), url: v.url, title: v.title || '', body: '',
      author: null, community: 'Eporner', flair: null, format: formatFor(duration), width: null, height: null, duration,
      score: Number(v.views) || 0, comments: 0, created_utc: unix(v.added), nsfw: 1,
      tags: [...new Set(kw)],
      media: { kind: 'embed', embed: v.embed, poster: v.default_thumb?.src, thumbs: (v.thumbs || []).map((t) => t.src).slice(0, 15), provider: 'Eporner', rating: Number(v.rate) ? Math.round(Number(v.rate) * 20) : null, views: Number(v.views) || null }
    };
  }
};
