import { config } from './config.js';
import { logNet } from './db.js';
import { tr } from './i18n.js';

export class HttpError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function request(url, { method = 'GET', headers = {}, body, purpose = 'content', timeout = 20000, raw = false } = {}) {
  const u = new URL(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const h = { 'User-Agent': config.userAgent, ...headers };
  let payload = body;
  if (body && typeof body === 'object' && !(body instanceof URLSearchParams) && !(body instanceof Buffer)) {
    payload = JSON.stringify(body);
    h['Content-Type'] = 'application/json';
  }
  const bytesOut = (payload ? Buffer.byteLength(String(payload)) : 0) + u.pathname.length + u.search.length;
  let res;
  try {
    res = await fetch(url, { method, headers: h, body: payload, signal: ctrl.signal });
  } catch (err) {
    clearTimeout(timer);
    logNet(u.host, purpose, bytesOut, 0, 0);
    throw new HttpError(0, tr('Could not reach {host}: {why}', { host: u.host, why: err.name === 'AbortError' ? tr('timed out') : err.message }));
  }
  clearTimeout(timer);
  if (raw) {
    logNet(u.host, purpose, bytesOut, Number(res.headers.get('content-length') || 0), res.status);
    return res;
  }
  const text = await res.text();
  logNet(u.host, purpose, bytesOut, Buffer.byteLength(text), res.status);
  let data = text;
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) throw new HttpError(res.status, tr('{host} answered {status}', { host: u.host, status: res.status }), data);
  return data;
}
