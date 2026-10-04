import { getDb, getSetting, setSetting, normalizeTag } from '../db.js';
import { request } from '../http.js';
import { log } from '../log.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

export function ensureStarsTable() {
  getDb().exec(`CREATE TABLE IF NOT EXISTS performers (
    name TEXT PRIMARY KEY,
    display TEXT,
    thumb TEXT,
    videos INTEGER DEFAULT 0,
    gender TEXT,
    source TEXT,
    updated INTEGER
  )`);
}

export function performerInfo(name) {
  ensureStarsTable();
  return getDb().prepare('SELECT * FROM performers WHERE name = ?').get(normalizeTag(name)) || null;
}

export function performerNames(minVideos = 8) {
  ensureStarsTable();
  return getDb().prepare('SELECT name, display, videos FROM performers WHERE videos >= ?').all(minVideos);
}

const CLEAN = /^[a-z][a-z'.-]*(?: [a-z][a-z'.-]*){1,3}$/;

export async function refreshStars({ force = false } = {}) {
  ensureStarsTable();
  const last = getSetting('starsFetchedAt', 0) || 0;
  if (!force && Date.now() - last < 7 * 86400000) return { skipped: true };
  const data = await request('https://www.pornhub.com/webmasters/stars_detailed', { purpose: 'Performer list', headers: { 'User-Agent': UA, Accept: 'application/json' }, timeout: 60000 });
  const stars = (data?.stars || []).map((s) => s.star || s).filter(Boolean);
  const db = getDb();
  const ins = db.prepare(`INSERT INTO performers(name, display, thumb, videos, gender, source, updated) VALUES(?, ?, ?, ?, ?, 'pornhub', ?)
    ON CONFLICT(name) DO UPDATE SET display = excluded.display, thumb = excluded.thumb, videos = excluded.videos, gender = excluded.gender, updated = excluded.updated`);
  let n = 0;
  db.transaction(() => {
    for (const s of stars) {
      const display = String(s.star_name || '').trim();
      const name = normalizeTag(display);
      const videos = Number(s.videos_count_all) || 0;
      if (!name || videos < 5 || !CLEAN.test(name)) continue;
      const thumb = /default\/|female\.jpg|male\.jpg/.test(s.star_thumb || '') ? null : s.star_thumb || null;
      ins.run(name, display, thumb, videos, s.gender || null, Date.now());
      n++;
    }
  })();
  setSetting('starsFetchedAt', Date.now());
  log('info', `Performer list: ${n} names from ${stars.length}`);
  return { stored: n };
}

// Performer photo and video count for the names shown on posts, from the Pornhub performer list kept here.
let cardCache = { at: 0, map: new Map() };
export function starCard(name) {
  if (Date.now() - cardCache.at > 10 * 60000) {
    ensureStarsTable();
    const map = new Map();
    for (const r of getDb().prepare('SELECT name, display, thumb, videos FROM performers').all()) map.set(r.name, r);
    cardCache = { at: Date.now(), map };
  }
  const r = cardCache.map.get(normalizeTag(name));
  return r ? { name: r.display || name, thumb: r.thumb || null, videos: r.videos || 0 } : { name, thumb: null, videos: null };
}
