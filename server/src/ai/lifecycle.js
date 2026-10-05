import { spawn, execFile } from 'node:child_process';
import os from 'node:os';
import { config } from '../config.js';
import { health } from './ollama.js';
import { log } from '../log.js';

// The local models live and die with the server: starting Undercurrent starts Ollama when it is not running yet,
// and stopping Undercurrent unloads the models (and quits Ollama again when Undercurrent was the one that started it).

let startedByUs = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function ensureOllama() {
  if (config.mock) return { ok: true, started: false };
  let h = await health();
  if (h.ok) return { ok: true, started: false };
  try {
    if (os.platform() === 'darwin') spawn('open', ['-g', '-j', '-a', 'Ollama'], { stdio: 'ignore', detached: true }).unref();
    else spawn('ollama', ['serve'], { stdio: 'ignore', detached: true }).unref();
  } catch (err) {
    return { ok: false, error: `Could not start Ollama: ${err.message}` };
  }
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    h = await health();
    if (h.ok) { startedByUs = true; log('info', 'Started Ollama for the local models'); return { ok: true, started: true }; }
  }
  return { ok: false, error: 'Ollama did not start within 30 seconds. Is the Ollama app installed?' };
}

async function unloadModels() {
  try {
    const ps = await (await fetch(`${config.ollamaUrl}/api/ps`, { signal: AbortSignal.timeout(3000) })).json();
    await Promise.all((ps.models || []).map((m) => fetch(`${config.ollamaUrl}/api/generate`, { method: 'POST', body: JSON.stringify({ model: m.name, keep_alive: 0 }), signal: AbortSignal.timeout(8000) }).catch(() => {})));
    return (ps.models || []).length;
  } catch { return 0; }
}

function quitOllama() {
  return new Promise((resolve) => {
    if (os.platform() === 'darwin') execFile('pkill', ['-TERM', '-x', 'Ollama'], () => execFile('pkill', ['-TERM', '-f', 'Ollama.app/Contents/Resources/ollama'], () => resolve()));
    else execFile('pkill', ['-TERM', '-f', 'ollama serve'], () => resolve());
  });
}

let stopping = false;
let restartCode = 0;
let stopFn = null;
// After an update the server stops with code 75; the Mac app sees that and starts it again on the new code.
// Code 76 means the whole app was replaced by a new version: the Mac app quits and opens the new one.
export function restartServer(code = 75) {
  restartCode = code;
  if (stopFn) stopFn('update');
  else process.exit(code);
}
export function stopWithServer(server) {
  const stop = async (sig) => {
    if (stopping) return;
    stopping = true;
    const quit = sig !== 'update' && (startedByUs || config.quitOllama);
    log('info', `Stopping (${sig}): unloading the local models${quit ? ' and quitting Ollama' : ''}`);
    try { server?.close(); } catch {}
    const n = config.mock || sig === 'update' ? 0 : await unloadModels();
    if (quit && !config.mock) await quitOllama();
    log('info', `Stopped. ${n} model${n === 1 ? '' : 's'} unloaded.`);
    process.exit(restartCode || 0);
  };
  stopFn = stop;
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { stop(sig); });
}
