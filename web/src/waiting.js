// Tells the Mac when you are looking at a spinner (the feed loading, the video on screen not playing yet), so its
// background work steps aside until you have something to see. A heartbeat keeps it on while it lasts; the Mac lets
// go by itself a few seconds after the last one.
const keys = new Set();
let on = false;
let beat = null;
const soon = new Map();

function send(v) {
  try { fetch('/api/waiting', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: v }), keepalive: true }).catch(() => {}); } catch {}
}

function sync() {
  const want = keys.size > 0;
  if (want && !on) {
    on = true;
    send(true);
    beat = setInterval(() => send(true), 4000);
  } else if (!want && on) {
    on = false;
    clearInterval(beat);
    beat = null;
    send(false);
  }
}

// Something is loading on screen (key) or not anymore. A spinner gone within half a second never counts.
export function waitingFor(key, is) {
  clearTimeout(soon.get(key));
  soon.delete(key);
  if (is) {
    if (keys.has(key)) return;
    soon.set(key, setTimeout(() => { soon.delete(key); keys.add(key); sync(); }, 500));
    return;
  }
  if (keys.delete(key)) sync();
}
