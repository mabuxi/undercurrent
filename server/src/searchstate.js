// Live search jobs, kept apart so the feed builder can read a search without importing the whole search engine.
export const JOBS = new Map();

export function getSearchSpec(id) {
  const j = JOBS.get(String(id));
  return j ? j.spec : null;
}

export function getProfileItems(id, key) {
  return JOBS.get(String(id))?.profileItems?.get(key) || null;
}

export function pruneJobs(maxAgeMs = 3 * 3600000) {
  const cut = Date.now() - maxAgeMs;
  for (const [id, j] of JOBS) if (j.at < cut) JOBS.delete(id);
}

// Bumped whenever posts are added, hidden or blocked, so the feed's cached pool is rebuilt.
// Posts added in the background only mark the pool as stale: it is rebuilt at most every 8 seconds for them.
export const pool = { ver: 0, dirtyAt: 0, cache: !process.env.NODE_TEST_CONTEXT };
export function invalidatePool() { pool.ver++; }
export function touchPool() { pool.dirtyAt = Date.now(); }
