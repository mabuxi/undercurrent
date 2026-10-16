import { useEffect, useRef, useState } from 'react';
import { fmtDur, imgSrc, proxied } from '../api.js';
import { Icon } from '../icons.jsx';
import { KShape } from '../shapes.jsx';
import { coverOf } from './Immersive.jsx';
import { t } from '../i18n.js';

// Under a post you were clearly into (a like, heat, a save, a long watch), on the feed only: a row of small previews
// with the same kinks and similar tags, like the related videos under a video on a tube site. Picking one plays it
// in the post's place; the row stays, the first one goes back to the post you started from, and the feed simply
// carries on below.

const stillsOf = (it) => {
  const m = it.media || {};
  if (m.kind === 'gallery') return (m.items || []).filter((g) => g.type !== 'video').map((g) => g.mid || g.src).slice(0, 6);
  return [...new Set([coverOf(m), ...(m.thumbs || []), m.mid, m.kind === 'image' ? m.src : null].filter(Boolean))].slice(0, 8);
};

function Tile({ it, on, first, moving, onPick }) {
  const stills = stillsOf(it);
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  const [bad, setBad] = useState(() => new Set());
  const [viaMac, setViaMac] = useState(() => new Set());
  // While the row is on screen the previews run through their stills, like little videos; pointing at one with a
  // video file plays it without sound.
  useEffect(() => {
    if (!moving || stills.length < 2) return undefined;
    const tm = setInterval(() => setI((x) => (x + 1) % stills.length), 700 + (it.id % 5) * 90);
    return () => clearInterval(tm);
  }, [moving, stills.length, it.id]);
  const ok = stills.filter((u) => !bad.has(u));
  const url = ok.length ? ok[i % ok.length] : null;
  const vid = it.media?.kind === 'video' && it.media.src && !it.media.hls ? it.media.src : null;
  return (
    <button type="button" className={`simtile${on ? ' on' : ''}${first ? ' first' : ''}`} onClick={() => onPick(it)} onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(true); }} onPointerLeave={() => setHover(false)} aria-pressed={on} title={it.title}>
      <span className="simpic" style={{ '--c': it.kinks?.[0]?.color || '#E39A83' }}>
        {url ? <img src={viaMac.has(url) ? proxied(url) : imgSrc(url)} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} onError={() => (viaMac.has(url) ? setBad((b) => new Set([...b, url])) : setViaMac((v) => new Set([...v, url])))} /> : null}
        {hover && vid ? <video src={vid} muted loop autoPlay playsInline preload="none" /> : null}
        {first && !on ? <em className="simback"><Icon name="chevL" />{t('Back')}</em> : it.duration ? <em className="simdur">{fmtDur(it.duration)}</em> : null}
        {on ? <i className="simnow" aria-hidden="true"><Icon name="play" filled /></i> : null}
      </span>
      <span className="simtxt">
        {it.kinks?.[0] ? <KShape id={it.kinks[0].id} color={it.kinks[0].color} size={12} /> : null}
        <span>{it.title || it.kinks?.[0]?.name || ''}</span>
      </span>
    </button>
  );
}

export default function SimilarRow({ strip, onPick }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // The one playing stays in sight when the row is wider than the screen.
  useEffect(() => {
    const el = ref.current?.querySelector('.simtile.on');
    if (el && inView) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [strip.sel]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="simrow" ref={ref} aria-label={t('More like this')}>
      <div className="simrow-h"><Icon name="route" /><span>{strip.why}</span></div>
      <div className="simrow-list">
        {strip.items.map((it, i) => <Tile key={it.id} it={it} first={i === 0} on={strip.sel === it.id} moving={inView} onPick={onPick} />)}
      </div>
    </section>
  );
}
