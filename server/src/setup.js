import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { config } from './config.js';
import { getDb, getSetting, setSetting, now } from './db.js';
import { health, setModel } from './ai/ollama.js';
import { FAMILIES, familyOf, conceptName, knownVariants, conceptsOf, isKinkConcept } from './concepts.js';
import { log } from './log.js';

// First run: the local AI (Ollama and its models), then what you like. Everything here can be done again later
// from Settings; nothing leaves this computer except downloading Ollama and the models themselves.

const MODELS = {
  fast: { name: 'huihui_ai/qwen3.5-abliterated:4b', size: 3.4, what: 'Looks at every post and tags it' },
  deep: { name: 'huihui_ai/qwen3.5-abliterated:9b', size: 6.6, what: 'Looks closer at the posts you love' },
  main: { name: 'orcarouter/Qwen3.8-27B-Uncensored:q4_K_M', size: 17, what: 'The assistant you talk to' }
};

export function memoryGb() {
  return Math.round(os.totalmem() / 1024 ** 3);
}

// The big assistant model needs about 32 GB of memory; on smaller Macs the 9B model does that job too.
export function recommendedModels() {
  const big = memoryGb() >= 30;
  return {
    fast: { role: 'fast', ...MODELS.fast },
    deep: { role: 'deep', ...MODELS.deep },
    main: big ? { role: 'main', ...MODELS.main } : { role: 'main', ...MODELS.deep, what: MODELS.main.what, shared: true }
  };
}

function wanted() {
  const rec = recommendedModels();
  const set = (role, fallback) => getSetting(role === 'main' ? 'model' : `${role}Model`, null) || fallback;
  return {
    fast: { ...rec.fast, name: set('fast', rec.fast.name) },
    deep: { ...rec.deep, name: set('deep', rec.deep.name) },
    main: { ...rec.main, name: getSetting('model', null) || rec.main.name }
  };
}

function ollamaInstalled() {
  if (os.platform() === 'darwin' && fs.existsSync('/Applications/Ollama.app')) return true;
  return ['/usr/local/bin/ollama', '/opt/homebrew/bin/ollama', '/usr/bin/ollama'].some((p) => fs.existsSync(p));
}

const pulls = new Map();
const install = { state: 'idle', received: 0, total: 0, error: null };

async function localModels() {
  try {
    const r = await fetch(`${config.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(4000) });
    const d = await r.json();
    return new Set((d.models || []).map((m) => m.name));
  } catch { return null; }
}

export async function setupStatus() {
  const h = config.mock ? { ok: true, version: 'test' } : await health();
  const have = config.mock ? null : h.ok ? await localModels() : null;
  const w = wanted();
  const seen = new Set();
  const models = [];
  for (const m of Object.values(w)) {
    const p = pulls.get(m.name);
    models.push({ role: m.role, name: m.name, size: m.size, what: m.what, shared: !!m.shared || seen.has(m.name), present: config.mock ? true : have ? have.has(m.name) : false,
      pull: p ? { status: p.status, completed: p.completed, total: p.total, error: p.error, done: p.done } : null });
    seen.add(m.name);
  }
  return {
    version: config.version, app: config.app, mock: config.mock,
    ollama: { installed: config.mock || ollamaInstalled(), running: !!h.ok, version: h.version || null, install: { ...install } },
    models, memoryGb: memoryGb(), onboarded: !!getSetting('onboarded', false),
    ready: config.mock || (h.ok && models.every((m) => m.present))
  };
}

async function pullOne(name) {
  const st = { status: 'starting', completed: 0, total: 0, error: null, done: false, at: now() };
  pulls.set(name, st);
  try {
    const res = await fetch(`${config.ollamaUrl}/api/pull`, { method: 'POST', body: JSON.stringify({ name, stream: true }) });
    if (!res.ok || !res.body) throw new Error(`Ollama answered ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        try {
          const x = JSON.parse(line);
          if (x.error) throw new Error(x.error);
          st.status = x.status || st.status;
          if (x.total) { st.total = x.total; st.completed = x.completed || 0; }
        } catch (e) { if (/error|not found|pull/i.test(e.message)) throw e; }
      }
    }
    st.status = 'success';
    st.done = true;
    log('info', `Downloaded the model ${name}`);
  } catch (err) {
    st.error = String(err.message || err).slice(0, 200);
    st.done = true;
    log('warn', `Model download failed for ${name}: ${st.error}`);
  }
}

let pulling = null;
// Downloads every model that is missing, one after the other, and remembers which model does which job.
export async function pullModels() {
  if (config.mock) return { started: false };
  const w = wanted();
  setSetting('fastModel', w.fast.name);
  setSetting('deepModel', w.deep.name);
  if (!getSetting('model', null)) setModel(w.main.name);
  if (pulling) return { started: false, busy: true };
  const have = (await localModels()) || new Set();
  const missing = [...new Set(Object.values(w).map((m) => m.name))].filter((n) => !have.has(n));
  pulling = (async () => { for (const n of missing) await pullOne(n); })().finally(() => { pulling = null; });
  return { started: missing.length > 0, missing };
}

// Installs Ollama from ollama.com when it is not on this Mac yet: the official app, into Applications.
export async function installOllama() {
  if (config.mock || os.platform() !== 'darwin') return { ok: false, error: 'Only on a Mac. Get Ollama from ollama.com.' };
  if (ollamaInstalled()) return { ok: true, already: true };
  if (install.state === 'downloading' || install.state === 'unpacking') return { ok: true, busy: true };
  Object.assign(install, { state: 'downloading', received: 0, total: 0, error: null });
  (async () => {
    const tmp = path.join(os.tmpdir(), `ollama-${Date.now()}.zip`);
    try {
      const res = await fetch('https://ollama.com/download/Ollama-darwin.zip');
      if (!res.ok || !res.body) throw new Error(`download failed (${res.status})`);
      install.total = Number(res.headers.get('content-length')) || 0;
      const out = fs.createWriteStream(tmp);
      const reader = res.body.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        install.received += value.length;
        if (!out.write(value)) await new Promise((r) => out.once('drain', r));
      }
      await new Promise((r) => out.end(r));
      install.state = 'unpacking';
      await new Promise((resolve, reject) => execFile('ditto', ['-x', '-k', tmp, '/Applications'], (e) => (e ? reject(e) : resolve())));
      spawn('open', ['-g', '-a', 'Ollama'], { stdio: 'ignore', detached: true }).unref();
      install.state = 'done';
      log('info', 'Installed Ollama in Applications');
    } catch (err) {
      install.state = 'failed';
      install.error = String(err.message || err).slice(0, 200);
    } finally {
      fs.rm(tmp, { force: true }, () => {});
    }
  })();
  return { ok: true, started: true };
}

// The picker: concepts by family, each in its family colour. Popular things in what is already here come first.
export function conceptCatalog() {
  const db = getDb();
  const counts = new Map();
  try {
    for (const r of db.prepare(`SELECT t.name, COUNT(*) n FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.weight >= 0.45 AND t.kind != 'performer'
      GROUP BY t.id ORDER BY n DESC LIMIT 4000`).all()) for (const c of conceptsOf(r.name)) counts.set(c, (counts.get(c) || 0) + r.n);
  } catch {}
  const families = Object.entries(FAMILIES).map(([key, f]) => ({ key, name: f.name, color: f.color, concepts: [] }));
  const byKey = new Map(families.map((f) => [f.key, f]));
  for (const c of new Set([...ALL_CONCEPTS])) {
    const f = familyOf(c);
    if (!f || !byKey.has(f) || !isKinkConcept(c)) continue;
    byKey.get(f).concepts.push({ concept: c, name: conceptName(c), n: counts.get(c) || 0 });
  }
  // Most common in what is already here first; on a fresh install, the usual favourites of each family first.
  const rank = new Map(ALL_CONCEPTS.map((c, i) => [c, i]));
  for (const f of families) f.concepts.sort((a, b) => (b.n > 50 ? b.n : 0) - (a.n > 50 ? a.n : 0) || rank.get(a.concept) - rank.get(b.concept));
  return families.filter((f) => f.concepts.length);
}

const ALL_CONCEPTS = ['latino', 'asian', 'black', 'arab', 'indian', 'interracial', 'muscle', 'abs', 'hairy', 'hairy chest', 'beard', 'smooth', 'chubby', 'thighs', 'feet', 'armpits', 'tattoo', 'piercing', 'bubble butt', 'big ass', 'big tits', 'small tits', 'blonde', 'redhead', 'brunette', 'petite', 'curvy', 'bbw',
  'uncut', 'cut', 'veiny', 'bwc', 'bbc', 'big balls', 'twink', 'daddy', 'jock', 'bear', 'femboy', '18 25', 'mature', 'milf', 'trans', 'straight guy', 'blowjob', 'sloppy', 'deepthroat', 'face fucking', 'cock worship', 'rimming', 'pussy licking', 'kissing',
  'anal', 'handjob', 'fingering', 'toys', 'bareback', 'breeding', 'doggystyle', 'missionary', 'riding', 'squirting', 'solo', 'masturbation', 'gooning', 'edging', 'ruined orgasm', 'prostate', 'huge load', 'precum', 'dripping', 'creampie', 'facial', 'swallow', 'bukkake',
  'rough', 'dominant', 'submissive', 'sensual', 'dirty talk', 'moaning', 'bondage', 'femdom', 'size difference', 'teasing', 'jockstrap', 'underwear', 'socks', 'lingerie', 'jeans', 'shorts', 'uniform', 'bulge', 'shower', 'public', 'outdoor', 'office', 'gym', 'car', 'hotel', 'massage',
  'step family', 'cheating', 'cuckold', 'roleplay', 'caught', 'threesome', 'group sex', 'double penetration', 'pov', 'close up', 'webcam', 'audio', 'piss', 'oiled', 'sweaty', 'hentai', 'yaoi', 'bara', 'animated', 'ai generated', 'futanari', 'furry'];

// Things that tend to go with what you picked: from posts already here when there are any, otherwise the
// same family, so the suggestions change live with every pick.
const RELATED = {
  muscle: ['abs', 'jock', 'gym', 'hairy chest'], hairy: ['hairy chest', 'beard', 'bear', 'daddy'], twink: ['smooth', 'femboy', 'daddy', 'bareback'], daddy: ['hairy', 'beard', 'bear', 'twink'],
  jockstrap: ['jock', 'gym', 'bulge', 'underwear'], latino: ['uncut', 'muscle', 'bareback'], bareback: ['breeding', 'creampie', 'dripping'], edging: ['precum', 'gooning', 'ruined orgasm', 'masturbation'],
  blowjob: ['deepthroat', 'sloppy', 'facial', 'swallow'], pov: ['close up', 'dirty talk'], dominant: ['submissive', 'rough', 'bondage'], shower: ['oiled', 'sweaty', 'gym'], big_tits: ['milf', 'curvy']
};
export function suggestFor(picked = []) {
  const want = new Set(picked);
  const score = new Map();
  const add = (c, w) => { if (!want.has(c) && isKinkConcept(c) && familyOf(c)) score.set(c, (score.get(c) || 0) + w); };
  for (const p of picked) for (const r of RELATED[p] || RELATED[p.replace(/ /g, '_')] || []) add(r, 3);
  try {
    const db = getDb();
    for (const p of picked.slice(0, 8)) {
      const names = knownVariants(p);
      const rows = db.prepare(`SELECT t2.name, COUNT(*) c FROM item_tags a JOIN tags t1 ON t1.id = a.tag_id JOIN item_tags b ON b.item_id = a.item_id JOIN tags t2 ON t2.id = b.tag_id
        WHERE t1.name IN (${names.map(() => '?').join(',')}) AND a.weight >= 0.45 AND b.weight >= 0.45 AND t2.kind != 'performer' GROUP BY t2.id ORDER BY c DESC LIMIT 60`).all(...names);
      const total = rows.reduce((x, r) => x + r.c, 0) || 1;
      for (const r of rows) for (const c of conceptsOf(r.name)) if (c !== p) add(c, (6 * r.c) / total);
    }
  } catch {}
  for (const p of picked) { const f = familyOf(p); if (f) for (const c of ALL_CONCEPTS) if (familyOf(c) === f) add(c, 0.4); }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c]) => ({ concept: c, name: conceptName(c), family: familyOf(c), color: FAMILIES[familyOf(c)]?.color }));
}

// Sources in the order most people use them, for the last step.
export const SOURCE_ORDER = ['pornhub', 'reddit', 'xvideos', 'redgifs', 'xhamster', 'xnxx', 'eporner', 'youporn', 'redtube', 'txxx', 'bluesky', 'lemmy', 'rule34', 'gelbooru'];
