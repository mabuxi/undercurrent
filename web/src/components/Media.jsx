import { useEffect, useRef, useState } from 'react';
import { api, fmtDur, proxied, rgba, track } from '../api.js';
import { Icon } from '../icons.jsx';
import { soundOn, setSound, onSound, soundBlocked } from '../sound.js';
import Linkify from './Linkify.jsx';
import { t, tn } from '../i18n.js';
import { useTranslate, TranslateButton, TranslatedNote } from './Translate.jsx';
import { useZoomFullscreen } from './Zoom.jsx';
import { useTkOpen } from '../tk.js';

let HlsLib = null;
async function loadHls() {
  if (!HlsLib) HlsLib = (await import('hls.js')).default;
  return HlsLib;
}

function Badge({ format }) {
  if (format === 'long') return <span className="badge b-long"><Icon name="clock" />{t('Long form')}</span>;
  if (format === 'short') return <span className="badge b-short"><Icon name="loop" />{t('Short form')}</span>;
  if (format === 'gif') return <span className="badge b-gif">GIF</span>;
  return null;
}

// Media far away from the screen (a few screens up or down) lets go of its video and player, so a long session
// does not keep dozens of videos loaded. It loads again when you scroll back.
function useFar(ref, onFar) {
  const cb = useRef(onFar);
  cb.current = onFar;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    // An element taken out of the page (a player swapped for another) is not far away.
    const io = new IntersectionObserver(([e]) => { if (!e.isIntersecting && e.target.isConnected) cb.current(); }, { rootMargin: '2500px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
}

export function VideoPlayer({ item, active, onPlay, onReady, onFull, onFail, inTk = false, preload = false, exposeRef }) {
  // In the feed nothing plays while the full screen viewer covers it; the viewer's own players are not affected.
  const tkOpen = useTkOpen();
  const covered = tkOpen && !inTk;
  const [hover, setHover] = useState(false);
  const ref = useRef(null);
  const hlsRef = useRef(null);
  const [src, setSrc] = useState(item.media.kind === 'video' ? item.media.src : item.media.hd || item.media.sd || null);
  const [hlsUrl, setHlsUrl] = useState(item.media.hls || null);
  const [armed, setArmed] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const [poster, setPoster] = useState(item.media.poster || null);
  const [muted, setMuted] = useState(!soundOn());
  const prog = useRef(false);
  const applyMuted = (m) => { setMuted(m); const v = ref.current; if (v && v.muted !== m) { prog.current = true; v.muted = m; } };
  useEffect(() => onSound((on) => applyMuted(!on)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { if (error) onFail?.(error); }, [error]); // eslint-disable-line react-hooks/exhaustive-deps
  const [triedProxy, setTriedProxy] = useState(false);
  const [progress, setProgress] = useState(0);
  const readyFired = useRef(false);
  const watch = useRef({ maxQ: 0, loops: 0, mark: 0, last: 0, completed: false, rew: 0 });
  const loop = item.format !== 'long';
  const [ar, setAr] = useState(item.width && item.height ? item.width / item.height : null);
  // On a phone, going full screen from the feed (the player's own button too) opens the full screen viewer instead.
  const fullRef = useRef(onFull);
  fullRef.current = onFull;
  const hasFull = !!onFull && !inTk;
  useEffect(() => {
    const v = ref.current;
    if (!v || !hasFull) return undefined;
    const go = () => {
      setTimeout(() => {
        try { if (v.webkitDisplayingFullscreen) v.webkitExitFullscreen?.(); } catch {}
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      }, 60);
      fullRef.current?.();
    };
    const fc = () => { if (document.fullscreenElement === v || document.webkitFullscreenElement === v) go(); };
    v.addEventListener('webkitbeginfullscreen', go);
    document.addEventListener('fullscreenchange', fc);
    document.addEventListener('webkitfullscreenchange', fc);
    return () => {
      v.removeEventListener('webkitbeginfullscreen', go);
      document.removeEventListener('fullscreenchange', fc);
      document.removeEventListener('webkitfullscreenchange', fc);
    };
  }, [hasFull, src, hlsUrl, armed]);

  useEffect(() => { if ((active || hover || preload) && !armed) setArmed(true); }, [active, hover, armed, preload]);
  const wrapRef = useRef(null);
  const boxRef = useRef(null);
  const zoom = useZoomFullscreen(boxRef);
  const [holdH, setHoldH] = useState(null);
  const openFs = () => { setHoldH(wrapRef.current?.offsetHeight || null); zoom.open(); };
  useEffect(() => { if (!zoom.fs) setHoldH(null); }, [zoom.fs]);
  useFar(wrapRef, () => {
    if (!armed || zoom.fs || inTk) return;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    const v = ref.current;
    if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
    setArmed(false);
  });

  useEffect(() => {
    if (item.media.kind !== 'redgifs' || src || !armed) return;
    setLoading(true);
    api(`/media/redgifs/${item.media.redgifsId}`).then((r) => {
      setSrc(r.hd || r.sd);
      if (!poster && r.poster) setPoster(r.poster);
    }).catch((err) => { setError(err.message); setLoading(false); });
  }, [armed, item.media, src, poster]);

  useEffect(() => {
    const v = ref.current;
    if (!v || !armed || (!src && !hlsUrl)) return undefined;
    setLoading(true);
    if (hlsUrl && !v.canPlayType('application/vnd.apple.mpegurl')) {
      let cancelled = false;
      loadHls().then((Hls) => {
        if (cancelled) return;
        if (!Hls.isSupported()) { v.src = src; return; }
        const h = new Hls({ maxBufferLength: 20, startLevel: -1 });
        hlsRef.current = h;
        h.loadSource(hlsUrl);
        h.attachMedia(v);
        h.on(Hls.Events.ERROR, (_, d) => {
          if (!d.fatal) return;
          h.destroy();
          hlsRef.current = null;
          if (!hlsUrl.startsWith('/api/hls')) setHlsUrl(`/api/hls?url=${encodeURIComponent(item.media.hls)}`);
          else if (src && src !== item.media.hls) { setHlsUrl(null); }
          else { setError(t('This video could not be loaded. It may have been removed at the source.')); setLoading(false); }
        });
      });
      return () => { cancelled = true; hlsRef.current?.destroy(); hlsRef.current = null; };
    }
    v.src = hlsUrl || src;
    return undefined;
  }, [src, hlsUrl, triedProxy, armed]);

  useEffect(() => {
    const v = ref.current;
    if (!v || !armed) return;
    if (((active || hover) && !covered) || zoom.fs) {
      v.play().catch((err) => {
        if (err?.name === 'NotAllowedError' && !v.muted) {
          applyMuted(true);
          soundBlocked();
          v.play().catch(() => {});
        }
      });
    } else v.pause();
  }, [active, hover, armed, src, hlsUrl, zoom.fs, covered]);

  function onError() {
    if (item.media.kind === 'redgifs' && !refreshed) {
      setRefreshed(true);
      api(`/media/redgifs/${item.media.redgifsId}?fresh=1`).then((r) => setSrc(r.hd || r.sd)).catch((err) => setError(err.message));
      return;
    }
    if (hlsUrl) return;
    if (!triedProxy && src && /^https:/.test(src)) {
      setTriedProxy(true);
      setSrc(proxied(src));
      return;
    }
    setLoading(false);
    setError(t('This video could not be loaded. It may have been removed at the source.'));
  }

  // Watch tracking for every video format: quartiles watched, watched to the end, and rewatches.
  // Very short clips have to loop a few times before a loop counts, so scrolling past a 2 second GIF is not a rewatch.
  function finishPass(d) {
    const w = watch.current;
    if (w.maxQ >= 3 && w.maxQ < 4) { track(item.id, 'progress', (4 - w.maxQ) * 0.25); w.maxQ = 4; }
    if (w.maxQ < 3 && !w.completed) return;
    w.loops++;
    const need = Math.max(1, Math.ceil(3 / d));
    const per = Math.max(1, Math.ceil(8 / d));
    if (!w.completed) {
      if (w.loops >= need) { w.completed = true; w.mark = w.loops; track(item.id, 'complete'); }
      return;
    }
    if ((w.loops - w.mark) % per === 0 && w.rew < 3) { w.rew++; track(item.id, 'rewatch', w.rew); }
  }

  function onTime() {
    const v = ref.current;
    if (!v?.duration || !isFinite(v.duration)) return;
    const d = v.duration;
    const ct = v.currentTime;
    const w = watch.current;
    const p = ct / d;
    setProgress(p);
    if (w.last > d * 0.8 && ct < d * 0.2 && !v.seeking && (loop || w.completed)) finishPass(d);
    w.last = ct;
    const q = Math.min(4, Math.floor(p * 4 + 0.001));
    if (!w.completed && q > w.maxQ) { track(item.id, 'progress', (q - w.maxQ) * 0.25); w.maxQ = q; }
  }

  function onEnded() {
    const v = ref.current;
    const w = watch.current;
    if (loop || !v) return;
    if (!w.completed) {
      if (w.maxQ < 4) track(item.id, 'progress', (4 - w.maxQ) * 0.25);
      w.maxQ = 4; w.completed = true; w.mark = 1; w.loops = 1;
      track(item.id, 'complete');
    }
    w.last = v.duration;
  }

  function onMeta() {
    const v = ref.current;
    if (v?.videoWidth && v?.videoHeight) setAr(v.videoWidth / v.videoHeight);
  }

  function playing() {
    setLoading(false);
    if (!readyFired.current) { readyFired.current = true; onReady?.(); }
  }

  function unmute() {
    applyMuted(false);
    setSound(true);
    track(item.id, 'play');
    onPlay?.();
  }

  const vertical = (item.height || 0) > (item.width || 0) * 1.1 || item.format === 'short';
  const cls = ar ? `media natural${ar < 0.9 ? ' tall' : ''}` : item.format === 'long' ? 'media land' : item.format === 'gif' ? 'media gifm real' : vertical ? 'media vert' : 'media land';
  const c = item.kinks?.[0]?.color || '#E39A83';
  const style = { '--c': rgba(c, 0.55), '--c2': rgba(c, 0.3), ...(ar ? { '--ar': Math.max(0.4, Math.min(2.6, ar)) } : {}) };
  return (
    <div className="vidwrap" ref={wrapRef} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={holdH ? { minHeight: holdH } : undefined}>
      <div className={`${cls}${zoom.fs ? ' fsbox' : ''}`} style={style} ref={boxRef}>
        {src || hlsUrl ? (
          <video
            ref={(el) => { ref.current = el; if (exposeRef) exposeRef.current = el; }}
            poster={poster ? (triedProxy ? proxied(poster) : poster) : undefined}
            muted={muted}
            loop={loop}
            playsInline
            preload={armed ? 'auto' : 'metadata'}
            controls={armed && !inTk}
            controlsList="nofullscreen"
            onError={onError}
            onTimeUpdate={onTime}
            onPlaying={playing}
            onWaiting={() => setLoading(true)}
            onCanPlay={() => setLoading(false)}
            onVolumeChange={(e) => { if (prog.current) { prog.current = false; return; } const m = e.currentTarget.muted; setMuted(m); if (!m && !soundOn()) { setSound(true); track(item.id, 'play'); onPlay?.(); } else if (m && soundOn()) setSound(false); }}
            onEnded={onEnded}
            onLoadedMetadata={onMeta}
          />
        ) : poster ? <img src={poster} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}
        {!inTk && !(onFull && armed) ? <Badge format={item.format} /> : null}
        {item.duration && !inTk && !(onFull && armed) ? <span className="dur">{fmtDur(item.duration)}</span> : null}
        {loading && !error ? <span className="spinner" aria-label={t('Loading video')} /> : null}
        {!inTk && item.media.hasAudio !== false && (src || hlsUrl) && armed ? (
          <button type="button" className={`mutebtn${muted ? '' : ' on'}`} onClick={(e) => { e.stopPropagation(); if (muted) unmute(); else { setSound(false); } }} aria-label={muted ? t('Turn sound on') : t('Turn sound off')} title={muted ? t('Sound on for every video') : t('Sound off for every video')}>
            <Icon name={muted ? 'mute' : 'volume'} />
          </button>
        ) : null}
        {(src || hlsUrl) && armed && !zoom.fs && !inTk ? <button type="button" className={`fsbtn${onFull ? ' tl' : ''}`} onClick={(e) => { e.stopPropagation(); if (onFull) onFull(); else openFs(); }} aria-label={t('Full screen')} title={onFull ? t('Full screen') : t('Full screen: pinch or double-tap to zoom')}><Icon name="expand" /></button> : null}
        {zoom.fs ? <button type="button" className="fsclose" onClick={(e) => { e.stopPropagation(); zoom.close(); }} aria-label={t('Close full screen')}><Icon name="x" /></button> : null}
        {error ? <div className="mediaerr">{error}</div> : null}
      </div>
      {item.format === 'long' && !inTk ? (
        <div className="longbar" aria-hidden="true"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
      ) : null}
    </div>
  );
}

const NEEDS_PROXY = /^https:\/\/pix-[^/]*\.phncdn\.com\//;
function expired(u) {
  const m = /[?&]validto=(\d+)/.exec(u || '');
  return m ? Number(m[1]) * 1000 < Date.now() + 60_000 : false;
}
function thumbSrc(u, forceProxy) {
  if (!u) return u;
  return forceProxy || NEEDS_PROXY.test(u) ? proxied(u) : u;
}

// Sites whose player an iPhone often shows black: on a phone their video file is played in the phone's own player
// instead, through the Mac. Their own player stays the fallback.
export const DIRECT = new Set(['pornhub', 'redtube', 'youporn', 'eporner']);

// Only these permissions: the player can run and go fullscreen, but it cannot open new windows or tabs
// (that is what the "first click opens your browser" ads do) and cannot navigate this page away.
const SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-forms';

export function EmbedPlayer({ item, active, onPlay, onReady, onFull, sandboxed = true }) {
  const [m, setM] = useState(item.media);
  const thumbs = (m.thumbs?.length ? m.thumbs : [m.poster]).filter(Boolean);
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  const [playing, setPlaying] = useState(false);
  const embedRef = useRef(null);
  useFar(embedRef, () => { if (playing) setPlaying(false); });
  // The full screen viewer takes over: the player in the feed stops, so two never play at once.
  const tkOpen = useTkOpen();
  useEffect(() => { if (tkOpen && playing) setPlaying(false); }, [tkOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const [proxyAll, setProxyAll] = useState(false);
  const [dead, setDead] = useState(false);
  const [posterOk, setPosterOk] = useState(true);
  const ready = useRef(new Set());
  const bad = useRef(new Set());
  const refreshed = useRef(false);
  const short = item.format === 'short';
  // On a phone (where the full screen viewer exists) these sites play in the phone's own player.
  const [direct, setDirect] = useState(null);
  const tryDirect = !!onFull && DIRECT.has(item.source);
  const iframeRef = useRef(null);
  const fullRef = useRef(onFull);
  fullRef.current = onFull;
  useEffect(() => {
    if (!onFull || !playing) return undefined;
    const fc = () => {
      const el = document.fullscreenElement || document.webkitFullscreenElement;
      if (el && el === iframeRef.current) { document.exitFullscreen?.().catch(() => {}); fullRef.current?.(); }
    };
    document.addEventListener('fullscreenchange', fc);
    document.addEventListener('webkitfullscreenchange', fc);
    return () => { document.removeEventListener('fullscreenchange', fc); document.removeEventListener('webkitfullscreenchange', fc); };
  }, [!!onFull, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = async () => {
    if (refreshed.current) { setDead(true); return; }
    refreshed.current = true;
    try {
      const r = await api(`/items/${item.id}/refresh-media`, { method: 'POST', body: {} });
      if (r.media) { ready.current = new Set(); bad.current = new Set(); setM(r.media); setI(0); setPosterOk(true); setProxyAll(false); }
      else setDead(true);
    } catch { setDead(true); }
  };

  useEffect(() => { if ((active || hover) && expired(m.poster || thumbs[0])) refresh(); }, [active, hover]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewing = (active || hover) && !playing && thumbs.length > 1;
  useEffect(() => {
    if (!previewing) return undefined;
    let alive = true;
    const load = (idx) => {
      const u = thumbs[idx];
      if (!u || ready.current.has(u) || bad.current.has(u)) return;
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.onload = () => { ready.current.add(u); };
      img.onerror = () => {
        if (!proxyAll && !NEEDS_PROXY.test(u)) { const p = new Image(); p.onload = () => { ready.current.add(u); if (alive) setProxyAll(true); }; p.onerror = () => bad.current.add(u); p.src = proxied(u); }
        else bad.current.add(u);
      };
      img.src = thumbSrc(u, proxyAll);
    };
    for (let k = 0; k < Math.min(4, thumbs.length); k++) load(k);
    const tm = setInterval(() => {
      setI((cur) => {
        for (let step = 1; step <= thumbs.length; step++) {
          const nx = (cur + step) % thumbs.length;
          load((nx + 2) % thumbs.length);
          if (ready.current.has(thumbs[nx])) return nx;
          if (!bad.current.has(thumbs[nx])) { load(nx); return cur; }
        }
        return cur;
      });
    }, short ? 550 : 750);
    return () => { alive = false; clearInterval(tm); };
  }, [previewing, thumbs.join('|'), proxyAll, short]); // eslint-disable-line react-hooks/exhaustive-deps

  function onPosterError() {
    if (!proxyAll) { setProxyAll(true); return; }
    if (i !== 0) { bad.current.add(thumbs[i]); setI(0); return; }
    setPosterOk(false);
    refresh();
  }

  function play() {
    setPlaying(true);
    track(item.id, 'play');
    onPlay?.();
    if (tryDirect && direct === null) {
      setDirect('wait');
      api(`/items/${item.id}/direct`).then((r) => setDirect(r.direct || false)).catch(() => setDirect(false));
    }
  }

  const c = item.kinks?.[0]?.color || '#E39A83';
  const shown = ready.current.has(thumbs[i]) || i === 0 ? thumbs[i] : m.poster;
  const embedUrl = m.embed && short && !/autoplay/.test(m.embed) ? `${m.embed}${m.embed.includes('?') ? '&' : '?'}autoplay=1` : m.embed;
  if (playing && direct && direct !== 'wait') {
    const vItem = { ...item, media: { kind: 'video', src: direct.kind === 'mp4' ? direct.src : undefined, hls: direct.kind === 'hls' ? direct.src : undefined, poster: m.poster ? proxied(m.poster) : undefined, hasAudio: true } };
    return <VideoPlayer item={vItem} active={active} onReady={onReady} onFull={onFull} onFail={() => setDirect(false)} />;
  }
  const fsBtn = onFull ? <button type="button" className="fsbtn emb" onClick={(e) => { e.stopPropagation(); onFull(); }} aria-label={t('Full screen')} title={t('Full screen')}><Icon name="expand" /></button> : null;
  if (dead && !playing) {
    return <div className="media land embed-dead" style={{ '--c': rgba(c, 0.4), '--c2': rgba(c, 0.18) }}><span>{t('This video is no longer available on {provider}.', { provider: m.provider })}</span></div>;
  }
  return (
    <div ref={embedRef} tabIndex={-1} className={`vidwrap${short ? ' tube-short' : ''}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className={`media land${short ? ' shortland' : ''}`} style={{ '--c': rgba(c, 0.55), '--c2': rgba(c, 0.3) }}>
        {playing && direct === 'wait' ? (
          <>
            {shown && posterOk ? <img src={thumbSrc(shown, proxyAll)} alt="" referrerPolicy="no-referrer" /> : null}
            <span className="spinner" aria-label={t('Loading video')} />
          </>
        ) : playing ? (
          <iframe ref={iframeRef} key={sandboxed ? 's' : 'u'} src={embedUrl} title={item.title} sandbox={sandboxed ? SANDBOX : undefined} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        ) : (
          <>
            {shown && posterOk ? <img src={thumbSrc(shown, proxyAll)} alt="" loading={active ? 'eager' : 'lazy'} referrerPolicy="no-referrer" onError={onPosterError} onLoad={() => onReady?.()} /> : null}
            <Badge format={item.format} />
            {item.duration ? <span className="dur">{fmtDur(item.duration)}</span> : null}
            <span className="provider">{m.provider}</span>
            <button type="button" className="play" onClick={play} aria-label={t('Play in the {provider} player', { provider: m.provider })}><Icon name="play" filled /></button>
          </>
        )}
        {fsBtn}
      </div>
      {!playing && thumbs.length > 1 ? <div className="longbar" aria-hidden="true"><i style={{ width: `${Math.round(((i + 1) / thumbs.length) * 100)}%` }} /></div> : null}
    </div>
  );
}

export function ImageMedia({ item, src, mid, single = true, onReady }) {
  const [big, setBig] = useState(false);
  const [url, setUrl] = useState(mid || src);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setUrl(big ? src || mid : mid || src); }, [big, src, mid]);
  function onError() {
    if (!failed && /^https:/.test(url)) { setFailed(true); setUrl(proxied(url)); }
  }
  return (
    <button type="button" className={`imgbtn ${single ? 'single' : ''} ${big ? 'big' : ''}`} onClick={() => { setBig((b) => !b); if (!big) track(item.id, 'open'); }} aria-label={big ? t('Show smaller') : t('Show larger')}>
      <img src={url} alt={item.title} loading="lazy" referrerPolicy="no-referrer" onError={onError} onLoad={() => onReady?.()} />
    </button>
  );
}

export function Gallery({ item, onReady }) {
  const items = item.media.items || [];
  const [open, setOpen] = useState(null);
  const [failed, setFailed] = useState({});
  const srcOf = (g, full) => {
    const u = full ? g.src || g.mid : g.mid || g.src;
    return failed[u] ? proxied(u) : u;
  };
  if (open !== null) {
    const g = items[open];
    return (
      <div className="viewer">
        {g.title && item.collection ? <div className="viewer-cap">{g.title}{g.source ? ` · ${g.source}` : ''}</div> : null}
        {g.type === 'video'
          ? <video src={g.src} autoPlay muted loop playsInline controls />
          : <img src={srcOf(g, true)} alt="" referrerPolicy="no-referrer" onError={() => setFailed((f) => ({ ...f, [g.src || g.mid]: true }))} />}
        <div className="viewer-bar">
          <button type="button" className="icon-btn" onClick={() => setOpen((open - 1 + items.length) % items.length)} aria-label={t('Previous image')}><Icon name="chevL" /></button>
          <span className="count">{open + 1} / {items.length}</span>
          <button type="button" className="icon-btn" onClick={() => { const n = (open + 1) % items.length; setOpen(n); if (items[n].itemId && items[n].itemId !== g.itemId) track(items[n].itemId, 'open'); }} aria-label={t('Next image')}><Icon name="chevR" /></button>
          <button type="button" className="ghost-btn small" onClick={() => setOpen(null)}><Icon name="x" />{t('Close')}</button>
        </div>
      </div>
    );
  }
  // One big image, smaller ones beside it, and the last small one says how many more there are.
  const show = items.slice(0, 4);
  const coll = item.collection;
  return (
    <div className="galwrap">
      {coll ? <div className="collnote"><Icon name="grid" />{coll.why}{coll.sources.length > 1 ? ` · ${t('from {list}', { list: coll.sources.join(` ${t('and')} `) })}` : ''}</div> : null}
      <div className={`gallery g${show.length}`}>
        {show.map((g, i) => (
          <button type="button" key={i} className={`gtile${i === 0 ? ' big' : ''}`} onClick={() => { setOpen(i); track(g.itemId || item.id, 'open'); }} aria-label={t('Open image {i} of {n}', { i: i + 1, n: items.length })}>
            {g.type === 'video' ? <video src={g.src} muted loop autoPlay playsInline onPlaying={() => onReady?.()} /> : <img src={srcOf(g, false)} alt="" loading="lazy" referrerPolicy="no-referrer" onLoad={() => onReady?.()} onError={() => setFailed((f) => ({ ...f, [g.mid || g.src]: true }))} />}
            {i === show.length - 1 && items.length > show.length ? <span className="more-n">+{items.length - show.length}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function Paragraphs({ text, source, onPerson }) {
  return String(text || '').split(/\n{2,}/).map((p, i) => <p key={i}><Linkify text={p} source={source} onPerson={onPerson} /></p>);
}

export function readMinutes(item) {
  if (item.media?.readMin) return item.media.readMin;
  const words = String(item.body || '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}

export function TopReplies({ item, compact = false }) {
  const [top, setTop] = useState(item.media?.top || null);
  const [pending, setPending] = useState(false);
  const [n, setN] = useState(2);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (item.media?.topAt || item.format !== 'discussion') return undefined;
    let alive = true;
    setPending(true);
    api(`/items/${item.id}/top`).then((r) => { if (alive) { setTop(r.top || []); setPending(!!r.pending); } }).catch(() => { if (alive) setPending(false); });
    return () => { alive = false; };
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function more(count) {
    setLoading(true);
    try {
      const r = await api(`/items/${item.id}/top?n=${count}`);
      if (r.top?.length) { setTop(r.top); setN(count); }
      track(item.id, 'comments');
    } catch { /* keep what is shown */ } finally { setLoading(false); }
  }
  if (!top?.length) return pending && !compact ? <p className="replies-wait">{t('Top replies are on their way…')}</p> : null;
  const shown = top.slice(0, compact ? 2 : Math.max(2, n));
  const canMore = !compact && (item.comments || 0) > shown.length && n < 40;
  return (
    <div className={`topreplies${compact ? ' compact' : ''}`}>
      {shown.map((c, i) => (
        <div key={i} className="topreply">
          <span className="ra">{c.author || t('someone')}{c.score != null ? <em>▲ {c.score >= 1000 ? `${(c.score / 1000).toFixed(1)}k` : c.score}</em> : null}</span>
          <p>{compact && c.body.length > 220 ? `${c.body.slice(0, 220).replace(/\s+\S*$/, '')}…` : c.body}</p>
          {!compact && c.replies?.length ? <div className="subreplies">{c.replies.map((r, j) => <div key={j} className="topreply sub"><span className="ra">{r.author || t('someone')}{r.score != null ? <em>▲ {r.score}</em> : null}</span><p>{r.body}</p></div>)}</div> : null}
        </div>
      ))}
      {canMore ? (
        <div className="morereplies">
          <button type="button" className="ghost-btn small" disabled={loading} onClick={() => more(n < 10 ? 10 : 40)}><Icon name="comment" />{loading ? t('Loading replies…') : n < 10 ? t('More replies') : t('All replies')}</button>
          {n < 10 ? <button type="button" className="linkbtn" disabled={loading} onClick={() => more(40)}>{t('Load all')}</button> : null}
        </div>
      ) : null}
    </div>
  );
}

export function TextBody({ item, onPerson }) {
  const [open, setOpen] = useState(false);
  const trTitle = useTranslate(item, 'title');
  const trBody = useTranslate(item, 'body');
  const body = trBody.text || item.body || '';
  // On a phone a story starts shorter, so the whole post fits on the screen; "Continue reading" opens the rest.
  const phone = window.innerWidth <= 900;
  const cut = phone ? 380 : 900;
  const short = body.length > cut ? `${body.slice(0, cut).replace(/\s+\S*$/, '')}…` : body;
  const c = item.kinks?.[0]?.color || '#E39A83';
  const story = item.format === 'story';
  return (
    <div className={story ? 'story' : 'thread'} style={{ '--c': c }}>
      {story ? <span className="kicker">{t('Story · {n} min read', { n: readMinutes(item) })}{item.flair ? ` · ${item.flair}` : ''}</span> : <span className="kicker thread-k">{t('Thread')}{item.community ? ` · ${item.community}` : ''}</span>}
      <h3><Linkify text={trTitle.text || item.title} source={item.source} onPerson={onPerson} /><TranslateButton tr={trTitle} small /><TranslatedNote tr={trTitle} /></h3>
      {body ? <div className="ptext prose"><Paragraphs text={open ? body : short} source={item.source} onPerson={onPerson} /></div> : null}
      {!story ? <TopReplies item={item} compact={phone && !open} /> : null}
      <div className="rowline">
        <TranslateButton tr={trBody} />
        <TranslatedNote tr={trBody} />
        {body.length > cut || (phone && !story && !open && item.comments > 2) ? <button type="button" className="ghost-btn small" onClick={() => { setOpen((o) => !o); if (!open) track(item.id, 'open'); }}><Icon name="book" />{open ? t('Show less') : t('Continue reading')}</button> : null}
        <span className="read">{story ? t('about {n} min to read', { n: readMinutes(item) }) : tn(item.comments, '{n} reply', '{n} replies')}</span>
      </div>
    </div>
  );
}

export function Media({ item, active, near = true, height, onPlay, onReady, onPerson, onLike, onFull, sandboxed }) {
  const m = item.media || {};
  useEffect(() => { if (m.kind === 'text' || !m.kind) onReady?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!near && m.kind !== 'text') return <div className="media-sleep" style={{ height: height || 320 }} aria-hidden="true" />;
  if (m.kind === 'embed') return <EmbedPlayer item={item} active={active} onPlay={onPlay} onReady={onReady} onFull={onFull} sandboxed={sandboxed} />;
  if (m.kind === 'video' || m.kind === 'redgifs') return <VideoPlayer item={item} active={active} onPlay={onPlay} onReady={onReady} onFull={onFull} />;
  if (m.kind === 'gallery') return <Gallery item={item} onReady={onReady} />;
  if (m.kind === 'image') return <ImageMedia item={item} src={m.src} mid={m.mid} onReady={onReady} />;
  if (m.kind === 'text') return <TextBody item={item} onPerson={onPerson} />;
  return null;
}
