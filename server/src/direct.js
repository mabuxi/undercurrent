import { log } from './log.js';

// The video file behind a tube site's embed player, so a phone can play it in its own player: Safari on an iPhone
// often shows those embed players black (they need cookies it does not give them), and its own player can start by
// itself, go 2x and fill the screen. The links only work from the Mac that asked for them, so they always go through
// the Mac (/api/proxy for files, /api/hls for streams). Kept for 40 minutes; they expire after about two hours.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const CACHE = new Map();
const TTL = 40 * 60000;

async function get(url, referer, json = false) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer, Accept: json ? 'application/json' : 'text/html' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${r.status}`);
  return json ? r.json() : r.text();
}

const best = (list, h = (x) => x.height) => list.filter((x) => h(x) && h(x) <= 1080).sort((a, b) => h(b) - h(a))[0] || list[0];

// The JSON list right after a key in a page's script, read bracket by bracket (it holds lists of its own).
function jsonArrayAfter(text, key) {
  const k = text.indexOf(key);
  if (k < 0) return null;
  const start = text.indexOf('[', k);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

// Pornhub, RedTube and YouPorn pages list their streams the same way.
async function mediaDefinitions(embed, site, preferHls = false) {
  const html = await get(embed, site);
  const raw = jsonArrayAfter(html, '"mediaDefinitions"');
  if (!raw) return null;
  let defs = [];
  try { defs = JSON.parse(raw); } catch { return null; }
  // Some entries are the address of a small list of the real files or streams, in every quality.
  const entries = [];
  for (const d of defs) {
    if (!d?.videoUrl) continue;
    if (!d.remote) { entries.push(d); continue; }
    try {
      const list = await get(new URL(d.videoUrl, site).toString(), embed, true);
      for (const x of Array.isArray(list) ? list : []) if (x?.videoUrl) entries.push({ ...x, format: x.format || d.format });
    } catch (e) { log('info', `Direct video: no list from ${site} (${e.message})`); }
  }
  const q = (x) => Number(x.quality) || Number(x.height) || 0;
  const pick = (fmt) => { const b2 = best(entries.filter((x) => x.format === fmt && /^https:/.test(x.videoUrl)), q); return b2 ? { kind: fmt, url: b2.videoUrl, height: q(b2) || null } : null; };
  const hls = pick('hls');
  const mp4 = pick('mp4');
  // RedTube and YouPorn files ignore byte ranges (an iPhone will not play those) and come slowly: their stream is
  // used. Pornhub's files can be seeked in, which is nicer than a stream.
  return preferHls ? hls || mp4 : mp4 || hls;
}

// Eporner hands out its files from a small request signed with the page's hash.
const b36 = (hex) => parseInt(hex, 16).toString(36);
async function eporner(embed) {
  const html = await get(embed, 'https://www.eporner.com/');
  const vid = /vid\s*=\s*['"]([A-Za-z0-9]+)['"]/.exec(html)?.[1];
  const hash = /hash\s*=\s*['"]([a-f0-9]{32})['"]/.exec(html)?.[1];
  if (!vid || !hash) return null;
  const h = [0, 8, 16, 24].map((i) => b36(hash.slice(i, i + 8))).join('');
  const r = await get(`https://www.eporner.com/xhr/video/${vid}?hash=${h}&domain=www.eporner.com&fallback=false&embed=true&supportedFormats=hls,mp4`, embed, true);
  const files = Object.values(r?.sources?.mp4 || {}).map((f) => ({ url: f.src, height: parseInt(f.labelShort, 10) || 0 })).filter((f) => f.url);
  const mp4 = best(files);
  if (mp4) return { kind: 'mp4', url: mp4.url, height: mp4.height };
  const hls = r?.sources?.hls?.auto?.src;
  return hls ? { kind: 'hls', url: hls, height: null } : null;
}

const SITES = {
  pornhub: (e) => mediaDefinitions(e, 'https://www.pornhub.com/'),
  redtube: (e) => mediaDefinitions(e, 'https://www.redtube.com/', true),
  youporn: (e) => mediaDefinitions(e, 'https://www.youporn.com/', true),
  eporner
};
export const DIRECT_SOURCES = Object.keys(SITES);

export async function directMedia(item) {
  const fn = SITES[item?.source];
  const embed = item?.media?.embed;
  if (!fn || !embed) return null;
  const hit = CACHE.get(item.id);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  let v = null;
  try { v = await fn(embed); } catch (e) { log('info', `Direct video for ${item.source} ${item.id} failed: ${e.message}`); }
  if (v) {
    v = { ...v, src: v.kind === 'hls' ? `/api/hls?url=${encodeURIComponent(v.url)}` : `/api/proxy?url=${encodeURIComponent(v.url)}` };
    CACHE.set(item.id, { at: Date.now(), v });
    if (CACHE.size > 300) CACHE.delete(CACHE.keys().next().value);
  }
  return v;
}
