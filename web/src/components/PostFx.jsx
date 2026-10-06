import { useEffect, useState } from 'react';
import { FLAME_PATH, ICON_PATHS } from '../icons.jsx';

// The reactions in the middle of a post: the same line icons as the buttons below it, bigger and bolder, on a
// small frosted glass disc like the tab bar. A like rises, a dislike sinks, a save fills in, hiding crosses the eye
// out, and the heat flame grows with the slider. Purely visual: nothing here changes what the post does.

const KIND_ICON = { up: 'up', down: 'down', unup: 'up', undown: 'down', save: 'save', unsave: 'save', hide: 'less' };

function Glyph({ name, fill = false }) {
  return (
    <svg className="fxglyph" viewBox="0 0 24 24" aria-hidden="true">
      {fill ? <path className="fxfill" d={ICON_PATHS[name]} /> : null}
      <path className="fxline" d={ICON_PATHS[name]} pathLength="1" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// One-shot reactions. `fx` is { kind, key }: a new key plays it again.
export function PostFx({ fx }) {
  const [shown, setShown] = useState(null);
  useEffect(() => {
    if (!fx) return undefined;
    setShown(fx);
    const tm = setTimeout(() => setShown((cur) => (cur?.key === fx.key ? null : cur)), 1200);
    return () => clearTimeout(tm);
  }, [fx?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown) return null;
  const k = shown.kind;
  const undo = k === 'unup' || k === 'undown' || k === 'unsave';
  return (
    <div className={`postfx fx-${k}${undo ? ' fx-undo' : ''}${shown.y != null ? ' at' : ''}`} style={{ ...(shown.y != null ? { '--fy': `${shown.y}px` } : {}), ...(shown.x != null ? { '--fx': `${shown.x}px` } : {}) }} key={shown.key} aria-hidden="true">
      {undo ? null : <span className="fxring" />}
      <span className="fxdisc"><Glyph name={KIND_ICON[k]} fill={k === 'save'} /></span>
    </div>
  );
}

// The heat flame: the slider's own flame on the same glass disc. It grows and warms up while you slide, flares up
// when you let go, or goes out at zero. `heat` is { v, phase: 'live' | 'end', key }.
export function HeatFx({ heat }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!heat) return undefined;
    setState(heat);
    if (heat.phase !== 'end') return undefined;
    const tm = setTimeout(() => setState((cur) => (cur?.key === heat.key && cur.phase === 'end' ? null : cur)), 1100);
    return () => clearTimeout(tm);
  }, [heat?.key, heat?.v, heat?.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!state) return null;
  const h = Math.max(0, Math.min(1, state.v / 5));
  const end = state.phase === 'end';
  const out = end && state.v === 0;
  return (
    <div className={`postfx heatfx${end ? (out ? ' out' : ' burst') : ' live'}${state.y != null ? ' at' : ''}`} style={{ '--h': h, ...(state.y != null ? { '--fy': `${state.y}px` } : {}), ...(state.x != null ? { '--fx': `${state.x}px` } : {}) }} aria-hidden="true">
      {end && !out ? <span className="fxring" /> : null}
      <span className="fxdisc">
        <svg className="fxglyph hfflame" viewBox="0 0 24 24"><path d={FLAME_PATH} fill="currentColor" /></svg>
      </span>
    </div>
  );
}
