import { request } from '../http.js';
import { getSetting } from '../db.js';
import { tr } from '../i18n.js';

// Lustpress: an open-source service that reads search results from Pornhub, XNXX, RedTube, XVideos, xHamster,
// YouPorn, Eporner and TXXX. It is not run on this computer: you point Undercurrent at a Lustpress server you host
// somewhere else (Settings → Scraper server). Without that address these sources stay off.

export const LUST_SITES = { pornhub: 'Pornhub', xnxx: 'XNXX', redtube: 'RedTube', xvideos: 'XVideos', xhamster: 'xHamster', youporn: 'YouPorn', eporner: 'Eporner', txxx: 'TXXX' };

// Image servers of the tube sites and the page each one expects as referrer, for the image proxy and the tagger.
export const TUBE_CDNS = [
  [/phncdn\.com$/, 'https://www.pornhub.com/'], [/rdtcdn\.com$/, 'https://www.redtube.com/'], [/eporner\.com$/, 'https://www.eporner.com/'],
  [/xvideos-cdn\.com$|xvideos\.com$/, 'https://www.xvideos.com/'], [/xnxx-cdn\.com$|xnxx\.com$/, 'https://www.xnxx.com/'],
  [/xhcdn\.com$|xhamster\.com$/, 'https://xhamster.com/'], [/ypncdn\.com$|youporn\.com$/, 'https://www.youporn.com/'], [/txxx\.com$|tube-cdn\.com$/, 'https://txxx.com/']
];
export function tubeReferer(url) {
  let host = '';
  try { host = new URL(url).hostname; } catch { return null; }
  return TUBE_CDNS.find(([re]) => re.test(host))?.[1] || null;
}

export function lustUrl() {
  return String(getSetting('lustpressUrl', '') || process.env.LUSTPRESS_URL || '').trim().replace(/\/+$/, '');
}

function secs(d) {
  if (typeof d === 'number') return d;
  const s = String(d || '').trim().toLowerCase();
  if (!s || s === 'none') return null;
  const m = s.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?\s*(?:(\d+)\s*sec)?/);
  if (/h|min|sec/.test(s) && m) return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0) || null;
  const parts = s.split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  return parts.reduce((a, b) => a * 60 + b, 0) || null;
}

export function parseCount(v) {
  if (typeof v === 'number') return v;
  const s = String(v || '').trim().toLowerCase().replace(/views?/, '').trim();
  const m = s.match(/^([\d.,]+)\s*([kmb])?$/);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, m[2] ? '.' : ''));
  if (!m[2]) n = Number(m[1].replace(/[.,]/g, ''));
  return Math.round(n * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1)) || null;
}

export function normalizeLust(site, x) {
  if (!x || !(x.id || x.video_id) || !(x.title)) return null;
  const id = String(x.id || x.video_id).replace(/^\/+|\/+$/g, '').slice(0, 200);
  const duration = secs(x.duration);
  const views = parseCount(x.views);
  const embed = x.video || x.embed || null;
  const poster = x.image && x.image !== 'None' ? x.image : null;
  if (!embed || !poster) return null;
  return {
    source: site, ext_id: site === 'pornhub' ? id.replace(/^.*viewkey=/, '') : id, url: x.link || null, title: String(x.title).trim(), body: '',
    author: x.uploader || null, community: LUST_SITES[site], flair: null, format: duration && duration <= 180 ? 'short' : 'long', width: null, height: null, duration,
    score: 0, comments: 0, created_utc: 0, nsfw: 1, tags: [],
    media: { kind: 'embed', embed, poster, thumbs: [], provider: LUST_SITES[site], views, via: 'lustpress' }
  };
}

export async function lustSearch(site, key, page = 1) {
  const base = lustUrl();
  if (!base || !LUST_SITES[site] || !key) return [];
  const d = await request(`${base}/${site}/search?${new URLSearchParams({ key, page: String(page) })}`, { purpose: `Scraper server: ${LUST_SITES[site]}`, timeout: 30000 });
  const list = Array.isArray(d?.data) ? d.data : Array.isArray(d?.data?.videos) ? d.data.videos : [];
  return list.map((x) => normalizeLust(site, x)).filter(Boolean);
}

export async function lustTest(url) {
  const base = String(url || '').trim().replace(/\/+$/, '');
  const d = await request(`${base}/xvideos/search?${new URLSearchParams({ key: 'amateur' })}`, { purpose: 'Scraper server test', timeout: 30000 });
  if (!Array.isArray(d?.data)) throw new Error(tr('no list of videos came back'));
  return d.data.length;
}

// Official API results first, then what the scraper server adds, without the same video twice.
export function merge(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) for (const n of list || []) {
    const k = `${n.source}|${n.ext_id}`;
    const t = String(n.title || '').toLowerCase().replace(/\W+/g, ' ').trim();
    if (seen.has(k) || (t && seen.has(`t|${n.source}|${t}`))) continue;
    seen.add(k);
    if (t) seen.add(`t|${n.source}|${t}`);
    out.push(n);
  }
  return out;
}
