import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n.js';

const TWO_PI = Math.PI * 2;
const BG = '#1A1420';

function hex(c) {
  const m = String(c || '#999999').replace('#', '');
  const f = m.length === 3 ? m.split('').map((x) => x + x).join('') : m.padEnd(6, '9');
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}
// Nodes stay solid: "fading" one mixes it toward the background instead of making it see-through.
function mix(c, t, to = BG) {
  const a = hex(c);
  const b = hex(to);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}
function alpha(c, a) {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
}

function radius(n, sizeBy) {
  const v = sizeBy === 'week' ? n.lately : n.allTime;
  if (n.type === 'tag') return 5 + Math.max(0, v - 50) * 0.16;
  if (n.type === 'fantasy') return 10 + Math.max(0, v - 45) * 0.14;
  return 9 + Math.max(0, v - 45) * 0.36;
}

function drawDiamond(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
}

function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// A soft, organic outline around a family of kinks: the hull of padded circles, drawn with curves through its midpoints.
function blobPath(ctx, members, pad, t) {
  const pts = [];
  for (const n of members) {
    const wob = 1 + 0.08 * Math.sin(t / 1400 + n.x * 0.01);
    const rr = (n.sr + pad) * wob;
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TWO_PI; pts.push([n.sx + Math.cos(a) * rr, n.sy + Math.sin(a) * rr]); }
  }
  const h = hull(pts);
  if (h.length < 3) return null;
  ctx.beginPath();
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const first = mid(h[h.length - 1], h[0]);
  ctx.moveTo(first[0], first[1]);
  for (let i = 0; i < h.length; i++) { const m = mid(h[i], h[(i + 1) % h.length]); ctx.quadraticCurveTo(h[i][0], h[i][1], m[0], m[1]); }
  ctx.closePath();
  return h;
}

export default function BrainCanvas({ data, view, selected, onSelect, onHover, height = 560 }) {
  const canvasRef = useRef(null);
  const [hint, setHint] = useState(false);
  const sim = useRef({ nodes: new Map(), edges: [], alpha: 1, cam: { x: 0, y: 0, k: 1 }, hover: null, drag: null, pan: null, moved: false, w: 800, h: height });
  const viewRef = useRef(view);
  const selRef = useRef(selected);
  viewRef.current = view;
  selRef.current = selected;

  useEffect(() => {
    const S = sim.current;
    const keep = S.nodes;
    const next = new Map();
    const v = view || {};
    const visible = (data?.nodes || []).filter((n) => (n.type !== 'tag' || v.showTags) && (n.type !== 'fantasy' || v.showFantasies)
      && (!v.focusGroup || n.topGroup === v.focusGroup || n.group === v.focusGroup || n.type === 'fantasy'));
    const cx = S.w / 2;
    const cy = S.h / 2;
    const groupIds = [...new Set(visible.map((n) => n.topGroup || 0))];
    const inGroup = new Map();
    visible.forEach((n) => {
      const old = keep.get(n.key);
      const gi = groupIds.indexOf(n.topGroup || 0);
      const k = inGroup.get(gi) || 0;
      inGroup.set(gi, k + 1);
      const a = (gi / Math.max(1, groupIds.length)) * TWO_PI;
      const rr = n.type === 'fantasy' ? 90 : n.type === 'tag' ? 420 : 300;
      next.set(n.key, { ...n, x: old?.x ?? cx + Math.cos(a) * rr + Math.cos(k * 2.4) * (40 + k * 12), y: old?.y ?? cy + Math.sin(a) * rr * 0.8 + Math.sin(k * 2.4) * (40 + k * 12), vx: 0, vy: 0, fixed: old?.fixed || false, r: radius(n, v.sizeBy), bornAt: old?.bornAt || performance.now(), lastMs: n.last || 0 });
    });
    S.nodes = next;
    const all = (data?.edges || []).filter((e) => next.has(e.a) && next.has(e.b) && e.w >= (v.minLink || 0));
    const per = new Map();
    for (const e of all) for (const k of [e.a, e.b]) { if (!per.has(k)) per.set(k, []); per.get(k).push(e); }
    const kept = new Set();
    for (const [, list] of per) list.sort((x, y) => y.w - x.w).slice(0, v.allLinks ? 6 : 2).forEach((e) => kept.add(e));
    S.edges = all.filter((e) => kept.has(e) || e.fantasy || e.manual);
    S.alpha = keep.size ? Math.max(S.alpha, 0.3) : 1;
    if (!keep.size) S.cam = { x: 0, y: 0, k: 0.8 };
  }, [data, view]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const S = sim.current;
    let raf = 0;
    const resize = () => {
      const box = canvas.parentElement;
      S.w = Math.max(300, box.clientWidth);
      S.h = height;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = S.w * dpr;
      canvas.height = S.h * dpr;
      canvas.style.width = `${S.w}px`;
      canvas.style.height = `${S.h}px`;
      S.dpr = dpr;
      S.alpha = Math.max(S.alpha, 0.3);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);

    // Roomy layout: strong push between everything (labels need space), long links, families pulled together.
    const step = () => {
      const nodes = [...S.nodes.values()];
      const a0 = S.alpha;
      if (a0 > 0.01) {
        const byKey = S.nodes;
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
            const d = Math.sqrt(d2);
            if (d > 700) continue;
            const min = a.r + b.r + 90;
            const f = (6000 / d2 + (d < min ? (min - d) * 0.14 : 0)) * a0;
            a.vx -= (dx / d) * f; a.vy -= (dy / d) * f;
            b.vx += (dx / d) * f; b.vy += (dy / d) * f;
          }
        }
        for (const e of S.edges) {
          const a = byKey.get(e.a);
          const b = byKey.get(e.b);
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const len = 150 + (1 - e.w) * 170 + a.r + b.r;
          const k = (0.002 + e.w * 0.012) * a0;
          const f = (d - len) * k;
          a.vx += (dx / d) * f; a.vy += (dy / d) * f;
          b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
        }
        const groups = new Map();
        for (const n of nodes) if (n.topGroup) { const g = groups.get(n.topGroup) || { x: 0, y: 0, c: 0 }; g.x += n.x; g.y += n.y; g.c++; groups.set(n.topGroup, g); }
        for (const n of nodes) {
          if (n.topGroup) { const g = groups.get(n.topGroup); n.vx += (g.x / g.c - n.x) * 0.012 * a0; n.vy += (g.y / g.c - n.y) * 0.012 * a0; }
          n.vx += (S.w / 2 - n.x) * 0.0015 * a0;
          n.vy += (S.h / 2 - n.y) * 0.0022 * a0;
          if (n.fixed) { n.vx = 0; n.vy = 0; continue; }
          n.vx *= 0.68; n.vy *= 0.68;
          n.x += Math.max(-14, Math.min(14, n.vx));
          n.y += Math.max(-14, Math.min(14, n.vy));
        }
        S.alpha *= 0.975;
        if (S.alpha < 0.012) S.alpha = 0;
      }
      draw();
      raf = requestAnimationFrame(step);
    };

    // Zooming spreads the map out (positions scale), while circles and labels stay about the same size.
    const toScreen = (n) => {
      const { cam } = S;
      n.sx = (n.x - S.w / 2) * cam.k + S.w / 2 + cam.x;
      n.sy = (n.y - S.h / 2) * cam.k + S.h / 2 + cam.y;
      n.sr = n.r * Math.max(0.7, Math.min(1.35, Math.pow(cam.k, 0.3)));
    };

    const draw = () => {
      const ctx = canvas.getContext('2d');
      const now = performance.now();
      const v = viewRef.current || {};
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, S.w, S.h);
      const nodes = [...S.nodes.values()];
      for (const n of nodes) toScreen(n);
      const focus = S.hover || selRef.current;
      const neighbors = new Set();
      if (focus) for (const e of S.edges) { if (e.a === focus) neighbors.add(e.b); if (e.b === focus) neighbors.add(e.a); }

      // Families: translucent organic shapes. Where two overlap, their colours mix.
      const groupMembers = new Map();
      for (const n of nodes) for (const gid of [n.topGroup, n.group !== n.topGroup ? n.group : null].filter(Boolean)) {
        if (!groupMembers.has(gid)) groupMembers.set(gid, []);
        groupMembers.get(gid).push(n);
      }
      const labels = [];
      for (const [gid, members] of groupMembers) {
        const g = (data?.groups || []).find((x) => x.id === gid);
        if (!g || !members.length) continue;
        const sub = !!g.parentId;
        const h = blobPath(ctx, members, sub ? 26 : 44, now);
        if (!h) continue;
        const dimG = focus && !members.some((m) => m.key === focus || neighbors.has(m.key));
        ctx.fillStyle = alpha(g.color || '#888888', dimG ? 0.05 : sub ? 0.12 : 0.14);
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = alpha(g.color || '#888888', dimG ? 0.15 : 0.45);
        ctx.stroke();
        const top = h.reduce((m, p) => (p[1] < m[1] ? p : m), h[0]);
        labels.push({ text: g.name.toUpperCase(), x: top[0], y: top[1] - 6, color: mix(g.color || '#bbbbbb', 0.05, '#ffffff'), font: `${sub ? 600 : 700} ${sub ? 10.5 : 12}px Manrope, sans-serif`, prio: sub ? 2 : 3, group: true });
      }

      for (const e of S.edges) {
        const a = S.nodes.get(e.a);
        const b = S.nodes.get(e.b);
        if (!a || !b) continue;
        const lit = focus && (e.a === focus || e.b === focus);
        const dim = focus && !lit;
        const base = e.fantasy ? '#F6C35B' : '#CFC2C9';
        ctx.strokeStyle = mix(base, dim ? 0.92 : lit ? 0.05 : 0.74 - e.w * 0.3);
        ctx.lineWidth = lit ? 1.4 + e.w * 2.6 : 0.8 + e.w * 1.4;
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      }

      for (const n of nodes) {
        const dim = focus && focus !== n.key && !neighbors.has(n.key);
        const fade = dim ? 0.72 : 0;
        const grow = Math.min(1, (now - n.bornAt) / 400);
        const r = n.sr * (0.5 + 0.5 * grow);
        const recent = n.lastMs && Date.now() - n.lastMs < 10 * 60000;
        if (n.type === 'kink') {
          ctx.fillStyle = mix(n.color, n.status === 'proposed' ? Math.max(fade, 0.45) : fade);
          ctx.beginPath(); ctx.arc(n.sx, n.sy, r, 0, TWO_PI); ctx.fill();
          ctx.strokeStyle = mix(n.color, Math.min(0.95, fade + 0.35), '#000000');
          ctx.lineWidth = 1.5;
          ctx.stroke();
          if (n.status === 'proposed') { ctx.setLineDash([3, 4]); ctx.strokeStyle = mix(n.color, fade); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(n.sx, n.sy, r + 4, 0, TWO_PI); ctx.stroke(); ctx.setLineDash([]); }
        } else if (n.type === 'tag') {
          ctx.fillStyle = '#231B29';
          ctx.beginPath(); ctx.arc(n.sx, n.sy, r, 0, TWO_PI); ctx.fill();
          ctx.strokeStyle = mix('#B6A8B0', fade);
          ctx.lineWidth = 1.4;
          ctx.stroke();
          if (n.promote) { ctx.strokeStyle = mix('#E8C66B', fade); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(n.sx, n.sy, r + 3.5, 0, TWO_PI); ctx.stroke(); }
        } else {
          ctx.fillStyle = mix('#F6C35B', n.saved ? fade : Math.max(fade, 0.35));
          drawDiamond(ctx, n.sx, n.sy, r * 1.15); ctx.fill();
          ctx.strokeStyle = mix('#F6C35B', 0.4, '#000000'); ctx.lineWidth = 1.2; ctx.stroke();
        }
        if (recent && !dim) { ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(n.sx + r * 0.75, n.sy - r * 0.75, 3, 0, TWO_PI); ctx.fill(); }
        if (selRef.current === n.key) { ctx.strokeStyle = '#EFE6EA'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(n.sx, n.sy, r + 7, 0, TWO_PI); ctx.stroke(); }
        const important = focus === n.key || neighbors.has(n.key) || selRef.current === n.key;
        if (dim && n.type === 'tag') continue;
        const font = n.type === 'fantasy' ? 'italic 15px "Instrument Serif", Georgia, serif' : `${n.type === 'kink' ? 600 : 500} ${n.type === 'kink' ? 12.5 : 11}px Manrope, sans-serif`;
        const color = n.type === 'fantasy' ? mix('#F6C35B', fade) : n.type === 'tag' ? mix('#B6A8B0', fade) : mix('#EFE6EA', fade);
        labels.push({ text: n.name, x: n.sx, y: n.sy + r + 16, color, font, prio: important ? 10 : n.type === 'kink' ? 4 + n.sr / 20 : n.type === 'fantasy' ? 4 : 1, force: important || v.labelsAll, delta: n.type === 'kink' && focus === n.key ? n.lately - n.allTime : null });
      }

      // Labels last, biggest first; a label that would sit on top of another one waits until you zoom or hover.
      labels.sort((a, b) => b.prio - a.prio);
      const placed = [];
      for (const l of labels) {
        ctx.font = l.font;
        const w = ctx.measureText(l.text).width + 10;
        const box = { x1: l.x - w / 2, y1: l.y - 13, x2: l.x + w / 2, y2: l.y + 4 };
        const hit = placed.some((p) => box.x1 < p.x2 && box.x2 > p.x1 && box.y1 < p.y2 && box.y2 > p.y1);
        if (hit && !l.force) continue;
        placed.push(box);
        ctx.fillStyle = l.group ? 'rgba(26,20,32,.82)' : BG;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(box.x1, box.y1, w, 17, 6); else ctx.rect(box.x1, box.y1, w, 17);
        ctx.fill();
        ctx.fillStyle = l.color;
        ctx.textAlign = 'center';
        ctx.fillText(l.text, l.x, l.y);
        if (l.delta !== null && l.delta !== undefined) {
          ctx.font = '500 10.5px "IBM Plex Mono", monospace';
          ctx.fillStyle = l.delta >= 0 ? '#7FC49B' : '#E07070';
          ctx.fillText(`${l.delta >= 0 ? '▲' : '▼'} ${Math.abs(l.delta)}`, l.x, l.y + 14);
        }
      }
    };

    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [height, data]);

  function toWorld(e) {
    const S = sim.current;
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    return { x: (sx - S.w / 2 - S.cam.x) / S.cam.k + S.w / 2, y: (sy - S.h / 2 - S.cam.y) / S.cam.k + S.h / 2, sx, sy };
  }

  function hit(p) {
    let best = null;
    for (const n of sim.current.nodes.values()) {
      const d = Math.hypot((n.sx ?? n.x) - p.sx, (n.sy ?? n.y) - p.sy);
      if (d <= (n.sr || n.r) + 8 && (!best || d < best.d)) best = { n, d };
    }
    return best?.n || null;
  }

  // On a touch screen one finger scrolls the page past the map (a tap still opens a circle); two fingers move and
  // zoom the map.
  function down(e) {
    const S = sim.current;
    const p = toWorld(e);
    const n = hit(p);
    S.moved = false;
    if (e.pointerType === 'touch') { S.tap = { n, x: e.clientX, y: e.clientY }; return; }
    canvasRef.current.setPointerCapture(e.pointerId);
    if (n) { S.drag = n; n.fixed = true; S.alpha = Math.max(S.alpha, 0.3); }
    else S.pan = { x: p.sx - S.cam.x, y: p.sy - S.cam.y };
  }

  function move(e) {
    const S = sim.current;
    if (e.pointerType === 'touch') { if (S.tap && Math.hypot(e.clientX - S.tap.x, e.clientY - S.tap.y) > 10) S.tap = null; return; }
    const p = toWorld(e);
    if (S.drag) { S.drag.x = p.x; S.drag.y = p.y; S.moved = true; S.alpha = Math.max(S.alpha, 0.25); return; }
    if (S.pan) { S.cam.x = p.sx - S.pan.x; S.cam.y = p.sy - S.pan.y; S.moved = true; return; }
    const n = hit(p);
    const key = n?.key || null;
    if (key !== S.hover) { S.hover = key; canvasRef.current.style.cursor = n ? 'pointer' : 'grab'; }
    onHover?.(n ? { node: n, x: p.sx, y: p.sy } : null);
  }

  function up(e) {
    const S = sim.current;
    const p = toWorld(e);
    if (e.pointerType === 'touch') {
      const tp = S.tap;
      S.tap = null;
      if (tp && !S.pinch && Date.now() - (S.pinchEnd || 0) > 300) onSelect?.(tp.n ? tp.n.key : null);
      return;
    }
    if (S.drag) {
      const n = S.drag;
      S.drag = null;
      if (!S.moved) { n.fixed = false; onSelect?.(n.key); } else setTimeout(() => { n.fixed = false; }, 1500);
    } else if (S.pan) {
      S.pan = null;
      if (!S.moved && !hit(p)) onSelect?.(null);
    }
  }

  // Zoom toward the pointer, like a real map.
  function zoomAt(factor, sx, sy) {
    const S = sim.current;
    const k0 = S.cam.k;
    const k = Math.max(0.3, Math.min(4, k0 * factor));
    const wx = (sx - S.w / 2 - S.cam.x) / k0;
    const wy = (sy - S.h / 2 - S.cam.y) / k0;
    S.cam.x = sx - S.w / 2 - wx * k;
    S.cam.y = sy - S.h / 2 - wy * k;
    S.cam.k = k;
  }

  useEffect(() => {
    const c = canvasRef.current;
    const w = (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - rect.left, e.clientY - rect.top);
    };
    c.addEventListener('wheel', w, { passive: false });
    const S = sim.current;
    const two = (e) => {
      const rect = c.getBoundingClientRect();
      const [a, b] = [e.touches[0], e.touches[1]];
      return { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top, d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1 };
    };
    const ts = (e) => {
      if (e.touches.length >= 2) { e.preventDefault(); S.tap = null; S.pinch = { ...two(e) }; setHint(false); onHover?.(null); }
      else S.one = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const tm = (e) => {
      if (e.touches.length >= 2 && S.pinch) {
        e.preventDefault();
        const g = two(e);
        S.cam.x += g.x - S.pinch.x;
        S.cam.y += g.y - S.pinch.y;
        zoomAt(g.d / S.pinch.d, g.x, g.y);
        S.pinch = g;
      } else if (e.touches.length === 1 && !S.pinch && S.one && Math.abs(e.touches[0].clientX - S.one.x) > 24 && Math.abs(e.touches[0].clientX - S.one.x) > Math.abs(e.touches[0].clientY - S.one.y)) {
        // Sideways with one finger does nothing on the page, so it says how to move the map.
        clearTimeout(S.hintT);
        setHint(true);
        S.hintT = setTimeout(() => setHint(false), 1400);
      }
    };
    const te = (e) => { if (S.pinch && e.touches.length < 2) { S.pinch = null; S.pinchEnd = Date.now(); } };
    c.addEventListener('touchstart', ts, { passive: false });
    c.addEventListener('touchmove', tm, { passive: false });
    c.addEventListener('touchend', te);
    c.addEventListener('touchcancel', te);
    return () => {
      c.removeEventListener('wheel', w);
      c.removeEventListener('touchstart', ts);
      c.removeEventListener('touchmove', tm);
      c.removeEventListener('touchend', te);
      c.removeEventListener('touchcancel', te);
      clearTimeout(S.hintT);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const S = sim.current;
    S.api = {
      zoom: (f) => zoomAt(f, S.w / 2, S.h / 2),
      reset: () => { S.cam = { x: 0, y: 0, k: 0.8 }; S.alpha = 1; },
      center: (key) => { const n = S.nodes.get(key); if (n) { S.cam.x = -(n.x - S.w / 2) * S.cam.k; S.cam.y = -(n.y - S.h / 2) * S.cam.k; } }
    };
  });

  return (
    <div className="brainbox">
      <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { const S = sim.current; S.tap = null; S.pan = null; if (S.drag) { S.drag.fixed = false; S.drag = null; } }} onPointerLeave={() => { sim.current.hover = null; onHover?.(null); }} role="img" aria-label={t('Live map of your kinks, tags and fantasies')} />
      <div className={`brainhint${hint ? ' on' : ''}`} aria-hidden="true">{t('Use two fingers to move and zoom the map')}</div>
      <div className="brainzoom">
        <button type="button" className="icon-btn" onClick={() => sim.current.api?.zoom(1.25)} aria-label={t('Zoom in')}>+</button>
        <button type="button" className="icon-btn" onClick={() => sim.current.api?.zoom(0.8)} aria-label={t('Zoom out')}>−</button>
        <button type="button" className="icon-btn" onClick={() => sim.current.api?.reset()} aria-label={t('Reset view')}>⟲</button>
      </div>
    </div>
  );
}
