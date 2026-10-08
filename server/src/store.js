import { getDb, now, tagId, normalizeTag, getSetting, setSetting } from './db.js';
import { isBlockedCreator } from './blocks.js';
import { postLangs } from './langdetect.js';
import { isBlocked } from './safety.js';
import { extractInto } from './ai/extract.js';
import { guessGender } from './gender.js';
import { postTagOk } from './tagquality.js';
import { invalidatePool, touchPool } from './searchstate.js';

// Moderator and housekeeping posts never belong in the feed.
const MOD_TITLE = /^\s*(?:\[(?:mod|meta|announcement|rules?|psa|mod post)\]|\((?:mod|meta|announcement)\)|(?:mod|meta|admin|moderator)s?\s*(?:post|note|announcement|update|message)\b|announcement\b|megathread|(?:weekly|daily|monthly)\s+(?:thread|discussion|megathread|check.?in|post)|new\s+rules?\b|rules?\s+(?:update|reminder|change)|please read\b|read (?:this )?before posting|verification\b|how to (?:get )?verif|welcome to (?:r\/|the sub|our)|subreddit (?:update|rules|announcement)|we(?:'re| are) (?:looking for|hiring|recruiting) (?:new )?mods|mod applications?|state of the sub|community (?:update|announcement|rules))/i;
const MOD_AUTHOR = /^(?:automoderator|[\w-]*modteam|reddit|mod|mods|moderator)$/i;
export function isModPost(n) {
  if (MOD_AUTHOR.test(String(n.author || ''))) return true;
  if (n.stickied || n.distinguished === 'moderator') return true;
  if (/^(?:mod|announcement|meta|rules)$/i.test(String(n.flair || '').trim())) return true;
  return MOD_TITLE.test(String(n.title || ''));
}

const OC_RE = /\s*(?:\[\s*(?:oc|og|o\.c\.?|o\.g\.?|original(?: content)?)\s*\]|\(\s*(?:oc|og|o\.c\.?|o\.g\.?|original content)\s*\)|\{\s*(?:oc|og)\s*\})\s*/gi;
// "[F OC]", "(og, 23)": an OC or OG inside a bracket with other words is taken out of the bracket.
const OC_IN = /([\[(])([^\])]*?)\b(?:oc|og|o\.c\.?|o\.g\.?)(?![\w.])([^\])]*?)([\])])/gi;
// Tags that only say "the poster made this": they become the Original content badge instead of a tag.
export const OC_TAGS = new Set(['oc', 'og', 'o.c.', 'o.c', 'o.g.', 'original content', 'oc content', 'og content', 'my own content']);
export function stripOc(title) {
  const t = String(title || '');
  let out = t.replace(OC_RE, ' ').replace(OC_IN, (m, a, x, y, b) => { const rest = `${x} ${y}`.replace(/[\s,;/|]+/g, ' ').trim(); return rest ? `${a}${rest}${b}` : ' '; }).replace(/^\s*o[cg]\s*[:\-–|]\s*/i, '').replace(/\s+[-–|]\s*o[cg]\s*$/i, '').replace(/\s+oc$/i, '').replace(/\s+original content\s*$/i, '').replace(/^\s*original content\s*[:\-–|]\s*/i, '');
  out = out.replace(/\s{2,}/g, ' ').trim();
  return out && out !== t.trim() ? { title: out, oc: true } : { title: t, oc: false };
}

const SOURCE_TAG_WEIGHT = { reddit: 0.5, redgifs: 0.7, rule34: 0.55, gelbooru: 0.55, pornhub: 0.6, redtube: 0.6, eporner: 0.5, lemmy: 0.5, bluesky: 0.5, mock: 0.7 };

export function upsertItem(n) {
  const db = getDb();
  const oc = stripOc(n.title);
  const ocTag = (n.tags || []).some((x) => OC_TAGS.has(String(x || '').trim().toLowerCase()));
  n = { ...n, title: oc.title, oc: n.oc || oc.oc || ocTag, tags: (n.tags || []).filter((x) => !OC_TAGS.has(String(x || '').trim().toLowerCase())) };
  let verdict = isBlocked({ title: n.title, body: n.body, tags: n.tags || [] });
  if (!verdict.blocked && isModPost(n)) verdict = { blocked: true, reason: 'announcement' };
  if (!verdict.blocked && isBlockedCreator(n)) verdict = { blocked: true, reason: 'creator' };
  const existing = db.prepare('SELECT id FROM items WHERE source = ? AND ext_id = ?').get(n.source, n.ext_id);
  if (existing) {
    db.prepare('UPDATE items SET score = ?, comments = ?, blocked = MAX(blocked, ?), block_reason = COALESCE(block_reason, ?), media = COALESCE(?, media) WHERE id = ?')
      .run(n.score || 0, n.comments || 0, verdict.blocked ? 1 : 0, verdict.blocked ? verdict.reason : null, n.media ? JSON.stringify(n.media) : null, existing.id);
    return { id: existing.id, created: false, blocked: verdict.blocked };
  }
  const info = db.prepare(`INSERT INTO items(source, ext_id, url, title, body, author, community, flair, format, media, width, height, duration, score, comments, created_utc, nsfw, source_tags, ai_status, blocked, block_reason, fetched_at, via, oc)
    VALUES(@source, @ext_id, @url, @title, @body, @author, @community, @flair, @format, @media, @width, @height, @duration, @score, @comments, @created_utc, @nsfw, @source_tags, @ai_status, @blocked, @block_reason, @fetched_at, @via, @oc)`).run({
    via: n.via || null, oc: n.oc ? 1 : 0,
    source: n.source, ext_id: n.ext_id, url: n.url || null, title: n.title || '', body: n.body || '', author: n.author || null,
    community: n.community || null, flair: n.flair || null, format: n.format, media: JSON.stringify(n.media || {}),
    width: n.width || null, height: n.height || null, duration: n.duration || null, score: n.score || 0, comments: n.comments || 0,
    created_utc: n.created_utc || 0, nsfw: n.nsfw ? 1 : 0, source_tags: JSON.stringify(n.tags || []),
    ai_status: verdict.blocked ? 'skipped' : 'pending', blocked: verdict.blocked ? 1 : 0, block_reason: verdict.blocked ? verdict.reason : null, fetched_at: now()
  });
  const id = Number(info.lastInsertRowid);
  touchPool();
  const g = guessGender(`${n.title} ${String(n.body || '').slice(0, 600)} ${(n.tags || []).join(', ')}`);
  db.prepare("UPDATE items SET g_men = ?, g_women = ?, g_trans = ?, g_src = ? WHERE id = ?").run(g?.men ?? null, g?.women ?? null, g?.trans ? 1 : 0, g ? 'guess' : 'none', id);
  if (!verdict.blocked) {
    addTags(id, n.tags || [], 'source', SOURCE_TAG_WEIGHT[n.source] ?? 0.5);
    if (n.performers?.length) addTags(id, n.performers.map((p) => ({ name: p, kind: 'performer', weight: 0.6 })), 'source');
    extractInto(id, addTags);
  }
  return { id, created: true, blocked: verdict.blocked };
}

// Tags you took off a post stay off it: a later tagging pass does not put them back.
let removedReady = false;
function removedTable() {
  if (removedReady) return;
  getDb().exec('CREATE TABLE IF NOT EXISTS item_tag_removed (item_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, ts INTEGER, PRIMARY KEY(item_id, tag_id))');
  removedReady = true;
}

export function removeItemTag(itemId, name) {
  removedTable();
  const db = getDb();
  const n = normalizeTag(name);
  const row = n ? db.prepare('SELECT id FROM tags WHERE name = ?').get(n) : null;
  if (!row) return null;
  db.prepare('DELETE FROM item_tags WHERE item_id = ? AND tag_id = ?').run(Number(itemId), row.id);
  db.prepare('INSERT OR REPLACE INTO item_tag_removed(item_id, tag_id, ts) VALUES(?, ?, ?)').run(Number(itemId), row.id, now());
  // The tagger hears which tags people take off, so it uses them less loosely.
  const wrong = getSetting('wrongTags', {}) || {};
  wrong[n] = (wrong[n] || 0) + 1;
  const keep = Object.entries(wrong).sort((a, b) => b[1] - a[1]).slice(0, 60);
  setSetting('wrongTags', Object.fromEntries(keep));
  touchPool();
  return n;
}

export function addTags(itemId, tags, origin, weight = 0.5) {
  const db = getDb();
  removedTable();
  const stmt = db.prepare('INSERT INTO item_tags(item_id, tag_id, weight, origin) VALUES(?, ?, ?, ?) ON CONFLICT(item_id, tag_id, origin) DO UPDATE SET weight = MAX(weight, excluded.weight)');
  const gone = origin === 'user' ? null : db.prepare('SELECT 1 FROM item_tag_removed WHERE item_id = ? AND tag_id = ?');
  for (const t of tags) {
    const name = typeof t === 'string' ? t : t.name;
    if (!postTagOk(name)) continue;
    const w = typeof t === 'string' ? weight : Math.max(0.05, Math.min(1, Number(t.weight ?? weight)));
    const id = tagId(name, typeof t === 'string' ? 'tag' : t.kind || 'tag');
    // A name found in the title (or looked up) is a person, even when a site also used it as a plain tag.
    if (id && t.kind === 'performer' && origin === 'title') db.prepare("UPDATE tags SET kind = 'performer' WHERE id = ? AND kind = 'tag'").run(id);
    if (id && gone?.get(itemId, id)) continue;
    if (id) stmt.run(itemId, id, w, origin);
  }
}

export function itemTags(itemId) {
  return getDb().prepare(`SELECT t.id, t.name, t.kind, MAX(it.weight) AS weight, GROUP_CONCAT(DISTINCT it.origin) AS origins
    FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = ? GROUP BY t.id ORDER BY weight DESC`).all(itemId);
}

export function tagsForItems(ids) {
  const out = new Map();
  if (!ids.length) return out;
  const db = getDb();
  for (let i = 0; i < ids.length; i += 800) {
    const chunk = ids.slice(i, i + 800);
    const rows = db.prepare(`SELECT it.item_id, it.tag_id, t.name, t.kind, MAX(it.weight) AS weight FROM item_tags it JOIN tags t ON t.id = it.tag_id
      WHERE it.item_id IN (${chunk.map(() => '?').join(',')}) GROUP BY it.item_id, it.tag_id`).all(...chunk);
    for (const r of rows) {
      if (!out.has(r.item_id)) out.set(r.item_id, []);
      out.get(r.item_id).push({ id: r.tag_id, name: r.name, kind: r.kind, weight: r.weight });
    }
  }
  return out;
}

export function getItem(id) {
  const row = getDb().prepare('SELECT i.*, s.saved, s.rating, s.vote, s.hidden, s.seen FROM items i LEFT JOIN item_state s ON s.item_id = i.id WHERE i.id = ?').get(id);
  return row ? hydrate(row) : null;
}

export function hydrate(row) {
  let media = {};
  try { media = JSON.parse(row.media || '{}'); } catch {}
  return {
    id: row.id, source: row.source, extId: row.ext_id, url: row.url, title: row.title, body: row.body, author: row.author,
    community: row.community, flair: row.flair, format: row.format, media, width: row.width, height: row.height,
    duration: row.duration, score: row.score, comments: row.comments, created: row.created_utc, nsfw: !!row.nsfw,
    aiStatus: row.ai_status, aiSummary: row.ai_summary, saved: !!row.saved, rating: row.rating || 0, vote: row.vote || 0,
    oc: !!row.oc, via: row.via || null, threadOk: row.thread_ok ?? null, threadMatch: row.thread_match ?? null, aiFit: row.ai_fit ?? null, gMen: row.g_men ?? null, gWomen: row.g_women ?? null, gTrans: !!row.g_trans, gSrc: row.g_src || null,
    langs: postLangs({ title: row.title, body: row.body })
  };
}

export function lengthCat(item) {
  const f = item.format;
  const d = item.duration;
  if (f === 'long' || f === 'short' || f === 'gif') {
    if (!d) return f === 'long' ? 'long' : 'quick';
    return d < 120 ? 'quick' : d < 900 ? 'medium' : 'long';
  }
  if (f === 'story') {
    const m = item.media?.readMin || 5;
    return m < 5 ? 'quick' : m <= 15 ? 'medium' : 'long';
  }
  if (f === 'discussion') return 'medium';
  return 'quick';
}

export function setState(itemId, patch) {
  const db = getDb();
  db.prepare('INSERT INTO item_state(item_id) VALUES(?) ON CONFLICT(item_id) DO NOTHING').run(itemId);
  const keys = Object.keys(patch);
  if (!keys.length) return;
  db.prepare(`UPDATE item_state SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE item_id = @item_id`).run({ ...patch, item_id: itemId });
  if ('hidden' in patch) invalidatePool();
}

export function followed() {
  // Sources you only added (from a search) feed the feed but are not "following". Subreddits and communities are
  // always sources: "Following" is for people.
  const rows = getDb().prepare("SELECT kind, value, label, created FROM follows WHERE active = 1 AND COALESCE(synced_from, '') NOT IN ('auto', 'source') AND kind NOT IN ('subreddit', 'community')").all();
  const communities = new Map();
  const authors = new Map();
  for (const r of rows) {
    const at = r.created || 0;
    if (r.kind === 'subreddit') communities.set(`r/${r.value}`.toLowerCase(), at);
    else if (r.kind === 'reddit_user' || r.kind === 'redgifs_user') authors.set(r.value.toLowerCase(), at);
    else if (r.kind === 'community' || r.kind === 'creator') {
      const [prov, ...rest] = r.value.split('|');
      const v = rest.join('|');
      if (!v) continue;
      if (r.kind === 'community') communities.set((prov === 'reddit' ? `r/${v}` : v).toLowerCase(), at);
      else authors.set(v.toLowerCase(), at);
    }
  }
  return { rows, communities, authors };
}

export function recheckBlocks() {
  const db = getDb();
  const rows = db.prepare("SELECT id, title, body, author, flair, blocked, block_reason FROM items WHERE blocked = 0 OR block_reason IN ('extreme', 'limit')").all();
  const tagQ = db.prepare('SELECT DISTINCT t.name FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = ?');
  const upd = db.prepare('UPDATE items SET blocked = ?, block_reason = ? WHERE id = ?');
  let blocked = 0;
  let restored = 0;
  db.transaction(() => {
    for (const r of rows) {
      let v = isBlocked({ title: r.title, body: r.body, tags: tagQ.all(r.id).map((x) => x.name) });
      if (!v.blocked && isModPost(r)) v = { blocked: true, reason: 'announcement' };
      if (v.blocked && !r.blocked) { upd.run(1, v.reason, r.id); blocked++; }
      else if (!v.blocked && r.blocked) { upd.run(0, null, r.id); restored++; }
      else if (v.blocked && r.block_reason !== v.reason) upd.run(1, v.reason, r.id);
    }
  })();
  invalidatePool();
  return { blocked, restored };
}

let specCache = { at: 0, map: new Map(), n: 1, overused: [] };
export function tagSpecificity(force = false) {
  const db = getDb();
  if (!force && specCache.map.size && Date.now() - (specCache.checked || 0) < 10000 && Date.now() - specCache.at < 5 * 60000) return specCache;
  const n = db.prepare('SELECT COUNT(*) c FROM items WHERE blocked = 0').get().c || 1;
  specCache.checked = Date.now();
  if (!force && Date.now() - specCache.at < 5 * 60000 && specCache.map.size && Math.abs(n - specCache.n) < specCache.n * 0.1) return specCache;
  const rows = db.prepare(`SELECT it.tag_id id, t.name, t.kind, COUNT(DISTINCT it.item_id) df FROM item_tags it JOIN tags t ON t.id = it.tag_id GROUP BY it.tag_id`).all();
  const map = new Map();
  const norm = Math.log((n + 1) / 20) || 1;
  for (const r of rows) {
    const idf = Math.log((n + 1) / (r.df + 1));
    map.set(r.id, r.kind === 'performer' ? 1.2 : Math.max(0.12, Math.min(1.5, idf / norm)));
  }
  const overused = rows.filter((r) => r.kind !== 'performer').sort((a, b) => b.df - a.df).slice(0, 45).map((r) => r.name);
  specCache = { at: Date.now(), checked: Date.now(), map, n, overused };
  return specCache;
}

export function specOf(tagId) {
  return tagSpecificity().map.get(tagId) ?? 1;
}

export function relatedTags(names, limit = 6) {
  const list = (names || []).map((n) => String(n).toLowerCase()).filter(Boolean);
  if (!list.length) return [];
  const spec = tagSpecificity().map;
  const rows = getDb().prepare(`SELECT t2.id, t2.name, COUNT(*) c FROM item_tags a JOIN tags t1 ON t1.id = a.tag_id JOIN item_tags b ON b.item_id = a.item_id JOIN tags t2 ON t2.id = b.tag_id
    WHERE t1.name IN (${list.map(() => '?').join(',')}) AND t2.id != t1.id AND t2.kind != 'performer' AND b.weight >= 0.4 GROUP BY t2.id ORDER BY c DESC LIMIT 80`).all(...list);
  return rows.filter((r) => !list.includes(r.name) && (spec.get(r.id) ?? 1) >= 0.35)
    .sort((a, b) => b.c * (spec.get(b.id) ?? 1) - a.c * (spec.get(a.id) ?? 1)).slice(0, limit).map((r) => r.name);
}

// One pass over posts stored before OC markers and moderator posts were handled.
export function cleanupTitles() {
  const db = getDb();
  const rows = db.prepare("SELECT id, title FROM items WHERE title LIKE '%oc%' OR title LIKE '%o.c%' OR title LIKE '%og%' OR title LIKE '%o.g%' OR title LIKE '%original%'").all();
  const upd = db.prepare('UPDATE items SET title = ?, oc = 1 WHERE id = ?');
  let n = 0;
  db.transaction(() => { for (const r of rows) { const x = stripOc(r.title); if (x.oc) { upd.run(x.title, r.id); n++; } } })();
  // Posts that only had an "OC" or "original content" tag: the badge instead, the tag goes.
  const names = [...OC_TAGS];
  const tagged = db.prepare(`SELECT DISTINCT it.item_id FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE t.name IN (${names.map(() => '?').join(',')})`).all(...names).map((r) => r.item_id);
  db.transaction(() => {
    for (const id of tagged) db.prepare('UPDATE items SET oc = 1 WHERE id = ?').run(id);
    db.prepare(`DELETE FROM item_tags WHERE tag_id IN (SELECT id FROM tags WHERE name IN (${names.map(() => '?').join(',')}))`).run(...names);
  })();
  n += tagged.length;
  const b = recheckBlocks();
  return { oc: n, blocked: b.blocked };
}
