import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { config } from './config.js';
import { getDb, getSetting, setSetting, now } from './db.js';
import { health, setModel } from './ai/ollama.js';
import { FAMILIES, familyOf, conceptName, knownVariants, conceptsOf, isKinkConcept } from './concepts.js';
import { log } from './log.js';
import { tr, lang } from './i18n.js';
import { conceptLabel, familyLabel } from './vocab.js';

// First run: the local AI (Ollama and its models), then what you like. Everything here can be done again later
// from Settings; nothing leaves this computer except downloading Ollama and the models themselves.

// The models Undercurrent can use for each job, with what they need. The recommendation is the best one this Mac
// can run comfortably (memory decides; Apple chips share it between the processor and graphics). You can pick another,
// or any model name Ollama knows.
const Q = 'orcarouter/Qwen3.8-27B-Uncensored';
const H = 'huihui_ai/qwen3.5-abliterated';
export const CATALOG = {
  fast: {
    label: 'Tagging', what: 'Looks at every post and its picture, and tags it. Runs all the time, so it should be quick.',
    options: [
      { name: `${H}:4b`, size: 3.4, minGb: 8, note: 'Sees pictures. Quick enough to keep up while you scroll.' },
      { name: `${H}:9b`, size: 6.6, minGb: 32, note: 'Sees pictures. More accurate tags, but tagging gets slower.' }
    ]
  },
  deep: {
    label: 'Closer look', what: 'Looks again, at several frames, at the posts you love.',
    options: [
      { name: `${H}:9b`, size: 6.6, minGb: 16, note: 'Sees pictures. Much more detail than the quick look.' },
      { name: `${H}:4b`, size: 3.4, minGb: 8, note: 'Lighter, for Macs with less memory.' }
    ]
  },
  main: {
    label: 'Assistant', what: 'Answers your questions, writes fantasies and understands what you search for.',
    options: [
      { name: `${Q}:q8_0`, size: 29, minGb: 64, note: 'The best answers. Needs a lot of memory.' },
      { name: `${Q}:q6_K`, size: 22, minGb: 40, note: 'Nearly the best answers.' },
      { name: `${Q}:q4_K_M`, size: 17, minGb: 30, note: 'Very good answers at a good speed.' },
      { name: `${Q}:iq4_xs`, size: 15, minGb: 24, note: 'Good answers, the smallest version of the big model.' },
      { name: `${H}:9b`, size: 6.6, minGb: 12, note: 'Uses the closer-look model for this too. Light and quick.' },
      { name: `${H}:4b`, size: 3.4, minGb: 8, note: 'Uses the tagging model for this too. For Macs with little memory.' }
    ]
  }
};
const SETTING = { fast: 'fastModel', deep: 'deepModel', main: 'model' };

export function memoryGb() {
  return Math.round(os.totalmem() / 1024 ** 3);
}

export function systemSummary() {
  const cpu = os.cpus()[0]?.model || os.arch();
  return { memoryGb: memoryGb(), chip: cpu.replace(/\s+/g, ' ').trim(), cores: os.cpus().length, appleSilicon: os.platform() === 'darwin' && os.arch() === 'arm64' };
}

// The best option this Mac runs comfortably. Without Apple Silicon (no shared graphics memory) one step lighter.
export function recommendFor(role, mem = memoryGb()) {
  const opts = CATALOG[role].options;
  const usable = os.platform() === 'darwin' && os.arch() === 'arm64' ? mem : mem * 0.75;
  if (role === 'fast') return opts[0].name;
  return (opts.find((o) => o.minGb <= usable) || opts[opts.length - 1]).name;
}

export function recommendedModels() {
  const out = {};
  for (const role of Object.keys(CATALOG)) {
    const name = recommendFor(role);
    const o = CATALOG[role].options.find((x) => x.name === name);
    out[role] = { role, name, size: o.size, what: tr(CATALOG[role].what) };
  }
  return out;
}

export function chosenModel(role) {
  return getSetting(SETTING[role], null) || recommendFor(role);
}

function wanted() {
  const out = {};
  for (const role of Object.keys(CATALOG)) {
    const name = chosenModel(role);
    const o = CATALOG[role].options.find((x) => x.name === name);
    out[role] = { role, name, size: o?.size ?? null, what: tr(CATALOG[role].what), label: tr(CATALOG[role].label) };
  }
  return out;
}

export async function modelOptions() {
  const have = config.mock ? new Set(Object.values(CATALOG).flatMap((r) => r.options.map((o) => o.name))) : (await localModels()) || new Set();
  const sys = systemSummary();
  const roles = {};
  for (const [role, r] of Object.entries(CATALOG)) {
    const rec = recommendFor(role);
    const chosen = chosenModel(role);
    const options = r.options.map((o) => ({ ...o, note: tr(o.note), installed: have.has(o.name), recommended: o.name === rec, fits: o.minGb <= sys.memoryGb }));
    if (!options.some((o) => o.name === chosen)) options.push({ name: chosen, size: null, minGb: null, note: tr('Your own choice.'), installed: have.has(chosen), recommended: false, fits: true, custom: true });
    roles[role] = { label: tr(r.label), what: tr(r.what), chosen, recommended: rec, options };
  }
  return { system: sys, roles, installed: [...have] };
}

// Saves which model does which job. Names that are not in the list are fine too: any model Ollama knows.
export function chooseModels(choice = {}) {
  for (const role of Object.keys(CATALOG)) {
    const name = String(choice[role] || '').trim();
    if (!name) continue;
    if (!/^[\w./:-]{2,120}$/.test(name)) throw Object.assign(new Error(tr('"{name}" is not a model name.', { name })), { status: 400 });
    if (role === 'main') setModel(name); else setSetting(SETTING[role], name);
  }
  setSetting('modelsChosen', true);
  return wanted();
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
    models.push({ role: m.role, label: m.label, name: m.name, size: m.size, what: m.what, shared: !!m.shared || seen.has(m.name), present: config.mock ? true : have ? have.has(m.name) : false,
      pull: p ? { status: p.status, completed: p.completed, total: p.total, error: p.error, done: p.done } : null });
    seen.add(m.name);
  }
  return {
    version: config.version, app: config.app, mock: config.mock,
    ollama: { installed: config.mock || ollamaInstalled(), running: !!h.ok, version: h.version || null, install: { ...install } },
    models, memoryGb: memoryGb(), system: systemSummary(), pulling: !!pulling, onboarded: !!getSetting('onboarded', false),
    ready: config.mock || (h.ok && models.every((m) => m.present))
  };
}

async function pullOne(name) {
  const st = { status: 'starting', completed: 0, total: 0, error: null, done: false, at: now() };
  pulls.set(name, st);
  try {
    const res = await fetch(`${config.ollamaUrl}/api/pull`, { method: 'POST', body: JSON.stringify({ name, stream: true }) });
    if (!res.ok || !res.body) throw new Error(tr('Ollama answered {status}', { status: res.status }));
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
  setModel(w.main.name);
  setSetting('modelsChosen', true);
  if (pulling) return { started: false, busy: true };
  const have = await localModels();
  if (!have) return { started: false, error: tr('Ollama is not running yet.') };
  const missing = [...new Set(Object.values(w).map((m) => m.name))].filter((n) => !have.has(n));
  pulling = (async () => { for (const n of missing) await pullOne(n); })().finally(() => { pulling = null; });
  return { started: missing.length > 0, missing };
}

// Installs Ollama from ollama.com when it is not on this Mac yet: the official app, into Applications.
export async function installOllama() {
  if (config.mock || os.platform() !== 'darwin') return { ok: false, error: tr('Only on a Mac. Get Ollama from ollama.com.') };
  if (ollamaInstalled()) return { ok: true, already: true };
  if (install.state === 'downloading' || install.state === 'unpacking') return { ok: true, busy: true };
  Object.assign(install, { state: 'downloading', received: 0, total: 0, error: null });
  (async () => {
    const tmp = path.join(os.tmpdir(), `ollama-${Date.now()}.zip`);
    try {
      const res = await fetch('https://ollama.com/download/Ollama-darwin.zip');
      if (!res.ok || !res.body) throw new Error(tr('download failed ({status})', { status: res.status }));
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
      spawn('open', ['-g', '-j', '-a', 'Ollama'], { stdio: 'ignore', detached: true }).unref();
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
  const families = Object.entries(FAMILIES).map(([key, f]) => ({ key, name: familyLabel(f.name, lang()), color: f.color, concepts: [] }));
  const byKey = new Map(families.map((f) => [f.key, f]));
  for (const c of new Set([...ALL_CONCEPTS])) {
    const f = familyOf(c);
    if (!f || !byKey.has(f) || !isKinkConcept(c)) continue;
    byKey.get(f).concepts.push({ concept: c, name: conceptLabel(c, lang(), conceptName(c)), n: counts.get(c) || 0 });
  }
  // Most common in what is already here first; on a fresh install, the usual favourites of each family first.
  const rank = new Map(ALL_CONCEPTS.map((c, i) => [c, i]));
  for (const f of families) f.concepts.sort((a, b) => (b.n > 50 ? b.n : 0) - (a.n > 50 ? a.n : 0) || rank.get(a.concept) - rank.get(b.concept));
  return families.filter((f) => f.concepts.length);
}

// Broad on purpose: straight first, gay and lesbian mixed in. On a fresh install each family shows its first ones.
const ALL_CONCEPTS = ['latino', 'asian', 'black', 'interracial', 'arab', 'indian',
  'big tits', 'big ass', 'petite', 'curvy', 'blonde', 'natural tits', 'muscle', 'brunette', 'redhead', 'hairy', 'abs', 'small tits', 'bubble butt', 'thighs', 'feet', 'tattoo', 'hairy chest', 'beard', 'smooth', 'chubby', 'bbw', 'piercing', 'armpits',
  'bbc', 'bwc', 'uncut', 'veiny', 'big balls', 'cut',
  'milf', '18 25', 'college', 'lesbian', 'mature', 'twink', 'daddy', 'jock', 'straight guy', 'gay for pay', 'bear', 'trans', 'femboy',
  'blowjob', 'deepthroat', 'pussy licking', 'facesitting', 'sloppy', 'kissing', 'face fucking', 'rimming', 'cock worship',
  'missionary', 'doggystyle', 'riding', 'reverse cowgirl', 'standing sex', 'sixty nine', 'spooning', 'prone bone', 'mating press', 'anal', 'squirting', 'titfuck', 'handjob', 'fingering', 'toys', 'scissoring', 'strap on', 'bareback', 'breeding',
  'masturbation', 'solo', 'edging', 'gooning', 'ruined orgasm', 'prostate',
  'creampie', 'facial', 'swallow', 'huge load', 'dripping', 'precum', 'bukkake',
  'sensual', 'rough', 'dominant', 'submissive', 'teasing', 'dirty talk', 'moaning', 'femdom', 'bondage', 'size difference',
  'lingerie', 'heels', 'yoga pants', 'underwear', 'uniform', 'jeans', 'shorts', 'socks', 'jockstrap', 'bulge',
  'massage', 'shower', 'outdoor', 'public', 'office', 'hotel', 'car', 'gym',
  'step family', 'cheating', 'casting', 'first time', 'roleplay', 'cuckold', 'caught',
  'threesome', 'group sex', 'double penetration', 'pov', 'close up', 'webcam', 'audio', 'oiled', 'sweaty', 'piss',
  'hentai', 'animated', 'ai generated', 'yaoi', 'bara', 'futanari', 'furry'];

// Things that tend to go with what you picked: from posts already here when there are any, otherwise the
// same family, so the suggestions change live with every pick.
const RELATED = {
  muscle: ['abs', 'jock', 'gym', 'hairy chest'], hairy: ['hairy chest', 'beard', 'bear', 'daddy'], twink: ['smooth', 'femboy', 'daddy', 'bareback'], daddy: ['hairy', 'beard', 'bear', 'twink'],
  jockstrap: ['jock', 'gym', 'bulge', 'underwear'], latino: ['uncut', 'muscle', 'bareback'], bareback: ['breeding', 'creampie', 'dripping'], edging: ['precum', 'gooning', 'ruined orgasm', 'masturbation'],
  blowjob: ['deepthroat', 'sloppy', 'facial', 'swallow'], pov: ['close up', 'dirty talk'], dominant: ['submissive', 'rough', 'bondage'], shower: ['oiled', 'sweaty', 'gym'],
  'big tits': ['natural tits', 'titfuck', 'milf', 'curvy'], milf: ['mature', 'step family', 'big tits', 'cheating'], lesbian: ['scissoring', 'strap on', 'pussy licking', 'kissing', 'facesitting'],
  'pussy licking': ['facesitting', 'squirting', 'lesbian'], 'straight guy': ['gay for pay', 'first time', 'jock'], 'gay for pay': ['straight guy', 'first time', 'casting'],
  college: ['18 25', 'petite', 'first time'], petite: ['small tits', 'size difference', '18 25'], lingerie: ['heels', 'teasing', 'big tits'], heels: ['lingerie', 'femdom', 'teasing'],
  'yoga pants': ['big ass', 'gym', 'teasing'], riding: ['reverse cowgirl', 'big ass', 'missionary', 'creampie'], doggystyle: ['prone bone', 'big ass', 'anal', 'rough'], missionary: ['mating press', 'kissing', 'sensual', 'spooning'], 'reverse cowgirl': ['riding', 'big ass', 'pov'], 'standing sex': ['size difference', 'shower', 'rough'], 'sixty nine': ['blowjob', 'pussy licking', 'rimming'], spooning: ['sensual', 'kissing', 'missionary'], 'prone bone': ['doggystyle', 'rough', 'breeding'], 'mating press': ['missionary', 'breeding', 'creampie'], casting: ['first time', 'pov', 'interracial'],
  squirting: ['pussy licking', 'toys', 'fingering'], scissoring: ['strap on', 'kissing', 'fingering', 'toys'], 'strap on': ['femdom', 'toys', 'scissoring'], facesitting: ['pussy licking', 'femdom', 'rimming'], titfuck: ['big tits', 'facial', 'natural tits'], 'big ass': ['bubble butt', 'doggystyle', 'riding', 'yoga pants'], anal: ['creampie', 'doggystyle', 'toys'], massage: ['oiled', 'sensual', 'happy ending']
};
// Suggestions for what goes with your picks. With `focus` (the one you just picked), what goes with that one comes
// first, so every pick brings its own related kinks.
export function suggestFor(picked = [], focus = null) {
  const want = new Set(picked);
  if (focus && want.has(focus)) picked = [focus, ...picked.filter((p) => p !== focus)];
  const score = new Map();
  const add = (c, w) => { if (!want.has(c) && isKinkConcept(c) && familyOf(c)) score.set(c, (score.get(c) || 0) + w); };
  for (const p of picked) for (const r of RELATED[p] || []) add(r, focus && p === focus ? 8 : 3);
  try {
    const db = getDb();
    for (const p of picked.slice(0, 8)) {
      const names = knownVariants(p);
      const rows = db.prepare(`SELECT t2.name, COUNT(*) c FROM item_tags a JOIN tags t1 ON t1.id = a.tag_id JOIN item_tags b ON b.item_id = a.item_id JOIN tags t2 ON t2.id = b.tag_id
        WHERE t1.name IN (${names.map(() => '?').join(',')}) AND a.weight >= 0.45 AND b.weight >= 0.45 AND t2.kind != 'performer' GROUP BY t2.id ORDER BY c DESC LIMIT 60`).all(...names);
      const total = rows.reduce((x, r) => x + r.c, 0) || 1;
      const w = focus && p === focus ? 14 : 6;
      for (const r of rows) for (const c of conceptsOf(r.name)) if (c !== p) add(c, (w * r.c) / total);
    }
  } catch {}
  for (const p of picked) { const f = familyOf(p); if (f) for (const c of ALL_CONCEPTS) if (familyOf(c) === f) add(c, 0.4); }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c]) => ({ concept: c, name: conceptLabel(c, lang(), conceptName(c)), family: familyOf(c), color: FAMILIES[familyOf(c)]?.color }));
}

// Sources in the order most people use them, for the last step.
export const SOURCE_ORDER = ['pornhub', 'reddit', 'xvideos', 'redgifs', 'xhamster', 'xnxx', 'eporner', 'youporn', 'redtube', 'txxx', 'bluesky', 'lemmy', 'rule34', 'gelbooru'];
