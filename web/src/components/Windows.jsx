import { useEffect, useRef, useState } from 'react';
import { api, fmtDur, fmtNum, formatMeta, rgba, proxied, imgSrc, sessionId, ago } from '../api.js';
import { useApp, MOODS } from '../context.jsx';
import { Icon } from '../icons.jsx';
import { Avatar, HeatSlider, plain } from './Panels.jsx';
import { TopReplies } from './Media.jsx';
import { drawMap } from '../mapdraw.js';
import { t, tn } from '../i18n.js';

function thumbUrl(it) {
  const m = it.media || {};
  return m.poster || m.thumbs?.[0] || m.thumb || m.mid || (m.kind === 'image' ? m.src : null) || m.items?.[0]?.mid || m.items?.[0]?.src || null;
}

// Tries the image directly, then through the local proxy, then gives up quietly (no broken-image icon).
function SafeImg({ url }) {
  const [stage, setStage] = useState(0);
  if (!url || stage > 1) return null;
  const first = imgSrc(url);
  const src = stage === 0 ? first : proxied(url);
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setStage(src === proxied(url) ? 2 : 1)} />;
}

function Thumb({ it, shape }) {
  const url = thumbUrl(it);
  const c = it.kinks?.[0]?.color || '#E39A83';
  if (shape === 'txt' || !url) return <span className={`thumb ${shape === 'txt' ? 'txt' : shape}`} style={{ '--c': shape === 'txt' ? c : rgba(c, 0.7) }} />;
  return <span className={`thumb ${shape} img`} style={{ '--c': rgba(c, 0.7) }}><SafeImg url={url} /></span>;
}

const shapeOf = (it) => (it.format === 'long' ? 'land' : it.format === 'short' ? 'vert' : it.format === 'gif' ? 'gif' : it.format === 'image' || it.format === 'set' ? 'sq' : 'txt');

function Mini({ it, onOpen, rank }) {
  return (
    <button type="button" className="mini" onClick={() => onOpen(it)}>
      {rank ? <span className="num">{rank}</span> : null}
      <span className="thumbbox"><Thumb it={it} shape={shapeOf(it)} /></span>
      <span className="mini-text"><span className="mini-title">{it.title}</span><span className="mini-meta">{rank && it.upvotes ? `${t('{n} up', { n: fmtNum(it.upvotes) })} · ` : ''}{formatMeta(it)} · {it.match}%</span></span>
    </button>
  );
}

function Tile({ it, onOpen, vert }) {
  const url = thumbUrl(it);
  const c = it.kinks?.[0]?.color || '#E39A83';
  const cyc = useCycle(it);
  return (
    <button type="button" className={`tile${it.format === 'gif' && !url ? ' gifm' : ''}`} style={{ '--c': rgba(c, 0.7), ...(vert ? { aspectRatio: '9/16' } : {}) }} onClick={() => onOpen(it)} aria-label={it.title} {...cyc.on}>
      <CycleImg cyc={cyc} />
      <span className="tb">{it.format === 'gif' ? 'GIF' : it.format === 'short' || it.format === 'long' ? fmtDur(it.duration) || formatMeta(it) : it.format === 'set' ? t('{n} img', { n: it.media?.items?.length || '' }).trim() : formatMeta(it).split(' · ')[0]}</span>
    </button>
  );
}

function Spot({ it, onOpen, note }) {
  const c = it.kinks?.[0]?.color || '#E39A83';
  const cyc = useCycle(it);
  return (
    <>
      <button type="button" className="mini spotbtn" onClick={() => onOpen(it)} {...cyc.on}>
        <span className="spot"><span className="sm" style={{ '--c': rgba(c, 0.55), '--c2': rgba(c, 0.3) }}><CycleImg cyc={cyc} /></span></span>
        <span className="mini-text"><span className="mini-title wrap">{it.title}</span><span className="mini-meta">{it.author ? `${it.author} · ` : ''}{it.upvotes ? `${t('{n} up', { n: fmtNum(it.upvotes) })} · ` : ''}{it.match}%</span></span>
      </button>
      {note ? <p className="wnote">{note}</p> : null}
    </>
  );
}

function Tonight({ w, setAskOut }) {
  const [s, setS] = useState(w.stats);
  useEffect(() => {
    const load = () => api(`/session/stats?session=${sessionId}`).then(setS).catch(() => {});
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="win-body">
      <div className="sess"><div><b>{s.minutes >= 90 ? `${Math.floor(s.minutes / 60)}h${String(s.minutes % 60).padStart(2, '0')}` : s.minutes}</b><span>{s.minutes >= 90 ? t('tonight') : t('minutes')}</span></div><div><b>{s.seen}</b><span>{t('posts seen')}</span></div><div><b>{s.saved}</b><span>{plain(t('saved [tonight count]'))}</span></div><div><b>{s.rated}</b><span>{t('rated')}</span></div></div>
      <div className="barrow" style={{ padding: '4px 2px' }}><div className="bt"><span>{t('Long vs short')}</span><em>{s.longShare} / {100 - s.longShare}</em></div><div className="track2"><i style={{ width: `${s.longShare}%`, background: 'var(--accent)' }} /></div></div>
      {s.topTagsNow?.length ? <p className="wnote">{t('Right now: {tags}', { tags: s.topTagsNow.join(', ') })}</p> : null}
      <div className="wbtns"><button type="button" className="ghost-btn small" onClick={async () => { setAskOut(t('Summarizing tonight…')); window.scrollTo({ top: 0, behavior: 'smooth' }); try { const r = await api('/session/summary'); setAskOut(r.text); } catch (e) { setAskOut(e.message); } }}>{t('Summarize tonight')}</button></div>
    </div>
  );
}

function thumbsOf(m) {
  if (m.thumbs?.length > 1) return m.thumbs;
  if (m.kind === 'gallery') return (m.items || []).filter((g) => g.type !== 'video').map((g) => g.mid || g.src).slice(0, 6);
  return [thumbUrl({ media: m })].filter(Boolean);
}

function expiredThumb(u) {
  const x = /[?&]validto=(\d+)/.exec(u || '');
  return x ? Number(x[1]) * 1000 < Date.now() + 60_000 : false;
}

// Hover cycling through a video's preview frames, like in the feed: frames are loaded first (directly, then through
// the local proxy) and only shown once they are there, so it never flashes empty. Expired Pornhub frames are renewed.
function useCycle(it) {
  const [media, setMedia] = useState(it.media || {});
  const list = thumbsOf(media);
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  const ready = useRef(new Map());
  const bad = useRef(new Set());
  const busy = useRef(new Set());
  const renewed = useRef(false);
  useEffect(() => {
    if (!hover || renewed.current || !(it.format === 'long' || it.format === 'short') || !expiredThumb(media.poster || list[0])) return;
    renewed.current = true;
    api(`/items/${it.id}/refresh-media`, { method: 'POST', body: {} }).then((r) => { if (r.media) { ready.current = new Map(); bad.current = new Set(); busy.current = new Set(); setMedia(r.media); setI(0); } }).catch(() => {});
  }, [hover]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!hover || list.length < 2) return undefined;
    const load = (idx) => {
      const u = list[idx];
      if (!u || ready.current.has(u) || bad.current.has(u) || busy.current.has(u)) return;
      busy.current.add(u);
      const a = new Image();
      a.referrerPolicy = 'no-referrer';
      a.onload = () => ready.current.set(u, imgSrc(u));
      a.onerror = () => {
        const b = new Image();
        b.onload = () => ready.current.set(u, proxied(u));
        b.onerror = () => bad.current.add(u);
        b.src = proxied(u);
      };
      a.src = imgSrc(u);
    };
    for (let k = 0; k < Math.min(4, list.length); k++) load(k);
    const t = setInterval(() => {
      setI((cur) => {
        for (let step = 1; step <= list.length; step++) {
          const nx = (cur + step) % list.length;
          load((nx + 2) % list.length);
          if (ready.current.has(list[nx])) return nx;
          if (!bad.current.has(list[nx])) { load(nx); return cur; }
        }
        return cur;
      });
    }, it.format === 'short' ? 550 : 700);
    return () => clearInterval(t);
  }, [hover, list.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const frame = i > 0 ? ready.current.get(list[i]) : null;
  return {
    first: list[0] || thumbUrl({ media }), frame, list, i, hover,
    on: { onMouseEnter: () => setHover(true), onMouseLeave: () => { setHover(false); setI(0); } }
  };
}

// The first frame with its own fallback, and the cycled frame laid over it once it has loaded.
function CycleImg({ cyc }) {
  return (
    <>
      <SafeImg key={cyc.first} url={cyc.first} />
      {cyc.frame ? <img className="pv-frame" src={cyc.frame} alt="" referrerPolicy="no-referrer" /> : null}
    </>
  );
}

function Preview({ it, big = false }) {
  const cyc = useCycle(it);
  const c = it.kinks?.[0]?.color || '#E39A83';
  return (
    <span className={`pv${big ? ' big' : ''}`} style={{ '--c': rgba(c, 0.6) }} {...cyc.on}>
      {cyc.first ? <CycleImg cyc={cyc} /> : <span className="pv-fallback">{it.title}</span>}
      {it.format === 'long' || it.format === 'short' ? <span className="tb">{fmtDur(it.duration) || (it.format === 'short' ? t('clip') : t('video'))}</span> : it.format === 'gif' ? <span className="tb">GIF</span> : it.format === 'set' ? <span className="tb">{t('set')}</span> : null}
      {cyc.list.length > 1 && cyc.hover ? <span className="pv-bar"><i style={{ width: `${((cyc.i + 1) / cyc.list.length) * 100}%` }} /></span> : null}
    </span>
  );
}

function Carousel({ items, onOpen }) {
  const ref = useRef(null);
  const [idx, setIdx] = useState(0);
  const raf = useRef(0);
  const go = (d) => {
    const el = ref.current;
    if (!el) return;
    const n = Math.max(0, Math.min(items.length - 1, idx + d));
    const child = el.children[n];
    if (child) el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: 'smooth' });
    setIdx(n);
  };
  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el || !el.children.length) return;
      const w = el.children[0].offsetWidth + 8;
      const n = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / w)));
      setIdx((cur) => (cur === n ? cur : n));
    });
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return (
    <div className="carousel">
      <div className="car-track" ref={ref} onScroll={onScroll}>
        {items.map((it) => (
          <button type="button" key={it.id} className="car-item" onClick={() => onOpen(it)} title={it.title}>
            <Preview it={it} big />
            <span className="car-cap"><span className="mini-title">{it.title}</span><span className="mini-meta">{it.match}% · {formatMeta(it)}</span></span>
          </button>
        ))}
      </div>
      {items.length > 1 ? (
        <div className="car-nav">
          <button type="button" className="icon-btn" onClick={() => go(-1)} disabled={idx === 0} aria-label={t('Previous')}><Icon name="chevL" /></button>
          <span className="car-dots">{items.map((it, i) => <i key={it.id} className={i === idx ? 'on' : ''} />)}</span>
          <button type="button" className="icon-btn" onClick={() => go(1)} disabled={idx >= items.length - 1} aria-label={t('Next')}><Icon name="chevR" /></button>
        </div>
      ) : null}
    </div>
  );
}

function Hero({ items, onOpen }) {
  const [first, ...rest] = items;
  if (!first) return null;
  return (
    <div className="hero">
      <button type="button" className="hero-main" onClick={() => onOpen(first)} title={first.title}>
        <Preview it={first} big />
        <span className="hero-cap"><span className="mini-title wrap">{first.title}</span><span className="mini-meta">{t('{n}% match', { n: first.match })} · {formatMeta(first)}</span></span>
      </button>
      {rest.length ? <div className="hero-row">{rest.slice(0, 3).map((it) => <button type="button" key={it.id} className="hero-sm" onClick={() => onOpen(it)} title={it.title}><Preview it={it} /></button>)}</div> : null}
    </div>
  );
}

function Mosaic({ items, onOpen }) {
  return (
    <div className="mosaic">
      {items.slice(0, 5).map((it, i) => <button type="button" key={it.id} className={`mo${i === 0 ? ' mo-big' : ''}`} onClick={() => onOpen(it)} title={it.title}><Preview it={it} big={i === 0} /></button>)}
    </div>
  );
}

function Layout({ w, items, open }) {
  if (w.layout === 'carousel') return <Carousel items={items} onOpen={open} />;
  if (w.layout === 'hero') return <Hero items={items} onOpen={open} />;
  if (w.layout === 'mosaic' && items.length >= 3) return <Mosaic items={items} onOpen={open} />;
  return <div className="scroll-list">{items.map((it) => <Mini key={it.id} it={it} onOpen={open} />)}</div>;
}

function MiniMap({ data }) {
  const ref = useRef(null);
  useEffect(() => { drawMap(ref.current, data, false); }, [data]);
  return <div className="mmap-box"><canvas ref={ref} className="mmap" role="img" aria-label={t('Small map of your kinks and fantasies')} /></div>;
}

const FORMAT_NAME = { long: t('Long videos'), short: t('Short clips'), gif: t('GIFs'), image: t('Images'), set: t('Image sets'), story: t('Stories'), discussion: t('Threads') };

function MatchBar({ value }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return <div className="wmatch" title={t('{n}% match', { n: v })}><div className="track2"><i style={{ width: `${v}%` }} /></div><span>{t('{n}% match', { n: v })}</span></div>;
}

function FantasySuggest({ w, open }) {
  const { toast, refreshMeta, setFilters } = useApp();
  const [state, setState] = useState('new');
  const sg = w.suggestion;
  const act = async (action) => {
    try {
      await api(`/suggestions/${sg.id}`, { method: 'POST', body: { action } });
      setState(action === 'save' ? 'saved' : 'dismissed');
      if (action === 'save') { refreshMeta(); toast(t('Saved to your fantasies.')); } else toast(t('Got it. It will not come back.'));
    } catch (e) { toast(e.message); }
  };
  if (state === 'dismissed') return <div className="win-body"><p className="wnote">{t('Dismissed.')}</p></div>;
  return (
    <div className="win-body"><div className="fant">
      <p className="scenario serif">{sg.scenario}</p>
      <div className="chiprow">
        {sg.kinks.map((k) => <button type="button" key={k.id} className="chip btn" style={{ '--c': k.color, '--c2': rgba(k.color, 0.16) }} onClick={() => setFilters({ kink: k.id })}>{k.name}</button>)}
        {sg.tags.map((t) => <button type="button" key={t} className="chip ghost btn" onClick={() => setFilters({ tags: [t] })}>{t}</button>)}
      </div>
      <MatchBar value={sg.confidence} />
      {sg.why ? <p className="wnote">{sg.why}</p> : null}
      {w.items?.length ? <div className="wgrid three">{w.items.slice(0, 3).map((it) => <Tile key={it.id} it={it} onOpen={open} />)}</div> : null}
      <div className="wbtns">
        <button type="button" className="ghost-btn small accent" onClick={() => act('save')} disabled={state === 'saved'}>{state === 'saved' ? plain(t('Saved [button state]')) : t('Save fantasy')}</button>
        <button type="button" className="ghost-btn small" onClick={() => act('dismiss')}>{t('Not for me')}</button>
      </div>
    </div></div>
  );
}

function NewKink({ w, open }) {
  const { toast, refreshMeta } = useApp();
  const [state, setState] = useState(w.kink.status);
  const set = async (status) => {
    try { await api(`/kinks/${w.kink.id}`, { method: 'PATCH', body: { status } }); setState(status); refreshMeta(); toast(status === 'active' ? t('{name} is one of your kinks now.', { name: w.kink.name }) : t('Hidden. It will not be suggested again.')); } catch (e) { toast(e.message); }
  };
  return (
    <div className="win-body">
      {w.kink.description ? <p className="wtext">{w.kink.description}</p> : null}
      <div className="chiprow">{w.kink.tags.map((t) => <span key={t} className="chip ghost">{t}</span>)}</div>
      <Layout w={w} items={w.items || []} open={open} />
      {state !== 'hidden' ? (
        <div className="wbtns">
          <button type="button" className="ghost-btn small accent" onClick={() => set('active')} disabled={state === 'active'}>{state === 'active' ? t('In your kinks') : t('Keep it')}</button>
          <button type="button" className="ghost-btn small" onClick={() => set('hidden')}>{t('Not for me')}</button>
        </div>
      ) : <p className="wnote">{t('Hidden.')}</p>}
    </div>
  );
}

function Body({ w, open }) {
  const { setFilters, openMode, toast, setAskOut, refreshMeta, opts } = useApp();
  const [limits, setLimits] = useState(w.limits || []);
  const [limIn, setLimIn] = useState('');
  const [rating, setRating] = useState(0);
  const [fant, setFant] = useState(w.fantasy);
  const items = w.items || [];
  switch (w.type) {
    case 'stories':
      return (
        <div className="win-body scroll">
          {items.map((it) => (
            <button type="button" key={it.id} className="mini storyrow" onClick={() => open(it)}>
              <span className="readbadge"><b>{it.readMin || it.media?.readMin || 1}</b><span>{t('min')}</span></span>
              <span className="mini-text"><span className="mini-title wrap serif">{it.title}</span><span className="mini-meta">{it.community || it.author} · {t('{n}% match', { n: it.match })}</span></span>
            </button>
          ))}
        </div>
      );
    case 'kinkList':
      return (
        <div className="win-body">
          {w.newest ? <p className="newestline">{t('Newest post {ago}', { ago: ago(w.newest) })}</p> : null}
          {w.performerThumb ? <div className="perfhead"><img src={imgSrc(w.performerThumb)} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} /><span>{w.title}</span></div> : null}
          <Layout w={w} items={items} open={open} />
        </div>
      );
    case 'kinkDeep':
      return (
        <div className="win-body">
          {w.subs?.length ? (
            <div className="chiprow subs">
              {w.group ? <button type="button" className="chip btn" onClick={() => setFilters({ kink: w.group.id })}>{t('All of {name}', { name: w.group.name })}</button> : null}
              {w.subs.map((x) => (
                <button type="button" key={x.id || x.tag} className={`chip btn${(x.id && x.id === w.activeSub) || (x.tag && x.tag === w.activeTag) ? ' on' : ''}`} onClick={() => setFilters(x.id ? { kink: x.id } : { kink: w.kink.id, tags: [x.tag] })}>{x.name}</button>
              ))}
            </div>
          ) : null}
          <Layout w={w} items={items} open={open} />
        </div>
      );
    case 'kinkSpot':
      return <div className="win-body">{items[0] ? <Spot it={items[0]} onOpen={open} /> : null}</div>;
    case 'discovery':
      if (w.big) return <div className="win-body">{items[0] ? <Spot it={items[0]} onOpen={open} note={t("You haven't opened {name} before. It sits next to things you like.", { name: items[0].kinks?.[0]?.name || t('this kind of post') })} /> : null}</div>;
      return <div className="win-body">{items.slice(0, 3).map((it) => <Mini key={it.id} it={it} onOpen={open} />)}<p className="wnote">{t("Kinds of posts you haven't opened yet, next to things you like.")}</p></div>;
    case 'pair':
      return (
        <div className="win-body">
          <div className="chiprow">{w.pair.map((k) => <span key={k.id} className="chip" style={{ '--c': k.color, '--c2': rgba(k.color, 0.16) }}>{k.name}</span>)}</div>
          <div className="wgrid">{items.map((it) => <Tile key={it.id} it={it} onOpen={open} />)}</div>
          <p className="wnote">{t('These two show up together in the things you rate highest.')}</p>
        </div>
      );
    case 'gifs':
      return <div className="win-body"><div className="wgrid">{items.map((it) => <Tile key={it.id} it={it} onOpen={open} />)}</div></div>;
    case 'shortsRail':
      return <div className="win-body"><div className="wgrid three">{items.map((it) => <Tile key={it.id} it={it} onOpen={open} vert />)}</div></div>;
    case 'fantasy':
      return (
        <div className="win-body"><div className="fant">
          <h4>{fant.name}</h4>
          {fant.description ? <p className="wtext">{fant.description}</p> : null}
          <div className="chiprow">{fant.kinks.map((k) => <span key={k.id} className="chip" style={{ '--c': k.color, '--c2': rgba(k.color, 0.16) }}>{k.name}</span>)}</div>
          <div className="wbtns">
            <button type="button" className="ghost-btn small accent" onClick={() => openMode('journey', { fantasy: fant.id })}><Icon name="route" />{t('Start a journey')}</button>
            <button type="button" className="ghost-btn small" onClick={async () => { await api(`/fantasies/${fant.id}`, { method: 'PATCH', body: { saved: !fant.saved } }); setFant({ ...fant, saved: !fant.saved }); refreshMeta(); toast(fant.saved ? t('Removed from your fantasies.') : t('Saved to your fantasies.')); }}>{fant.saved ? plain(t('Saved [button state]')) : t('Save fantasy')}</button>
          </div>
        </div></div>
      );
    case 'following':
      return (
        <div className="win-body scroll">
          <div className="avrow">{w.follows.map((f) => (
            <button type="button" key={f.kind + f.value} onClick={() => setFilters(f.kind === 'subreddit' || f.kind === 'community' ? { community: f.provider === 'reddit' || f.kind === 'subreddit' ? `r/${f.value}` : f.value } : { author: f.value })}>
              <span className="ring"><Avatar name={f.value} /></span><span>{f.kind === 'subreddit' || (f.kind === 'community' && f.provider === 'reddit') ? `r/${f.value}` : f.value}</span>
            </button>
          ))}</div>
          {w.newest ? <p className="newestline">{t('Newest post {ago}', { ago: ago(w.newest) })}</p> : null}
          {items.map((it) => <Mini key={it.id} it={it} onOpen={open} />)}
        </div>
      );
    case 'followLatest':
      return (
        <div className="win-body scroll">
          {w.newest ? <p className="newestline">{t('Newest post {ago}', { ago: ago(w.newest) })}</p> : null}
          {items.map((it) => (
            <button type="button" key={it.id} className="mini latest" onClick={() => open(it)}>
              <span className="thumbbox"><Thumb it={it} shape={shapeOf(it)} /></span>
              <span className="mini-text"><span className="mini-title">{it.title}</span><span className="mini-meta">{it.author || it.community} · {ago(it.created)}</span></span>
              {(it.created || 0) * 1000 > Date.now() - 86400000 ? <span className="newdot">{t('new')}</span> : null}
            </button>
          ))}
        </div>
      );
    case 'trending':
      return <div className="win-body rank">{items.map((it, i) => <Mini key={it.id} it={it} onOpen={open} rank={i + 1} />)}</div>;
    case 'creator':
      return (
        <div className="win-body">
          <div className="prof"><Avatar name={w.creator.name} size="l" /><div className="pn"><strong>{w.creator.name}</strong><span>{w.creator.source === 'reddit' ? `u/${w.creator.name}` : `@${w.creator.name}`} · {tn(w.creator.posts, '{n} post', '{n} posts')}</span></div></div>
          {w.creator.match ? <MatchBar value={w.creator.match} /> : null}
          <Layout w={w} items={items} open={open} />
          <div className="wbtns"><button type="button" className="ghost-btn small accent" onClick={async () => { await api('/follow', { method: 'POST', body: { kind: 'creator', value: `${w.creator.source}|${w.creator.name}`, on: true, label: w.creator.name } }); toast(t('Following {name}.', { name: w.creator.name })); }}>{w.creator.followed ? plain(t('Following [button state]')) : t('Follow')}</button></div>
        </div>
      );
    case 'tonight': {
      return <Tonight w={w} setAskOut={setAskOut} />;
    }
    case 'lately':
      return (
        <div className="win-body"><div className="bars">
          {w.kinks.map((k) => { const d = k.lately - k.allTime; return (
            <div className="barrow" key={k.id}>
              <div className="bt"><span>{k.name}</span><em className={d >= 0 ? 'up' : 'down'}>{d >= 0 ? '+' : ''}{d}</em></div>
              <div className="duo"><div className="track2"><i style={{ width: `${k.allTime}%`, background: rgba(k.color, 0.45) }} /></div><div className="track2"><i style={{ width: `${k.lately}%`, background: k.color }} /></div></div>
            </div>
          ); })}
        </div><p className="wnote">{t('Left bar all time, right bar the last week.')}</p></div>
      );
    case 'map':
      if (w.variant === 'groups') {
        return (
          <div className="win-body">
            {w.groups.map((g) => (
              <div key={g.id} className="mapgroup" style={{ '--c': g.color }}>
                <div className="bt"><button type="button" className="linkbtn plain" onClick={() => setFilters({ kink: g.id })}><strong>{g.name}</strong></button><em>{g.score}%</em></div>
                <div className="track2"><i style={{ width: `${g.score}%`, background: g.color }} /></div>
                <div className="chiprow">{g.kinks.map((k) => <button type="button" key={k.id} className="chip btn" style={{ '--c': k.color, '--c2': rgba(k.color, 0.16) }} onClick={() => setFilters({ kink: k.id })}>{k.name}</button>)}</div>
              </div>
            ))}
            <div className="wbtns"><button type="button" className="ghost-btn small" onClick={() => openMode('map')}><Icon name="map" />{t('Expand your map')}</button></div>
          </div>
        );
      }
      if (w.variant === 'links') {
        return (
          <div className="win-body">
            {w.links.map((l, i) => (
              <button type="button" key={i} className="linkrow" onClick={() => setFilters({ pair: [l.a.id, l.b.id] })}>
                <span className="chip" style={{ '--c': l.a.color, '--c2': rgba(l.a.color || '#999', 0.16) }}>{l.a.name}</span>
                <span className="linkline"><i style={{ opacity: 0.35 + l.w * 0.65, height: `${2 + Math.round(l.w * 4)}px` }} /></span>
                <span className="chip" style={{ '--c': l.b.color, '--c2': rgba(l.b.color || '#999', 0.16) }}>{l.b.name}</span>
              </button>
            ))}
            <div className="wbtns"><button type="button" className="ghost-btn small" onClick={() => openMode('map')}><Icon name="map" />{t('Expand your map')}</button></div>
          </div>
        );
      }
      return <div className="win-body"><MiniMap data={w} /><div className="wbtns"><button type="button" className="ghost-btn small" onClick={() => openMode('map')}><Icon name="map" />{t('Expand your map')}</button></div></div>;
    case 'rising':
      return (
        <div className="win-body">
          {w.rising.map((k) => (
            <button type="button" key={k.id} className="riserow" onClick={() => setFilters({ kink: k.id })}>
              <span className="rise up">▲ {k.delta}</span><span className="rname" style={{ color: k.color }}>{k.name}</span><em>{t('{n}% this week', { n: k.lately })}</em>
            </button>
          ))}
          {w.falling?.length ? <p className="wnote">{t('Cooling off: {list}', { list: w.falling.map((k) => `${k.name} (${k.delta})`).join(', ') })}</p> : null}
        </div>
      );
    case 'topWatched':
      return (
        <div className="win-body rank">
          {items.map((it, i) => (
            <button type="button" key={it.id} className="mini" onClick={() => open(it)}>
              <span className="num">{i + 1}</span>
              <span className="thumbbox"><Thumb it={it} shape={shapeOf(it)} /></span>
              <span className="mini-text"><span className="mini-title">{it.title}</span><span className="mini-meta">{formatMeta(it)}</span></span>
              <span className="pts">+{it.points}</span>
            </button>
          ))}
          <p className="wnote">{t('Points: saves, heat and likes count most, then rewatches and watching to the end.')}</p>
        </div>
      );
    case 'scoreboard':
      return (
        <div className="win-body">
          <div className="scoreboard">
            {w.rows.map((r) => (
              <div key={r.key}><b>{r.now}</b><span>{r.label}</span>{r.before !== r.now ? <em className={r.now >= r.before ? 'up' : 'down'}>{r.now >= r.before ? '▲' : '▼'} {Math.abs(r.now - r.before)}</em> : <em>{t('same')}</em>}</div>
            ))}
          </div>
        </div>
      );
    case 'formats':
      return (
        <div className="win-body"><div className="bars">
          {w.formats.map((f) => (
            <div className="barrow" key={f.format} role="button" tabIndex={0} onClick={() => setFilters({ formats: [f.format] })} onKeyDown={(e) => { if (e.key === 'Enter') setFilters({ formats: [f.format] }); }}>
              <div className="bt"><span>{FORMAT_NAME[f.format] || f.format}</span><em>{f.lately}%</em></div>
              <div className="track2"><i style={{ width: `${f.lately}%`, background: 'var(--accent)' }} /></div>
            </div>
          ))}
        </div></div>
      );
    case 'journeyOne':
      return (
        <div className="win-body">
          <p className="wtext">{w.blurb}</p>
          {items.length ? <div className="wgrid three">{items.slice(0, 3).map((it) => <Tile key={it.id} it={it} onOpen={open} />)}</div> : null}
          <div className="wbtns">
            <button type="button" className="ghost-btn small accent" onClick={() => openMode('journey', w.subject.kind === 'fantasy' ? { fantasy: w.subject.id, mode: w.mode } : { kink: w.subject.id, mode: w.mode })}><Icon name="route" />{t('Start the journey')}</button>
          </div>
        </div>
      );
    case 'combo':
      return (
        <div className="win-body">
          <div className="combo">
            <span className="chip" style={{ '--c': w.suggestion.a.color, '--c2': rgba(w.suggestion.a.color, 0.16) }}>{w.suggestion.a.name}</span>
            <span className={`combo-x ${w.suggestion.distance}`}>{w.suggestion.distance === 'far' ? '↔' : '+'}</span>
            <span className="chip" style={{ '--c': w.suggestion.b.color, '--c2': rgba(w.suggestion.b.color, 0.16) }}>{w.suggestion.b.name}</span>
          </div>
          <MatchBar value={w.suggestion.match} />
          {w.why ? <p className="wnote">{w.why}</p> : null}
          <div className="wgrid">{items.map((it) => <Tile key={it.id} it={it} onOpen={open} />)}</div>
        </div>
      );
    case 'fantasySuggest':
      return <FantasySuggest w={w} open={open} />;
    case 'newKink':
      return <NewKink w={w} open={open} />;
    case 'limits':
      return (
        <div className="win-body">
          <div className="limits">{limits.map((l) => <span className="limit" key={l}>{l}<button type="button" aria-label={t('Remove {tag}', { tag: l })} onClick={async () => { await api(`/limits/${encodeURIComponent(l)}`, { method: 'DELETE' }); setLimits(limits.filter((x) => x !== l)); }}><Icon name="close" /></button></span>)}</div>
          <form className="limitform" onSubmit={async (e) => { e.preventDefault(); const tag = limIn.trim(); if (!tag) { toast(t('Type a tag to block first.')); return; } const r = await api('/limits', { method: 'POST', body: { tag } }); setLimits([...limits, tag.toLowerCase()]); setLimIn(''); toast(tn(r.hidden, 'Blocked. {n} post hidden.', 'Blocked. {n} posts hidden.')); }}>
            <input id={`lim-${w.uid}`} value={limIn} onChange={(e) => setLimIn(e.target.value)} placeholder={t('Add a tag to block')} aria-label={t('Tag to block')} />
            <button type="submit" className="ghost-btn small">{t('Block')}</button>
          </form>
          <p className="wnote">{t('Never shown, never suggested, and nothing can override them.')}</p>
        </div>
      );
    case 'savedFant':
      return (
        <div className="win-body">
          {w.fantasies.length ? w.fantasies.map((f) => (
            <button type="button" key={f.id} className="mini" onClick={() => setFilters({ fantasy: f.id })}>
              <span className="thumbbox"><span className="thumb sq" style={{ '--c': rgba('#F6C35B', f.saved ? 0.7 : 0.3), borderRadius: '50%' }} /></span>
              <span className="mini-text"><span className="mini-title">{f.name}</span><span className="mini-meta">{f.kinks.map((k) => k.name).join(' + ') || t('no kinks yet')} · {f.match}%</span></span>
            </button>
          )) : <p className="wnote">{t('No fantasies yet. Save one from a journey, or write one in Memory.')}</p>}
          <div className="wbtns"><button type="button" className="ghost-btn small" onClick={() => openMode('memory')}>{t('Write a fantasy')}</button></div>
        </div>
      );
    case 'journey':
      return (
        <div className="win-body">
          <p className="wtext">{t('A finite, guided path. The assistant picks every step; you only move forward, and it ends when it ends.')}</p>
          <div className="wbtns col">
            {w.kinks[0] ? <button type="button" className="ghost-btn small" onClick={() => openMode('journey', { kink: w.kinks[0].id, mode: 'branch' })}><Icon name="route" />{t('Branch out from {name}', { name: w.kinks[0].name })}</button> : null}
            {w.kinks[1] ? <button type="button" className="ghost-btn small" onClick={() => openMode('journey', { kink: w.kinks[1].id, mode: 'close' })}><Icon name="route" />{t('Go deep into {name}', { name: w.kinks[1].name })}</button> : null}
            <button type="button" className="ghost-btn small" onClick={() => openMode('journey', { mode: 'surprise' })}><Icon name="route" />{t('Surprise me')}</button>
          </div>
        </div>
      );
    case 'moodCheck':
      return <div className="win-body"><div className="chiprow">{MOODS.map((m) => <MoodChip key={m.id} m={m} on={opts.mood === m.id} />)}</div></div>;
    case 'tagcloud':
      return (
        <div className="win-body"><div className="tagcloud">
          {w.tags.map((t) => <button type="button" key={t.name} style={{ fontSize: `${Math.round(11 + Math.min(10, t.weight * 5))}px` }} onClick={() => setFilters({ tags: [t.name] })}>{t.name}</button>)}
        </div></div>
      );
    case 'rateRecent':
      return (
        <div className="win-body">
          {items[0] ? <button type="button" className="ratebig" onClick={() => open(items[0])} title={items[0].title}><Preview it={items[0]} big /><span className="mini-title wrap">{items[0].title}</span></button> : null}
          {items[0] ? <div className="flames-wrap"><HeatSlider value={rating} onChange={(n) => { setRating(n); api(`/items/${items[0].id}/rate`, { method: 'POST', body: { value: n } }).catch(() => {}); }} /></div> : null}
        </div>
      );
    case 'recentSaved':
      return <div className="win-body">{items.length ? <div className="wgrid">{items.map((it) => <Tile key={it.id} it={it} onOpen={open} />)}</div> : <p className="wnote">{t('Save a post with the bookmark icon and it lands here.')}</p>}</div>;
    case 'discussion':
    case 'hotThread': {
      const th = items[0];
      if (!th) return null;
      return (
        <div className="win-body hotthread" style={{ '--c': w.color }}>
          <MatchBar value={th.match} />
          <button type="button" className="threadq" onClick={() => open(th)}>
            <span className="serif">{th.title}</span>
            {th.aiSummary ? <span className="mini-meta">{th.aiSummary}</span> : null}
          </button>
          <TopReplies item={th} compact />
          <div className="rowline"><span className="mini-meta">{[th.comments ? tn(th.comments, '{n} reply', '{n} replies', { n: fmtNum(th.comments) }) : null, th.upvotes ? t('{n} up', { n: fmtNum(th.upvotes) }) : null].filter(Boolean).join(' · ')}</span><button type="button" className="ghost-btn small" onClick={() => open(th)}>{t('Open thread')}</button></div>
        </div>
      );
    }
    case 'memory':
      return (
        <div className="win-body">
          {w.memories.length ? w.memories.map((m) => <p key={m.id} className="memline">{m.status === 'proposed' ? <em>{t('suggested')}</em> : null}{m.content}</p>) : <p className="wnote">{t('Nothing remembered yet. The assistant suggests memories as it learns, and you can write your own.')}</p>}
          <div className="wbtns"><button type="button" className="ghost-btn small" onClick={() => openMode('memory')}><Icon name="brain" />{t('Open memory')}</button></div>
        </div>
      );
    default:
      return null;
  }
}

function MoodChip({ m, on }) {
  const { applyMood } = useApp();
  return <button type="button" className={`chip btn${on ? ' on' : ''}`} onClick={() => applyMood(m.id)}>{m.label}</button>;
}

export function Window({ w }) {
  const { setFilters, openMode, opts, mode } = useApp();
  const [min, setMin] = useState(false);
  const active = (w.type === 'map' && mode === 'map') || (mode === 'feed' && opts.activeWin === w.uid);
  const canExpand = w.type === 'map' || !!w.filter;
  const open = (it) => setFilters(w.filter || {}, { win: w.filter ? w.uid : null, focus: it.id });
  return (
    <section className={`win${active ? ' active' : ''}`}>
      <header className="win-head">
        <span className="win-dot" style={{ '--c': w.color }} />
        <div className="win-title"><strong>{w.title}</strong><span>{w.meta}</span></div>
        {active ? <span className="incenter">{t('In center')}</span> : null}
        <button type="button" className="icon-btn" onClick={() => setMin(!min)} aria-label={min ? t('Open window') : t('Minimize window')}><Icon name={min ? 'plus' : 'min'} /></button>
        {canExpand ? <button type="button" className="icon-btn" onClick={() => (w.type === 'map' ? openMode('map') : setFilters(w.filter, { win: w.uid }))} aria-label={t('Show in center')}><Icon name="expand" /></button> : null}
      </header>
      {!min ? <Body w={w} open={open} /> : null}
    </section>
  );
}
