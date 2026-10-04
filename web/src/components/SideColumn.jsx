import { useCallback, useEffect, useRef, useState } from 'react';
import { api, sessionId } from '../api.js';
import { Window } from './Windows.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';

const REDUCED = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FACTOR = REDUCED ? 1 : 0.55;
let SEED = Math.floor(Math.random() * 1e6);
export const WINDOW_SEEN = new Set();
function seenIds() {
  const feed = [...document.querySelectorAll('article.post[data-id]')].map((el) => el.dataset.id);
  return [...new Set([...feed, ...WINDOW_SEEN])].slice(-400).join(',');
}

// Ask every side column to rebuild its windows (after the gender balance changes, for example).
export function refreshWindows() {
  window.dispatchEvent(new Event('uc-refresh-windows'));
}

export default function SideColumn({ side }) {
  const [wins, setWins] = useState([]);
  const [swap, setSwap] = useState(0);
  const asideRef = useRef(null);
  const trackRef = useRef(null);
  const cursor = useRef(0);
  const busy = useRef(false);
  const ended = useRef(false);
  const deepest = useRef(0);
  const refreshing = useRef(false);
  const winsRef = useRef([]);
  winsRef.current = wins;

  const visible = () => asideRef.current && getComputedStyle(asideRef.current).display !== 'none';

  const fetchWindows = async (from, n, seed) => {
    const r = await api(`/windows?cursor=${from}&count=${n}&side=${side}&session=${sessionId}&seed=${seed}&exclude=${seenIds()}`);
    for (const w of r.windows) for (const it of w.items || []) if (it?.id) WINDOW_SEEN.add(String(it.id));
    return r.windows;
  };

  const load = useCallback(async (n = 3) => {
    if (busy.current || refreshing.current || ended.current || !visible()) return;
    busy.current = true;
    try {
      const got = await fetchWindows(cursor.current, n, SEED);
      cursor.current += n;
      if (!got.length && cursor.current > 40) ended.current = true;
      setWins((cur) => [...cur, ...got]);
    } catch {
      ended.current = cursor.current > 6;
    } finally {
      busy.current = false;
    }
  }, [side]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild the windows from what you are into right now. The new set is fetched first and swapped in whole,
  // with as many windows as are needed to cover where you are, so the column never goes black.
  const refresh = useCallback(async () => {
    if (refreshing.current || !visible()) return;
    refreshing.current = true;
    try {
      const track = trackRef.current;
      const shift = track ? -(new DOMMatrixReadOnly(getComputedStyle(track).transform).m42 || 0) : 0;
      const needTo = shift + window.innerHeight + 900;
      const kids = track ? [...track.children] : [];
      let need = kids.filter((el) => el.offsetTop < needTo).length + 1;
      need = Math.max(4, Math.min(16, need));
      const seed = Math.floor(Math.random() * 1e6);
      const got = [];
      for (let from = 0; from < need; from += 8) got.push(...await fetchWindows(from, Math.min(8, need - from), seed));
      if (!got.length) return;
      SEED = seed;
      cursor.current = need;
      ended.current = false;
      setWins(got);
      setSwap((x) => x + 1);
    } catch { /* keep the windows that are there */ } finally {
      refreshing.current = false;
    }
  }, [side]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const aside = asideRef.current;
        const track = trackRef.current;
        if (!aside || !track || !visible()) return;
        const grid = aside.parentElement;
        const top = grid.getBoundingClientRect().top + window.scrollY;
        const y = Math.max(0, window.scrollY - top) * FACTOR * (side === 1 ? 0.9 : 1);
        track.style.transform = `translateY(${-y}px)`;
        deepest.current = Math.max(deepest.current, window.scrollY);
        // Back at the very top after scrolling down a good way: fresh windows, the feed stays as it is.
        if (window.scrollY < 30 && deepest.current > window.innerHeight * 1.2) {
          deepest.current = 0;
          refresh();
          return;
        }
        if (track.scrollHeight < y + window.innerHeight + 2200) load(3);
      });
    };
    load(4);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('uc-refresh-windows', refresh);
    const t = setInterval(onScroll, 1500);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); window.removeEventListener('uc-refresh-windows', refresh); clearInterval(t); cancelAnimationFrame(raf); };
  }, [load, refresh, side]);

  // In auto mode the balance moves with what you interact with; when it moves, the windows follow.
  useEffect(() => {
    if (side !== 0) return undefined;
    let last = null;
    const check = () => api('/settings/gender').then((g) => {
      const v = g.auto ? g.autoValue : g.male;
      if (last !== null && Math.abs(v - last) >= 5) refreshWindows();
      last = v;
    }).catch(() => {});
    check();
    const t = setInterval(check, 120000);
    return () => clearInterval(t);
  }, [side]);

  return (
    <aside ref={asideRef} className={`side ${side === 0 ? 'left' : 'right'}`} aria-label={side === 0 ? 'Windows' : 'More windows'}>
      <div className="track fadein" data-swap={swap} ref={trackRef}>
        {wins.map((w) => <ErrorBoundary key={w.uid} name="Window" quiet><Window w={w} /></ErrorBoundary>)}
      </div>
    </aside>
  );
}
