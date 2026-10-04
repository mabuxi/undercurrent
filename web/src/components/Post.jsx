import { useEffect, useRef, useState } from 'react';
import { ago, api, fmtNum, formatMeta, LABELS, rgba, track, imgSrc } from '../api.js';
import { useApp } from '../context.jsx';
import { Icon } from '../icons.jsx';
import { Media } from './Media.jsx';
import { AskPanel, Avatar, CommentsPanel, ProfilePanel, PerformerPanel, PersonPanel, HeatSlider, WhyPanel } from './Panels.jsx';
import Linkify from './Linkify.jsx';

// A performer's photo from the Pornhub performer list, or their initials when there is none.
function PerfAvatar({ p }) {
  const [bad, setBad] = useState(false);
  if (!p.thumb || bad) return <Avatar name={p.name} size="s" />;
  return <img className="avatar av-s avimg" src={imgSrc(p.thumb)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} />;
}

const HAS_COMMENTS = new Set(['reddit', 'lemmy']);
const AUTO_UP_HEAT = 2;

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
  const [kinkPick, setKinkPick] = useState(false);
  const [panel, setPanel] = useState(null);
  const [gone, setGone] = useState(false);
  const [allTags, setAllTags] = useState(false);
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
  if (near && mediaRef.current) lastH.current = mediaRef.current.offsetHeight || lastH.current;
  const c = item.kinks?.[0]?.color || '#E39A83';

  async function vote(dir) {
    const next = item.vote === dir ? 0 : dir;
    setItem({ ...item, vote: next, score: item.score - item.vote + next, upvotes: item.upvotes != null ? item.upvotes - (item.vote > 0 ? 1 : 0) + (next > 0 ? 1 : 0) : null });
    if (next > 0) strong('up');
    try {
      const r = await api(`/items/${item.id}/vote`, { method: 'POST', body: { dir: next } });
      if (r.synced && next) toast(next > 0 ? 'Upvoted on Reddit too.' : 'Downvoted on Reddit too.');
    } catch (e) { toast(e.message); }
  }

  async function save() {
    const on = !item.saved;
    setItem({ ...item, saved: on });
    if (on) strong('save');
    try {
      const r = await api(`/items/${item.id}/save`, { method: 'POST', body: { on } });
      toast(on ? `Saved${r.synced ? ' here and on Reddit' : ''}.` : 'Removed from saved.');
    } catch (e) { toast(e.message); }
  }

  async function less() {
    setGone(true);
    try {
      await api(`/items/${item.id}/less`, { method: 'POST', body: {} });
      toast(`Less like this. ${item.tags?.slice(0, 2).join(' and ') || 'These tags'} count against it now.`);
    } catch (e) { toast(e.message); }
  }

  // Finding something hot is liking it: a heat of 2 flames or more upvotes it too (also on Reddit when that is on).
  async function rate(n) {
    const autoUp = n >= AUTO_UP_HEAT && item.vote <= 0;
    setItem((cur) => ({ ...cur, rating: n, ...(autoUp ? { vote: 1, upvotes: cur.upvotes != null ? cur.upvotes + 1 - (cur.vote > 0 ? 1 : 0) : null } : {}) }));
    if (n > 0) strong('rate');
    try {
      await api(`/items/${item.id}/rate`, { method: 'POST', body: { value: n } });
      if (autoUp) await api(`/items/${item.id}/vote`, { method: 'POST', body: { dir: 1 } });
      if (n) toast(n >= 4 ? `On fire${autoUp ? ' and upvoted' : ''}. Your feed goes deeper into this.` : `Noted how hot this was${autoUp ? ', and upvoted it' : ''}. It counts more than an upvote.`);
    } catch (e) { toast(e.message); }
  }

  // Put this post in one of your kinks, or take it out when the tagging got it wrong.
  async function setKink(k, on) {
    setKinkPick(false);
    try {
      const r = await api(`/items/${item.id}/kinks`, { method: 'POST', body: { kink: k.id, on } });
      setItem((cur) => ({ ...cur, kinks: r.item.kinks, tags: r.item.tags }));
      toast(on ? `Added to ${k.name}.` : `Taken out of ${k.name}: the tags that put it there are removed from this post.`);
      refreshMeta?.();
    } catch (e) { toast(e.message); }
  }

  function applyPatch(patch) {
    if (patch.hidden) setGone(true);
    else if (patch.reasonTags) setItem((cur) => ({ ...cur, tags: [...new Set([...patch.reasonTags, ...(cur.tags || [])])], liked: patch.reasonTags }));
    else setItem((cur) => ({ ...cur, ...patch }));
  }

  const toggle = (p) => setPanel((cur) => (cur === p ? null : p));
  const panelRef = useRef(null);
  // Opening a profile, a performer or any panel under the post scrolls it into view.
  useEffect(() => {
    if (!panel) return undefined;
    const t = setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
    return () => clearTimeout(t);
  }, [panel]);
  const openPerson = (p) => setPanel(`person:${p.platform || 'any'}|${p.handle}`);
  if (gone) return <div className="post gone">Hidden. The feed will show less like this.</div>;
  const id = identity(item);
  const isText = item.media?.kind === 'text';
  const liked = item.media?.rating;
  const votes = item.media?.votes;
  const tagList = item.tags || [];
  const shownTags = allTags ? tagList : tagList.slice(0, 9);
  const sub = [...id.sub, item.media?.repostedBy ? `reposted by @${item.media.repostedBy}` : null, item.media?.views ? `${fmtNum(item.media.views)} views` : null, ago(item.created)].filter(Boolean).join(' · ');

  return (
    <article ref={ref} className={`post${focus ? ' focus' : ''}`} data-id={item.id}>
      <header className="ph">
        <button type="button" className="who" onClick={() => (id.handle ? toggle('profile') : id.performer ? toggle(`performer:${id.performer}`) : null)} aria-label={`Show profile of ${id.name}`}>
          {item.media?.avatar ? <img className="avatar av-m avimg" src={item.media.avatar} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <Avatar name={id.name} />}
          <span className="names"><strong>{id.name}</strong><span>{sub}</span></span>
        </button>
        <div className="right">
          {item.oc ? <span className="ocbadge" title="The poster marked this as their own original content">Original content</span> : null}
          <span className={`pill pill-${item.label}`}>{LABELS[item.label]}</span>
          <span className="match" title="Match with you"><span className="meter" style={{ '--c': c }}><i style={{ width: `${item.match}%` }} /></span>{item.match}%</span>
        </div>
      </header>
      {item.performers?.length || item.people?.length ? (
        <div className="performers">
          <span className="fb-label">In this video</span>
          {(item.performerCards || (item.performers || []).map((name) => ({ name }))).slice(0, 8).map((p) => (
            <button type="button" key={p.name} className={`perf${panel === `performer:${p.name}` ? ' on' : ''}`} onClick={() => { toggle(`performer:${p.name}`); strong('performer'); }} title={p.videos ? `${p.name}, ${p.videos} videos on Pornhub` : p.name}>
              <PerfAvatar p={p} />
              {String(p.name).replace(/^@+/, '')}{p.videos ? <small>{p.videos >= 1000 ? `${Math.round(p.videos / 100) / 10}k` : p.videos}</small> : null}
            </button>
          ))}
          {(item.people || []).map((p) => (
            <button type="button" key={p.handle} className={`perf mentionchip${panel === `person:${p.platform}|${p.handle}` ? ' on' : ''}`} onClick={() => { openPerson(p); strong('performer'); }}><Avatar name={p.handle} size="s" />{String(p.handle).replace(/^@+/, '')}</button>
          ))}
        </div>
      ) : null}
      {!isText ? <p className="ptitle"><Linkify text={item.title} source={item.source} onPerson={openPerson} /></p> : null}
      <div ref={mediaRef}><Media item={item} active={active} near={near} height={lastH.current} onPlay={() => strong('play')} onReady={() => setReady(true)} onPerson={openPerson} /></div>
      {!isText && item.body ? <p className="ptext caption"><Linkify text={item.body} source={item.source} onPerson={openPerson} /></p> : null}
      {item.aiSummary && !isText ? <p className="aisum">{item.aiSummary}</p> : null}
      <div className="chiprow">
        {item.gender && (item.gender.women || item.gender.men || item.gender.trans) ? (
          <span className="gicons" title={`${item.gender.women ? `${item.gender.women} ${item.gender.women > 1 ? 'women' : 'woman'}` : ''}${item.gender.women && item.gender.men ? ', ' : ''}${item.gender.men ? `${item.gender.men} ${item.gender.men > 1 ? 'men' : 'man'}` : ''}${item.gender.trans ? ', trans' : ''}${item.gender.sure ? '' : ' (guess until the AI looks closer)'}`}>
            {item.gender.women ? <><span className="gf"><Icon name="female" /></span>{item.gender.women > 1 ? <em>{item.gender.women}</em> : null}</> : null}
            {item.gender.men ? <><span className="gm"><Icon name="male" /></span>{item.gender.men > 1 ? <em>{item.gender.men}</em> : null}</> : null}
            {item.gender.trans ? <span className="gt"><Icon name="trans" /></span> : null}
          </span>
        ) : null}
        {item.kinks?.map((k) => (
          <span key={k.id} className="chip link kchip" style={{ '--c': k.color, '--c2': rgba(k.color, 0.16) }}>
            <button type="button" onClick={() => setFilters({ kink: k.id })} title={`Show only ${k.name}`}>{k.name}</button>
            <button type="button" className="kx" onClick={() => setKink(k, false)} aria-label={`This post is not ${k.name}`} title={`Not ${k.name}: take it out`}><Icon name="x" /></button>
          </span>
        ))}
        {kinkPick ? (
          <select className="kinkpick" autoFocus defaultValue="" onChange={(e) => { const k = allKinks.find((x) => x.id === Number(e.target.value)); if (k) setKink(k, true); }} onBlur={() => setKinkPick(false)} aria-label="Add this post to a kink">
            <option value="" disabled>Add to a kink…</option>
            {allKinks.filter((k) => !k.isGroup && k.status !== 'hidden' && !item.kinks?.some((x) => x.id === k.id)).sort((a, b) => a.name.localeCompare(b.name)).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        ) : <button type="button" className="chip ghost more addkink" onClick={() => setKinkPick(true)} title="Add this post to one of your kinks">+ kink</button>}
        {shownTags.map((t) => <button type="button" key={t} className={`chip ghost link${item.liked?.includes(t) ? ' mine' : ''}`} onClick={() => runSearch(t).catch(() => setFilters({ tags: [t] }))} title={`Search everything for ${t}`}>{t}</button>)}
        {tagList.length > 9 ? <button type="button" className="chip ghost more" onClick={() => setAllTags((x) => !x)}>{allTags ? 'fewer' : `+${tagList.length - 9} tags`}</button> : null}
        <span className="chip ghost meta">{formatMeta(item)}</span>
      </div>
      <div className="pbar">
        <div className="grp">
          <div className="votewrap" title={liked ? `${Math.round(liked)}% of ${votes ? fmtNum(votes) : 'the'} votes were likes` : undefined}>
            <div className="vote">
              <button type="button" className={item.vote > 0 ? 'on' : ''} onClick={() => vote(1)} aria-label="I like this"><Icon name="up" /></button>
              {item.upvotes != null ? <span>{fmtNum(item.upvotes)}</span> : null}
              <button type="button" className={item.vote < 0 ? 'on' : ''} onClick={() => vote(-1)} aria-label="I don't like this"><Icon name="down" /></button>
            </div>
            {liked ? <div className="likebar" aria-label={`${Math.round(liked)}% liked`}><i style={{ width: `${Math.max(0, Math.min(100, liked))}%` }} /></div> : null}
          </div>
          {HAS_COMMENTS.has(item.source) ? <button type="button" className={`pb${panel === 'comments' ? ' on' : ''}`} onClick={() => { toggle('comments'); strong('comments'); }} aria-label="Comments"><Icon name="comment" />{item.comments ? fmtNum(item.comments) : null}</button> : null}
        </div>
        <HeatSlider value={item.rating || 0} onChange={rate} />
        <div className="grp end">
          <button type="button" className={`pb icon${panel === 'ask' ? ' on' : ''}`} onClick={() => toggle('ask')} aria-label="Ask or tell the assistant about this post" title="Ask or tell the assistant"><Icon name="ask" /></button>
          <button type="button" className={`pb icon${panel === 'why' ? ' on' : ''}`} onClick={() => toggle('why')} aria-label="Why this" title="Why this"><Icon name="why" /></button>
          <button type="button" className={`pb icon${item.saved ? ' on' : ''}`} onClick={save} aria-label={item.saved ? 'Unsave' : 'Save'} title={item.saved ? 'Saved' : 'Save'}><Icon name="save" filled={item.saved} /></button>
          <button type="button" className="pb icon" onClick={less} aria-label="Less like this" title="Less like this"><Icon name="less" /></button>
          {item.url ? <a className="pb icon" href={item.url} target="_blank" rel="noreferrer noopener" aria-label="Open on source" title="Open on the original site" onClick={() => track(item.id, 'open')}><Icon name="open" /></a> : null}
        </div>
      </div>
      {panel ? (
        <div className="panel-in" ref={panelRef}>
          {panel === 'why' ? <WhyPanel item={item} /> : null}
          {panel === 'ask' ? <AskPanel item={item} onPatch={applyPatch} /> : null}
          {panel === 'comments' ? <CommentsPanel item={item} /> : null}
          {panel === 'profile' ? <ProfilePanel item={item} /> : null}
          {panel.startsWith('performer:') ? <PerformerPanel name={panel.slice(10)} /> : null}
          {panel.startsWith('person:') ? <PersonPanel key={panel} item={item} person={{ platform: panel.slice(7).split('|')[0], handle: panel.slice(7).split('|').slice(1).join('|') }} /> : null}
        </div>
      ) : null}
    </article>
  );
}
