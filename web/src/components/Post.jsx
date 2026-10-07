import { useEffect, useRef, useState } from 'react';
import { PostFx, HeatFx } from './PostFx.jsx';
import { ago, api, fmtNum, formatMeta, LABELS, rgba, track, imgSrc } from '../api.js';
import { useApp } from '../context.jsx';
import { Icon } from '../icons.jsx';
import { Media } from './Media.jsx';
import { AskPanel, Avatar, CommentsPanel, ProfilePanel, PerformerPanel, PersonPanel, HeatSlider, WhyPanel, plain } from './Panels.jsx';
import Linkify from './Linkify.jsx';
import { t, tn } from '../i18n.js';
import { useTranslate, TranslateButton, TranslatedNote } from './Translate.jsx';

// A performer's photo from the Pornhub performer list, or their initials when there is none.
function PerfAvatar({ p }) {
  const [bad, setBad] = useState(false);
  if (!p.thumb || bad) return <Avatar name={p.name} size="s" />;
  return <img className="avatar av-s avimg" src={imgSrc(p.thumb)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} />;
}

const HAS_COMMENTS = new Set(['reddit', 'lemmy']);
const AUTO_UP_HEAT = 2;

// Right after a hide, a thumbs down or a block: which tags did you not like? Only what you pick counts against future
// posts. For a hide or a block the bigger model makes a guess too (marked with a spark), but a guess never counts
// until you confirm it; unanswered guesses wait in Memory to verify.
export function DislikeNote({ id, compact = false }) {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [pick, setPick] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    let n = 0;
    let tm = null;
    const poll = async () => {
      n++;
      try {
        const r = await api(`/items/${id}/dislike`);
        if (!alive) return;
        setD(r);
        if ((r.status === 'waiting' || r.status === 'running') && n < 60) tm = setTimeout(poll, n < 5 ? 1500 : 3000);
      } catch { if (alive && n < 3) tm = setTimeout(poll, 3000); }
    };
    tm = setTimeout(poll, 400);
    return () => { alive = false; clearTimeout(tm); };
  }, [id]);
  async function send(path, body, method = 'POST') {
    setBusy(true);
    try { setD(await api(path, { method, body })); } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  if (!d || d.status === 'none') return null;
  const thinking = d.status === 'waiting' || d.status === 'running';
  const asking = !d.answered && d.candidates.length >= 2;
  const toggle = (tag) => setPick((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]));
  if (asking) {
    return (
      <div className={`dislike ask${compact ? ' compact' : ''}`}>
        <span className="dq">{d.kind === 'block' ? t('What did you not like about them?') : t('What did you not like?')}</span>
        <div className="dpicks">
          {d.candidates.map((tag) => (
            <button type="button" key={tag} className={`dpick${pick.includes(tag) ? ' on' : ''}${d.guesses.includes(tag) ? ' guess' : ''}`} onClick={() => toggle(tag)} aria-pressed={pick.includes(tag)} title={d.guesses.includes(tag) ? t('The bigger model’s guess') : undefined}>
              {d.guesses.includes(tag) ? <Icon name="why" /> : null}{tag}{pick.includes(tag) ? <Icon name="check" /> : null}
            </button>
          ))}
        </div>
        <div className="dbtns">
          <button type="button" className="ghost-btn small accent" disabled={!pick.length || busy} onClick={() => send(`/items/${id}/dislike`, { tags: pick })}><Icon name="check" />{t('That was it')}</button>
          <button type="button" className="ghost-btn small" disabled={busy} onClick={() => send(`/items/${id}/dislike/skip`, {})}><Icon name="x" />{t('Not sure')}</button>
          {thinking ? <span className="dthink"><span className="spin" />{t('The bigger model is having a look too…')}</span> : null}
        </div>
        {d.kind !== 'down' ? <span className="wnote">{t('Only what you pick counts. If you leave it, the guesses wait in Memory for you to confirm.')}</span> : null}
      </div>
    );
  }
  if (!d.reasons.length && !d.guesses.length) {
    return thinking ? <p className={`dislike${compact ? ' compact' : ''}`}><span className="spin" />{t('Looking at what you did not like, leaving out what you already like…')}</p> : null;
  }
  return (
    <div className={`dislike${compact ? ' compact' : ''}`}>
      {d.reasons.length ? (
        <>
          <span>{t('Less of:')}</span>
          {d.reasons.map((r) => <span key={r} className="dchip">{r}<button type="button" onClick={() => send(`/items/${id}/dislike/${encodeURIComponent(r)}`, undefined, 'DELETE')} title={t('That was not it')} aria-label={t('That was not it: {tag}', { tag: r })}><Icon name="x" /></button></span>)}
        </>
      ) : null}
      {d.guesses.length ? (
        <>
          <span className="dverify">{t('Guessed, not counted yet:')}</span>
          {d.guesses.map((g) => (
            <span key={g} className="dchip guess"><Icon name="why" />{g}
              <button type="button" onClick={() => send(`/items/${id}/dislike`, { tags: [g] })} title={t('Yes, that was it')} aria-label={t('Yes, that was it: {tag}', { tag: g })}><Icon name="check" /></button>
              <button type="button" onClick={() => send(`/items/${id}/dislike-guess/${encodeURIComponent(g)}`, undefined, 'DELETE')} title={t('That was not it')} aria-label={t('That was not it: {tag}', { tag: g })}><Icon name="x" /></button>
            </span>
          ))}
        </>
      ) : null}
      {d.note && d.guesses.length ? <em className="dnote">{d.note}</em> : null}
    </div>
  );
}

// On a phone the picture or video is as big as it can be while it stays fully on the screen, with the post's top
// at the top. What comes after it (tags, buttons) may run below the screen: a little more scrolling shows it, and
// scrolling past the end of the post snaps to the next one.
function useFit(ref, mediaRef, on) {
  useEffect(() => {
    const el = ref.current;
    if (!on || !el) return undefined;
    const fit = () => {
      const m = mediaRef.current;
      if (!m) return;
      const cs = getComputedStyle(document.documentElement);
      const head = parseInt(cs.getPropertyValue('--toph'), 10) || 60;
      const tab = document.querySelector('.tabbar')?.offsetHeight || 0;
      const vh = window.visualViewport?.height || window.innerHeight;
      const above = m.getBoundingClientRect().top - el.getBoundingClientRect().top;
      el.style.setProperty('--fit', `${Math.max(220, Math.round(vh - head - tab - above - 18))}px`);
    };
    fit();
    const ro = new ResizeObserver(() => requestAnimationFrame(fit));
    ro.observe(el);
    window.addEventListener('resize', fit);
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
}

function useNear(ref) {
  const [near, setNear] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '1800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return near;
}

function useVisibility(ref, id, onLong, ready, members) {
  const [active, setActive] = useState(false);
  const started = useRef(0);
  const impressed = useRef(false);
  const longTimer = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => {
      setActive(e.intersectionRatio >= 0.6 || (e.isIntersecting && e.intersectionRect.height >= window.innerHeight * 0.55));
    }, { threshold: [0, 0.3, 0.6, 0.9] });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  // Scrolling past a post before it even started: a strong "not for me".
  const shownAt = useRef(0);
  useEffect(() => {
    if (active) { shownAt.current = Date.now(); return undefined; }
    const at = shownAt.current;
    shownAt.current = 0;
    if (at && !impressed.current) {
      const ms = Date.now() - at;
      if (ms >= 250 && ms < 1500) track(id, 'skip', ms);
    }
    return undefined;
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!active || !ready) return undefined;
    started.current = Date.now();
    if (!impressed.current) {
      impressed.current = true;
      track(id, 'impression');
      for (const m of members || []) if (m !== id) track(m, 'impression');
    }
    longTimer.current = setTimeout(() => onLong?.('dwell'), 60000);
    return () => {
      clearTimeout(longTimer.current);
      if (started.current) {
        track(id, 'dwell', Date.now() - started.current);
        started.current = 0;
      }
    };
  }, [active, ready, id]); // eslint-disable-line react-hooks/exhaustive-deps
  return active;
}

function identity(it) {
  const perf = it.performers || [];
  if (it.source === 'reddit') return { name: `u/${it.author}`, handle: it.author, sub: [it.community] };
  if (it.source === 'redgifs') return { name: it.author ? `@${it.author}` : 'RedGIFs', handle: it.author, sub: ['RedGIFs'] };
  if (it.source === 'lemmy') return { name: it.author || it.community, handle: it.author, sub: [it.community, 'Lemmy'] };
  if (it.source === 'bluesky') return { name: it.media?.displayName || `@${it.author}`, handle: it.author, sub: [`@${it.author}`, 'Bluesky'] };
  if (it.media?.kind === 'embed') return { name: perf[0] || it.media.provider || it.community, handle: null, performer: perf[0] || null, sub: [it.media.provider || it.community] };
  return { name: it.author || it.community || it.source, handle: it.author, sub: [it.community] };
}

export default function Post({ item: initial, focus = false, onStrong }) {
  const { toast, setFilters, runSearch, kinks: allKinks, refreshMeta } = useApp();
  const [item, setItem] = useState(initial);
  const itemRef = useRef(initial);
  itemRef.current = item;
  const [kinkPick, setKinkPick] = useState(false);
  const [panel, setPanel] = useState(null);
  const [gone, setGone] = useState(false);
  const [allTags, setAllTags] = useState(false);
  const [fx, setFx] = useState(null);
  const [heat, setHeat] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const [menu, setMenu] = useState(false);
  const [over, setOver] = useState(0);
  const chipsRef = useRef(null);
  const menuRef = useRef(null);
  // The reaction shows in the middle of the part of the picture you can see, or of the post when the picture is off screen.
  const fxY = () => {
    const m = mediaRef.current;
    if (!m) return null;
    const top = (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--toph'), 10) || 0);
    const low = (window.visualViewport?.height || window.innerHeight) - (document.querySelector('.tabbar')?.offsetHeight || 0);
    const mr = m.getBoundingClientRect();
    const seen = (r) => [Math.max(r.top, top), Math.min(r.bottom, low)];
    let [a, b] = seen(mr);
    if (b - a < 140 && ref.current) [a, b] = seen(ref.current.getBoundingClientRect());
    if (b - a < 60) return null;
    return Math.round((a + b) / 2 - mr.top);
  };
  const fxX = () => {
    const m = mediaRef.current;
    const box = m?.querySelector('.media, .galwrap, .gallery, .imgbtn');
    if (!box) return null;
    const r = box.getBoundingClientRect();
    return Math.round(r.left + r.width / 2 - m.getBoundingClientRect().left);
  };
  const play = (kind) => setFx({ kind, key: Date.now() + Math.random(), y: fxY(), x: fxX() });
  const onHeat = (v, phase) => setHeat((cur) => (cur && cur.phase === 'live' ? { ...cur, v, phase } : { v, phase, key: Date.now(), y: fxY(), x: fxX() }));
  const fired = useRef(false);
  const strong = (why) => {
    if (fired.current) return;
    fired.current = true;
    onStrong?.(item, why);
  };
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  const active = useVisibility(ref, item.id, strong, ready, item.collection?.members);
  const near = useNear(ref);
  const mediaRef = useRef(null);
  const lastH = useRef(null);
  const narrowNow = typeof window !== 'undefined' && window.innerWidth <= 900;
  useFit(ref, mediaRef, narrowNow && item.media?.kind !== 'text');
  if (near && mediaRef.current) lastH.current = mediaRef.current.offsetHeight || lastH.current;
  const c = item.kinks?.[0]?.color || '#E39A83';

  // Double-tapping the picture or video likes the post, like on Instagram. A single tap on an image waits a moment
  // so a double tap does not also open it.
  const tap = useRef({ t: 0, x: 0, y: 0, timer: null, pass: false });
  function onMediaClick(e) {
    const r = tap.current;
    if (r.pass) { r.pass = false; return; }
    if (e.target.closest('a, input, select, textarea, .mutebtn, .linkbtn, .ghost-btn, .icon-btn, .play, .tbtn, .fsbox, .fsbtn')) return;
    const at = Date.now();
    if (at - r.t < 300 && Math.abs(e.clientX - r.x) < 40 && Math.abs(e.clientY - r.y) < 40) {
      clearTimeout(r.timer);
      r.t = 0;
      e.preventDefault();
      e.stopPropagation();
      likeByTap();
      return;
    }
    r.t = at;
    r.x = e.clientX;
    r.y = e.clientY;
    const btn = e.target.closest('.imgbtn, .gtile');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(r.timer);
      r.timer = setTimeout(() => { r.pass = true; btn.click(); }, 300);
      return;
    }
    // A tap on a video pauses or plays it, but only once it is clear it was not the first tap of a double-tap, so
    // liking never pauses the video. Taps on the player's own controls (the bar at the bottom) go straight through.
    const v = e.target.closest('video');
    if (v) {
      const box = v.getBoundingClientRect();
      if (v.controls && e.clientY > box.bottom - 56) return;
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(r.timer);
      r.timer = setTimeout(() => { if (v.paused) v.play().catch(() => {}); else v.pause(); }, 300);
    }
  }
  useEffect(() => () => clearTimeout(tap.current.timer), []);
  const voteRef = useRef(null);
  const likeByTap = () => { if (itemRef.current.vote > 0) play('up'); else voteRef.current?.(1); };

  voteRef.current = (d) => vote(d);
  async function vote(dir) {
    const next = item.vote === dir ? 0 : dir;
    play(next > 0 ? 'up' : next < 0 ? 'down' : item.vote > 0 ? 'unup' : 'undown');
    setItem({ ...item, vote: next, autoUp: false, score: item.score - item.vote + next, upvotes: item.upvotes != null ? item.upvotes - (item.vote > 0 ? 1 : 0) + (next > 0 ? 1 : 0) : null });
    if (next > 0) strong('up');
    setDownNote(next < 0);
    try {
      const r = await api(`/items/${item.id}/vote`, { method: 'POST', body: { dir: next } });
      if (r.synced && next) toast(next > 0 ? t('Upvoted on Reddit too.') : t('Downvoted on Reddit too.'));
      else if (!next && item.vote) toast(item.vote > 0 ? t('Like taken back. What it taught your feed is undone.') : t('Dislike taken back. What it taught your feed is undone.'));
    } catch (e) { toast(e.message); }
  }

  async function save() {
    const on = !item.saved;
    play(on ? 'save' : 'unsave');
    setItem({ ...item, saved: on });
    if (on) strong('save');
    try {
      const r = await api(`/items/${item.id}/save`, { method: 'POST', body: { on } });
      toast(on ? (r.synced ? t('Saved here and on Reddit.') : t('Saved.')) : t('Removed from saved. What saving it taught your feed is undone.'));
    } catch (e) { toast(e.message); }
  }

  async function less() {
    play('hide');
    setLeaving(true);
    setTimeout(() => setGone(true), window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 720);
    try {
      await api(`/items/${item.id}/less`, { method: 'POST', body: {} });
      toast(t('Hidden. Pick what you did not like, or leave it.'));
    } catch (e) { toast(e.message); }
  }

  // Finding something hot is liking it: a heat of 2 flames or more upvotes it too (also on Reddit when that is on).
  async function rate(n) {
    const autoUp = n >= AUTO_UP_HEAT && item.vote <= 0;
    // Heat taken back below two flames also takes back the upvote it gave.
    const autoDown = n < AUTO_UP_HEAT && item.vote > 0 && item.autoUp;
    setItem((cur) => ({ ...cur, rating: n, ...(autoUp ? { vote: 1, autoUp: true, upvotes: cur.upvotes != null ? cur.upvotes + 1 - (cur.vote > 0 ? 1 : 0) : null } : autoDown ? { vote: 0, autoUp: false, upvotes: cur.upvotes != null ? cur.upvotes - 1 : null } : {}) }));
    if (n > 0) strong('rate');
    try {
      await api(`/items/${item.id}/rate`, { method: 'POST', body: { value: n } });
      if (autoUp) await api(`/items/${item.id}/vote`, { method: 'POST', body: { dir: 1 } });
      if (autoDown) await api(`/items/${item.id}/vote`, { method: 'POST', body: { dir: 0 } });
      if (!n) { toast(autoDown ? t('Heat and upvote taken back. What they taught your feed is undone.') : t('Heat taken back. What it taught your feed is undone.')); return; }
      if (n) toast(n >= 4 ? (autoUp ? t('On fire and upvoted. Your feed goes deeper into this.') : t('On fire. Your feed goes deeper into this.')) : (autoUp ? t('Noted how hot this was, and upvoted it. It counts more than an upvote.') : t('Noted how hot this was. It counts more than an upvote.')));
    } catch (e) { toast(e.message); }
  }

  // Put this post in one of your kinks, or take it out when the tagging got it wrong.
  async function setKink(k, on) {
    setKinkPick(false);
    try {
      const r = await api(`/items/${item.id}/kinks`, { method: 'POST', body: { kink: k.id, on } });
      setItem((cur) => ({ ...cur, kinks: r.item.kinks, tags: r.item.tags }));
      toast(on ? t('Added to {name}.', { name: k.name }) : t('Taken out of {name}: the tags that put it there are removed from this post.', { name: k.name }));
      refreshMeta?.();
    } catch (e) { toast(e.message); }
  }

  function applyPatch(patch) {
    if (patch.hidden) setGone(true);
    else if (patch.reasonTags) setItem((cur) => ({ ...cur, tags: [...new Set([...patch.reasonTags, ...(cur.tags || [])])], liked: patch.reasonTags }));
    else setItem((cur) => ({ ...cur, ...patch }));
  }

  const toggle = (p) => setPanel((cur) => (cur === p ? null : p));
  const goneRef = useRef(null);
  useEffect(() => {
    if (!gone) return;
    const tm = setTimeout(() => {
      const el = goneRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const top = document.querySelector('header.top')?.getBoundingClientRect().bottom || 70;
      if (r.top < top + 8 || r.top > window.innerHeight * 0.55) window.scrollTo({ top: window.scrollY + r.top - top - 16, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }, 60);
    return () => clearTimeout(tm);
  }, [gone]);
  const blocked = () => { play('hide'); setLeaving(true); setTimeout(() => setGone('block'), 720); };
  const panelRef = useRef(null);
  // Opening a profile, a performer or any panel under the post scrolls it into view.
  useEffect(() => {
    if (!panel) return undefined;
    const tm = setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
    return () => clearTimeout(tm);
  }, [panel]);
  const openPerson = (p) => setPanel(`person:${p.platform || 'any'}|${p.handle}`);
  const trTitle = useTranslate(item, 'title');
  const trBody = useTranslate(item, 'body');
  const [downNote, setDownNote] = useState(false);
  // On a phone the kinks and tags stay on one line; a button at its end opens them all.
  useEffect(() => {
    const el = chipsRef.current;
    if (!el) return undefined;
    const check = () => {
      if (el.scrollWidth <= el.clientWidth + 2) { setOver(0); return; }
      const cut = [...el.children].filter((c) => c.offsetWidth && c.offsetLeft + c.offsetWidth > el.clientWidth - 4).length;
      setOver(cut + Math.max(0, (item.tags || []).length - 9));
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [allTags, item.tags, item.kinks]);
  // The ⋯ menu on a phone closes when you tap anywhere else.
  useEffect(() => {
    if (!menu) return undefined;
    const off = (e) => { if (!menuRef.current?.contains(e.target)) setMenu(false); };
    document.addEventListener('pointerdown', off, true);
    return () => document.removeEventListener('pointerdown', off, true);
  }, [menu]);
  // The post shrinks to its question when hidden, so the feed would jump to the next post: scroll back up a little,
  // so the question about what you did not like is right there.
  if (gone) return <div ref={goneRef} className="post gone fxin"><span>{gone === 'block' ? t('Blocked. Nothing from them shows up again; you can unblock them in Memory.') : t('Hidden. The feed will show less like this.')}</span><DislikeNote id={item.id} /></div>;
  const id = identity(item);
  const isText = item.media?.kind === 'text';
  const liked = item.media?.rating;
  const votes = item.media?.votes;
  const tagList = item.tags || [];
  const shownTags = allTags ? tagList : tagList.slice(0, 9);
  const sub = [...id.sub, item.media?.repostedBy ? t('reposted by @{name}', { name: item.media.repostedBy }) : null, item.media?.views ? tn(item.media.views, '{n} view', '{n} views', { n: fmtNum(item.media.views) }) : null, ago(item.created)].filter(Boolean).join(' · ');

  return (
    <article ref={ref} className={`post${focus ? ' focus' : ''}${leaving ? ' leaving' : ''}`} data-id={item.id}>
      <header className="ph">
        <button type="button" className="who" onClick={() => (id.handle ? toggle('profile') : id.performer ? toggle(`performer:${id.performer}`) : null)} aria-label={t('Show profile of {name}', { name: id.name })}>
          {item.media?.avatar ? <img className="avatar av-m avimg" src={item.media.avatar} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <Avatar name={id.name} />}
          <span className="names"><strong>{id.name}</strong><span>{sub}</span></span>
        </button>
        <div className="right">
          {item.oc ? <span className="ocbadge" title={t('The poster marked this as their own original content')}>{t('Original content')}</span> : null}
          <span className={`pill pill-${item.label}`}>{LABELS[item.label]}</span>
          <span className="match" title={t('Match with you')}><span className="meter" style={{ '--c': c }}><i style={{ width: `${item.match}%` }} /></span>{item.match}%</span>
        </div>
      </header>
      {item.performers?.length || item.people?.length ? (
        <div className="performers">
          <span className="fb-label">{t('In this video')}</span>
          {(item.performerCards || (item.performers || []).map((name) => ({ name }))).slice(0, 8).map((p) => (
            <button type="button" key={p.name} className={`perf${panel === `performer:${p.name}` ? ' on' : ''}`} onClick={() => { toggle(`performer:${p.name}`); strong('performer'); }} title={p.videos ? tn(p.videos, '{name}, {n} video on Pornhub', '{name}, {n} videos on Pornhub', { name: p.name }) : p.name}>
              <PerfAvatar p={p} />
              {String(p.name).replace(/^@+/, '')}{p.videos ? <small>{p.videos >= 1000 ? `${Math.round(p.videos / 100) / 10}k` : p.videos}</small> : null}
            </button>
          ))}
          {(item.people || []).map((p) => (
            <button type="button" key={p.handle} className={`perf mentionchip${panel === `person:${p.platform}|${p.handle}` ? ' on' : ''}`} onClick={() => { openPerson(p); strong('performer'); }}><Avatar name={p.handle} size="s" />{String(p.handle).replace(/^@+/, '')}</button>
          ))}
        </div>
      ) : null}
      {!isText ? <p className="ptitle"><Linkify text={trTitle.text || item.title} source={item.source} onPerson={openPerson} /><TranslateButton tr={trTitle} small /><TranslatedNote tr={trTitle} /></p> : null}
      <div ref={mediaRef} className="pmedia" onClickCapture={onMediaClick}><PostFx fx={fx} /><HeatFx heat={heat} /><Media item={item} active={active} near={near} height={lastH.current} onPlay={() => strong('play')} onReady={() => setReady(true)} onPerson={openPerson} onLike={likeByTap} /></div>
      {!isText && item.body ? <p className="ptext caption"><Linkify text={trBody.text || item.body} source={item.source} onPerson={openPerson} /><TranslateButton tr={trBody} small /><TranslatedNote tr={trBody} /></p> : null}
      {item.aiSummary && !isText ? <p className="aisum">{item.aiSummary}</p> : null}
      <div className={`chipwrap${over && !allTags ? ' over' : ''}`}>
      <div ref={chipsRef} className={`chiprow${allTags ? ' all' : ' one'}${over && !allTags ? ' over' : ''}`}>
        {item.gender && (item.gender.women || item.gender.men || item.gender.trans) ? (
          <span className="gicons" title={`${item.gender.women ? tn(item.gender.women, '{n} woman', '{n} women') : ''}${item.gender.women && item.gender.men ? ', ' : ''}${item.gender.men ? tn(item.gender.men, '{n} man', '{n} men') : ''}${item.gender.trans ? ', trans' : ''}${item.gender.sure ? '' : t(' (guess until the AI looks closer)')}`}>
            {item.gender.women ? <><span className="gf"><Icon name="female" /></span>{item.gender.women > 1 ? <em>{item.gender.women}</em> : null}</> : null}
            {item.gender.men ? <><span className="gm"><Icon name="male" /></span>{item.gender.men > 1 ? <em>{item.gender.men}</em> : null}</> : null}
            {item.gender.trans ? <span className="gt"><Icon name="trans" /></span> : null}
          </span>
        ) : null}
        {item.kinks?.map((k) => (
          <span key={k.id} className="chip link kchip" style={{ '--c': k.color, '--c2': rgba(k.color, 0.16) }}>
            <button type="button" onClick={() => setFilters({ kink: k.id })} title={t('Show only {name}', { name: k.name })}>{k.name}</button>
            <button type="button" className="kx" onClick={() => setKink(k, false)} aria-label={t('This post is not {name}', { name: k.name })} title={t('Not {name}: take it out', { name: k.name })}><Icon name="x" /></button>
          </span>
        ))}
        {kinkPick ? (
          <select className="kinkpick" autoFocus defaultValue="" onChange={(e) => { const k = allKinks.find((x) => x.id === Number(e.target.value)); if (k) setKink(k, true); }} onBlur={() => setKinkPick(false)} aria-label={t('Add this post to a kink')}>
            <option value="" disabled>{t('Add to a kink…')}</option>
            {allKinks.filter((k) => !k.isGroup && k.status !== 'hidden' && !item.kinks?.some((x) => x.id === k.id)).sort((a, b) => a.name.localeCompare(b.name)).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        ) : <button type="button" className="chip ghost more addkink" onClick={() => setKinkPick(true)} title={t('Add this post to one of your kinks')}>{t('+ kink')}</button>}
        {shownTags.map((tag) => <button type="button" key={tag} className={`chip ghost link${item.liked?.includes(tag) ? ' mine' : ''}`} onClick={() => runSearch(tag).catch(() => setFilters({ tags: [tag] }))} title={t('Search everything for {tag}', { tag })}>{tag}</button>)}
        {tagList.length > 9 || allTags ? <button type="button" className="chip ghost more" onClick={() => setAllTags((x) => !x)}>{allTags ? t('fewer') : t('+{n} tags', { n: tagList.length - 9 })}</button> : null}
        <span className="chip ghost meta">{formatMeta(item)}</span>
      </div>
        {over && !allTags ? <button type="button" className="chip ghost more chipmore" onClick={() => setAllTags(true)} aria-label={t('Show all kinks and tags')} title={t('Show all kinks and tags')}>{t('+{n}', { n: over })}</button> : null}
      </div>
      <div className="pbar">
        <div className="grp">
          <div className="votewrap" title={liked ? (votes ? t('{p}% of {n} votes were likes', { p: Math.round(liked), n: fmtNum(votes) }) : t('{p}% of the votes were likes', { p: Math.round(liked) })) : undefined}>
            <div className="vote">
              <button type="button" className={`vup${item.vote > 0 ? ' on' : ''}`} onClick={() => vote(1)} aria-label={t('I like this')}><Icon name="up" /></button>
              {item.upvotes != null ? <span>{fmtNum(item.upvotes)}</span> : null}
              <button type="button" className={`vdown${item.vote < 0 ? ' on' : ''}`} onClick={() => vote(-1)} aria-label={t("I don't like this")}><Icon name="down" /></button>
            </div>
            {liked ? <div className="likebar" aria-label={t('{p}% liked', { p: Math.round(liked) })}><i style={{ width: `${Math.max(0, Math.min(100, liked))}%` }} /></div> : null}
          </div>
          {HAS_COMMENTS.has(item.source) ? <button type="button" className={`pb${panel === 'comments' ? ' on' : ''}`} onClick={() => { toggle('comments'); strong('comments'); }} aria-label={t('Comments')}><Icon name="comment" />{item.comments ? fmtNum(item.comments) : null}</button> : null}
        </div>
        <HeatSlider value={item.rating || 0} onChange={rate} onLive={onHeat} />
        <div className={`pmenu${menu ? ' open' : ''}`} ref={menuRef}>
        <button type="button" className={`pb icon dotsbtn${menu ? ' on' : ''}`} onClick={() => setMenu((x) => !x)} aria-label={t('More actions')} aria-expanded={menu} title={t('More actions')}><Icon name="dots" filled /></button>
        <div className="grp end" onClick={(e) => { if (menu && e.target.closest('button, a')) setTimeout(() => setMenu(false), 120); }}>
          <button type="button" className={`pb icon${panel === 'ask' ? ' on' : ''}`} onClick={() => toggle('ask')} aria-label={t('Ask or tell the assistant about this post')} title={t('Ask or tell the assistant')}><Icon name="ask" /><span className="pblabel">{t('Ask the assistant')}</span></button>
          <button type="button" className={`pb icon${panel === 'why' ? ' on' : ''}`} onClick={() => toggle('why')} aria-label={t('Why this')} title={t('Why this')}><Icon name="why" /><span className="pblabel">{t('Why this')}</span></button>
          <button type="button" className={`pb icon${item.saved ? ' on' : ''}`} onClick={save} aria-label={item.saved ? t('Unsave') : t('Save')} title={item.saved ? plain(t('Saved [button state]')) : t('Save')}><Icon name="save" filled={item.saved} /><span className="pblabel">{item.saved ? t('Unsave') : t('Save')}</span></button>
          <button type="button" className="pb icon" onClick={less} aria-label={t('Less like this')} title={t('Less like this')}><Icon name="less" /><span className="pblabel">{t('Less like this')}</span></button>
          {item.url ? <a className="pb icon" href={item.url} target="_blank" rel="noreferrer noopener" aria-label={t('Open on source')} title={t('Open on the original site')} onClick={() => track(item.id, 'open')}><Icon name="open" /><span className="pblabel">{t('Open on the original site')}</span></a> : null}
        </div>
        </div>
      </div>
      {downNote ? <DislikeNote id={item.id} compact /> : null}
      {panel ? (
        <div className="panel-in" ref={panelRef}>
          {panel === 'why' ? <WhyPanel item={item} /> : null}
          {panel === 'ask' ? <AskPanel item={item} onPatch={applyPatch} /> : null}
          {panel === 'comments' ? <CommentsPanel item={item} /> : null}
          {panel === 'profile' ? <ProfilePanel item={item} onBlocked={blocked} /> : null}
          {panel.startsWith('performer:') ? <PerformerPanel name={panel.slice(10)} itemId={item.id} onBlocked={blocked} /> : null}
          {panel.startsWith('person:') ? <PersonPanel key={panel} item={item} person={{ platform: panel.slice(7).split('|')[0], handle: panel.slice(7).split('|').slice(1).join('|') }} /> : null}
        </div>
      ) : null}
      <i className="snapend" aria-hidden="true" />
    </article>
  );
}
