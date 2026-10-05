import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config } from './config.js';
import { getSetting, setSetting, now } from './db.js';
import { log } from './log.js';
import { restartServer } from './ai/lifecycle.js';
import { tr, lang } from './i18n.js';

// Updates come from GitHub: every version is a tag (v0.14.0, v0.15.0, …) with its notes in CHANGELOG.md.
// The downloaded app (packaged) reads the newest GitHub Release, downloads its Undercurrent-mac.zip, swaps the app
// and opens the new one. A code folder (git) fetches the tags, moves to the newest one, rebuilds and restarts.
// Your data is in ~/Library/Application Support/Undercurrent, never in the app, so an update never touches it.
const ASSET = 'Undercurrent-mac.zip';
const UA = { 'User-Agent': 'Undercurrent-updater', Accept: 'application/vnd.github+json' };

const ENV = {
  ...process.env,
  PATH: [path.dirname(process.execPath), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', process.env.PATH || ''].join(':'),
  GIT_TERMINAL_PROMPT: '0'
};
// The key this copy uses for GitHub (set in its own git settings), never asking for a password in the background.
let sshReady = false;
async function prepareSsh() {
  if (sshReady) return;
  sshReady = true;
  const own = await new Promise((resolve) => execFile('git', ['config', '--get', 'core.sshCommand'], { cwd: config.root }, (e, out) => resolve(e ? '' : String(out).trim())));
  ENV.GIT_SSH_COMMAND = `${own || 'ssh'} -o BatchMode=yes -o ConnectTimeout=15`;
}

function run(cmd, args, { timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: config.root, env: ENV, timeout, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(new Error((stderr || err.message || '').trim().split('\n').slice(-3).join(' ')), { stdout, stderr }));
      else resolve(String(stdout).trim());
    });
  });
}
const git = (...args) => run('git', args);

export function parseVersion(v) {
  const m = String(v || '').match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
export function newer(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

// The sections of a changelog for every version after `since`, newest first.
export function changelogSince(text, since, upTo = null) {
  const out = [];
  const parts = String(text || '').split(/^## /m).slice(1);
  for (const p of parts) {
    const head = p.split('\n')[0];
    const m = head.match(/\[?v?(\d+\.\d+\.\d+)\]?(?:\s*[·|-]?\s*(.*))?/);
    if (!m) continue;
    const v = m[1];
    if (since && !newer(v, since)) continue;
    if (upTo && newer(v, upTo)) continue;
    out.push({ version: v, date: (m[2] || '').trim(), text: p.split('\n').slice(1).join('\n').trim() });
  }
  return out;
}

// The newest release that has the Mac app attached (a release whose app is still being built is skipped).
export function pickRelease(releases, current) {
  let best = null;
  for (const r of Array.isArray(releases) ? releases : [releases]) {
    if (!r || r.draft || r.prerelease) continue;
    const v = String(r.tag_name || '').replace(/^v/, '');
    if (!parseVersion(v)) continue;
    const asset = (r.assets || []).find((a) => a.name === ASSET && (!a.state || a.state === 'uploaded'));
    if (!asset) continue;
    if (!best || newer(v, best.version)) best = { version: v, tag: r.tag_name, url: asset.browser_download_url, size: asset.size || 0, body: r.body || '' };
  }
  return best && newer(best.version, current) ? best : null;
}

async function getJson(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw Object.assign(new Error(tr('GitHub answered {status}', { status: res.status })), { status: res.status });
  return res.json();
}

async function releaseStatus(base) {
  base.mode = 'release';
  try {
    const list = await getJson(`https://api.github.com/repos/${config.repo}/releases?per_page=10`);
    base.connected = true;
    const rel = pickRelease(list, config.version);
    if (rel) {
      base.latest = rel.version;
      base.available = true;
      base.release = rel;
      const raw = async (file) => {
        try {
          const r = await fetch(`https://raw.githubusercontent.com/${config.repo}/${rel.tag}/${file}`, { headers: { 'User-Agent': UA['User-Agent'] }, signal: AbortSignal.timeout(15000) });
          return r.ok ? await r.text() : '';
        } catch { return ''; }
      };
      const [text, textFr] = await Promise.all([raw('CHANGELOG.md'), lang() === 'fr' ? raw('CHANGELOG.fr.md') : '']);
      base.notes = localNotes(text, textFr, config.version, rel.version);
      if (!base.notes.length && rel.body) base.notes = [{ version: rel.version, date: '', text: rel.body }];
    }
  } catch (err) {
    base.error = err.status === 403 || err.status === 429
      ? tr('GitHub is limiting update checks for a while. Try again in an hour.')
      : err.status === 404 ? tr('The Undercurrent repository is not public on GitHub, so this app cannot check for updates.')
      : tr('Could not reach GitHub to check for updates ({error}).', { error: err.message });
  }
  cache = { at: now(), v: base };
  return base;
}

// The change notes in the interface language: CHANGELOG.fr.md for French, version by version, English where a
// version has no French notes.
export function localNotes(en, fr, since, upTo = null, l = lang()) {
  const list = changelogSince(en, since, upTo);
  if (l !== 'fr' || !fr) return list;
  const byV = new Map(changelogSince(fr, since, upTo).map((n) => [n.version, n]));
  return list.map((n) => byV.get(n.version) || n);
}

function readLocal(name) {
  try { return fs.readFileSync(path.join(config.root, name), 'utf8'); } catch { return ''; }
}

let cache = { at: 0, v: null };
export async function updateStatus({ fresh = false } = {}) {
  if (!fresh && cache.v && now() - cache.at < 30 * 60000) return cache.v;
  const base = { current: config.version, latest: config.version, available: false, notes: [], connected: false, git: false, dirty: false, error: null, checkedAt: now(), packaged: config.packaged };
  if (config.packaged && !config.mock) return releaseStatus(base);
  if (config.mock || !fs.existsSync(path.join(config.root, '.git'))) { cache = { at: now(), v: { ...base, error: tr('This copy is not linked to GitHub, so it cannot update itself.') } }; return cache.v; }
  base.git = true;
  try {
    await prepareSsh();
    base.remote = await git('remote', 'get-url', 'origin').catch(() => null);
    if (!base.remote) throw new Error(tr('No GitHub address set for this copy.'));
    await git('fetch', '--tags', '--force', '--quiet', 'origin');
    base.connected = true;
    const tags = (await git('tag', '-l', 'v*')).split('\n').map((t) => t.trim()).filter((t) => parseVersion(t));
    const latest = tags.sort((a, b) => (newer(a, b) ? -1 : newer(b, a) ? 1 : 0))[0];
    if (latest && newer(latest, config.version)) {
      base.latest = latest.replace(/^v/, '');
      base.available = true;
      const log2 = await git('show', `${latest}:CHANGELOG.md`).catch(() => '');
      const log2fr = lang() === 'fr' ? await git('show', `${latest}:CHANGELOG.fr.md`).catch(() => '') : '';
      base.notes = localNotes(log2, log2fr, config.version, base.latest);
    }
    base.dirty = (await git('status', '--porcelain', '--untracked-files=no')).length > 0;
  } catch (err) {
    base.error = /Permission denied|publickey|Could not read from remote|Authentication|denied|access rights|repository exists|not found/i.test(err.message)
      ? tr('This Mac cannot reach the GitHub repository yet (it needs the SSH key of this Mac on the GitHub account, and the repository has to exist), so it cannot check for updates.')
      : tr('Could not check for updates: {error}', { error: err.message });
  }
  cache = { at: now(), v: base };
  return base;
}

// Packages only need installing when the dependencies changed, not when only the version number did.
async function depsChanged(before, changed) {
  if (changed.some((f) => /(^|\/)package-lock\.json$/.test(f))) return true;
  for (const f of changed.filter((x) => /(^|\/)package\.json$/.test(x))) {
    const deps = (txt) => { try { const j = JSON.parse(txt); return JSON.stringify([j.dependencies || {}, j.devDependencies || {}, j.workspaces || []]); } catch { return ''; } };
    const a = await git('show', `${before}:${f}`).catch(() => '');
    const b = await git('show', `HEAD:${f}`).catch(() => '');
    if (deps(a) !== deps(b)) return true;
  }
  return false;
}

export const job = { state: 'idle', steps: [], error: null, version: null, restart: false, appRebuilt: false, relaunch: false, progress: null };
const step = (label, state = 'run') => {
  const cur = job.steps.find((s) => s.label === label);
  if (cur) cur.state = state; else job.steps.push({ label, state });
};

// ---------- The downloaded app: swap the whole app for the new one ----------

const sh = (cmd, args, timeout = 300000) => new Promise((resolve, reject) => execFile(cmd, args, { timeout, maxBuffer: 20 * 1024 * 1024 }, (e, out, err) => (e ? reject(new Error(String(err || e.message).trim().slice(-300))) : resolve(String(out).trim()))));

// Leftovers of the previous update, removed on the next start.
export function cleanupUpdate() {
  if (!config.packaged || !config.appBundle) return;
  const dir = path.dirname(config.appBundle);
  for (const name of ['.Undercurrent-update', '.Undercurrent-previous.app']) {
    try { fs.rmSync(path.join(dir, name), { recursive: true, force: true }); } catch {}
  }
}

async function download(url, file, size) {
  const res = await fetch(url, { headers: { 'User-Agent': UA['User-Agent'] }, redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(tr('The download failed (GitHub answered {status}).', { status: res.status }));
  const total = Number(res.headers.get('content-length')) || size || 0;
  let got = 0;
  const body = Readable.fromWeb(res.body);
  body.on('data', (c) => { got += c.length; job.progress = total ? Math.min(100, Math.round((got / total) * 100)) : null; });
  await pipeline(body, fs.createWriteStream(file));
  if (size && fs.statSync(file).size !== size) throw new Error(tr('The download was incomplete. Try again.'));
}

async function applyRelease(st) {
  const rel = st.release;
  const target = config.appBundle;
  const dir = path.dirname(target);
  const work = path.join(dir, '.Undercurrent-update');
  const previous = path.join(dir, '.Undercurrent-previous.app');
  let swapped = false;
  try {
    fs.accessSync(dir, fs.constants.W_OK);
  } catch {
    throw new Error(tr('Undercurrent cannot write to {dir}. Move Undercurrent.app to your Applications folder and try again.', { dir }));
  }
  try {
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    const zip = path.join(work, ASSET);
    step(tr('Downloading version {v}', { v: rel.version }));
    await download(rel.url, zip, rel.size);
    step(tr('Downloading version {v}', { v: rel.version }), 'done');
    step(tr('Checking the new app'));
    await sh('/usr/bin/ditto', ['-x', '-k', zip, work]);
    const fresh = path.join(work, 'Undercurrent.app');
    const pkg = JSON.parse(fs.readFileSync(path.join(fresh, 'Contents', 'Resources', 'app', 'package.json'), 'utf8'));
    if (pkg.version !== rel.version) throw new Error(tr('The download is version {got}, not {want}.', { got: pkg.version, want: rel.version }));
    if (!fs.existsSync(path.join(fresh, 'Contents', 'Resources', 'node', 'node'))) throw new Error(tr('The download is missing parts of the app.'));
    await sh('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', fresh]).catch(() => {});
    step(tr('Checking the new app'), 'done');
    step(tr('Installing it'));
    fs.rmSync(previous, { recursive: true, force: true });
    fs.renameSync(target, previous);
    swapped = true;
    fs.renameSync(fresh, target);
    step(tr('Installing it'), 'done');
  } catch (err) {
    if (swapped && !fs.existsSync(target)) { try { fs.renameSync(previous, target); } catch {} }
    fs.rmSync(work, { recursive: true, force: true });
    throw err;
  }
}

export async function applyUpdate() {
  if (job.state === 'running') return job;
  const st = await updateStatus({ fresh: true });
  if (!st.available) return { ...job, state: 'none', error: st.error || tr('You already have the newest version.') };
  if (st.mode === 'release') {
    if (!config.appBundle) return { ...job, state: 'failed', error: tr('Open Undercurrent from the app to update it.') };
    Object.assign(job, { state: 'running', steps: [], error: null, version: st.latest, restart: false, appRebuilt: false, relaunch: false, progress: null });
    (async () => {
      try {
        await applyRelease(st);
        setSetting('updatedFrom', config.version);
        if (!getSetting('versionSeen', null)) setSetting('versionSeen', config.version);
        Object.assign(job, { state: 'done', restart: true, relaunch: true });
        log('info', `Installed ${st.latest}; opening the new app`);
        cache = { at: 0, v: null };
        setTimeout(() => restartServer(76), 1500);
      } catch (err) {
        job.state = 'failed';
        job.error = String(err.message || err).slice(0, 300);
        log('warn', `Update failed: ${job.error}`);
      }
    })();
    return job;
  }
  if (st.dirty) return { ...job, state: 'failed', error: tr('There are changes in the code folder that are not on GitHub, so updating could lose them.') };
  Object.assign(job, { state: 'running', steps: [], error: null, version: st.latest, restart: false, appRebuilt: false });
  (async () => {
    const before = await git('rev-parse', 'HEAD');
    try {
      step(tr('Getting version {v}', { v: st.latest }));
      await git('checkout', '--quiet', 'main').catch(() => {});
      await git('merge', '--ff-only', '--quiet', `v${st.latest}`);
      step(tr('Getting version {v}', { v: st.latest }), 'done');
      const changed = (await git('diff', '--name-only', before, 'HEAD')).split('\n');
      if (await depsChanged(before, changed)) {
        step(tr('Installing what the new version needs'));
        await run(fs.existsSync(path.join(path.dirname(process.execPath), 'npm')) ? path.join(path.dirname(process.execPath), 'npm') : 'npm', ['install', '--no-audit', '--no-fund'], { timeout: 600000 });
        step(tr('Installing what the new version needs'), 'done');
      }
      step(tr('Building the app'));
      await run(path.join(path.dirname(process.execPath), 'node'), [path.join(config.root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', path.join(config.root, 'web')], { timeout: 300000 });
      step(tr('Building the app'), 'done');
      // The Mac app is rebuilt when its code changed or the version did (so About shows the right one).
      if (changed.some((f) => f.startsWith('mac/') || f === 'package.json') && process.platform === 'darwin' && fs.existsSync(path.join(config.root, 'mac', 'build.sh'))) {
        step(tr('Updating the Mac app'));
        await run('/bin/bash', [path.join(config.root, 'mac', 'build.sh'), '--install'], { timeout: 600000 });
        job.appRebuilt = true;
        step(tr('Updating the Mac app'), 'done');
      }
      setSetting('updatedFrom', config.version);
      if (!getSetting('versionSeen', null)) setSetting('versionSeen', config.version);
      job.state = 'done';
      job.restart = true;
      log('info', `Updated to ${st.latest}; restarting`);
      cache = { at: 0, v: null };
      setTimeout(() => restartServer(), 1500);
    } catch (err) {
      job.state = 'failed';
      job.error = String(err.message || err).slice(0, 300);
      log('warn', `Update failed: ${job.error}`);
      // Back to the version that worked.
      await git('reset', '--hard', '--quiet', before).catch(() => {});
    }
  })();
  return job;
}

// What changed since the version you saw last: shown once after an update.
export function whatsNew() {
  const seen = getSetting('versionSeen', null);
  if (!seen) { setSetting('versionSeen', config.version); return { show: false, version: config.version, notes: [] }; }
  if (!newer(config.version, seen)) return { show: false, version: config.version, notes: [] };
  return { show: true, version: config.version, from: seen, notes: localNotes(readLocal('CHANGELOG.md'), readLocal('CHANGELOG.fr.md'), seen, config.version) };
}

export function markSeen() {
  setSetting('versionSeen', config.version);
}

export function changelog(limit = 10) {
  return localNotes(readLocal('CHANGELOG.md'), readLocal('CHANGELOG.fr.md'), null).slice(0, limit);
}
