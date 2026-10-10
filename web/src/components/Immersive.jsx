import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ago, fmtDur, fmtNum, formatMeta, imgSrc, LABELS, proxied, rgba, track } from '../api.js';
import { useApp } from '../context.jsx';
import { Icon } from '../icons.jsx';
import { VideoPlayer, DIRECT } from './Media.jsx';
import { PostFx, HeatFx } from './PostFx.jsx';
import { AskPanel, Avatar, CommentsPanel, ProfilePanel, PerformerPanel, PersonPanel, WhyPanel } from './Panels.jsx';
import { DislikeNote, HAS_COMMENTS, identity } from './Post.jsx';
import { usePostActions } from '../postactions.js';
import { setTkOpen, withChanges } from '../tk.js';
import { soundOn, setSound, onSound } from '../sound.js';
import { t, tn } from '../i18n.js';
import { tapOnly } from '../tapguard.js';

// The full screen viewer on a phone, like TikTok: one post fills the screen, a swipe up or down snaps to the next or
// the previous one, nothing else in between (no windows), and the tab bar is out of the way. Everything a post can do
// stays one tap away: the buttons on the right, who posted it and one line of tags at the bottom, and the rest in a
// sheet that slides up. Double-tap likes, a tap pauses, pinch zooms in.

const KINDS = new Set(['video', 'redgifs', 'embed', 'image', 'gallery']);
export const inViewer = (it) => KINDS.has(it?.media?.kind);
const SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-forms';
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function SafeImg({ url, className, onLoad, onFail }) {
  const [stage, setStage] = useState(0);
  useEffect(() => setStage(0), [url]);
  if (!url || stage > 1) return null;
  return <img className={className} src={stage === 0 ? imgSrc(url) : proxied(url)} alt="" referrerPolicy="no-referrer" onLoad={onLoad} onError={() => { if (stage === 1) onFail?.(); setStage((s) => s + 1); }} draggable={false} />;
}

// Sites whose player an iPhone often shows black (DIRECT): their video file is played in the phone's own player
// instead, through the Mac, so it starts by itself, can go faster and fills the screen.

function TkEmbed({ item, active, preload, onReady, onStart, vref, onPlay, sandboxed, onNative }) {
  const [m, setM] = useState(item.media);
  const [direct, setDirect] = useState(DIRECT.has(item.source) ? undefined : null);
  const [failed, setFailed] = useState(false);
  const refreshed = useRef(false);
  const short = item.format === 'short';
  const url = m.embed ? (/autoplay/.test(m.embed) ? m.embed : `${m.embed}${m.embed.includes('?') ? '&' : '?'}autoplay=1`) : null;
  const poster = m.poster || m.thumbs?.[0];
  const refresh = async () => {
    if (refreshed.current) return;
    refreshed.current = true;
    try { const r = await api(`/items/${item.id}/refresh-media`, { method: 'POST', body: {} }); if (r.media) setM(r.media); } catch {}
  };
  useEffect(() => {
    if (direct !== undefined || !(active || preload)) return undefined;
    let alive = true;
    const give = setTimeout(() => { if (alive) setDirect((d) => (d === undefined ? null : d)); }, 9000);
    api(`/items/${item.id}/direct`).then((r) => { if (alive) setDirect(r.direct || null); }).catch(() => { if (alive) setDirect(null); });
    return () => { alive = false; clearTimeout(give); };
  }, [active, preload, direct, item.id]);
  const native = !!direct && !failed;
  useEffect(() => { onNative?.(native); }, [native]); // eslint-disable-line react-hooks/exhaustive-deps
  if (native) {
    const vItem = { ...item, media: { kind: 'video', src: direct.kind === 'mp4' ? direct.src : undefined, hls: direct.kind === 'hls' ? direct.src : undefined, poster: poster ? proxied(poster) : undefined, hasAudio: true } };
    return <VideoPlayer item={vItem} active={active} preload={preload} inTk exposeRef={vref} onReady={() => { onReady?.(); onStart?.(); }} onPlay={onPlay} onFail={() => setFailed(true)} />;
  }
  return (
    <div className={`tk-embed${short ? ' short' : ''}`}>
      <div className="tk-player">
        {active && url && direct !== undefined ? (
          <iframe key={sandboxed ? 's' : 'u'} src={url} title={item.title} sandbox={sandboxed ? SANDBOX : undefined} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onLoad={() => { onReady?.(); onStart?.(); }} />
        ) : (
          <>
            <SafeImg key={poster} url={poster} onLoad={onReady} onFail={refresh} />
            {active && direct === undefined ? <span className="spinner" /> : <span className="tk-embplay"><Icon name="play" filled /></span>}
          </>
        )}
      </div>
      <div className="tk-embednote">
        <span>{m.provider}</span>
        {active ? <span className="tk-swipehint">{t('Swipe outside the player to go on')}</span> : null}
      </div>
    </div>
  );
}

// The cover picture of a video while you scroll to it and while it loads: the main picture first, and once it is on
// screen and still loading, the other previews of the video in turn. It goes away as soon as the video plays.
export const coverOf = (m = {}) => m.poster || m.thumbs?.[0] || m.thumb || null;
function TkCover({ item, active }) {
  const m = item.media || {};
  const main = coverOf(m);
  const list = [...new Set([main, ...(m.thumbs || [])].filter(Boolean))];
  const [i, setI] = useState(0);
  const [failed, setFailed] = useState(() => new Set());
  const [viaMac, setViaMac] = useState(() => new Set());
  useEffect(() => {
    if (!active || list.length < 2) { setI(0); return undefined; }
    const tm = setInterval(() => setI((x) => (x + 1) % list.length), 650);
    return () => clearInterval(tm);
  }, [active, list.length]);
  const ok = list.filter((u) => !failed.has(u));
  const url = ok.length ? ok[i % ok.length] : null;
  if (!url) return null;
  return (
    <div className="tk-cover" aria-hidden="true">
      <img src={viaMac.has(url) ? proxied(url) : imgSrc(url)} alt="" referrerPolicy="no-referrer" draggable={false} onError={() => (viaMac.has(url) ? setFailed((f) => new Set([...f, url])) : setViaMac((f) => new Set([...f, url])))} />
      {active ? <span className="tk-coverspin" /> : null}
    </div>
  );
}

function TkGallery({ item, active, onReady }) {
  const items = item.media.items || [];
  const [i, setI] = useState(0);
  const ref = useRef(null);
  const onScroll = () => { const el = ref.current; if (el) setI(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); };
  return (
    <div className="tk-gal">
      <div className="tk-galrow" ref={ref} onScroll={onScroll}>
        {items.map((g, k) => (
          <div key={k} className="tk-galcell">
            {g.type === 'video'
              ? (Math.abs(k - i) <= 1 ? <video src={g.src} muted loop playsInline autoPlay={active && k === i} onPlaying={onReady} /> : null)
              : (Math.abs(k - i) <= 2 ? <SafeImg url={g.src || g.mid} onLoad={k === 0 ? onReady : undefined} /> : null)}
          </div>
        ))}
      </div>
      {items.length > 1 ? <div className="tk-dots">{items.length <= 12 ? items.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />) : <span>{i + 1} / {items.length}</span>}</div> : null}
    </div>
  );
}

function TkMedia({ item, active, preload, vref, onReady, onStart, onPlay, sandboxed, onNative }) {
  const m = item.media || {};
  if (m.kind === 'video' || m.kind === 'redgifs') return <VideoPlayer item={item} active={active} preload={preload} inTk exposeRef={vref} onReady={() => { onReady?.(); onStart?.(); }} onPlay={onPlay} />;
  if (m.kind === 'embed') return <TkEmbed item={item} active={active} preload={preload} vref={vref} onReady={onReady} onStart={onStart} onPlay={onPlay} sandboxed={sandboxed} onNative={onNative} />;
  if (m.kind === 'gallery') return <TkGallery item={item} active={active} onReady={onReady} />;
  if (m.kind === 'image') return <div className="tk-img"><SafeImg url={m.src || m.mid} onLoad={onReady} /></div>;
  return null;
}

// The thin line at the bottom of a video: how far it is, and drag it to jump.
function TkProgress({ vref, active, slideRef, onMeta }) {
  const bar = useRef(null);
  const [scrub, setScrub] = useState(null);
  const sent = useRef('');
  useEffect(() => {
    if (!active) return undefined;
    let raf = 0;
    const loop = () => {
      const v = vref.current;
      if (v && v.duration && isFinite(v.duration)) {
        if (bar.current) bar.current.style.width = `${(v.currentTime / v.duration) * 100}%`;
        const key = `${Math.round(v.duration)}|${v.videoWidth}|${v.videoHeight}`;
        if (key !== sent.current) { sent.current = key; onMeta?.({ d: v.duration, w: v.videoWidth, h: v.videoHeight }); }
      }
      slideRef.current?.classList.toggle('paused', !!v && v.paused && v.readyState >= 2 && !v.ended);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, vref, slideRef]);
  const seek = (e) => {
    const v = vref.current;
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    if (v && v.duration && isFinite(v.duration)) { v.currentTime = f * v.duration; setScrub({ at: f * v.duration, d: v.duration }); }
  };
  return (
    <div
      className={`tk-prog${scrub ? ' on' : ''}`}
      onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId); seek(e); }}
      onPointerMove={(e) => { if (scrub) seek(e); }}
      onPointerUp={() => setScrub(null)}
      onPointerCancel={() => setScrub(null)}
      role="slider"
      aria-label={t('Video position')}
    >
      {scrub ? <span className="tk-time">{fmtDur(Math.round(scrub.at))} / {fmtDur(Math.round(scrub.d))}</span> : null}
      <div className="tk-track"><i ref={bar} /></div>
    </div>
  );
}

function Sheet({ title, onClose, children, tall }) {
  return (
    <div className="tk-sheetwrap" onClick={onClose}>
      <div className={`tk-sheet${tall ? ' tall' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="tk-sheethead"><span className="tk-grab" /><strong>{title}</strong><button type="button" className="tk-sheetx" onClick={onClose} aria-label={t('Close')}><Icon name="x" /></button></div>
        <div className="tk-sheetbody">{children}</div>
      </div>
    </div>
  );
}

// Pinch to zoom in on the picture or the video, drag to move around while zoomed in; double-tap or pinch back out
// to go back. While zoomed in, swiping does not go to the next post.
function usePinch(stageRef, zoomRef, active, onZoomed) {
  const z = useRef({ s: 1, x: 0, y: 0 });
  const lastGesture = useRef(0);
  const apply = (anim) => {
    const el = zoomRef.current;
    if (!el) return;
    const c = z.current;
    el.style.transition = anim && !reduced() ? 'transform .22s ease' : 'none';
    el.style.transform = c.s > 1.001 ? `translate(${c.x}px, ${c.y}px) scale(${c.s})` : '';
  };
  const clamp = () => {
    const el = stageRef.current;
    const c = z.current;
    c.s = Math.max(1, Math.min(5, c.s));
    if (!el || c.s <= 1.001) { c.s = 1; c.x = 0; c.y = 0; return; }
    const mx = ((c.s - 1) * el.clientWidth) / 2;
    const my = ((c.s - 1) * el.clientHeight) / 2;
    c.x = Math.max(-mx, Math.min(mx, c.x));
    c.y = Math.max(-my, Math.min(my, c.y));
  };
  const reset = useCallback(() => { z.current = { s: 1, x: 0, y: 0 }; apply(true); onZoomed(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!active && z.current.s > 1) reset(); }, [active, reset]);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    let pinch = null;
    let pan = null;
    const rel = (x, y) => { const r = el.getBoundingClientRect(); return [x - r.left - r.width / 2, y - r.top - r.height / 2]; };
    const start = (e) => {
      if (e.target.closest('iframe, button, a, .tk-prog')) return;
      if (e.touches.length === 2) {
        const [a, b] = [e.touches[0], e.touches[1]];
        const [mx, my] = rel((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
        pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, s: z.current.s, x: z.current.x, y: z.current.y, mx, my };
        pan = null;
        e.preventDefault();
      } else if (e.touches.length === 1 && z.current.s > 1) {
        pan = { x0: e.touches[0].clientX, y0: e.touches[0].clientY, x: z.current.x, y: z.current.y, moved: false };
      }
    };
    const move = (e) => {
      if (pinch && e.touches.length >= 2) {
        e.preventDefault();
        const [a, b] = [e.touches[0], e.touches[1]];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
        const [mx, my] = rel((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
        const s = Math.max(1, Math.min(5, (pinch.s * d) / pinch.d));
        const k = s / pinch.s;
        z.current = { s, x: mx - (pinch.mx - pinch.x) * k, y: my - (pinch.my - pinch.y) * k };
        clamp();
        apply(false);
        onZoomed(z.current.s > 1.001);
      } else if (pan && e.touches.length === 1) {
        e.preventDefault();
        if (Math.hypot(e.touches[0].clientX - pan.x0, e.touches[0].clientY - pan.y0) > 8) pan.moved = true;
        z.current.x = pan.x + e.touches[0].clientX - pan.x0;
        z.current.y = pan.y + e.touches[0].clientY - pan.y0;
        clamp();
        apply(false);
      }
    };
    const end = (e) => {
      if (pinch || pan?.moved) lastGesture.current = Date.now();
      if (e.touches.length < 2) pinch = null;
      if (!e.touches.length) pan = null;
      if (!pinch && z.current.s < 1.08 && z.current.s !== 1) reset();
    };
    const gesture = (e) => e.preventDefault();
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    el.addEventListener('gesturestart', gesture);
    el.addEventListener('gesturechange', gesture);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
      el.removeEventListener('gesturestart', gesture);
      el.removeEventListener('gesturechange', gesture);
    };
  }, [stageRef]); // eslint-disable-line react-hooks/exhaustive-deps
  return { reset, zoomedNow: () => z.current.s > 1.001, recentGesture: () => Date.now() - lastGesture.current < 400 };
}

// Heat in words instead of a number: warm, hot, very hot, burning, on fire.
const HEAT_WORDS = [null, t('Warm'), t('Hot'), t('Very hot'), t('Burning'), t('On fire')];
export const heatWord = (v) => (v > 0 ? HEAT_WORDS[Math.min(5, Math.ceil(v))] : '');

// Heat on the right: a tap on the flame grows it into a slider going up (or, when heat is already set, turns it
// off); holding the flame and moving up sets the heat right away, and letting go keeps it. Two flames or more also likes the post.
function HeatRail({ value, onChange, onLive }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(value);
  const root = useRef(null);
  const track = useRef(null);
  const drag = useRef(null);
  const closeT = useRef(null);
  useEffect(() => { setV(value); }, [value]);
  useEffect(() => () => clearTimeout(closeT.current), []);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', off, true);
    return () => document.removeEventListener('pointerdown', off, true);
  }, [open]);
  const at = (y) => {
    const r = track.current?.getBoundingClientRect();
    if (!r || !r.height) return v;
    return Math.max(0, Math.min(5, Math.round((1 - (y - r.top) / r.height) * 10) / 2));
  };
  const commit = (n) => { onLive?.(n, 'end'); if (n !== value) onChange(n); };
  const down = (e, onTrack) => {
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(closeT.current);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { y: e.clientY, moved: false, onTrack, wasOpen: open, had: v };
    setOpen(true);
    if (onTrack) { const n = at(e.clientY); drag.current.moved = true; setV(n); onLive?.(n, 'live'); }
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientY - d.y) < 6) return;
    d.moved = true;
    const n = at(e.clientY);
    setV(n);
    onLive?.(n, 'live');
  };
  const up = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) { const n = at(e.clientY); setV(n); commit(n); closeT.current = setTimeout(() => setOpen(false), 700); return; }
    // A tap on the flame while it is open closes it; a tap on a flame that is already set turns the heat off.
    if (d.wasOpen) { setOpen(false); return; }
    if (!d.onTrack && d.had > 0) { setOpen(false); setV(0); commit(0); }
  };
  // A small bump on every half flame, so it feels like a real dial (phones that can vibrate).
  const last = useRef(v);
  useEffect(() => { if (open && v !== last.current) { try { navigator.vibrate?.(6); } catch {} } last.current = v; }, [v, open]);
  const word = heatWord(v);
  return (
    <div ref={root} className={`tk-hot${open ? ' open' : ''}${v ? ' on' : ''}`} style={{ '--h': v / 5 }}>
      <div className="tk-hottrack" ref={track} onPointerDown={(e) => down(e, true)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} role="slider" aria-valuemin={0} aria-valuemax={5} aria-valuenow={v} aria-valuetext={word || t('Not rated')} aria-hidden={!open}>
        <i className="tk-hotfill" />
      </div>
      <button type="button" className="tk-b hot" onPointerDown={(e) => down(e, false)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClick={(e) => e.preventDefault()} aria-label={t('How hot was this')} aria-expanded={open}>
        <Icon name="flame" filled={!!v} /><span className="tk-hotword">{word}</span>
      </button>
    </div>
  );
}

// The background behind a post takes the colours of what is playing: a tiny copy of the frame (or the picture) is
// averaged every second and a half, the vivid parts counting more, and the glow fades to the new colour. Files from
// sites that do not allow reading their pixels use the cover picture through the Mac instead.
function toneOf(data) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const R = data[i], G = data[i + 1], B = data[i + 2];
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    if (mx < 18) continue;
    const w = 1 + ((mx - mn) / (mx || 1)) * 3;
    r += R * w; g += G * w; b += B * w; n += w;
  }
  if (!n) return null;
  r /= n * 255; g /= n * 255; b /= n * 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0;
  const d = mx - mn;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const l = (mx + mn) / 2;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return `hsl(${Math.round(((h * 60) + 360) % 360)} ${Math.round(Math.min(0.85, s * 1.3) * 100)}% ${Math.round(Math.max(0.2, Math.min(0.42, l)) * 100)}% / 0.8)`;
}
function sample(src) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0, 16, 16);
  return toneOf(x.getImageData(0, 0, 16, 16).data);
}
function useAmbient(active, vref, zoomRef, ambRef, item) {
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    let fromPoster = false;
    let blank = 0;
    const set = (col) => {
      if (!col) { if (++blank >= 3) posterTone(); return; }
      if (alive && ambRef.current) ambRef.current.style.setProperty('--amb', col);
    };
    const m = item.media || {};
    const still = m.poster || m.thumbs?.[0] || m.mid || m.src || m.items?.[0]?.mid || m.items?.[0]?.src;
    const posterTone = () => {
      if (fromPoster || !still) return;
      fromPoster = true;
      const im = new Image();
      im.onload = () => { try { const col = sample(im); if (col && alive && ambRef.current) ambRef.current.style.setProperty('--amb', col); } catch {} };
      im.src = proxied(still);
    };
    const tick = () => {
      const v = vref.current;
      if (v && v.readyState >= 2 && !fromPoster) {
        try { set(sample(v)); } catch { posterTone(); }
        return;
      }
      const img = zoomRef.current?.querySelector('img');
      if (img?.complete && img.naturalWidth && !fromPoster) { try { set(sample(img)); } catch { posterTone(); } return; }
      if (!v) posterTone();
    };
    const first = setTimeout(tick, 350);
    const iv = setInterval(tick, 1500);
    return () => { alive = false; clearTimeout(first); clearInterval(iv); };
  }, [active, item.id]); // eslint-disable-line react-hooks/exhaustive-deps
}

// A small round picture for someone in a post: the performer's picture when known, the person's profile picture
// from the sites that have it, otherwise their initials.
const PEOPLE_PICS = new Map();
function PersonPic({ name, thumb, lookup = false, platform = 'any' }) {
  const [src, setSrc] = useState(thumb || PEOPLE_PICS.get(name) || null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (thumb || !lookup || PEOPLE_PICS.has(name)) return undefined;
    let alive = true;
    PEOPLE_PICS.set(name, null);
    api(`/people/lookup?handle=${encodeURIComponent(name)}&platform=${platform}`).then((d) => {
      const pic = (d.profiles || []).find((x) => x.avatar)?.avatar || null;
      PEOPLE_PICS.set(name, pic);
      if (alive && pic) setSrc(pic);
    }).catch(() => {});
    return () => { alive = false; };
  }, [name, thumb, lookup, platform]);
  if (!src || bad) return <span className="tk-pic none" aria-hidden="true">{String(name).replace(/^@+/, '').slice(0, 1).toUpperCase()}</span>;
  return <img className="tk-pic" src={imgSrc(src)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} />;
}

function Slide({ item: initial, active, preload, onStrong, onWeak, lock, onNext, onLeave }) {
  const { toast, refreshMeta, setFilters, runSearch, kinks: allKinks } = useApp();
  const [item, setItem] = useState(() => withChanges(initial));
  const [fx, setFx] = useState(null);
  const [heat, setHeat] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [kinkPick, setKinkPick] = useState(false);
  const [native, setNative] = useState(false);
  const [sandboxed, setSandboxed] = useState(true);
  const [fast, setFast] = useState(0);
  const [whoData, setWhoData] = useState(null);
  const [vmeta, setVmeta] = useState(null);
  const [ctlTop, setCtlTop] = useState(null);
  const vref = useRef(null);
  const infoRef = useRef(null);
  const ambRef = useRef(null);
  const slideRef = useRef(null);
  const stageRef = useRef(null);
  const zoomRef = useRef(null);
  const fired = useRef(false);
  const strong = (why) => { if (fired.current) return; fired.current = true; onStrong?.(item, why); };
  const weak = () => { fired.current = false; onWeak?.(item); };
  // The heart shows where you double-tapped; other reactions in the middle.
  const fxAt = useRef(null);
  const play = (kind) => { setFx({ kind, key: Date.now() + Math.random(), ...(fxAt.current || {}) }); fxAt.current = null; };
  const acts = usePostActions(item, setItem, {
    play, strong, toast, refreshMeta,
    // A dislike moves on to the next post right away.
    onDown: (on) => { if (on) { weak(); setTimeout(() => onNext?.(), 450); } },
    onHide: () => { weak(); setSheet(null); setHidden('hide'); }
  });
  useEffect(() => { if (item.hiddenNow && !hidden) setHidden('hide'); }, [item.hiddenNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const pinch = usePinch(stageRef, zoomRef, active, setZoomed);
  useEffect(() => { lock(`z${item.id}`, active && zoomed); }, [active, zoomed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { lock(`s${item.id}`, active && !!sheet); }, [active, sheet]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { lock(`f${item.id}`, active && !!fast); }, [active, fast]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { lock(`z${item.id}`, false); lock(`s${item.id}`, false); lock(`f${item.id}`, false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Who posted it and who is in it, and whether you follow them, for the follow button and their pictures.
  useEffect(() => {
    if (!active || whoData) return;
    const perf = (item.performers || []).slice(0, 6).join('|');
    api(`/items/${item.id}/who${perf ? `?performers=${encodeURIComponent(perf)}` : ''}`).then(setWhoData).catch(() => {});
  }, [active, item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!active) { setSheet(null); setOpen(false); } }, [active]);

  // Time spent on it counts like in the feed; a minute on it is being into it. Swiping past one that had not even
  // loaded yet is a quick "not for me".
  const shownAt = useRef(0);
  const impressed = useRef(false);
  useEffect(() => {
    if (!active) return undefined;
    shownAt.current = Date.now();
    const long = setTimeout(() => strong('dwell'), 60000);
    return () => {
      clearTimeout(long);
      const ms = Date.now() - shownAt.current;
      if (impressed.current) track(item.id, 'dwell', ms);
      else if (ms >= 250 && ms < 1500) track(item.id, 'skip', ms);
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (active && ready && !impressed.current) { impressed.current = true; track(item.id, 'impression'); shownAt.current = Date.now(); }
  }, [active, ready, item.id]);

  const isEmbed = item.media?.kind === 'embed';
  const isVideo = item.media?.kind === 'video' || item.media?.kind === 'redgifs' || (isEmbed && native);
  // A longer video (a minute or more) gets a small row under it: back 15 seconds, the phone's own full screen
  // player, forward 15 seconds. The video itself stays in the middle, under the buttons.
  const dur = vmeta?.d || item.duration || 0;
  const isLong = isVideo && (dur ? dur >= 60 : item.format === 'long');
  useLayoutEffect(() => {
    if (!isLong || !active) return undefined;
    const fit = () => {
      const st = stageRef.current;
      const sl = slideRef.current;
      if (!st || !sl) return;
      const v = vref.current;
      const W = st.clientWidth;
      const H = st.clientHeight;
      const ar = v?.videoWidth && v?.videoHeight ? v.videoWidth / v.videoHeight : item.width && item.height ? item.width / item.height : 16 / 9;
      const bottom = H / 2 + Math.min(H, W / ar) / 2;
      const info = infoRef.current?.getBoundingClientRect();
      const infoTop = info ? info.top - sl.getBoundingClientRect().top : H - 150;
      const top = Math.round(Math.max(90, Math.min(bottom + 10, infoTop - 48)));
      setCtlTop((x) => (x === top ? x : top));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [isLong, active, vmeta, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const skipBy = (s2) => {
    const v = vref.current;
    if (!v || !v.duration || !isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration - 0.5, v.currentTime + s2));
  };
  const nativeFull = () => {
    const v = vref.current;
    if (!v) return;
    try {
      if (document.fullscreenEnabled && v.requestFullscreen) v.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
      else v.webkitEnterFullscreen?.();
    } catch {}
    track(item.id, 'open');
  };
  useAmbient(active && !hidden, vref, zoomRef, ambRef, item);
  // Holding the left or right side of a video plays it faster until you let go: 2x, or 5x for a longer video.
  const hold = useRef({ timer: null, x: 0, y: 0, until: 0 });
  const holdStart = (e) => {
    const v = vref.current;
    if (!isVideo || !v || e.target.closest('button, a, iframe, .tk-prog')) return;
    const b = stageRef.current.getBoundingClientRect();
    const fx = (e.clientX - b.left) / b.width;
    if (fx > 0.3 && fx < 0.7) return;
    const h = hold.current;
    h.x = e.clientX; h.y = e.clientY;
    clearTimeout(h.timer);
    h.timer = setTimeout(() => {
      const vv = vref.current;
      if (!vv) return;
      const want = isLong ? 5 : 2;
      try { vv.playbackRate = want; } catch { try { vv.playbackRate = 2; } catch {} }
      if (vv.paused) vv.play().catch(() => {});
      setFast(vv.playbackRate > 1 ? vv.playbackRate : want);
      h.until = Infinity;
    }, 380);
  };
  const holdMove = (e) => { const h = hold.current; if (h.timer && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 10) { clearTimeout(h.timer); h.timer = null; } };
  const holdEnd = () => {
    const h = hold.current;
    clearTimeout(h.timer);
    h.timer = null;
    if (fast) { const v = vref.current; if (v) v.playbackRate = 1; setFast(0); h.until = Date.now() + 450; }
  };
  useEffect(() => { if (!active && fast) holdEnd(); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const tap = useRef({ t: 0, timer: null });
  useEffect(() => () => clearTimeout(tap.current.timer), []);
  function onTap(e) {
    if (e.target.closest('button, a, iframe, input, select, .tk-embednote')) return;
    if (pinch.recentGesture()) return;
    // The end of a 2x hold is not a tap.
    if (Date.now() < hold.current.until) return;
    const r = tap.current;
    const now = Date.now();
    const box = stageRef.current.getBoundingClientRect();
    if (now - r.t < 300) {
      clearTimeout(r.timer);
      r.t = 0;
      if (pinch.zoomedNow()) { pinch.reset(); return; }
      // Players from other sites never like on a tap.
      if (!isEmbed || native) { fxAt.current = { y: Math.round(e.clientY - box.top), x: Math.round(e.clientX - box.left) }; acts.like(); }
      return;
    }
    r.t = now;
    clearTimeout(r.timer);
    r.timer = setTimeout(() => {
      const v = vref.current;
      if (isVideo && v) { if (v.paused) v.play().catch(() => {}); else v.pause(); }
    }, 300);
  }

  const id = identity(item);
  const c = item.kinks?.[0]?.color || '#E39A83';
  const tags = item.tags || [];
  // Tube sites never say who uploaded a video: then the button shows where it comes from.
  const who = id.handle ? 'profile' : id.performer ? `performer:${id.performer}` : 'source';
  const thumbOf = (name) => item.performerCards?.find((p) => p.name === name)?.thumb || whoData?.performers?.find((p) => p.name === name)?.thumb || null;
  // The + under the picture follows who posted it (or the first person in it when the site does not say who
  // posted it); a check shows you already do, and tapping it again unfollows.
  const followTarget = who === 'profile' ? (whoData?.author?.canFollow ? { kind: 'author', name: whoData.author.name, on: whoData.author.followed } : null)
    : id.performer ? { kind: 'performer', name: id.performer, on: !!whoData?.performers?.find((p) => p.name === id.performer)?.followed } : null;
  async function toggleFollow() {
    if (!followTarget || !whoData) return;
    const on = !followTarget.on;
    const patch = (d) => (followTarget.kind === 'author' ? { ...d, author: { ...d.author, followed: on } } : { ...d, performers: d.performers.map((p) => (p.name === followTarget.name ? { ...p, followed: on } : p)) });
    setWhoData((d) => patch(d));
    try {
      if (followTarget.kind === 'author') {
        if (on) { const r = await api('/follow-creator', { method: 'POST', body: { source: item.source, name: followTarget.name, itemId: item.id } }); toast(tn(r.followed?.length || 1, 'Following {name} on {n} source.', 'Following {name} on {n} sources.', { name: followTarget.name })); }
        else { await api('/follow', { method: 'POST', body: { kind: whoData.author.kind, value: whoData.author.followValue, on: false } }); toast(t('Unfollowed {name}.', { name: followTarget.name })); }
      } else {
        await api(`/performers/${encodeURIComponent(followTarget.name)}/follow`, { method: 'POST', body: { on } });
        toast(on ? t('Following {name} on every source that has them.', { name: followTarget.name }) : t('Unfollowed {name}.', { name: followTarget.name }));
      }
      if (on) strong('follow');
    } catch (e) {
      toast(e.message);
      const perf = (item.performers || []).slice(0, 6).join('|');
      api(`/items/${item.id}/who${perf ? `?performers=${encodeURIComponent(perf)}` : ''}`).then(setWhoData).catch(() => {});
    }
  }
  const leaveTo = (fn) => { onLeave(); setTimeout(fn, 30); };
  const title = item.title || '';
  const sub = [id.sub[0], ago(item.created)].filter(Boolean).join(' · ');

  const sheetView = (() => {
    if (!sheet) return null;
    const close = () => setSheet(null);
    if (sheet === 'source') {
      const site = item.media?.provider || id.sub[0] || item.source;
      return (
        <Sheet title={site} onClose={close}>
          <p className="wtext">{t('{site} does not say who uploaded this video, so there is no profile to show.', { site })}</p>
          {item.performers?.length ? <div className="chiprow all">{item.performers.map((p) => <button type="button" key={p} className="chip ghost btn" onClick={() => setSheet(`performer:${p}`)}><Icon name="person" />{p}</button>)}</div> : null}
          <div className="tk-list">
            <button type="button" onClick={() => leaveTo(() => setFilters({ sources: [item.source] }))}><Icon name="globe" />{t('Only posts from {site}', { site })}</button>
            {item.url ? <a href={item.url} target="_blank" rel="noreferrer noopener" onClick={() => track(item.id, 'open')}><Icon name="open" />{t('Open on the original site')}</a> : null}
          </div>
        </Sheet>
      );
    }
    if (sheet === 'dislike') return <Sheet title={t("I don't like this")} onClose={close}><DislikeNote id={item.id} /></Sheet>;
    if (sheet === 'comments') return <Sheet title={t('Comments')} onClose={close} tall><CommentsPanel item={item} /></Sheet>;
    if (sheet === 'why') return <Sheet title={t('Why this')} onClose={close} tall><WhyPanel item={item} /></Sheet>;
    if (sheet === 'ask') return <Sheet title={t('Ask the assistant')} onClose={close} tall><AskPanel item={item} onPatch={(p) => { if (p.hidden) setHidden('hide'); else if (p.reasonTags) acts.update({ tags: [...new Set([...p.reasonTags, ...(item.tags || [])])], liked: p.reasonTags }); else acts.update(p); }} /></Sheet>;
    if (sheet === 'profile') return <Sheet title={id.name} onClose={close} tall><ProfilePanel item={item} onBlocked={() => { weak(); close(); setHidden('block'); }} /></Sheet>;
    if (sheet.startsWith('performer:')) return <Sheet title={sheet.slice(10)} onClose={close} tall><PerformerPanel name={sheet.slice(10)} itemId={item.id} onBlocked={() => { weak(); close(); setHidden('block'); }} /></Sheet>;
    if (sheet.startsWith('person:')) { const [platform, ...h] = sheet.slice(7).split('|'); return <Sheet title={h.join('|')} onClose={close} tall><PersonPanel key={sheet} item={item} person={{ platform, handle: h.join('|') }} /></Sheet>; }
    if (sheet === 'tags') {
      return (
        <Sheet title={t('Kinks and tags')} onClose={close}>
          {item.performers?.length || item.people?.length ? (
            <div className="tk-sec"><span className="fb-label">{t('In this video')}</span><div className="chiprow all">
              {(item.performers || []).map((p) => <button type="button" key={p} className="chip ghost btn picchip" onClick={() => { setSheet(`performer:${p}`); strong('performer'); }}><PersonPic name={p} thumb={thumbOf(p)} />{String(p).replace(/^@+/, '')}</button>)}
              {(item.people || []).map((p) => <button type="button" key={p.handle} className="chip ghost btn picchip" onClick={() => setSheet(`person:${p.platform || 'any'}|${p.handle}`)}><PersonPic name={p.handle} lookup platform={p.platform || 'any'} />{String(p.handle).replace(/^@+/, '')}</button>)}
            </div></div>
          ) : null}
          <div className="tk-sec"><span className="fb-label">{t('Kinks')}</span><div className="chiprow all">
            {(item.kinks || []).map((k) => (
              <span key={k.id} className="chip link kchip" style={{ '--c': k.color, '--c2': rgba(k.color, 0.16) }}>
                <button type="button" onClick={tapOnly(() => leaveTo(() => setFilters({ kink: k.id })))}>{k.name}</button>
                <button type="button" className="kx" onClick={tapOnly(() => acts.setKink(k, false))} aria-label={t('This post is not {name}', { name: k.name })}><Icon name="x" /></button>
              </span>
            ))}
            {kinkPick ? (
              <select className="kinkpick" autoFocus defaultValue="" onChange={(e) => { const k = allKinks.find((x) => x.id === Number(e.target.value)); setKinkPick(false); if (k) acts.setKink(k, true); }} onBlur={() => setKinkPick(false)} aria-label={t('Add this post to a kink')}>
                <option value="" disabled>{t('Add to a kink…')}</option>
                {allKinks.filter((k) => !k.isGroup && k.status !== 'hidden' && !item.kinks?.some((x) => x.id === k.id)).sort((a, b) => a.name.localeCompare(b.name)).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            ) : <button type="button" className="chip ghost more addkink" onClick={() => setKinkPick(true)}>{t('+ kink')}</button>}
          </div></div>
          <div className="tk-sec"><span className="fb-label">{t('Tags')}</span><div className="chiprow all">
            {tags.map((tag) => (
              <span key={tag} className={`chip ghost tagx${item.liked?.includes(tag) ? ' mine' : ''}`}>
                <button type="button" onClick={tapOnly(() => leaveTo(() => runSearch(tag).catch(() => setFilters({ tags: [tag] }))))}>{tag}</button>
                <button type="button" className="kx" onClick={tapOnly(() => acts.dropTag(tag))} aria-label={t('Take {tag} off this post', { tag })} title={t('Does not fit: take it off')}><Icon name="x" /></button>
              </span>
            ))}
          </div></div>
          <p className="wnote">{formatMeta(item)}{item.gender && (item.gender.women || item.gender.men) ? ` · ${[item.gender.women ? tn(item.gender.women, '{n} woman', '{n} women') : null, item.gender.men ? tn(item.gender.men, '{n} man', '{n} men') : null, item.gender.trans ? 'trans' : null].filter(Boolean).join(', ')}` : ''}</p>
        </Sheet>
      );
    }
    if (sheet === 'more') {
      return (
        <Sheet title={t('More actions')} onClose={close}>
          <div className="tk-list">
            <button type="button" onClick={() => setSheet('ask')}><Icon name="ask" />{t('Ask the assistant')}</button>
            <button type="button" onClick={() => setSheet('why')}><Icon name="why" />{t('Why this')}</button>
            <button type="button" onClick={() => setSheet('tags')}><Icon name="tag" />{t('Kinks and tags')}</button>
            <button type="button" onClick={() => acts.less()}><Icon name="less" />{t('Less like this')}</button>
            {isEmbed && !native ? <button type="button" onClick={() => { setSandboxed((x) => !x); close(); }}><Icon name={sandboxed ? 'key' : 'block'} />{sandboxed ? t('Load without the content blocker') : t('Turn the content blocker back on')}</button> : null}
            {item.url ? <a href={item.url} target="_blank" rel="noreferrer noopener" onClick={() => track(item.id, 'open')}><Icon name="open" />{t('Open on the original site')}</a> : null}
          </div>
          <p className="wnote">{[LABELS[item.label], t('{n}% match', { n: item.match }), formatMeta(item)].filter(Boolean).join(' · ')}</p>
        </Sheet>
      );
    }
    return null;
  })();

  return (
    <div ref={slideRef} className={`tk-s${zoomed ? ' zoomed' : ''}${open ? ' open' : ''}`} style={{ '--c': c, '--c2': rgba(c, 0.3) }}>
      <div className="tk-amb" ref={ambRef} aria-hidden="true" />
      <div className="tk-stage" ref={stageRef} onClick={onTap} onPointerDown={holdStart} onPointerMove={holdMove} onPointerUp={holdEnd} onPointerCancel={holdEnd} onContextMenu={(e) => e.preventDefault()}>
        <div className="tk-zoom" ref={zoomRef}>
          <TkMedia item={item} active={active && !hidden} preload={preload} vref={vref} onReady={() => setReady(true)} onStart={() => setStarted(true)} onPlay={() => strong('play')} sandboxed={sandboxed} onNative={setNative} />
          {!started && (isVideo || isEmbed) && coverOf(item.media) ? <TkCover item={item} active={active && !hidden} /> : null}
        </div>
        {fast ? <span className="tk-fast" aria-live="polite">{String(fast).replace('.', ',')}× <Icon name="chevR" /><Icon name="chevR" /></span> : null}
        <PostFx fx={fx} />
        <HeatFx heat={heat} />
        {isVideo ? <span className="tk-pausedicon" aria-hidden="true"><Icon name="play" filled /></span> : null}
      </div>
      <div className="tk-shade" aria-hidden="true" />
      {isLong && ctlTop != null && !hidden ? (
        <div className="tk-ctl" style={{ top: ctlTop }}>
          <button type="button" onClick={() => skipBy(-15)} aria-label={t('Back 15 seconds')}>−15</button>
          <button type="button" className="fs" onClick={nativeFull} aria-label={t('Open in the full screen player')} title={t('Open in the full screen player')}><Icon name="expand" /></button>
          <button type="button" onClick={() => skipBy(15)} aria-label={t('Forward 15 seconds')}>+15</button>
        </div>
      ) : null}
      <div className="tk-rail">
        <div className="tk-avwrap">
          <button type="button" className="tk-av" onClick={() => setSheet(who)} aria-label={t('Show profile of {name}', { name: id.name })}>
            {item.media?.avatar ? <img className="avatar av-m avimg" src={item.media.avatar} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : id.performer && thumbOf(id.performer) ? <img className="avatar av-m avimg" src={imgSrc(thumbOf(id.performer))} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <Avatar name={id.name} />}
          </button>
          {followTarget ? (
            <button type="button" className={`tk-follow${followTarget.on ? ' on' : ''}`} onClick={toggleFollow} aria-pressed={followTarget.on} aria-label={followTarget.on ? t('You follow {name}. Tap to unfollow.', { name: followTarget.name }) : t('Follow {name}', { name: followTarget.name })}>
              <Icon name={followTarget.on ? 'check' : 'plus'} />
            </button>
          ) : null}
        </div>
        <button type="button" className={`tk-b up${item.vote > 0 ? ' on' : ''}`} onClick={() => acts.vote(1)} aria-label={t('I like this')}><Icon name="up" /><span>{item.upvotes != null ? fmtNum(item.upvotes) : ''}</span></button>
        <button type="button" className={`tk-b down${item.vote < 0 ? ' on' : ''}`} onClick={() => acts.vote(-1)} aria-label={t("I don't like this")}><Icon name="down" /></button>
        <HeatRail value={item.rating || 0} onChange={acts.rate} onLive={(v, phase) => setHeat((cur) => (cur && cur.phase === 'live' ? { ...cur, v, phase } : { v, phase, key: Date.now() }))} />
        {HAS_COMMENTS.has(item.source) ? <button type="button" className="tk-b" onClick={() => { setSheet('comments'); strong('comments'); }} aria-label={t('Comments')}><Icon name="comment" /><span>{item.comments ? fmtNum(item.comments) : ''}</span></button> : null}
        <button type="button" className={`tk-b save${item.saved ? ' on' : ''}`} onClick={acts.save} aria-label={item.saved ? t('Unsave') : t('Save')}><Icon name="save" filled={item.saved} /></button>
        <button type="button" className="tk-b" onClick={() => setSheet('more')} aria-label={t('More actions')}><Icon name="dots" filled /></button>
      </div>
      <div className="tk-info" ref={infoRef}>
        <button type="button" className="tk-who" onClick={() => setSheet(who)}><strong>{id.name}</strong><span>{sub}</span></button>
        {title ? <button type="button" className="tk-title" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{title}</button> : null}
        {open ? (
          <div className="tk-text">
            {item.body ? <p>{item.body}</p> : null}
            {item.aiSummary ? <p className="aisum">{item.aiSummary}</p> : null}
            <p className="wnote">{[LABELS[item.label], t('{n}% match', { n: item.match }), formatMeta(item)].filter(Boolean).join(' · ')}</p>
          </div>
        ) : null}
        <div className="tk-tags">
          {(item.performers || []).slice(0, 3).map((p) => <button type="button" key={`p${p}`} className="tk-chip perf" onClick={tapOnly(() => { setSheet(`performer:${p}`); strong('performer'); })}><PersonPic name={p} thumb={thumbOf(p)} />{String(p).replace(/^@+/, '')}</button>)}
          {(item.kinks || []).map((k) => <button type="button" key={`k${k.id}`} className="tk-chip kink" style={{ '--c': k.color }} onClick={tapOnly(() => leaveTo(() => setFilters({ kink: k.id })))}>{k.name}</button>)}
          {tags.slice(0, 12).map((tag) => <button type="button" key={tag} className="tk-chip" onClick={tapOnly(() => leaveTo(() => runSearch(tag).catch(() => setFilters({ tags: [tag] }))))}>#{tag}</button>)}
        </div>
        <button type="button" className="tk-tagsbtn" onClick={() => setSheet('tags')} aria-label={t('Show all kinks and tags')}><Icon name="tag" /></button>
      </div>
      {isVideo ? <TkProgress vref={vref} active={active} slideRef={slideRef} onMeta={setVmeta} /> : null}
      {hidden ? (
        <div className="tk-gone">
          <p>{hidden === 'block' ? t('Blocked. Nothing from them shows up again; you can unblock them in Memory.') : t('Hidden. The feed will show less like this.')}</p>
          <DislikeNote id={item.id} />
          <button type="button" className="ghost-btn small accent" onClick={onNext}><Icon name="chevD" />{t('Next post')}</button>
        </div>
      ) : null}
      {sheetView}
    </div>
  );
}

function MuteBtn() {
  const [on, setOn] = useState(soundOn());
  useEffect(() => onSound(setOn), []);
  return <button type="button" className="tk-tb" onClick={() => setSound(!on)} aria-label={on ? t('Turn sound off') : t('Turn sound on')}><Icon name={on ? 'volume' : 'mute'} /></button>;
}

// Short form, mixed and long form at the top of the viewer: the same switch as the format filter of the feed, so
// the viewer and the feed always show the same thing. Any other filter (a search, tags, a kink...) shows above it
// and leaves no mode lit unless the formats match one.
export const TK_MODES = [
  { id: 'short', label: t('Short'), formats: ['short', 'gif', 'image', 'set'] },
  { id: 'mixed', label: t('Mixed'), formats: [] },
  { id: 'long', label: t('Long'), formats: ['long'] }
];
export function tkModeOf(filters, others) {
  const f = [...(filters?.formats || [])].sort().join(',');
  const m = TK_MODES.find((x) => [...x.formats].sort().join(',') === f);
  if (!m) return 'custom';
  if (m.id === 'mixed' && others) return 'custom';
  return m.id;
}

export default function Immersive({ items, startId, onClose, onMore, loading, done, onStrong, onWeak, onCurrent, mode = 'mixed', onMode, chips = [], onClearChip, onClearAll, gen = 0 }) {
  const list = items.filter(inViewer);
  const startAt = Math.max(0, list.findIndex((x) => x.id === startId));
  const [cur, setCur] = useState(startAt);
  const curId = useRef(list[startAt]?.id);
  const [locks, setLocks] = useState(() => new Set());
  const lock = useCallback((key, on) => setLocks((s) => { if (s.has(key) === on) return s; const n = new Set(s); if (on) n.add(key); else n.delete(key); return n; }), []);
  const sc = useRef(null);
  const raf = useRef(0);
  const closing = useRef(false);

  // Open: the page behind stops scrolling, the tab bar goes away and the viewer starts at the post you tapped.
  useLayoutEffect(() => {
    const el = sc.current;
    if (el) el.scrollTop = startAt * el.clientHeight;
    document.documentElement.classList.add('tkopen');
    setTkOpen(true);
    try { window.webkit?.messageHandlers?.uc?.postMessage('pinch-off'); } catch {}
    return () => {
      document.documentElement.classList.remove('tkopen');
      setTkOpen(false);
      try { window.webkit?.messageHandlers?.uc?.postMessage('pinch-on'); } catch {}
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Back (the phone's back swipe or button) closes the viewer instead of leaving the page.
  const finish = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    onClose(curId.current);
  }, [onClose]);
  useEffect(() => {
    let pushed = false;
    try { window.history.pushState({ ucTk: 1 }, ''); pushed = true; } catch {}
    const pop = () => finish();
    window.addEventListener('popstate', pop);
    return () => {
      window.removeEventListener('popstate', pop);
      if (pushed && window.history.state?.ucTk) { try { window.history.back(); } catch {} }
    };
  }, [finish]);
  const close = () => { if (window.history.state?.ucTk) window.history.back(); else finish(); };

  // The post on screen is the one the scroll position is at.
  const onScroll = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const el = sc.current;
      if (!el) return;
      const i = Math.round(el.scrollTop / Math.max(1, el.clientHeight));
      if (i !== cur && i >= 0 && i < list.length) { setCur(i); curId.current = list[i].id; }
    });
  };
  // Posts coming in (more of the feed, or similar ones after one you liked) never move the one on screen.
  useLayoutEffect(() => {
    if (curId.current == null && list[cur]) { curId.current = list[cur].id; const el = sc.current; if (el) el.scrollTop = cur * el.clientHeight; }
    const i = list.findIndex((x) => x.id === curId.current);
    if (i >= 0 && i !== cur) { setCur(i); const el = sc.current; if (el) el.scrollTop = i * el.clientHeight; }
  }, [list.map((x) => x.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const re = () => { const el = sc.current; if (el) el.scrollTop = cur * el.clientHeight; };
    window.addEventListener('resize', re);
    return () => window.removeEventListener('resize', re);
  }, [cur]);
  // The feed behind follows along, so closing the viewer lands on the same post with everything above it loaded.
  useEffect(() => {
    const id = list[cur]?.id;
    if (!id || !onCurrent) return undefined;
    const tm = setTimeout(() => onCurrent(id), 250);
    return () => clearTimeout(tm);
  }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps
  // More posts load before you reach the end.
  useEffect(() => { if (!done && !loading && list.length - cur <= 3) onMore(); }, [cur, list.length, done, loading]); // eslint-disable-line react-hooks/exhaustive-deps
  // Another mode or filter: the viewer starts again at the top of what the feed shows now.
  const firstGen = useRef(gen);
  useLayoutEffect(() => {
    if (gen === firstGen.current) return;
    firstGen.current = gen;
    curId.current = null;
    setCur(0);
    const el = sc.current;
    if (el) el.scrollTop = 0;
  }, [gen]);
  // Swiping left or right switches between short form, mixed and long form.
  const [flash, setFlash] = useState(null);
  const flashT = useRef(null);
  useEffect(() => () => clearTimeout(flashT.current), []);
  // Switching modes slides the whole viewer out to one side and the new one in from the other, and a sideways
  // swipe drags it along under your finger first.
  const slideTo = (dir, then) => {
    const el = sc.current;
    if (!el || reduced()) { then(); return; }
    el.style.transition = 'transform .2s cubic-bezier(.4,0,.6,1), opacity .2s';
    el.style.transform = `translateX(${dir < 0 ? '-100%' : '100%'})`;
    el.style.opacity = '0.2';
    setTimeout(() => {
      then();
      el.style.transition = 'none';
      el.style.transform = `translateX(${dir < 0 ? '60%' : '-60%'})`;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1), opacity .28s';
        el.style.transform = '';
        el.style.opacity = '';
      }));
    }, 200);
  };
  const snapBack = () => {
    const el = sc.current;
    if (!el) return;
    el.style.transition = 'transform .25s cubic-bezier(.34,1.4,.64,1), opacity .25s';
    el.style.transform = '';
    el.style.opacity = '';
  };
  const modeIndex = () => Math.max(0, TK_MODES.findIndex((x) => x.id === (mode === 'custom' ? 'mixed' : mode)));
  const pickMode = (id, dirHint) => {
    if (!onMode || id === mode) { snapBack(); return; }
    const dir = dirHint ?? (TK_MODES.findIndex((x) => x.id === id) > modeIndex() ? -1 : 1);
    slideTo(dir, () => {
      onMode(id);
      setFlash(TK_MODES.find((x) => x.id === id)?.label || null);
      clearTimeout(flashT.current);
      flashT.current = setTimeout(() => setFlash(null), 900);
    });
  };
  const swipe = useRef(null);
  const swStart = (e) => {
    if (e.touches.length !== 1 || locks.size || e.target.closest('.tk-galrow, .tk-hot, .tk-prog, .tk-tags, .tk-chips, .tk-sheetwrap, .tk-modes, input')) { swipe.current = null; return; }
    swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), side: false };
  };
  const swMove = (e) => {
    const s0 = swipe.current;
    if (!s0 || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - s0.x;
    const dy = e.touches[0].clientY - s0.y;
    if (!s0.side) {
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { swipe.current = null; return; }
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4) s0.side = true;
      else return;
    }
    const el = sc.current;
    if (!el) return;
    const next = TK_MODES[modeIndex() + (dx < 0 ? 1 : -1)];
    const x = next && onMode ? dx : dx * 0.25;
    el.style.transition = 'none';
    el.style.transform = `translateX(${x}px)`;
    el.style.opacity = String(Math.max(0.45, 1 - Math.abs(x) / 700));
  };
  const swEnd = (e) => {
    const s0 = swipe.current;
    swipe.current = null;
    if (!s0 || !e.changedTouches.length) return;
    const dx = e.changedTouches[0].clientX - s0.x;
    const dy = e.changedTouches[0].clientY - s0.y;
    const next = TK_MODES[modeIndex() + (dx < 0 ? 1 : -1)];
    // A quick flick or a drag past a third of the screen switches; anything less springs back.
    const far = Math.abs(dx) > window.innerWidth * 0.3;
    const flick = Math.abs(dx) >= 70 && Date.now() - s0.t < 700;
    if (!s0.side || locks.size || !next || (!far && !flick) || Math.abs(dx) < Math.abs(dy) * 1.8) { if (s0.side) snapBack(); return; }
    pickMode(next.id, dx < 0 ? -1 : 1);
  };


  const go = (d) => { const el = sc.current; if (el) el.scrollTo({ top: (cur + d) * el.clientHeight, behavior: reduced() ? 'auto' : 'smooth' }); };
  useEffect(() => {
    const key = (e) => {
      if (e.target.closest?.('input, textarea, select')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  return createPortal(
    <div className={`tk${chips.length ? ' haschips' : ''}`} role="dialog" aria-modal="true" aria-label={t('Full screen')} onTouchStart={swStart} onTouchMove={swMove} onTouchEnd={swEnd} onTouchCancel={() => { if (swipe.current?.side) snapBack(); swipe.current = null; }}>
      <div ref={sc} className={`tk-scroll${locks.size ? ' locked' : ''}`} onScroll={onScroll}>
        {list.map((it, i) => (
          <section key={it.id} className="tk-slide" data-id={it.id} data-source={it.source} data-kind={it.media?.kind} aria-hidden={i !== cur}>
            {Math.abs(i - cur) <= 2
              ? <Slide item={it} active={i === cur} preload={i === cur + 1} onStrong={onStrong} onWeak={onWeak} lock={lock} onNext={() => go(1)} onLeave={close} />
              : <div className="tk-s tk-far">{Math.abs(i - cur) <= 6 && coverOf(it.media) ? <img className="tk-farimg" src={imgSrc(coverOf(it.media))} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} /> : null}</div>}
          </section>
        ))}
        <section className="tk-slide tk-endslide">
          {!list.length && loading ? <span className="finding"><span className="spin" />{t('Loading…')}</span> : done ? (
            <div className="tk-endmsg"><p>{t('Nothing more matches right now.')}</p><button type="button" className="ghost-btn small accent" onClick={close}><Icon name="x" />{t('Back to the feed')}</button></div>
          ) : <span className="finding"><span className="spin" />{t('Loading more…')}</span>}
        </section>
      </div>
      <div className="tk-top">
        <button type="button" className="tk-tb" onClick={close} aria-label={t('Close full screen')}><Icon name="chevD" /></button>
        {onMode ? (
          <div className="tk-modes" role="tablist" aria-label={t('What to show')}>
            {TK_MODES.map((m) => <button type="button" key={m.id} role="tab" aria-selected={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => pickMode(m.id)}>{m.label}</button>)}
          </div>
        ) : null}
        <MuteBtn />
      </div>
      {chips.length ? (
        <div className="tk-chips" aria-label={t('What the feed is showing')}>
          {chips.map(([k, label]) => <span key={k} className="tk-fchip"><span>{label}</span><button type="button" onClick={() => onClearChip?.(k)} aria-label={t('Remove {name}', { name: label })}><Icon name="x" /></button></span>)}
          {chips.length > 1 ? <button type="button" className="tk-fclear" onClick={() => onClearAll?.()}><Icon name="x" />{t('Clear all')}</button> : null}
        </div>
      ) : null}
      {flash ? <div className="tk-modeflash" aria-live="polite">{flash}</div> : null}
    </div>,
    document.body
  );
}

