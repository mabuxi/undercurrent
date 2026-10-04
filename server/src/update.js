import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { config } from './config.js';
import { getSetting, setSetting, now } from './db.js';
import { log } from './log.js';
import { restartServer } from './ai/lifecycle.js';

// Updates come from GitHub: every version is a tag (v0.14.0, v0.15.0, …) with its notes in CHANGELOG.md.
// Checking fetches the tags; updating moves this copy to the newest tag, installs what changed, rebuilds the app
// and restarts. Your data is not in this folder, so an update never touches it.

const ENV = {
  ...process.env,
  PATH: [path.dirname(process.execPath), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', process.env.PATH || ''].join(':'),
  GIT_TERMINAL_PROMPT: '0',
  GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o ConnectTimeout=15'
};

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

let cache = { at: 0, v: null };
export async function updateStatus({ fresh = false } = {}) {
  if (!fresh && cache.v && now() - cache.at < 30 * 60000) return cache.v;
  const base = { current: config.version, latest: config.version, available: false, notes: [], connected: false, git: false, dirty: false, error: null, checkedAt: now() };
  if (config.mock || !fs.existsSync(path.join(config.root, '.git'))) { cache = { at: now(), v: { ...base, error: 'This copy is not linked to GitHub, so it cannot update itself.' } }; return cache.v; }
  base.git = true;
  try {
    base.remote = await git('remote', 'get-url', 'origin').catch(() => null);
    if (!base.remote) throw new Error('No GitHub address set for this copy.');
    await git('fetch', '--tags', '--force', '--quiet', 'origin');
    base.connected = true;
    const tags = (await git('tag', '-l', 'v*')).split('\n').map((t) => t.trim()).filter((t) => parseVersion(t));
    const latest = tags.sort((a, b) => (newer(a, b) ? -1 : newer(b, a) ? 1 : 0))[0];
    if (latest && newer(latest, config.version)) {
      base.latest = latest.replace(/^v/, '');
      base.available = true;
      const log2 = await git('show', `${latest}:CHANGELOG.md`).catch(() => '');
      base.notes = changelogSince(log2, config.version, base.latest);
    }
    base.dirty = (await git('status', '--porcelain', '--untracked-files=no')).length > 0;
  } catch (err) {
    base.error = /Permission denied|publickey|Could not read from remote|Authentication|denied|access rights|repository exists|not found/i.test(err.message)
      ? 'This Mac cannot reach the GitHub repository yet (it needs the SSH key of this Mac on the GitHub account, and the repository has to exist), so it cannot check for updates.'
      : `Could not check for updates: ${err.message}`;
  }
  cache = { at: now(), v: base };
  return base;
}

export const job = { state: 'idle', steps: [], error: null, version: null, restart: false, appRebuilt: false };
const step = (label, state = 'run') => {
  const cur = job.steps.find((s) => s.label === label);
  if (cur) cur.state = state; else job.steps.push({ label, state });
};

export async function applyUpdate() {
  if (job.state === 'running') return job;
  const st = await updateStatus({ fresh: true });
  if (!st.available) return { ...job, state: 'none', error: st.error || 'You already have the newest version.' };
  if (st.dirty) return { ...job, state: 'failed', error: 'There are changes in the code folder that are not on GitHub, so updating could lose them.' };
  Object.assign(job, { state: 'running', steps: [], error: null, version: st.latest, restart: false, appRebuilt: false });
  (async () => {
    const before = await git('rev-parse', 'HEAD');
    try {
      step(`Getting version ${st.latest}`);
      await git('checkout', '--quiet', 'main').catch(() => {});
      await git('merge', '--ff-only', '--quiet', `v${st.latest}`);
      step(`Getting version ${st.latest}`, 'done');
      const changed = (await git('diff', '--name-only', before, 'HEAD')).split('\n');
      if (changed.some((f) => /(^|\/)package(-lock)?\.json$/.test(f))) {
        step('Installing what the new version needs');
        await run(fs.existsSync(path.join(path.dirname(process.execPath), 'npm')) ? path.join(path.dirname(process.execPath), 'npm') : 'npm', ['install', '--no-audit', '--no-fund'], { timeout: 600000 });
        step('Installing what the new version needs', 'done');
      }
      step('Building the app');
      await run(path.join(path.dirname(process.execPath), 'node'), [path.join(config.root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', path.join(config.root, 'web')], { timeout: 300000 });
      step('Building the app', 'done');
      if (changed.some((f) => f.startsWith('mac/')) && process.platform === 'darwin') {
        step('Updating the Mac app');
        await run('/bin/bash', [path.join(config.root, 'mac', 'build.sh'), '--install'], { timeout: 600000 });
        job.appRebuilt = true;
        step('Updating the Mac app', 'done');
      }
      setSetting('updatedFrom', config.version);
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
  let text = '';
  try { text = fs.readFileSync(path.join(config.root, 'CHANGELOG.md'), 'utf8'); } catch {}
  return { show: true, version: config.version, from: seen, notes: changelogSince(text, seen, config.version) };
}

export function markSeen() {
  setSetting('versionSeen', config.version);
}

export function changelog(limit = 10) {
  let text = '';
  try { text = fs.readFileSync(path.join(config.root, 'CHANGELOG.md'), 'utf8'); } catch {}
  return changelogSince(text, null).slice(0, limit);
}
