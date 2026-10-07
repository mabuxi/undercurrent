import { getSetting, setSetting, now } from './db.js';
import { log } from './log.js';

// Sessions: a session starts when you come back after more than half an hour away. Some background work runs once
// per session or every few sessions (new memory suggestions, "still true?" checks, fresh fantasy ideas).
const GAP = 30 * 60000;
let lastWrite = 0;
const hooks = [];

export function onNewSession(fn) { hooks.push(fn); }
export function sessionCount() { return getSetting('sessionCount', 0) || 0; }

export function touchSession() {
  const t = now();
  const last = getSetting('lastActive', 0) || 0;
  if (t - last > GAP) {
    const n = sessionCount() + 1;
    setSetting('sessionCount', n);
    setSetting('lastActive', t);
    lastWrite = t;
    setTimeout(() => { for (const fn of hooks) Promise.resolve().then(() => fn(n)).catch((err) => log('warn', `Session start work failed: ${err.message}`)); }, 20000);
    return true;
  }
  if (t - lastWrite > 60000) { setSetting('lastActive', t); lastWrite = t; }
  return false;
}
