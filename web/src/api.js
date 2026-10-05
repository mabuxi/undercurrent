import { t, tn, getLang } from './i18n.js';

export const sessionId = (() => {
  try {
    const k = 'uc-session';
    const prev = JSON.parse(sessionStorage.getItem(k) || 'null');
    if (prev && Date.now() - prev.at < 3 * 3600 * 1000) {
      sessionStorage.setItem(k, JSON.stringify({ id: prev.id, at: Date.now() }));
      return prev.id;
    }
    const id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    sessionStorage.setItem(k, JSON.stringify({ id, at: Date.now() }));
    return id;
  } catch {
    return `s${Date.now().toString(36)}`;
  }
})();

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify({ sessionId, ...body }) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) throw new Error(data?.error || t('Request failed ({status})', { status: res.status }));
  return data;
}

const queue = [];
let timer = null;

function flush(useBeacon = false) {
  if (!queue.length) return;
  const events = queue.splice(0, queue.length);
  const payload = JSON.stringify({ sessionId, events });
  if (useBeacon && navigator.sendBeacon) {
    navigator.sendBeacon('/api/events', new Blob([payload], { type: 'application/json' }));
    return;
  }
  fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
}

export function track(itemId, type, value = null) {
  queue.push({ itemId, type, value });
  if (queue.length >= 12) flush();
  clearTimeout(timer);
  timer = setTimeout(() => flush(), 1500);
}

export function flushNow() {
  clearTimeout(timer);
  flush();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
}

export function fmtDur(s) {
  if (!s && s !== 0) return '';
  s = Math.round(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(r).padStart(2, '0')}`;
}

const dec = (s) => (getLang() === 'fr' ? s.replace('.', ',') : s);

export function fmtNum(n) {
  n = Number(n) || 0;
  if (n >= 10000000) return `${Math.round(n / 1000000)}M`;
  if (n >= 1000000) return `${dec((n / 1000000).toFixed(1).replace(/\.0$/, ''))}M`;
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${dec((n / 1000).toFixed(1))}k`;
  return String(n);
}

export function fmtBytes(b) {
  b = Number(b) || 0;
  const fr = getLang() === 'fr';
  if (b >= 1048576) return `${dec((b / 1048576).toFixed(1))} ${fr ? 'Mo' : 'MB'}`;
  if (b >= 1024) return `${Math.round(b / 1024)} ${fr ? 'ko' : 'kB'}`;
  return `${b} ${fr ? 'o' : 'B'}`;
}

export function ago(unix) {
  if (!unix) return '';
  const s = Date.now() / 1000 - unix;
  if (getLang() === 'fr') {
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))}\u00a0min`;
    if (s < 86400) return `${Math.round(s / 3600)}\u00a0h`;
    if (s < 604800) return `${Math.round(s / 86400)}\u00a0j`;
    if (s < 2592000) return `${Math.round(s / 604800)}\u00a0sem.`;
    return `${Math.round(s / 2592000)}\u00a0mois`;
  }
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 604800) return `${Math.round(s / 86400)}d`;
  if (s < 2592000) return `${Math.round(s / 604800)}w`;
  return `${Math.round(s / 2592000)}mo`;
}

export function rgba(hex, a) {
  const h = String(hex || '#888888').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function imgSrc(url) {
  return url && /^https:\/\/pix-[^/]*\.phncdn\.com\//.test(url) ? proxied(url) : url;
}

export function proxied(url) {
  return url && /^https:/.test(url) ? `/api/proxy?url=${encodeURIComponent(url)}` : url;
}

export const FORMATS = { long: t('Long form'), short: t('Short form'), gif: t('GIFs'), image: t('Images'), set: t('Image sets'), story: t('Stories'), discussion: t('Discussions') };
export const LEN_HINT = { any: t('everything'), quick: t('video under 2 min · reads under 5 min · GIFs and images'), medium: t('video 2 to 15 min · reads 5 to 15 min · threads'), long: t('video over 15 min · reads over 15 min') };
export const LABELS = { following: t('Following'), foryou: t('For you'), discovery: t('New to you'), deeper: t('Deeper'), popular: t('Popular') };

export function formatMeta(it) {
  if (it.format === 'long') return `${t('Long form')}${it.duration ? ` · ${fmtDur(it.duration)}` : ''}`;
  if (it.format === 'short') return `${t('Short form')}${it.duration ? ` · ${fmtDur(it.duration)}` : ''}`;
  if (it.format === 'gif') return t('GIF · loops');
  if (it.format === 'image') return t('Image');
  if (it.format === 'set') return t('{n} images', { n: it.media?.items?.length || '' }).trim();
  if (it.format === 'story') return t('Story · {n} min read', { n: it.media?.readMin || 1 });
  return tn(Number(it.comments) || 0, 'Thread · {n} reply', 'Thread · {n} replies', { n: fmtNum(it.comments) });
}
