import { useEffect, useId, useState } from 'react';
import { api } from '../api.js';
import { KShape } from '../shapes.jsx';
import { useApp } from '../context.jsx';
import { lookColor } from '../lookcolor.js';
import { t, tn } from '../i18n.js';

// How one kink rose or dropped over all the weeks you have used the app: its share of your points, week by week.
// Each look draws it its own way: a soft glowing curve over a fading area (original), a thick vivid line over a flat
// tint with a glowing dot (Cutout), a stepped cream-outlined line over a hatched area with square marks (Signal), a hard
// straight pink line on ruled paper with a tick for every point and a square at the end (Specimen).
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
  if (theme === 'specimen') {
    const rules = [0.25, 0.5, 0.75].map((f) => PAD.t + f * (base - PAD.t));
    return (
      <svg className={`trendg t-${theme}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('How it went, week by week')}>
        {rules.map((ry) => <line key={ry} x1={PAD.l} x2={W - PAD.r} y1={ry} y2={ry} className="tg-rule" />)}
        {pts.map((p, i) => <line key={i} x1={p[0]} x2={p[0]} y1={base} y2={base - (i % 5 === 0 ? 7 : 4)} className="tg-tick" />)}
        <line x1={PAD.l} x2={W - PAD.r} y1={base} y2={base} className="tg-base" />
        <line x1={pts[peak][0]} x2={pts[peak][0]} y1={pts[peak][1] + 6} y2={base} className="tg-peak" />
        <path d={`M${pts.map((p) => p.join(' ')).join('L')}`} fill="none" className="tg-line" />
        <rect x={last[0] - 4} y={last[1] - 4} width="8" height="8" className="tg-dot" />
      </svg>
    );
  }
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

const RANGE_LABEL = () => ({ week: t('Week'), month: t('Month'), all: t('All time') });
function axis(range, n) {
  if (range === 'week') return [t('7 days ago'), t('today')];
  if (range === 'month') return [t('30 days ago'), t('today')];
  return [tn(n - 1, '{n} week ago', '{n} weeks ago'), t('this week')];
}

export function RangeSwitch({ value, onChange }) {
  const L = RANGE_LABEL();
  return (
    <div className="seg trange" role="tablist">
      {['week', 'month', 'all'].map((r) => <button type="button" key={r} role="tab" aria-selected={value === r} className={value === r ? 'on' : ''} onClick={() => onChange(r)}>{L[r]}</button>)}
    </div>
  );
}

// On a kink's page: how it moved over the last week, month or all time.
export function KinkTrend({ kinkId, color }) {
  const [range, setRange] = useState('month');
  const [series, setSeries] = useState(null);
  useEffect(() => {
    let live = true;
    setSeries(null);
    api(`/kinks/${kinkId}/trend?range=${range}`).then((r) => { if (live) setSeries(r.series || []); }).catch(() => { if (live) setSeries([]); });
    return () => { live = false; };
  }, [kinkId, range]);
  const [a, b] = axis(range, series?.length || 0);
  return (
    <div className="bw ktrend">
      <div className="bw-h"><span>{t('How it moved')}</span><RangeSwitch value={range} onChange={setRange} /></div>
      {series == null ? <div className="trend-wait"><span className="spin" /></div> : series.length >= 2 && Math.max(...series) > 0 ? (
        <>
          <TrendGraph series={series} color={color} />
          <div className="tg-axis"><span>{a}</span><span>{b}</span></div>
          <p className="wnote">{t('Its share of your points, {range}.', { range: { week: t('day by day this week'), month: t('day by day this month'), all: t('week by week since you started') }[range] })}</p>
        </>
      ) : <p className="wnote">{t('Not enough to draw yet for this stretch.')}</p>}
    </div>
  );
}

// On your kinks page: the kinks that moved the most, one line at a time.
export function KinksTrend() {
  const [range, setRange] = useState('month');
  const [movers, setMovers] = useState(null);
  const [pick, setPick] = useState(null);
  useEffect(() => {
    let live = true;
    api(`/kinks/trends?range=${range}`).then((r) => { if (live) setMovers(r.movers || []); }).catch(() => { if (live) setMovers([]); });
    return () => { live = false; };
  }, [range]);
  if (movers && !movers.length) return null;
  const cur = movers?.find((m) => m.id === pick) || movers?.[0];
  const [a, b] = axis(range, cur?.series.length || 0);
  const fmt = (n) => `${n > 0 ? '+' : ''}${String(n).replace('.', ',')}`;
  return (
    <section className="bw ktrends">
      <div className="bw-h"><span>{t('How your kinks moved')}</span><RangeSwitch value={range} onChange={setRange} /></div>
      {!movers ? <div className="trend-wait"><span className="spin" /></div> : (
        <div className="ktrends-in">
          <div className="ktrends-list">
            {movers.map((m) => (
              <button type="button" key={m.id} className={`ktm${cur?.id === m.id ? ' on' : ''}`} style={{ '--c': m.color }} onClick={() => setPick(m.id)}>
                <KShape id={m.id} color={m.color} size={18} /><span>{m.name}</span><em className={m.change >= 0 ? 'up' : 'down'}>{fmt(m.change)}</em>
              </button>
            ))}
          </div>
          {cur ? (
            <div className="ktrends-graph" key={`${cur.id}-${range}`}>
              <TrendGraph series={cur.series} color={cur.color} />
              <div className="tg-axis"><span>{a}</span><span>{b}</span></div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
