// You come first. While you are waiting for something to show (the feed loading, a video that has not started yet,
// a player link being looked up), background work steps aside: the AI's background jobs, the tagger, the quick looks,
// grabbing video frames, fetching from sources and the slower bookkeeping all wait until you have something to see.
// "Waiting" is known two ways: requests you are waiting on right now (the feed, a video link), and the page saying a
// spinner is on screen. Work that was put off runs once nothing has been asked for a little while.

let inflight = 0;
let waitUntil = 0;
let lastUser = 0;
const QUIET_MS = 1500;

export function userWaiting() {
  return inflight > 0 || Date.now() < waitUntil;
}

// The page says a spinner is on screen (on) or gone (off). A heartbeat keeps it on; it stops by itself after a few
// seconds, so a closed page never keeps everything paused.
export function setWaiting(on) {
  waitUntil = on ? Date.now() + 6000 : 0;
  if (!on) runIdle();
}

// Something you are waiting on: counted from start to finish.
export function beginUser() {
  inflight++;
  lastUser = Date.now();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    inflight = Math.max(0, inflight - 1);
    lastUser = Date.now();
    if (!inflight) setTimeout(runIdle, QUIET_MS + 50).unref?.();
  };
}

export function isIdle() {
  return !userWaiting() && Date.now() - lastUser >= QUIET_MS;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Background work calls this before each step: it returns at once when you are not waiting, otherwise when you are
// (or after maxMs, so nothing waits forever).
export async function yieldToUser(maxMs = 30000) {
  const t0 = Date.now();
  while (userWaiting() && Date.now() - t0 < maxMs) await sleep(250);
}

// Work that can wait (rebuilding caches, recounting): runs when nothing has been asked for a little while.
const later = new Map();
export function whenIdle(key, fn) {
  later.set(key, fn);
  setTimeout(runIdle, QUIET_MS + 50).unref?.();
}
function runIdle() {
  if (!later.size) return;
  if (!isIdle()) { setTimeout(runIdle, 600).unref?.(); return; }
  const [key, fn] = later.entries().next().value;
  later.delete(key);
  try { fn(); } catch {}
  if (later.size) setTimeout(runIdle, 200).unref?.();
}

// A value that takes a while to work out, kept for ttl. Once older than that it is still used for up to stale while a
// fresh one is worked out in a quiet moment, so you never wait for it; only when there is nothing yet is it worked out
// right away.
const MEMO = new Map();
export function memo(key, ttl, fn, stale = 0) {
  const hit = MEMO.get(key);
  const t = Date.now();
  if (hit && t - hit.at < ttl) return hit.v;
  if (hit && stale && t - hit.at < ttl + stale) {
    whenIdle(`memo:${key}`, () => { MEMO.set(key, { at: Date.now(), v: fn() }); });
    return hit.v;
  }
  const v = fn();
  MEMO.set(key, { at: t, v });
  return v;
}
export function forget(prefix = '') {
  for (const k of MEMO.keys()) if (k.startsWith(prefix)) MEMO.delete(k);
}
