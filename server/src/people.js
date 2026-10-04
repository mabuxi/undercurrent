import { getDb, now } from './db.js';
import { config } from './config.js';
import { request } from './http.js';
import * as redgifs from './sources/redgifs.js';
import * as bluesky from './sources/bluesky.js';
import { lemmyInstance } from './sources/lemmy.js';

// People named in a post: @handles, u/ names. Each one links to the profile on the platform it most likely belongs to.

const U_RE = /(?:^|[\s(>"'])\/?u\/([A-Za-z0-9_-]{3,20})\b/g;
const AT_RE = /(?:^|[^\w@.])@([A-Za-z0-9_](?:[A-Za-z0-9_.-]{0,60}[A-Za-z0-9_])?(?:@[a-z0-9.-]+\.[a-z]{2,})?)/g;

export function platformFor(handle, source) {
  if (source === 'lemmy' || /@/.test(handle)) return 'lemmy';
  if (source === 'bluesky' || /\.[a-z]{2,}$/i.test(handle)) return 'bluesky';
  if (source === 'redgifs') return 'redgifs';
  if (source === 'reddit') return 'any';
  return 'any';
}

export function profileUrl(platform, handle) {
  if (platform === 'bluesky') return /\./.test(handle) ? `https://bsky.app/profile/${handle}` : null;
  if (platform === 'reddit') return `https://www.reddit.com/user/${handle}`;
  if (platform === 'redgifs') return `https://www.redgifs.com/users/${handle.toLowerCase()}`;
  if (platform === 'lemmy') return `https://${lemmyInstance()}/u/${handle}`;
  return null;
}

export function mentionsIn(item) {
  const text = `${item.title || ''}\n${item.body || ''}`;
  const own = String(item.author || '').toLowerCase();
  const out = [];
  const seen = new Set();
  const add = (handle, platform) => {
    const h = handle.replace(/[.]+$/, '');
    const k = h.toLowerCase();
    if (!h || h.length < 3 || seen.has(k) || k === own || /^(everyone|here|all|mods?)$/i.test(h)) return;
    seen.add(k);
    out.push({ handle: h, platform, url: profileUrl(platform, h) });
  };
  for (const m of text.matchAll(U_RE)) add(m[1], 'reddit');
  for (const m of text.matchAll(AT_RE)) add(m[1], platformFor(m[1], item.source));
  return out.slice(0, 8);
}

const cache = new Map();
const TTL = 3600000;

async function safe(fn, ms = 6000) {
  try { return await Promise.race([fn(), new Promise((r) => setTimeout(() => r(null), ms))]); } catch { return null; }
}

async function onBluesky(handle) {
  let h = handle;
  if (!/\./.test(h)) {
    const d = await request(`https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?${new URLSearchParams({ q: h, limit: '10' })}`, { purpose: 'Bluesky profile' });
    const hit = (d.actors || []).find((a) => a.handle.split('.')[0].toLowerCase() === h.toLowerCase());
    if (!hit) return null;
    h = hit.handle;
  }
  const p = await bluesky.profile(h);
  if (!p?.handle) return null;
  return { platform: 'bluesky', handle: p.handle, name: p.displayName || p.handle, url: profileUrl('bluesky', p.handle), posts: p.postsCount ?? null, followers: p.followersCount ?? null, avatar: p.avatar || null, about: String(p.description || '').slice(0, 200) };
}

async function onRedgifs(handle) {
  const u = await redgifs.userInfo(handle);
  if (!u) return null;
  return { platform: 'redgifs', handle: u.username, name: u.name || u.username, url: u.profileUrl || profileUrl('redgifs', u.username), posts: u.publishedGifs ?? u.gifs ?? null, followers: u.followers ?? null, avatar: u.profileImageUrl || null, about: String(u.description || '').slice(0, 200) };
}

async function onLemmy(handle) {
  const d = await request(`https://${lemmyInstance()}/api/v3/user?${new URLSearchParams({ username: handle, limit: '1' })}`, { purpose: 'Lemmy profile' });
  const pv = d?.person_view;
  if (!pv) return null;
  return { platform: 'lemmy', handle, name: pv.person.display_name || pv.person.name, url: pv.person.actor_id || profileUrl('lemmy', handle), posts: pv.counts?.post_count ?? null, followers: null, avatar: pv.person.avatar || null, about: String(pv.person.bio || '').slice(0, 200) };
}

// Where does this person post? Checks the platforms that answer without an account and says how many posts they have there.
export async function lookupPerson(handle, { platform = 'any' } = {}) {
  const key = `${platform}|${handle}`.toLowerCase();
  const hit = cache.get(key);
  if (hit && now() - hit.at < TTL) return hit.data;
  const clean = String(handle).replace(/^@|^\/?u\//i, '').trim();
  const profiles = [];
  if (!config.mock) {
    const jobs = [];
    if (platform === 'bluesky' || platform === 'any') jobs.push(safe(() => onBluesky(clean)));
    if (platform === 'redgifs' || platform === 'any') jobs.push(safe(() => onRedgifs(clean)));
    if (platform === 'lemmy') jobs.push(safe(() => onLemmy(clean)));
    for (const p of await Promise.all(jobs)) if (p) profiles.push(p);
  } else {
    profiles.push({ platform: platform === 'any' ? 'bluesky' : platform, handle: clean, name: clean, url: profileUrl(platform === 'any' ? 'bluesky' : platform, clean), posts: 120 + clean.length * 7, followers: 900, avatar: null, about: 'Mock profile.' });
  }
  if (platform === 'reddit' || platform === 'any') profiles.push({ platform: 'reddit', handle: clean, name: `u/${clean}`, url: profileUrl('reddit', clean), posts: null, followers: null, avatar: null, about: '', unverified: platform !== 'reddit' });
  const local = getDb().prepare('SELECT source, COUNT(*) n FROM items WHERE lower(author) = lower(?) AND blocked = 0 GROUP BY source').all(clean);
  const data = { handle: clean, platform, profiles, local };
  cache.set(key, { at: now(), data });
  return data;
}

// Post count on the platform itself, when that platform tells us.
export async function platformPosts(source, author) {
  if (!author) return null;
  const map = { bluesky: 'bluesky', redgifs: 'redgifs', lemmy: 'lemmy' };
  if (!map[source]) return null;
  const r = await lookupPerson(author, { platform: map[source] });
  return r.profiles.find((p) => p.platform === map[source]) || null;
}
