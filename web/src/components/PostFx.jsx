import { useEffect, useId, useState } from 'react';
import { FLAME_PATH } from '../icons.jsx';

// The big animations in the middle of a post when you react to it: a bouncy arrow for a like or a dislike, a
// bookmark for a save, an eye for hiding, and a live flame while you slide the heat. Purely visual: nothing here
// changes what the post does.

const ARROW = 'M12 2.8 21.2 12.6h-5.4v8.6H8.2v-8.6H2.8z';
const MARK = 'M6 2.8h12v18.4l-6-4.4-6 4.4z';
const EYE_OFF = 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c5 0 9 5 9 7a11 11 0 0 1-2.6 3.4M6.3 6.4C4.2 7.8 3 10.2 3 12c0 2 4 7 9 7 1.6 0 3-.4 4.3-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2';
const EMBERS = 9;

function Shape({ kind }) {
  if (kind === 'up' || kind === 'down' || kind === 'unup' || kind === 'undown') {
    const filled = kind === 'up' || kind === 'down';
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id={`fxg-${kind}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={kind.endsWith('up') ? '#B8F0CF' : '#FFB4AC'} />
            <stop offset="1" stopColor={kind.endsWith('up') ? '#52B983' : '#E0534A'} />
          </linearGradient>
        </defs>
        <path d={ARROW} fill={filled ? `url(#fxg-${kind})` : 'none'} stroke={filled ? 'rgba(255,255,255,.85)' : 'currentColor'} strokeWidth={filled ? 0.9 : 1.4} strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'save' || kind === 'unsave') {
    const filled = kind === 'save';
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id="fxg-save" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFE3A3" />
            <stop offset="1" stopColor="#E39A83" />
          </linearGradient>
        </defs>
        <path d={MARK} fill={filled ? 'url(#fxg-save)' : 'none'} stroke={filled ? 'rgba(255,255,255,.85)' : 'currentColor'} strokeWidth={filled ? 0.9 : 1.4} strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'hide') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={EYE_OFF} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  return null;
}

// One-shot reactions. `fx` is { kind, key }: a new key plays it again.
export function PostFx({ fx }) {
  const [shown, setShown] = useState(null);
  useEffect(() => {
    if (!fx) return undefined;
    setShown(fx);
    const tm = setTimeout(() => setShown((cur) => (cur?.key === fx.key ? null : cur)), 1300);
    return () => clearTimeout(tm);
  }, [fx?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown) return null;
  return (
    <div className={`postfx fx-${shown.kind}`} key={shown.key} aria-hidden="true">
      <span className="fxring" />
      <span className="fxshape"><Shape kind={shown.kind} /></span>
      {shown.kind === 'up' || shown.kind === 'save' ? <span className="fxsparks">{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ '--a': `${i * 60 + 30}deg` }} />)}</span> : null}
    </div>
  );
}

// The heat flame: grows and warms up while you slide, flares up when you let go (or puffs out at zero).
// `heat` is { v, phase: 'live' | 'end', key }.
export function HeatFx({ heat }) {
  const uid = useId();
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!heat) return undefined;
    setState(heat);
    if (heat.phase !== 'end') return undefined;
    const tm = setTimeout(() => setState((cur) => (cur?.key === heat.key && cur.phase === 'end' ? null : cur)), 1250);
    return () => clearTimeout(tm);
  }, [heat?.key, heat?.v, heat?.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!state) return null;
  const h = Math.max(0, Math.min(1, state.v / 5));
  const end = state.phase === 'end';
  const gid = `hfg${uid.replace(/:/g, '')}`;
  const out = end && state.v === 0;
  return (
    <div className={`heatfx${end ? (out ? ' out' : ' burst') : ' live'}`} style={{ '--h': h }} aria-hidden="true">
      <span className="hfglow" />
      <span className="hfflame">
        <svg viewBox="0 0 24 24">
          <defs>
            <radialGradient id={gid} cx="50%" cy="72%" r="65%">
              <stop offset="0" stopColor="#FFF6D8" />
              <stop offset={`${0.25 + h * 0.1}`} stopColor="#F6C35B" />
              <stop offset={`${0.62 - h * 0.12}`} stopColor="#F2894E" />
              <stop offset="1" stopColor={h > 0.7 ? '#D9364F' : '#E5603C'} />
            </radialGradient>
          </defs>
          <path d={FLAME_PATH} fill={`url(#${gid})`} />
        </svg>
      </span>
      {end && !out ? <span className="hfembers">{Array.from({ length: EMBERS }, (_, i) => <i key={i} style={{ '--a': `${-150 + i * (120 / (EMBERS - 1))}deg`, '--d': `${(i % 3) * 60}ms` }} />)}</span> : null}
      {out ? <span className="hfsmoke"><i /><i /><i /></span> : null}
    </div>
  );
}
