// Sound is one switch for the whole site: turn it on once and every video plays with sound.
// After a reload the browser may refuse sound until you click or press a key somewhere; then it comes back on
// by itself. Your choice is only turned off when you mute.
let on = (() => { try { return localStorage.getItem('uc.sound') === '1'; } catch { return false; } })();
let blocked = false;
const subs = new Set();

function emit() {
  for (const f of subs) f(on && !blocked);
}

export function soundOn() {
  return on && !blocked;
}

export function soundWanted() {
  return on;
}

export function setSound(v) {
  on = !!v;
  if (on) blocked = false;
  try { localStorage.setItem('uc.sound', on ? '1' : '0'); } catch { /* storage can be unavailable */ }
  emit();
}

// The browser refused to play with sound: stay muted for now, keep the wish, retry on the next click or key.
export function soundBlocked() {
  if (blocked) return;
  blocked = true;
  emit();
}

export function onSound(f) {
  subs.add(f);
  return () => subs.delete(f);
}

if (typeof window !== 'undefined') {
  const unblock = () => { if (blocked) { blocked = false; emit(); } };
  window.addEventListener('pointerdown', unblock, true);
  window.addEventListener('keydown', unblock, true);
}
