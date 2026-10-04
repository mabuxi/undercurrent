import { useEffect, useState } from 'react';

// Everything the app is busy with right now (loading the feed, fetching from sources, finding similar posts),
// shown in the search bar next to what the search itself is doing.
// Quiet work (the feed loading more while you scroll) only shows up when it takes longer than a moment, and a
// quick one never flashes "done", so the search bar stays calm while you scroll.
const items = new Map();
const subs = new Set();
const QUIET_MS = 1200;
const emit = () => { const list = [...items.values()].filter((x) => x.shown); subs.forEach((f) => f(list)); };

export function begin(key, label, { quiet = false } = {}) {
  const prev = items.get(key);
  if (prev?.timer) clearTimeout(prev.timer);
  const it = { key, label, state: 'run', at: Date.now(), shown: !quiet || !!(prev?.shown && prev.state === 'run'), quiet };
  if (!it.shown) it.timer = setTimeout(() => { const cur = items.get(key); if (cur && cur.state === 'run' && cur.at === it.at) { items.set(key, { ...cur, shown: true }); emit(); } }, QUIET_MS);
  items.set(key, it);
  emit();
}

export function end(key, state = 'done', detail = null) {
  const it = items.get(key);
  if (!it) return;
  if (it.timer) clearTimeout(it.timer);
  if (!it.shown && state !== 'fail') { items.delete(key); emit(); return; }
  const at = it.at;
  items.set(key, { ...it, state, detail, shown: true, timer: null });
  emit();
  setTimeout(() => { const cur = items.get(key); if (cur && cur.state !== 'run' && cur.at === at) { items.delete(key); emit(); } }, state === 'fail' ? 5000 : it.quiet ? 1200 : 2200);
}

export function useActivity() {
  const [list, setList] = useState(() => [...items.values()].filter((x) => x.shown));
  useEffect(() => { subs.add(setList); return () => subs.delete(setList); }, []);
  return list;
}
