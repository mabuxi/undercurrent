import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { execFile } from 'node:child_process';
import { config, readProfiles } from './config.js';
import { getDb } from './db.js';
import { restartServer } from './ai/lifecycle.js';
import { log } from './log.js';
import { tr } from './i18n.js';

// Profiles: separate people or moods on one Mac, each with its own kinks, history, sources and settings.
// Each profile is its own database file; the local AI models are shared. Switching restarts the server on the
// other profile (the Mac app does that by itself), and a new profile starts with the welcome steps.

const COLORS = ['#E39A83', '#A58FE0', '#66B5A6', '#E8C66B', '#7FA7D9', '#C98BC4', '#93C47D', '#E07A7A'];
const file = () => path.join(config.dataDir, 'profiles.json');
const backupsDir = () => path.join(config.dataDir, 'backups');

function save(p) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = `${file()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(p, null, 2));
  fs.renameSync(tmp, file());
}

const sizeOf = (f) => { try { return ['', '-wal'].reduce((a, s) => a + (fs.existsSync(f + s) ? fs.statSync(f + s).size : 0), 0); } catch { return 0; } };
const slug = (name) => String(name).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'profile';

function stats(f) {
  if (!fs.existsSync(f)) return { kinks: 0, liked: 0, onboarded: false };
  try {
    const db = f === config.dbPath ? getDb() : new Database(f, { readonly: true, fileMustExist: true });
    const one = (q) => { try { return db.prepare(q).get(); } catch { return null; } };
    const out = {
      kinks: one("SELECT COUNT(*) c FROM kinks WHERE status != 'hidden' AND COALESCE(is_group, 0) = 0")?.c || 0,
      liked: one("SELECT COUNT(*) c FROM item_state WHERE rating > 0 OR saved = 1 OR vote = 1")?.c || 0,
      onboarded: one("SELECT value FROM settings WHERE key = 'onboarded'")?.value === 'true'
    };
    if (db !== getDb()) db.close();
    return out;
  } catch { return { kinks: 0, liked: 0, onboarded: false }; }
}

export function listProfiles() {
  const p = readProfiles();
  return {
    active: config.profile.id,
    list: p.list.map((x) => {
      const f = path.join(config.dataDir, x.file);
      return { ...x, active: x.id === config.profile.id, size: sizeOf(f), ...stats(f) };
    }),
    backups: listBackups()
  };
}

export function createProfile(name, { switchTo = true } = {}) {
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean) throw Object.assign(new Error(tr('Give the profile a name.')), { status: 400 });
  const p = readProfiles();
  if (p.list.some((x) => x.name.toLowerCase() === clean.toLowerCase())) throw Object.assign(new Error(tr('There is already a profile called {name}.', { name: clean })), { status: 400 });
  let id = slug(clean);
  for (let i = 2; p.list.some((x) => x.id === id); i++) id = `${slug(clean)}-${i}`;
  fs.mkdirSync(path.join(config.dataDir, 'profiles'), { recursive: true });
  const entry = { id, name: clean, file: path.join('profiles', `${id}.db`), color: COLORS[p.list.length % COLORS.length], created: Date.now() };
  p.list.push(entry);
  if (switchTo) p.active = id;
  save(p);
  log('info', `Made the profile ${clean}`);
  return entry;
}

export function renameProfile(id, name) {
  const p = readProfiles();
  const x = p.list.find((y) => y.id === id);
  const clean = String(name || '').trim().slice(0, 40);
  if (!x || !clean) throw Object.assign(new Error(tr('Pick a profile and a name.')), { status: 400 });
  x.name = clean;
  save(p);
  return x;
}

export function setProfileColor(id, color) {
  const p = readProfiles();
  const x = p.list.find((y) => y.id === id);
  if (x && /^#[0-9a-f]{6}$/i.test(color)) { x.color = color; save(p); }
  return x;
}

// Switching saves the choice and restarts the server on the other profile's database.
export function switchProfile(id) {
  const p = readProfiles();
  if (!p.list.some((x) => x.id === id)) throw Object.assign(new Error(tr('That profile does not exist.')), { status: 404 });
  if (id === config.profile.id) return { switched: false };
  p.active = id;
  save(p);
  log('info', `Switching to the profile ${p.list.find((x) => x.id === id).name}`);
  setTimeout(() => restartServer(), 600);
  return { switched: true, restarting: true };
}

export function deleteProfile(id) {
  const p = readProfiles();
  const x = p.list.find((y) => y.id === id);
  if (!x) throw Object.assign(new Error(tr('That profile does not exist.')), { status: 404 });
  if (id === config.profile.id) throw Object.assign(new Error(tr('Switch to another profile before deleting this one.')), { status: 400 });
  if (p.list.length < 2) throw Object.assign(new Error(tr('There has to be at least one profile.')), { status: 400 });
  const f = path.join(config.dataDir, x.file);
  for (const s of ['', '-wal', '-shm']) fs.rmSync(f + s, { force: true });
  p.list = p.list.filter((y) => y.id !== id);
  save(p);
  log('info', `Deleted the profile ${x.name}`);
  return { ok: true };
}

// A backup is a full copy of a profile's database, made safely even while it is in use.
export async function backupProfile(id) {
  const p = readProfiles();
  const x = p.list.find((y) => y.id === id);
  if (!x) throw Object.assign(new Error(tr('That profile does not exist.')), { status: 404 });
  fs.mkdirSync(backupsDir(), { recursive: true });
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  const out = path.join(backupsDir(), `${x.id}-${stamp}.db`);
  const src = path.join(config.dataDir, x.file);
  if (src === config.dbPath) await getDb().backup(out);
  else { const db = new Database(src, { readonly: true, fileMustExist: true }); await db.backup(out); db.close(); }
  fs.writeFileSync(`${out}.json`, JSON.stringify({ profile: x.id, name: x.name, made: Date.now() }));
  return { file: path.basename(out), size: fs.statSync(out).size };
}

export function listBackups() {
  try {
    return fs.readdirSync(backupsDir()).filter((f) => f.endsWith('.db')).map((f) => {
      const full = path.join(backupsDir(), f);
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(`${full}.json`, 'utf8')); } catch {}
      return { file: f, name: meta.name || f.replace(/-\d{4}-\d{2}-\d{2}-\d{4}\.db$/, ''), made: meta.made || fs.statSync(full).mtimeMs, size: fs.statSync(full).size };
    }).sort((a, b) => b.made - a.made);
  } catch { return []; }
}

function backupPath(name) {
  const f = path.basename(String(name || ''));
  const full = path.join(backupsDir(), f);
  if (!f.endsWith('.db') || !fs.existsSync(full)) throw Object.assign(new Error(tr('That backup does not exist.')), { status: 404 });
  return full;
}

// Restoring never overwrites anything: the backup becomes a new profile you can switch to.
export function restoreBackup(name, profileName) {
  const src = backupPath(name);
  const b = listBackups().find((x) => x.file === path.basename(src));
  const entry = createProfile(profileName || tr('{name} (restored)', { name: b?.name || tr('Restored') }), { switchTo: false });
  fs.copyFileSync(src, path.join(config.dataDir, entry.file));
  return entry;
}

export function deleteBackup(name) {
  const f = backupPath(name);
  fs.rmSync(f, { force: true });
  fs.rmSync(`${f}.json`, { force: true });
  return { ok: true };
}

export function revealInFinder(what) {
  const target = what === 'backups' ? backupsDir() : config.dataDir;
  fs.mkdirSync(target, { recursive: true });
  if (process.platform === 'darwin') execFile('open', [target], () => {});
  return { path: target };
}
