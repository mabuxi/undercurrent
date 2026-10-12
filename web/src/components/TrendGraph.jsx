import { useId } from 'react';
import { useApp } from '../context.jsx';
import { lookColor } from '../lookcolor.js';
import { t, tn } from '../i18n.js';

// How one kink rose or dropped over all the weeks you have used the app: its share of your points, week by week.
// Each look draws it its own way: a soft glowing curve over a fading area (original), a thick vivid line over a flat
// tint with a glowing dot (Cutout), a stepped cream-outlined line over a hatched area with square marks (Signal).
const W = 300;
const H = 116;
const PAD = { l: 6, r: 10, t: 12, b: 10 };

function smooth(pts) {
  if (pts.length < 3) return `M${pts.map((p) => p.join(' ')).join('L')}`;
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${Math.min(H - PAD.b, c1[1]).toFixed(1)} ${c2[0].toFixed(1)} ${Math.min(H - PAD.b, c2[1]).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}
const steps = (pts) => `M${pts[0][0]} ${pts[0][1]}${pts.slice(1).map((p, i) => `H${p[0]}V${p[1]}`).join('')}`;

export function TrendGraph({ series, color }) {
  const { theme } = useApp();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const s = series || [];
  if (s.length < 2) return null;
  const max = Math.max(1, ...s) * 1.12;
  const x = (i) => PAD.l + (i / (s.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const pts = s.map((v, i) => [Number(x(i).toFixed(1)), Number(y(v).toFixed(1))]);
  const c = lookColor(color || '#E39A83', theme);
  const peak = s.indexOf(Math.max(...s));
  const last = pts[pts.length - 1];
  const base = H - PAD.b;
  const line = theme === 'signal' ? steps(pts) : smooth(pts);
  const area = `${line}L${last[0]} ${base}L${pts[0][0]} ${base}Z`;
  return (
    <svg className={`trendg t-${theme}`} viewBox={`0 0 ${W} ${H}`} style={{ '--c': color }} role="img" aria-label={t('How it went, week by week')}>
      <defs>
        <linearGradient id={`${uid}a`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c} stopOpacity={theme === 'cutout' ? 0.32 : 0.38} /><stop offset="1" stopColor={c} stopOpacity={theme === 'cutout' ? 0.06 : 0} /></linearGradient>
        <pattern id={`${uid}h`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="none" /><rect width="2.2" height="7" fill={c} opacity=".55" /></pattern>
      </defs>
      {theme === 'signal' ? <line x1={PAD.l} x2={W - PAD.r} y1={base} y2={base} className="tg-base" /> : null}
      <path d={area} fill={theme === 'signal' ? `url(#${uid}h)` : `url(#${uid}a)`} />
      {theme === 'signal' ? <path d={line} className="tg-ink" fill="none" /> : null}
      {theme === 'original' ? <path d={line} fill="none" stroke={c} strokeWidth="6" opacity=".22" className="tg-glow" /> : null}
      <path d={line} fill="none" stroke={c} className="tg-line" />
      {theme === 'signal' ? pts.map((p, i) => <rect key={i} x={p[0] - 3} y={p[1] - 3} width="6" height="6" className="tg-mark" fill={c} />) : null}
      <line x1={pts[peak][0]} x2={pts[peak][0]} y1={pts[peak][1] + 6} y2={base} className="tg-peak" />
      <circle cx={last[0]} cy={last[1]} r={theme === 'cutout' ? 6 : 4.5} fill={c} className="tg-dot" />
    </svg>
  );
}

// The window: the graph, where it started and where it is now, and a button for its posts.
export function TrendBody({ w, onShow }) {
  const s = w.series || [];
  const avg = (a) => Math.round((a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)) * 10) / 10;
  const from = avg(s.slice(0, Math.min(3, Math.ceil(s.length / 3))));
  const to = avg(s.slice(-Math.min(3, Math.ceil(s.length / 3))));
  const fmt = (n) => String(n).replace('.', ',');
  return (
    <div className="win-body trendwin">
      <TrendGraph series={s} color={w.color} />
      <div className="tg-axis"><span>{tn(s.length - 1, '{n} week ago', '{n} weeks ago')}</span><span>{t('this week')}</span></div>
      <p className="wnote">{t('From {a}% to {b}% of your points, week by week.', { a: fmt(from), b: fmt(to) })}</p>
      <div className="wbtns"><button type="button" className="ghost-btn small" onClick={onShow}>{t('Show in center')}</button></div>
    </div>
  );
}
