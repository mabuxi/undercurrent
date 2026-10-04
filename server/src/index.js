import fs from 'node:fs';
import os from 'node:os';
import { isPrivateAddress } from './lan.js';
import { ensureOllama, stopWithServer } from './ai/lifecycle.js';
import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { openDb } from './db.js';
import { api } from './routes.js';
import { startTagger } from './ai/tagger.js';
import { startScheduler, ensureDefaults } from './ingest.js';
import { health, activeModel } from './ai/ollama.js';
import { refreshKinks } from './ai/assistant.js';
import { log, logFile } from './log.js';
import { ensureScoreVersion } from './profile.js';
import { cleanupTitles } from './store.js';
import { startThreads } from './threads.js';
import { startSuggestions } from './suggest.js';
import { startJudge } from './judge.js';
import { startLooker } from './ai/looker.js';
import { getSetting, setSetting, getDb } from './db.js';

process.on('unhandledRejection', (err) => log('error', 'Unhandled rejection', err?.stack || String(err)));
process.on('uncaughtException', (err) => log('error', 'Uncaught exception', err?.stack || String(err)));

openDb();
ensureDefaults();
try { if ((getSetting('titleClean', 0) || 0) < 1) { const c = cleanupTitles(); setSetting('titleClean', 1); log('info', `Cleaned titles: ${c.oc} original content markers, ${c.blocked} moderator posts hidden`); } } catch (e) { log('warn', 'Title cleanup failed', e.message); }
try { if (!getSetting('memClean', 0)) { const n = getDb().prepare("UPDATE memory SET status = 'archived' WHERE origin = 'user' AND content LIKE 'Liked \"%\" for:%' AND status != 'archived'").run().changes; setSetting('memClean', 1); if (n) log('info', `Moved ${n} post feedback notes out of memory`); } } catch (e) { log('warn', 'Memory cleanup failed', e.message); }
try {
  if ((getSetting('tidyV', 0) || 0) < 2) {
    const { isLatin } = await import('./tagquality.js');
    const db = getDb();
    const bad = db.prepare('SELECT id, name FROM tags').all().filter((t) => !isLatin(t.name)).map((t) => t.id);
    for (let i = 0; i < bad.length; i += 500) { const c = bad.slice(i, i + 500); const ph = c.map(() => '?').join(','); db.prepare(`DELETE FROM item_tags WHERE tag_id IN (${ph})`).run(...c); db.prepare(`DELETE FROM kink_tags WHERE tag_id IN (${ph})`).run(...c); }
    setSetting('tidyV', 2);
  }
} catch (e) { log('warn', 'Tag tidy failed', e.message); }
// Round 13: tags the quick look echoed from its own instructions are removed, then kinks are rebuilt from evidence.
try {
  if ((getSetting('kinksV', 0) || 0) < 3) {
    const { cleanVisionEchoes } = await import('./ai/looker.js');
    const removed = cleanVisionEchoes();
    const { syncKinks, ensureKinkSchema } = await import('./kinkengine.js');
    ensureKinkSchema();
    const before = getDb().prepare("SELECT COUNT(*) c FROM kinks WHERE status != 'hidden'").get().c;
    const r = syncKinks();
    const after = getDb().prepare("SELECT COUNT(*) c FROM kinks WHERE status != 'hidden' AND is_group = 0").get().c;
    setSetting('kinksV', 3);
    log('info', `Kinks rebuilt from what you clearly liked: ${removed} made-up picture tags removed, ${before} kinks and groups before, ${after} kinks now in ${r.groups} new families. New: ${r.created.join(', ') || 'none'}. Faded: ${r.faded.join(', ') || 'none'}. Combined: ${r.merged.join('; ') || 'none'}.`);
  }
} catch (e) { log('warn', 'Kink rebuild failed', e.stack || e.message); }
try { if ((getSetting('safetyReviewV', 0) || 0) < 1) { const n = getDb().prepare("UPDATE items SET block_reason = 'safety_check' WHERE blocked = 1 AND block_reason = 'safety' AND look_q = -1 AND COALESCE(g_src, '') != 'vision'").run().changes; setSetting('safetyReviewV', 1); if (n) log('info', `${n} posts the quick look flagged get a second safety check by the bigger model; they stay hidden until then`); } } catch (e) { log('warn', 'Safety review setup failed', e.message); }
try {
  if ((getSetting('safetyReviewV', 0) || 0) < 2) {
    const db = getDb();
    const { isBlocked } = await import('./safety.js');
    const rows = db.prepare("SELECT id, source, title, body FROM items WHERE blocked = 1 AND (block_reason = 'safety_check' OR (block_reason = 'safety' AND ai_status = 'blocked'))").all();
    let back = 0; let queued = 0;
    db.transaction(() => {
      for (const r of rows) {
        if (['pornhub', 'redtube', 'eporner'].includes(r.source)) {
          if (!isBlocked({ title: r.title, body: r.body, tags: [] }).blocked) { db.prepare("UPDATE items SET blocked = 0, block_reason = NULL, ai_status = 'done' WHERE id = ?").run(r.id); back++; }
        } else { db.prepare("UPDATE items SET block_reason = 'safety_check' WHERE id = ?").run(r.id); queued++; }
      }
    })();
    setSetting('safetyReviewV', 2);
    log('info', `Age checks: ${back} posts from the age-verified video sites shown again, ${queued} other posts wait for the image check`);
  }
} catch (e) { log('warn', 'Age check update failed', e.message); }
try {
  if ((getSetting('namesV', 0) || 0) < 1) {
    const db = getDb();
    const { NAME_RE, cleanPersonName, namesIn } = await import('./names.js');
    const bad = db.prepare("SELECT id, name FROM tags WHERE kind = 'performer'").all().filter((t) => !/^[a-z0-9][a-z0-9'. _-]{1,40}$/.test(cleanPersonName(t.name))).map((t) => t.id);
    for (const id of bad) db.prepare('DELETE FROM item_tags WHERE tag_id = ?').run(id);
    const { addTags } = await import('./store.js');
    let n = 0;
    db.transaction(() => {
      for (const r of db.prepare('SELECT id, title, body, format FROM items WHERE blocked = 0 ORDER BY id DESC LIMIT 12000').all()) {
        const names = namesIn(`${r.title}\n${r.format === 'story' ? '' : String(r.body || '').slice(0, 1500)}`).filter((x) => NAME_RE.test(x));
        if (names.length) { addTags(r.id, names.map((x) => ({ name: x, kind: 'performer', weight: 0.5 })), 'title'); n++; }
      }
    })();
    setSetting('namesV', 1);
    log('info', `Names: ${bad.length} garbled names removed, names found in ${n} titles and descriptions`);
  }
} catch (e) { log('warn', 'Name update failed', e.message); }
try {
  if ((getSetting('echoTagsV', 0) || 0) < 1) {
    const { ECHO } = await import('./ai/tagger.js');
    const db = getDb();
    const ids = db.prepare(`SELECT id FROM tags WHERE name IN (${ECHO.map(() => '?').join(',')}) OR name IN ('body', 'bodies', 'position', 'setting', 'outfit', 'people')`).all(...ECHO).map((r) => r.id);
    for (const id of ids) db.prepare('DELETE FROM item_tags WHERE tag_id = ?').run(id);
    setSetting('echoTagsV', 1);
    if (ids.length) log('info', `Removed ${ids.length} tags that were the tagging instructions echoed back (body, the act, what they wear)`);
  }
} catch (e) { log('warn', 'Tag clean-up failed', e.message); }
try {
  if ((getSetting('namesV', 0) || 0) < 2) {
    const db = getDb();
    const { extractFromText } = await import('./ai/extract.js');
    const { addTags } = await import('./store.js');
    let n = 0;
    db.transaction(() => {
      for (const r of db.prepare('SELECT id, title, body, format FROM items WHERE blocked = 0 ORDER BY id DESC LIMIT 8000').all()) {
        const p = extractFromText(r.title, r.format === 'story' ? '' : String(r.body || '').slice(0, 600)).performers;
        if (p.length) { addTags(r.id, p.map((x) => ({ name: x, kind: 'performer', weight: 0.5 })), 'title'); n++; }
      }
    })();
    const rs = (getSetting('recentSearches', []) || []).filter((x) => String(x.q || '').split(' ').length <= 4);
    setSetting('recentSearches', rs);
    setSetting('namesV', 2);
    log('info', `Names: people found in ${n} posts (also usernames like "watch name ..."), long sentences removed from the automatic searches`);
  }
} catch (e) { log('warn', 'Name update failed', e.message); }
try { const r = ensureScoreVersion(); if (r) log('info', `Rescored your history with the new weights (${r.replayed} events)`); } catch (e) { log('warn', 'Rescoring failed', e.message); }

const app = express();
app.disable('x-powered-by');
// Reachable from this Mac and from devices on the same private network (home Wi-Fi), never from anywhere else.
app.use((req, res, next) => {
  if (isPrivateAddress(req.socket.remoteAddress)) return next();
  log('warn', `Refused a request from ${req.socket.remoteAddress}: only this Mac and your local network may open Undercurrent`);
  res.status(403).send('Undercurrent only answers devices on your local network.');
});
app.use(express.json({ limit: '2mb' }));
app.use('/api/mock/video', express.static(path.join(config.root, 'server', 'mock-media')));

app.post('/api/client-log', (req, res) => {
  const b = req.body || {};
  log('error', `Browser: ${String(b.message || 'unknown').slice(0, 500)}`, String(b.stack || '').slice(0, 1500));
  res.json({ ok: true });
});

app.use('/api', api);

if (fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
}

app.use((err, req, res, next) => {
  log('error', `${req.method} ${req.path} failed`, err?.stack || String(err));
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err?.message || 'Something went wrong on the server.' });
});

const server = app.listen(config.port, config.host, async () => {
  stopWithServer(server);
  await ensureOllama().then((r) => { if (!r.ok) log('warn', r.error); });
  const h = await health();
  const lan = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => `http://${n.address}:${config.port}`);
  log('info', `Undercurrent server on http://127.0.0.1:${config.port}${config.host === '0.0.0.0' && lan.length ? ` and on your network at ${lan.join(', ')}` : ''}${config.mock ? '  (mock mode)' : ''} · Node ${process.version}`);
  log('info', `Database: ${config.dbPath} · log: ${logFile}`);
  log('info', h.ok ? `Ollama ${h.version} ready, model: ${activeModel()}` : `Ollama not reachable: ${h.error}`);
  startTagger();
  startScheduler();
  startThreads();
  startSuggestions();
  startJudge();
  startLooker();
  setTimeout(() => refreshKinks().catch((e) => { if (!e.yielded) log('warn', 'Kink refresh failed', e.message); }), 90000);
  setTimeout(async () => { try { const { backfillGender } = await import('./gender.js'); const { getSetting: gs, setSetting: ss, getDb: gd } = await import('./db.js'); if ((gs('genderGuessV', 1) || 1) < 2) { gd().exec("UPDATE items SET g_src = NULL WHERE g_src IN ('guess', 'none')"); ss('genderGuessV', 2); } const n = backfillGender(30000); if (n) log('info', `Guessed who is in ${n} posts (men, women, trans) until the AI looks closer`); } catch (e) { log('warn', 'Gender backfill failed', e.message); } }, 5000);
  setInterval(() => refreshKinks().catch((e) => log('warn', 'Kink refresh failed', e.message)), 15 * 60000);
});
