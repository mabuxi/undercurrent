import { useEffect, useState } from 'react';

// The full screen viewer on a phone (scrolling from post to post like TikTok) is open or not. Videos and posts in
// the feed under it stop playing and stop counting time while it is open.
let open = false;
const subs = new Set();
export function tkIsOpen() { return open; }
export function setTkOpen(v) {
  if (open === !!v) return;
  open = !!v;
  for (const f of subs) f(open);
}
export function useTkOpen() {
  const [v, setV] = useState(open);
  useEffect(() => { subs.add(setV); setV(open); return () => { subs.delete(setV); }; }, []);
  return v;
}

// The same post can be on screen twice (in the feed and in the viewer): a like, a save or a heat given in one shows
// in the other right away.
const itemSubs = new Map();
const latest = new Map();
export function publishItem(id, patch, from) {
  latest.set(id, { ...(latest.get(id) || {}), ...patch });
  for (const f of itemSubs.get(id) || []) if (f !== from) f(patch);
}
// A post as it is now, with what was changed on it since the feed loaded it.
export function withChanges(item) {
  const p = latest.get(item.id);
  return p ? { ...item, ...p } : item;
}
export function useItemSync(id, apply) {
  useEffect(() => {
    if (!itemSubs.has(id)) itemSubs.set(id, new Set());
    const set = itemSubs.get(id);
    set.add(apply);
    return () => { set.delete(apply); if (!set.size) itemSubs.delete(id); };
  }, [id, apply]);
}
