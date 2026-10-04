import os from 'node:os';
import { config } from '../config.js';
import { getDb, getSetting, setSetting, now } from '../db.js';
import { mockChat } from './mock.js';

export const session = { started: now(), requests: 0, promptTokens: 0, completionTokens: 0, ms: 0, errors: 0, lastError: null };

export function activeModel() {
  return getSetting('model', config.defaultModel);
}

export function setModel(name) {
  setSetting('model', name);
}

export function fastModel() {
  return getSetting('fastModel', null) || activeModel();
}

export function setFastModel(name) {
  setSetting('fastModel', name || null);
}

const infoCache = new Map();
export async function modelInfo(name) {
  if (config.mock) return { vision: true, capabilities: ['completion', 'vision'] };
  if (infoCache.has(name)) return infoCache.get(name);
  const d = await ollama('/api/show', { model: name }, 10000);
  const caps = d.capabilities || [];
  const info = { capabilities: caps, vision: caps.includes('vision'), parameterSize: d.details?.parameter_size, family: d.details?.family };
  infoCache.set(name, info);
  return info;
}

export const pulls = new Map();
export async function pullModel(name) {
  if (pulls.get(name)?.status === 'pulling') return pulls.get(name);
  const st = { name, status: 'pulling', completed: 0, total: 0, error: null, started: Date.now() };
  pulls.set(name, st);
  (async () => {
    try {
      const res = await fetch(`${config.ollamaUrl}/api/pull`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: name, stream: true }) });
      if (!res.ok || !res.body) throw new Error(`Ollama answered ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          let j;
          try { j = JSON.parse(line); } catch { continue; }
          if (j.error) throw new Error(j.error);
          if (j.total) { st.total = j.total; st.completed = j.completed || 0; }
          st.phase = j.status;
        }
      }
      st.status = 'done';
    } catch (err) {
      st.status = 'error';
      st.error = err.message;
    }
  })();
  return st;
}

async function ollama(path, body, timeout = 600000, external = null) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  if (external) external.addEventListener('abort', () => ctrl.abort(new Error('yielded')), { once: true });
  try {
    const res = await fetch(`${config.ollamaUrl}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    });
    const text = await res.text();
    let data = text;
    try { data = JSON.parse(text); } catch {}
    if (!res.ok) {
      const msg = data?.error || text || res.statusText;
      const err = new Error(/not found/i.test(msg) ? `The model isn't installed yet. Run: ollama pull ${body?.model || activeModel()}` : `Ollama: ${msg}`);
      err.status = res.status;
      throw err;
    }
    return data;
  } catch (err) {
    if (external?.aborted) { const e = new Error('Paused so your request could go first.'); e.yielded = true; throw e; }
    if (err.name === 'AbortError') throw new Error('The local model took too long to answer.');
    if (err.cause?.code === 'ECONNREFUSED' || /fetch failed/i.test(err.message)) throw new Error('Ollama is not running. Start the Ollama app, then try again.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function health() {
  if (config.mock) return { ok: true, version: 'mock', mock: true };
  try {
    const v = await ollama('/api/version', null, 3000);
    return { ok: true, version: v.version };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function listModels() {
  if (config.mock) return [{ name: 'mock-model', size: 0, parameterSize: '0B', quantization: 'none', families: ['mock'], vision: true }];
  const data = await ollama('/api/tags', null, 5000);
  return (data.models || []).map((m) => ({
    name: m.name, size: m.size, modified: m.modified_at, parameterSize: m.details?.parameter_size, quantization: m.details?.quantization_level,
    families: m.details?.families || [], vision: (m.details?.families || []).some((f) => /clip|mllama|vision|qwen.*vl|mmproj/i.test(f))
  }));
}

export async function running() {
  if (config.mock) return [];
  try {
    const data = await ollama('/api/ps', null, 3000);
    return (data.models || []).map((m) => ({ name: m.name, size: m.size, vram: m.size_vram, expires: m.expires_at, context: m.context_length }));
  } catch {
    return [];
  }
}

export function systemInfo() {
  const gb = os.totalmem() / 1024 ** 3;
  let rec;
  if (gb >= 64) rec = { tag: 'q8_0', note: 'Plenty of memory: the 8-bit version gives the best quality.' };
  else if (gb >= 36) rec = { tag: 'q6_K', note: 'Room for the 6-bit version with a good context size.' };
  else if (gb >= 30) rec = { tag: 'q4_K_M', note: 'The recommended 4-bit version fits with some room left.' };
  else if (gb >= 22) rec = { tag: 'iq4_xs', note: 'The 27B fits, but tightly. Close heavy apps while tagging.' };
  else rec = { tag: null, note: 'The 27B model is too big for this machine. Pick a smaller model (7B to 12B) in the list below.' };
  return { platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0]?.model, cores: os.cpus().length, memoryGb: Math.round(gb), recommendation: rec };
}

function record(kind, model, data, ms) {
  session.requests++;
  session.promptTokens += data.prompt_eval_count || 0;
  session.completionTokens += data.eval_count || 0;
  session.ms += ms;
  try {
    getDb().prepare('INSERT INTO ai_usage(ts, model, kind, prompt_tokens, completion_tokens, ms) VALUES(?, ?, ?, ?, ?, ?)')
      .run(now(), model, kind, data.prompt_eval_count || 0, data.eval_count || 0, ms);
  } catch {}
}

const BACKGROUND = new Set(['tag', 'name-kinks', 'reflect', 'threads', 'suggest', 'discover-ai', 'combos', 'judge', 'look']);
const LIMITS = { tag: 1200, 'ask-parse': 350, 'ask-item': 300, summary: 200, 'name-kinks': 500, reflect: 500, test: 60, threads: 900, suggest: 1200, 'discover-ai': 700, combos: 900, 'memory-sort': 300, judge: 500, look: 700 };
const lane = { interactive: 0, background: new Set(), hold: 0, looks: 0 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function aiBusy() {
  return { interactive: lane.interactive, background: lane.background.size };
}

export function holdTagging() {
  return lane.hold > 0;
}

export async function chat(opts) {
  const background = BACKGROUND.has(opts.kind);
  const model = opts.model || activeModel();
  const other = !config.mock && model !== fastModel();
  if (other) {
    lane.hold++;
    for (const c of lane.background) if (c.kind === 'tag') c.abort();
  }
  try {
    if (!background) {
      lane.interactive++;
      for (const c of lane.background) c.abort();
      try { return await chatNow({ ...opts, model }, null); } finally { lane.interactive--; }
    }
    const max = opts.kind === 'tag' ? Math.max(1, opts.parallel || 1) : Infinity;
    // Quick looks decide who is in the posts you are about to see, so other background jobs wait for them.
    const look = opts.kind === 'look';
    if (look) lane.looks++;
    try {
      while (lane.interactive > 0 || lane.background.size >= max || (!look && lane.looks > 0) || (opts.kind === 'tag' && lane.hold - (other ? 1 : 0) > 0)) await sleep(300);
      const ctrl = new AbortController();
      ctrl.kind = opts.kind;
      lane.background.add(ctrl);
      try { return await chatNow({ ...opts, model }, ctrl.signal); } finally { lane.background.delete(ctrl); }
    } finally {
      if (look) lane.looks--;
    }
  } finally {
    if (other) lane.hold--;
  }
}

export function deepModel() {
  return getSetting('deepModel', null) || fastModel();
}

async function chatNow({ kind = 'chat', system, user, images, schema, temperature = 0.3, numCtx = 8192, model, numPredict, think = false }, signal) {
  const m = model || activeModel();
  const started = Date.now();
  if (config.mock) {
    const data = await mockChat({ kind, system, user, schema });
    record(kind, 'mock-model', { prompt_eval_count: Math.round((system?.length || 0) / 4 + user.length / 4), eval_count: 40 }, Date.now() - started);
    return data;
  }
  // One context size per helper model: a different size on each call makes Ollama reload the model every time,
  // which made background jobs take over a minute each and sometimes drop the connection.
  if (m === fastModel() || m === deepModel()) numCtx = 8192;
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: user, ...(images?.length ? { images } : {}) });
  try {
    const data = await ollama('/api/chat', {
      model: m, messages, stream: false, think: !!think, keep_alive: '15m',
      ...(schema ? { format: schema } : {}),
      options: { temperature, num_ctx: numCtx, num_predict: numPredict || LIMITS[kind] || 400 }
    }, 600000, signal);
    record(kind, m, data, Date.now() - started);
    const content = data.message?.content || '';
    if (!schema) return content.trim();
    const cleaned = content.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try { return JSON.parse(cleaned); } catch (err) {
      // An answer cut off at the length limit: keep every complete entry instead of losing the whole batch.
      const fixed = repairJson(cleaned);
      if (fixed) return fixed;
      throw err;
    }
  } catch (err) {
    if (!err.yielded) {
      session.errors++;
      session.lastError = err.message;
    }
    throw err;
  }
}

// Closes a JSON answer that stopped halfway, at the last complete object.
export function repairJson(text) {
  const t = String(text || '');
  const ends = [];
  for (let i = t.length - 1; i >= 0 && ends.length < 400; i--) if (t[i] === '}' || t[i] === ']') ends.push(i);
  for (const end of ends) {
    const part = t.slice(0, end + 1);
    const stack = [];
    let inStr = false;
    let esc = false;
    for (const ch of part) {
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' || ch === ']') stack.pop();
    }
    if (inStr) continue;
    const close = stack.reverse().map((c) => (c === '{' ? '}' : ']')).join('');
    try { return JSON.parse(part.replace(/,\s*$/, '') + close); } catch {}
  }
  return null;
}

export function usageSummary() {
  const db = getDb();
  const since = now() - 24 * 3600 * 1000;
  const day = db.prepare('SELECT COUNT(*) AS requests, COALESCE(SUM(prompt_tokens),0) AS promptTokens, COALESCE(SUM(completion_tokens),0) AS completionTokens, COALESCE(SUM(ms),0) AS ms FROM ai_usage WHERE ts > ?').get(since);
  const byKind = db.prepare('SELECT kind, COUNT(*) AS n, COALESCE(SUM(prompt_tokens + completion_tokens),0) AS tokens FROM ai_usage WHERE ts > ? GROUP BY kind ORDER BY n DESC').all(since);
  return { session: { ...session }, day, byKind };
}
