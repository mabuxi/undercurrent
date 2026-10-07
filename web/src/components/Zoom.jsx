import { useCallback, useEffect, useRef, useState } from 'react';

// Our own full screen for videos: the whole video always fits the screen (never cropped), and you can zoom in by
// pinching (iPhone and the Mac trackpad), with ctrl and the scroll wheel, or by double-tapping; drag to move around
// when zoomed in. On a Mac it uses the real full screen; on an iPhone, where pages cannot go full screen, it covers
// the screen. Esc, the close button or leaving full screen closes it.
const MAX = 6;

export function useZoomFullscreen(boxRef) {
  const [fs, setFs] = useState(false);
  const z = useRef({ s: 1, x: 0, y: 0 });
  const apply = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.setProperty('--zs', String(z.current.s));
    el.style.setProperty('--zx', `${z.current.x}px`);
    el.style.setProperty('--zy', `${z.current.y}px`);
  }, [boxRef]);
  const clamp = useCallback(() => {
    const el = boxRef.current;
    const c = z.current;
    c.s = Math.max(1, Math.min(MAX, c.s));
    if (!el || c.s <= 1.001) { c.s = 1; c.x = 0; c.y = 0; return; }
    const mx = ((c.s - 1) * el.clientWidth) / 2;
    const my = ((c.s - 1) * el.clientHeight) / 2;
    c.x = Math.max(-mx, Math.min(mx, c.x));
    c.y = Math.max(-my, Math.min(my, c.y));
  }, [boxRef]);
  // Zoom around a point (relative to the centre of the box), so what is under your fingers stays there.
  const zoomAt = useCallback((next, px = 0, py = 0) => {
    const c = z.current;
    const k = Math.max(1, Math.min(MAX, next)) / c.s;
    c.x = px - (px - c.x) * k;
    c.y = py - (py - c.y) * k;
    c.s *= k;
    clamp();
    apply();
  }, [apply, clamp]);

  const open = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    z.current = { s: 1, x: 0, y: 0 };
    apply();
    setFs(true);
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) { try { const p = req.call(el); if (p?.catch) p.catch(() => {}); } catch {} }
  }, [boxRef, apply]);

  const close = useCallback(() => {
    setFs(false);
    z.current = { s: 1, x: 0, y: 0 };
    apply();
    const cur = document.fullscreenElement || document.webkitFullscreenElement;
    if (cur && cur === boxRef.current) { const ex = document.exitFullscreen || document.webkitExitFullscreen; try { const p = ex?.call(document); if (p?.catch) p.catch(() => {}); } catch {} }
  }, [boxRef, apply]);

  useEffect(() => {
    if (!fs) return undefined;
    const el = boxRef.current;
    if (!el) return undefined;
    const pts = new Map();
    let pinch = null;
    let pan = null;
    let lastTap = 0;
    const center = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2]; };
    const down = (e) => {
      if (e.target.closest('button')) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const r = el.getBoundingClientRect();
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, s: z.current.s, x: z.current.x, y: z.current.y, mx: (a[0] + b[0]) / 2 - r.left - r.width / 2, my: (a[1] + b[1]) / 2 - r.top - r.height / 2 };
        pan = null;
      } else if (pts.size === 1 && z.current.s > 1) {
        pan = { x0: e.clientX, y0: e.clientY, x: z.current.x, y: z.current.y };
      }
      if (pts.size === 1 && e.pointerType !== 'mouse') {
        const at = Date.now();
        if (at - lastTap < 300) { const [px, py] = center(e); zoomAt(z.current.s > 1.05 ? 1 : 2.5, px, py); lastTap = 0; } else lastTap = at;
      }
    };
    const move = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pts.size >= 2) {
        e.preventDefault();
        const [a, b] = [...pts.values()];
        const r = el.getBoundingClientRect();
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
        const mx = (a[0] + b[0]) / 2 - r.left - r.width / 2;
        const my = (a[1] + b[1]) / 2 - r.top - r.height / 2;
        const s = Math.max(1, Math.min(MAX, (pinch.s * d) / pinch.d));
        const k = s / pinch.s;
        z.current = { s, x: mx - (pinch.mx - pinch.x) * k, y: my - (pinch.my - pinch.y) * k };
        clamp();
        apply();
      } else if (pan) {
        e.preventDefault();
        z.current.x = pan.x + e.clientX - pan.x0;
        z.current.y = pan.y + e.clientY - pan.y0;
        clamp();
        apply();
      }
    };
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!pts.size) pan = null;
    };
    const dbl = (e) => { if (e.target.closest('button')) return; const [px, py] = center(e); zoomAt(z.current.s > 1.05 ? 1 : 2.5, px, py); };
    // Trackpad pinch: Chrome sends it as ctrl and the wheel, Safari and the Mac app as gesture events.
    const wheel = (e) => {
      if (e.ctrlKey) { e.preventDefault(); const [px, py] = center(e); zoomAt(z.current.s * Math.exp(-e.deltaY * 0.012), px, py); }
      else if (z.current.s > 1) { e.preventDefault(); z.current.x -= e.deltaX; z.current.y -= e.deltaY; clamp(); apply(); }
    };
    let g0 = 1;
    const gstart = (e) => { e.preventDefault(); g0 = z.current.s; };
    const gchange = (e) => { e.preventDefault(); const [px, py] = center(e); zoomAt(g0 * e.scale, px, py); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    let wasReal = false;
    const left = () => { const cur = document.fullscreenElement || document.webkitFullscreenElement; if (cur === el) wasReal = true; else if (!cur && wasReal) close(); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move, { passive: false });
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('dblclick', dbl);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('gesturestart', gstart);
    el.addEventListener('gesturechange', gchange);
    window.addEventListener('keydown', key);
    document.addEventListener('fullscreenchange', left);
    document.addEventListener('webkitfullscreenchange', left);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('dblclick', dbl);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('gesturestart', gstart);
      el.removeEventListener('gesturechange', gchange);
      window.removeEventListener('keydown', key);
      document.removeEventListener('fullscreenchange', left);
      document.removeEventListener('webkitfullscreenchange', left);
    };
  }, [fs, boxRef, apply, clamp, zoomAt, close]);

  // The page behind does not scroll while a video covers the screen.
  useEffect(() => {
    if (!fs) return undefined;
    document.documentElement.classList.add('vidfs');
    try { window.webkit?.messageHandlers?.uc?.postMessage('pinch-off'); } catch {}
    return () => {
      document.documentElement.classList.remove('vidfs');
      try { window.webkit?.messageHandlers?.uc?.postMessage('pinch-on'); } catch {}
    };
  }, [fs]);

  return { fs, open, close };
}
