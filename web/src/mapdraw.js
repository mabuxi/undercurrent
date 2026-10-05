import { rgba } from './api.js';
import { t, tn } from './i18n.js';

function solid(c, t, to = '#1A1420') {
  const h = (x) => { const m = String(x || '#999999').replace('#', ''); const f = m.length === 3 ? m.split('').map((y) => y + y).join('') : m.padEnd(6, '9'); return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)); };
  const a = h(c);
  const b = h(to);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}

export function graphFor(data, zoom = null) {
  const all = (data?.kinks || []).filter((k) => k.status !== 'hidden');
  const groups = all.filter((k) => k.isGroup);
  const kinks = all.filter((k) => !k.isGroup);
  const groupOf = new Map(kinks.map((k) => [k.id, k.parentId && groups.some((g) => g.id === k.parentId) ? k.parentId : null]));
  let nodes;
  const faded = new Set();
  if (zoom) {
    const inside = kinks.filter((k) => groupOf.get(k.id) === zoom);
    const ids = new Set(inside.map((k) => k.id));
    const outside = new Map();
    for (const l of data?.links || []) {
      if (ids.has(l.a) && !ids.has(l.b)) outside.set(l.b, true);
      if (ids.has(l.b) && !ids.has(l.a)) outside.set(l.a, true);
    }
    const extra = kinks.filter((k) => outside.has(k.id)).slice(0, 6);
    extra.forEach((k) => faded.add(k.id));
    nodes = [...inside, ...extra].map((k) => ({ id: k.id, name: k.name, color: k.color, v: (k.allTime + k.lately) / 2, d: k.lately - k.allTime, status: k.status, kind: 'kink', faded: faded.has(k.id) }));
  } else {
    const loose = kinks.filter((k) => !groupOf.get(k.id));
    nodes = [
      ...groups.map((g) => {
        const kids = kinks.filter((k) => groupOf.get(k.id) === g.id);
        const v = kids.length ? Math.max(...kids.map((k) => (k.allTime + k.lately) / 2)) : (g.allTime + g.lately) / 2;
        return { id: g.id, name: g.name, color: g.color, v: v + 6, d: 0, status: g.status, kind: 'group', count: kids.length, kids: kids.slice(0, 8) };
      }),
      ...loose.map((k) => ({ id: k.id, name: k.name, color: k.color, v: (k.allTime + k.lately) / 2, d: k.lately - k.allTime, status: k.status, kind: 'kink' }))
    ];
  }
  const shown = new Set(nodes.map((n) => n.id));
  const lift = (id) => (zoom ? id : groupOf.get(id) || id);
  const edges = new Map();
  const addEdge = (a, b, w, why) => {
    const A = lift(a);
    const B = lift(b);
    if (A === B || !shown.has(A) || !shown.has(B)) return;
    const key = A < B ? `${A}:${B}` : `${B}:${A}`;
    const cur = edges.get(key);
    edges.set(key, { a: Math.min(A, B), b: Math.max(A, B), w: Math.min(1, (cur?.w || 0) + w), why: cur?.why || why });
  };
  for (const l of data?.links || []) addEdge(l.a, l.b, 0.6, l.why);
  for (const p of data?.pairs || []) addEdge(p.a.id, p.b.id, (p.score - 50) / 60, `${p.score}% together`);
  const rings = (data?.fantasies || []).map((f) => ({ id: f.id, name: f.name, saved: f.saved, match: f.match, members: [...new Set(f.kinks.map((k) => lift(k.id)).filter((id) => shown.has(id)))] })).filter((f) => f.members.length);
  return { nodes, edges: [...edges.values()], rings };
}

export function layout(nodes, edges, w, h) {
  const pos = new Map();
  const n = nodes.length;
  const cx = w / 2;
  const cy = h / 2;
  nodes.forEach((k, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2 + (i % 2 ? 0.18 : -0.12);
    const spread = 0.62 + 0.3 * ((i * 37) % 10) / 10;
    pos.set(k.id, [cx + Math.cos(a) * w * 0.36 * spread, cy + Math.sin(a) * h * 0.34 * spread]);
  });
  const minD = n > 10 ? 80 : 110;
  for (let it = 0; it < 90; it++) {
    for (const e of edges) {
      const A = pos.get(e.a);
      const B = pos.get(e.b);
      if (!A || !B) continue;
      const dx = B[0] - A[0];
      const dy = B[1] - A[1];
      const d = Math.hypot(dx, dy) || 1;
      const target = Math.min(w, h) * (0.5 - e.w * 0.22);
      const f = (d - target) * 0.012;
      A[0] += (dx / d) * f; A[1] += (dy / d) * f;
      B[0] -= (dx / d) * f; B[1] -= (dy / d) * f;
    }
    for (const [ia, A] of pos) for (const [ib, B] of pos) {
      if (ia >= ib) continue;
      const dx = B[0] - A[0];
      const dy = B[1] - A[1];
      const d = Math.hypot(dx, dy) || 1;
      if (d < minD) {
        const f = (minD - d) * 0.06;
        A[0] -= (dx / d) * f; A[1] -= (dy / d) * f;
        B[0] += (dx / d) * f; B[1] += (dy / d) * f;
      }
    }
    for (const P of pos.values()) {
      P[0] = Math.max(56, Math.min(w - 56, P[0]));
      P[1] = Math.max(40, Math.min(h - 52, P[1]));
    }
  }
  return pos;
}

export function drawGraph(canvas, graph, { big = true, selected = null, height } = {}) {
  if (!canvas || !graph) return [];
  const box = canvas.parentElement;
  const w = Math.max(220, box.clientWidth);
  const h = height || (big ? 480 : 150);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const nodes = graph.nodes.slice(0, big ? 24 : 9);
  const ids = new Set(nodes.map((x) => x.id));
  const edges = graph.edges.filter((e) => ids.has(e.a) && ids.has(e.b));
  const hits = [];
  if (!nodes.length) {
    ctx.fillStyle = '#81737B';
    ctx.font = '13px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(big ? t('Your map fills in as you rate, save and spend time on posts.') : t('Builds as you browse'), w / 2, h / 2);
    return hits;
  }
  const pos = layout(nodes, edges, w, h);
  const radius = (nd) => {
    const base = big ? 9 + Math.max(0, nd.v - 40) * 0.45 : 4 + Math.max(0, nd.v - 40) * 0.14;
    return nd.kind === 'group' ? base * 1.35 + (big ? Math.min(14, nd.count * 2) : 2) : base;
  };
  for (const e of edges) {
    const A = pos.get(e.a);
    const B = pos.get(e.b);
    ctx.strokeStyle = `rgba(236,222,230,${0.1 + e.w * 0.35})`;
    ctx.lineWidth = big ? 1 + e.w * 4 : 1;
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
    if (big) hits.push({ x: (A[0] + B[0]) / 2, y: (A[1] + B[1]) / 2, r: 8, edge: e });
  }
  for (const f of graph.rings) {
    const pts = f.members.map((id) => pos.get(id)).filter(Boolean);
    if (!pts.length) continue;
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const spread = Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy)));
    const r = Math.max(big ? 30 : 10, spread + (big ? 26 : 8));
    ctx.fillStyle = `rgba(246,195,91,${f.saved ? 0.06 : 0.025})`;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.setLineDash(f.saved ? [] : [4, 5]);
    ctx.strokeStyle = selected?.kind === 'fantasy' && selected.id === f.id ? 'rgba(246,195,91,1)' : f.saved ? 'rgba(246,195,91,.7)' : 'rgba(246,195,91,.4)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    if (big) {
      ctx.fillStyle = '#F6C35B';
      ctx.font = 'italic 16px "Instrument Serif", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.name, cx, Math.max(14, cy - r - 6));
    }
    hits.push({ x: cx, y: cy - r, r: 14, ring: true, fantasy: f });
  }
  for (const nd of nodes) {
    const [x, y] = pos.get(nd.id);
    const r = radius(nd);
    const fade = nd.faded ? 0.65 : nd.status === 'proposed' ? 0.45 : 0;
    ctx.fillStyle = solid(nd.color, fade);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = solid(nd.color, 0.45, '#000000'); ctx.lineWidth = 1.2; ctx.stroke();
    if (nd.kind === 'group' && big) {
      nd.kids?.forEach((k, i) => {
        const a = (i / Math.max(1, nd.kids.length)) * Math.PI * 2;
        ctx.fillStyle = rgba(k.color || '#ffffff', 0.95);
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, Math.max(3, r * 0.16), 0, Math.PI * 2); ctx.fill();
      });
      ctx.strokeStyle = 'rgba(239,230,234,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke();
    }
    if (nd.status === 'proposed') {
      ctx.setLineDash([3, 4]); ctx.strokeStyle = nd.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    if (selected && selected.kind !== 'fantasy' && selected.id === nd.id) {
      ctx.strokeStyle = '#EFE6EA'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.textAlign = 'center';
    if (big) {
      ctx.fillStyle = nd.faded ? '#81737B' : '#EFE6EA';
      ctx.font = `${nd.kind === 'group' ? 700 : 600} ${nd.kind === 'group' ? 14 : 12.5}px Manrope, sans-serif`;
      ctx.fillText(nd.name, x, y + r + (nd.kind === 'group' ? 22 : 17));
      ctx.font = '500 11px "IBM Plex Mono", monospace';
      if (nd.kind === 'group') {
        ctx.fillStyle = '#B6A8B0';
        ctx.fillText(tn(nd.count, '{n} kink · click to open', '{n} kinks · click to open'), x, y + r + 37);
      } else if (!nd.faded) {
        ctx.fillStyle = nd.d >= 0 ? '#7FC49B' : '#E07070';
        ctx.fillText(t('{d} lately', { d: `${nd.d >= 0 ? '+' : ''}${nd.d}` }), x, y + r + 31);
      }
    }
    hits.push({ x, y, r: r + 8, node: nd });
  }
  return hits;
}

export function drawMap(canvas, data, big) {
  return drawGraph(canvas, graphFor(data, null), { big });
}
