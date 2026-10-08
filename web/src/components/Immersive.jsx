import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ago, fmtDur, fmtNum, formatMeta, imgSrc, LABELS, proxied, rgba, track } from '../api.js';
import { useApp } from '../context.jsx';
import { Icon } from '../icons.jsx';
import { VideoPlayer } from './Media.jsx';
import { PostFx, HeatFx } from './PostFx.jsx';
import { AskPanel, Avatar, CommentsPanel, ProfilePanel, PerformerPanel, PersonPanel, HeatSlider, WhyPanel } from './Panels.jsx';
import { DislikeNote, HAS_COMMENTS, identity } from './Post.jsx';
import { usePostActions } from '../postactions.js';
import { setTkOpen, withChanges } from '../tk.js';
import { soundOn, setSound, onSound } from '../sound.js';
import { t, tn } from '../i18n.js';

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

function TkEmbed({ item, active, onReady }) {
  const [m, setM] = useState(item.media);
  const [sandboxed, setSandboxed] = useState(true);
  const refreshed = useRef(false);
  const short = item.format === 'short';
  const url = m.embed ? (/autoplay/.test(m.embed) ? m.embed : `${m.embed}${m.embed.includes('?') ? '&' : '?'}autoplay=1`) : null;
  const poster = m.poster || m.thumbs?.[0];
  const refresh = async () => {
    if (refreshed.current) return;
    refreshed.current = true;
    try { const r = await api(`/items/${item.id}/refresh-media`, { method: 'POST', body: {} }); if (r.media) setM(r.media); } catch {}
  };
  return (
    <div className={`tk-embed${short ? ' short' : ''}`}>
      <div className="tk-player">
        {active && url ? (
          <iframe key={sandboxed ? 's' : 'u'} src={url} title={item.title} sandbox={sandboxed ? SANDBOX : undefined} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onLoad={onReady} />
        ) : (
          <>
            <SafeImg key={poster} url={poster} onLoad={onReady} onFail={refresh} />
            <span className="tk-embplay"><Icon name="play" filled /></span>
          </>
        )}
      </div>
      <div className="tk-embednote">
        <span>{m.provider}</span>
        {active ? (sandboxed
          ? <button type="button" className="linkbtn" onClick={() => setSandboxed(false)}>{t('Player stays black? Load it without the blocker')}</button>
          : <button type="button" className="linkbtn" onClick={() => setSandboxed(true)}>{t('Turn the blocker back on')}</button>) : null}
        {active ? <span className="tk-swipehint">{t('Swipe outside the player to go on')}</span> : null}
      </div>
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

function TkMedia({ item, active, preload, vref, onReady, onPlay }) {
  const m = item.media || {};
  if (m.kind === 'video' || m.kind === 'redgifs') return <VideoPlayer item={item} active={active} preload={preload} inTk exposeRef={vref} onReady={onReady} onPlay={onPlay} />;
  if (m.kind === 'embed') return <TkEmbed item={item} active={active} onReady={onReady} />;
  if (m.kind === 'gallery') return <TkGallery item={item} active={active} onReady={onReady} />;
  if (m.kind === 'image') return <div className="tk-img"><SafeImg url={m.src || m.mid} onLoad={onReady} /></div>;
  return null;
}

// The thin line at the bottom of a video: how far it is, and drag it to jump.
function TkProgress({ vref, active, slideRef }) {
  const bar = useRef(null);
  const [scrub, setScrub] = useState(null);
  useEffect(() => {
    if (!active) return undefined;
    let raf = 0;
    const loop = () => {
      const v = vref.current;
      if (v && v.duration && isFinite(v.duration) && bar.current) bar.current.style.width = `${(v.currentTime / v.duration) * 100}%`;
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

function Slide({ item: initial, active, preload, onStrong, lock, onNext, onLeave }) {
  const { toast, refreshMeta, setFilters, runSearch, kinks: allKinks } = useApp();
  const [item, setItem] = useState(() => withChanges(initial));
  const [fx, setFx] = useState(null);
  const [heat, setHeat] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [kinkPick, setKinkPick] = useState(false);
  const vref = useRef(null);
  const slideRef = useRef(null);
  const stageRef = useRef(null);
  const zoomRef = useRef(null);
  const fired = useRef(false);
  const strong = (why) => { if (fired.current) return; fired.current = true; onStrong?.(item, why); };
  // The heart shows where you double-tapped; other reactions in the middle.
  const fxAt = useRef(null);
  const play = (kind) => { setFx({ kind, key: Date.now() + Math.random(), ...(fxAt.current || {}) }); fxAt.current = null; };
  const acts = usePostActions(item, setItem, {
    play, strong, toast, refreshMeta,
    onDown: (on) => { if (on) setSheet('dislike'); },
    onHide: () => { setSheet(null); setHidden('hide'); }
  });
  useEffect(() => { if (item.hiddenNow && !hidden) setHidden('hide'); }, [item.hiddenNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const pinch = usePinch(stageRef, zoomRef, active, setZoomed);
  useEffect(() => { lock(`z${item.id}`, active && zoomed); }, [active, zoomed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { lock(`s${item.id}`, active && !!sheet); }, [active, sheet]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { lock(`z${item.id}`, false); lock(`s${item.id}`, false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
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

  const isVideo = item.media?.kind === 'video' || item.media?.kind === 'redgifs';
  const isEmbed = item.media?.kind === 'embed';
  const tap = useRef({ t: 0, timer: null });
  useEffect(() => () => clearTimeout(tap.current.timer), []);
  function onTap(e) {
    if (e.target.closest('button, a, iframe, input, select, .tk-embednote')) return;
    if (pinch.recentGesture()) return;
    const r = tap.current;
    const now = Date.now();
    const box = stageRef.current.getBoundingClientRect();
    if (now - r.t < 300) {
      clearTimeout(r.timer);
      r.t = 0;
      if (pinch.zoomedNow()) { pinch.reset(); return; }
      // Players from other sites never like on a tap.
      if (!isEmbed) { fxAt.current = { y: Math.round(e.clientY - box.top), x: Math.round(e.clientX - box.left) }; acts.like(); }
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
  const who = id.handle ? 'profile' : id.performer ? `performer:${id.performer}` : null;
  const leaveTo = (fn) => { onLeave(); setTimeout(fn, 30); };
  const title = item.title || '';
  const sub = [id.sub[0], ago(item.created)].filter(Boolean).join(' · ');

  const sheetView = (() => {
    if (!sheet) return null;
    const close = () => setSheet(null);
    if (sheet === 'heat') {
      return (
        <Sheet title={t('How hot was this')} onClose={close}>
          <div className="tk-heat"><HeatSlider value={item.rating || 0} onChange={acts.rate} onLive={(v, phase) => setHeat((cur) => (cur && cur.phase === 'live' ? { ...cur, v, phase } : { v, phase, key: Date.now() }))} /></div>
          <p className="wnote">{t('Two flames or more also likes it.')}</p>
        </Sheet>
      );
    }
    if (sheet === 'dislike') return <Sheet title={t("I don't like this")} onClose={close}><DislikeNote id={item.id} /></Sheet>;
    if (sheet === 'comments') return <Sheet title={t('Comments')} onClose={close} tall><CommentsPanel item={item} /></Sheet>;
    if (sheet === 'why') return <Sheet title={t('Why this')} onClose={close} tall><WhyPanel item={item} /></Sheet>;
    if (sheet === 'ask') return <Sheet title={t('Ask the assistant')} onClose={close} tall><AskPanel item={item} onPatch={(p) => { if (p.hidden) setHidden('hide'); else if (p.reasonTags) acts.update({ tags: [...new Set([...p.reasonTags, ...(item.tags || [])])], liked: p.reasonTags }); else acts.update(p); }} /></Sheet>;
    if (sheet === 'profile') return <Sheet title={id.name} onClose={close} tall><ProfilePanel item={item} onBlocked={() => { close(); setHidden('block'); }} /></Sheet>;
    if (sheet.startsWith('performer:')) return <Sheet title={sheet.slice(10)} onClose={close} tall><PerformerPanel name={sheet.slice(10)} itemId={item.id} onBlocked={() => { close(); setHidden('block'); }} /></Sheet>;
    if (sheet.startsWith('person:')) { const [platform, ...h] = sheet.slice(7).split('|'); return <Sheet title={h.join('|')} onClose={close} tall><PersonPanel key={sheet} item={item} person={{ platform, handle: h.join('|') }} /></Sheet>; }
    if (sheet === 'tags') {
      return (
        <Sheet title={t('Kinks and tags')} onClose={close}>
          {item.performers?.length || item.people?.length ? (
            <div className="tk-sec"><span className="fb-label">{t('In this video')}</span><div className="chiprow all">
              {(item.performers || []).map((p) => <button type="button" key={p} className="chip ghost btn" onClick={() => { setSheet(`performer:${p}`); strong('performer'); }}><Icon name="person" />{String(p).replace(/^@+/, '')}</button>)}
              {(item.people || []).map((p) => <button type="button" key={p.handle} className="chip ghost btn" onClick={() => setSheet(`person:${p.platform || 'any'}|${p.handle}`)}><Icon name="person" />{String(p.handle).replace(/^@+/, '')}</button>)}
            </div></div>
          ) : null}
          <div className="tk-sec"><span className="fb-label">{t('Kinks')}</span><div className="chiprow all">
            {(item.kinks || []).map((k) => (
              <span key={k.id} className="chip link kchip" style={{ '--c': k.color, '--c2': rgba(k.color, 0.16) }}>
                <button type="button" onClick={() => leaveTo(() => setFilters({ kink: k.id }))}>{k.name}</button>
                <button type="button" className="kx" onClick={() => acts.setKink(k, false)} aria-label={t('This post is not {name}', { name: k.name })}><Icon name="x" /></button>
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
                <button type="button" onClick={() => leaveTo(() => runSearch(tag).catch(() => setFilters({ tags: [tag] })))}>{tag}</button>
                <button type="button" className="kx" onClick={() => acts.dropTag(tag)} aria-label={t('Take {tag} off this post', { tag })} title={t('Does not fit: take it off')}><Icon name="x" /></button>
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
      <div className="tk-stage" ref={stageRef} onClick={onTap}>
        <div className="tk-zoom" ref={zoomRef}>
          <TkMedia item={item} active={active && !hidden} preload={preload} vref={vref} onReady={() => setReady(true)} onPlay={() => strong('play')} />
        </div>
        <PostFx fx={fx} />
        <HeatFx heat={heat} />
        {isVideo ? <span className="tk-pausedicon" aria-hidden="true"><Icon name="play" filled /></span> : null}
      </div>
      <div className="tk-shade" aria-hidden="true" />
      <div className="tk-rail">
        <button type="button" className="tk-av" onClick={() => who && setSheet(who)} aria-label={t('Show profile of {name}', { name: id.name })} disabled={!who}>
          {item.media?.avatar ? <img className="avatar av-m avimg" src={item.media.avatar} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <Avatar name={id.name} />}
        </button>
        <button type="button" className={`tk-b up${item.vote > 0 ? ' on' : ''}`} onClick={() => acts.vote(1)} aria-label={t('I like this')}><Icon name="up" /><span>{item.upvotes != null ? fmtNum(item.upvotes) : ''}</span></button>
        <button type="button" className={`tk-b down${item.vote < 0 ? ' on' : ''}`} onClick={() => acts.vote(-1)} aria-label={t("I don't like this")}><Icon name="down" /></button>
        <button type="button" className={`tk-b hot${item.rating ? ' on' : ''}`} style={{ '--h': (item.rating || 0) / 5 }} onClick={() => setSheet('heat')} aria-label={t('How hot was this')}><Icon name="flame" filled={!!item.rating} /><span>{item.rating ? String(item.rating).replace('.', ',') : ''}</span></button>
        {HAS_COMMENTS.has(item.source) ? <button type="button" className="tk-b" onClick={() => { setSheet('comments'); strong('comments'); }} aria-label={t('Comments')}><Icon name="comment" /><span>{item.comments ? fmtNum(item.comments) : ''}</span></button> : null}
        <button type="button" className={`tk-b save${item.saved ? ' on' : ''}`} onClick={acts.save} aria-label={item.saved ? t('Unsave') : t('Save')}><Icon name="save" filled={item.saved} /></button>
        <button type="button" className="tk-b" onClick={() => setSheet('more')} aria-label={t('More actions')}><Icon name="dots" filled /></button>
      </div>
      <div className="tk-info">
        <button type="button" className="tk-who" onClick={() => who && setSheet(who)} disabled={!who}><strong>{id.name}</strong><span>{sub}</span></button>
        {title ? <button type="button" className="tk-title" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{title}</button> : null}
        {open ? (
          <div className="tk-text">
            {item.body ? <p>{item.body}</p> : null}
            {item.aiSummary ? <p className="aisum">{item.aiSummary}</p> : null}
            <p className="wnote">{[LABELS[item.label], t('{n}% match', { n: item.match }), formatMeta(item)].filter(Boolean).join(' · ')}</p>
          </div>
        ) : null}
        <div className="tk-tags">
          {(item.performers || []).slice(0, 3).map((p) => <button type="button" key={`p${p}`} className="tk-chip perf" onClick={() => { setSheet(`performer:${p}`); strong('performer'); }}><Icon name="person" />{String(p).replace(/^@+/, '')}</button>)}
          {(item.kinks || []).map((k) => <button type="button" key={`k${k.id}`} className="tk-chip kink" style={{ '--c': k.color }} onClick={() => leaveTo(() => setFilters({ kink: k.id }))}>{k.name}</button>)}
          {tags.slice(0, 12).map((tag) => <button type="button" key={tag} className="tk-chip" onClick={() => leaveTo(() => runSearch(tag).catch(() => setFilters({ tags: [tag] })))}>#{tag}</button>)}
        </div>
        <button type="button" className="tk-tagsbtn" onClick={() => setSheet('tags')} aria-label={t('Show all kinks and tags')}><Icon name="tag" /></button>
      </div>
      {isVideo ? <TkProgress vref={vref} active={active} slideRef={slideRef} /> : null}
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

export default function Immersive({ items, startId, onClose, onMore, loading, done, onStrong }) {
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
    const i = list.findIndex((x) => x.id === curId.current);
    if (i >= 0 && i !== cur) { setCur(i); const el = sc.current; if (el) el.scrollTop = i * el.clientHeight; }
  }, [list.map((x) => x.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const re = () => { const el = sc.current; if (el) el.scrollTop = cur * el.clientHeight; };
    window.addEventListener('resize', re);
    return () => window.removeEventListener('resize', re);
  }, [cur]);
  // More posts load before you reach the end.
  useEffect(() => { if (!done && !loading && list.length - cur <= 3) onMore(); }, [cur, list.length, done, loading]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="tk" role="dialog" aria-modal="true" aria-label={t('Full screen')}>
      <div ref={sc} className={`tk-scroll${locks.size ? ' locked' : ''}`} onScroll={onScroll}>
        {list.map((it, i) => (
          <section key={it.id} className="tk-slide" aria-hidden={i !== cur}>
            {Math.abs(i - cur) <= 2
              ? <Slide item={it} active={i === cur} preload={i === cur + 1} onStrong={onStrong} lock={lock} onNext={() => go(1)} onLeave={close} />
              : <div className="tk-s tk-far" />}
          </section>
        ))}
        <section className="tk-slide tk-endslide">
          {done ? (
            <div className="tk-endmsg"><p>{t('Nothing more matches right now.')}</p><button type="button" className="ghost-btn small accent" onClick={close}><Icon name="x" />{t('Back to the feed')}</button></div>
          ) : <span className="finding"><span className="spin" />{t('Loading more…')}</span>}
        </section>
      </div>
      <div className="tk-top">
        <button type="button" className="tk-tb" onClick={close} aria-label={t('Close full screen')}><Icon name="chevD" /></button>
        <MuteBtn />
      </div>
    </div>,
    document.body
  );
}

