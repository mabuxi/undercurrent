import { useCallback, useEffect, useRef, useState } from 'react';
import { api, FORMATS, flushNow, imgSrc } from '../api.js';
import { useApp, MOODS } from '../context.jsx';
import { Icon } from '../icons.jsx';
import Post from './Post.jsx';
import { Window } from './Windows.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { refreshWindows } from './SideColumn.jsx';
import { begin, end } from '../activity.js';
import { Avatar } from './Panels.jsx';

export function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.innerWidth <= 900);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth <= 900);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return narrow;
}

const FORMAT_ICON = { long: 'video', short: 'loop', gif: 'spark', image: 'image', set: 'images', story: 'book', discussion: 'thread' };
const FORMAT_COLOR = { long: '#E39A83', short: '#7FD0C2', gif: '#B79BF0', image: '#93B4DF', set: '#7FA7D9', story: '#E8C66B', discussion: '#B6A8B0' };

const NOW_KIND = {
  kink: { label: 'kink', icon: 'flame', color: '#E39A83' },
  tag: { label: 'tag', icon: 'pulse', color: '#E8C66B' },
  person: { label: 'person', icon: 'person', color: '#D6A0CF' },
  creator: { label: 'creator', icon: 'person', color: '#8EA6C9' },
  pair: { label: 'pair', icon: 'route', color: '#B79BF0' },
  fantasy: { label: 'fantasy', icon: 'spark', color: '#F6C35B' },
  new: { label: 'new', icon: 'spark', color: '#7FD0C2' }
};

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function TChip({ on, icon, color, label, sub, onClick, title }) {
  return (
    <button type="button" className={`tchip${on ? ' on' : ''}`} style={{ '--tc': color || '#B6A8B0' }} onClick={onClick} title={title}>
      {icon ? <Icon name={icon} /> : null}<span>{label}</span>{sub ? <small>{sub}</small> : null}
    </button>
  );
}

// Men and women balance: pink on the women side, blue on the men side.
function Balance() {
  const { refreshFeed, toast } = useApp();
  const [g, setG] = useState(null);
  const timer = useRef(null);
  useEffect(() => {
    const load = () => api('/settings/gender').then(setG).catch(() => {});
    load();
    window.addEventListener('uc-gender', load);
    return () => window.removeEventListener('uc-gender', load);
  }, []);
  if (!g) return null;
  const save = (patch, msg) => {
    const next = { ...g, ...patch };
    setG(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { const r = await api('/settings/gender', { method: 'PUT', body: patch }); setG(r); refreshFeed(); refreshWindows(); if (msg) toast(msg); } catch (e) { toast(e.message); }
    }, 350);
  };
  const male = g.auto ? g.autoValue : g.male;
  return (
    <div className="tline">
      <span className="tlabel">Gender</span>
      <div className="uslider-row">
        <span className="gsym f" title="Women"><Icon name="female" /></span>
        <input className="uslider gender" type="range" min="0" max="100" step="5" value={male} disabled={g.auto} aria-label="Balance between women and men" onChange={(e) => save({ male: Number(e.target.value) })} />
        <span className="gsym m" title="Men"><Icon name="male" /></span>
        <output>{male >= 90 ? 'men only' : male <= 10 ? 'women only' : `${100 - male}% women · ${male}% men`}</output>
      </div>
      <TChip on={g.auto} icon="auto" color="#B6A8B0" label="Auto" sub={g.auto ? 'from what you like' : null} onClick={() => save({ auto: !g.auto }, !g.auto ? 'The balance now follows what you like, heat and save.' : 'Balance set by hand again.')} title="Let the balance follow what you interact with" />
      <TChip on={g.trans} icon="trans" color="#C9A7E8" label="Trans" sub={g.trans ? 'allowed' : 'hidden'} onClick={() => save({ trans: !g.trans })} title="Allow trans content" />
    </div>
  );
}

// Which posts the feed draws from: everything (mixed), only new ones, or only popular ones, over a period.
// It filters; the order still follows how well each post fits you.
function FeedWindow() {
  const { filters, patchFilters } = useApp();
  const [mode, period] = String(filters.window || 'mixed:week').split(':');
  const set = (m, p) => patchFilters({ window: m === 'mixed' ? null : `${m}:${p || period || 'week'}` });
  return (
    <div className="tline feedwin">
      <span className="tlabel">Feed</span>
      <div className="fw">
        <label className="fsel"><Icon name={mode === 'new' ? 'spark' : mode === 'popular' ? 'flame' : 'grid'} />
          <select value={filters.window ? mode : 'mixed'} onChange={(e) => set(e.target.value)} aria-label="Feed">
            <option value="mixed">Mixed</option>
            <option value="new">Only new posts</option>
            <option value="popular">Only popular</option>
          </select>
        </label>
        {filters.window ? (
          <label className="fsel"><Icon name="clock" />
            <select value={period} onChange={(e) => set(mode, e.target.value)} aria-label="Period">
              <option value="day">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="year">This year</option>
            </select>
          </label>
        ) : null}
        <span className="count">{!filters.window ? 'everything, ordered by how well it fits you' : mode === 'new' ? 'only posts from this period' : 'only the most upvoted and viewed posts of this period'}</span>
      </div>
    </div>
  );
}

const PLATFORM = { bluesky: 'Bluesky', reddit: 'Reddit', redgifs: 'RedGIFs', lemmy: 'Lemmy', pornhub: 'Pornhub', redtube: 'RedTube', eporner: 'Eporner', xvideos: 'XVideos', xnxx: 'XNXX', xhamster: 'xHamster', youporn: 'YouPorn', txxx: 'TXXX' };

function ProfileCard({ p, active, followed, onOpen, onFollow }) {
  const [bad, setBad] = useState(false);
  const stats = [
    p.followers != null ? `${fmtCount(p.followers)} ${p.kind === 'community' ? 'members' : 'followers'}` : null,
    p.posts != null ? `${fmtCount(p.posts)} ${p.kind === 'name' || ['pornhub', 'redtube', 'eporner', 'xvideos', 'xnxx', 'xhamster', 'youporn', 'txxx'].includes(p.platform) ? 'videos' : 'posts'}` : null,
    p.views ? `${fmtCount(p.views)} views` : null
  ].filter(Boolean).join(' · ');
  return (
    <div className={`pcard${active ? ' on' : ''}`}>
      <button type="button" className="pcard-main" onClick={() => onOpen(p)} title={`Show only posts from ${p.name}`}>
        {p.avatar && !bad ? <img src={imgSrc(p.avatar)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} /> : <Avatar name={p.name} size="m" />}
        <span className="pcard-txt">
          <strong>{p.name}</strong>
          <span className="pcard-sub"><em className={`plat plat-${p.platform}`}>{PLATFORM[p.platform] || p.platform}{p.kind === 'community' ? ' community' : p.kind === 'performer' ? ' performer' : ''}</em>{p.handle && p.handle !== p.name ? ` ${p.handle}` : ''}</span>
          {stats ? <span className="pcard-stats">{stats}</span> : <span className="pcard-stats dim">no follower count from this source</span>}
        </span>
      </button>
      <div className="pcard-acts">
        {p.url ? <a href={p.url} target="_blank" rel="noreferrer noopener" aria-label={`Open ${p.name} on ${PLATFORM[p.platform] || p.platform}`} title="Open on the site"><Icon name="open" /></a> : null}
        {p.kind !== 'name' ? <button type="button" onClick={() => onFollow(p)} disabled={followed} aria-label={followed ? 'Added to your sources' : `Add ${p.name} to your sources`} title={followed ? 'Added to your sources' : 'Add to your sources'}><Icon name={followed ? 'check' : 'plus'} /></button> : null}
      </div>
    </div>
  );
}

// What a search found besides posts: the person it looked up, and profiles and communities on every source.
function SearchCard() {
  const { search, filters, toast, openProfile, patchFilters } = useApp();
  const [followed, setFollowed] = useState({});
  const [shown, setShown] = useState(8);
  useEffect(() => { setShown(8); }, [search?.id]);
  if (!search || filters.search !== search.id) return null;
  const p = search.person;
  const profiles = search.profiles || [];
  const srcs = (search.sources || []).filter((s) => !profiles.some((x) => x.platform === s.provider && String(x.value).toLowerCase() === String(s.value).toLowerCase()));
  if (!p && !profiles.length && !srcs.length) return null;
  async function add(s) {
    const body = { provider: s.provider, mode: s.mode, value: s.value, label: s.label || `${PLATFORM[s.provider] || s.provider}: ${s.name || s.value}` };
    try { await api(`/search/${search.id}/follow`, { method: 'POST', body }); setFollowed((f) => ({ ...f, [`${s.provider}|${s.value}`]: true })); toast(`Added ${body.label} to your sources.`); } catch (e) { toast(e.message); }
  }
  return (
    <div className="searchcard">
      {p ? (
        <div className="personcard">
          {p.avatar ? <img className="pc-img" src={imgSrc(p.avatar)} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <Avatar name={p.display} size="l" />}
          <div className="pc-main">
            <strong>{p.display}</strong>
            <span>{[p.videos ? `${fmtCount(p.videos)} videos on Pornhub` : null, p.views ? `${fmtCount(p.views)} views on the videos found` : null, p.profiles.length ? `profiles on ${[...new Set(p.profiles.map((x) => PLATFORM[x.platform] || x.platform))].join(', ')}` : null].filter(Boolean).join(' · ') || 'searching every source'}</span>
            {p.links.length ? <div className="pc-links">{p.links.map((l) => <a key={l.url} className="pc-ext" href={l.url} target="_blank" rel="noreferrer noopener"><Icon name="globe" />{l.platform}: {l.handle}</a>)}</div> : null}
          </div>
        </div>
      ) : null}
      {profiles.length ? (
        <div className="profiles">
          <div className="profiles-head">
            <span className="tlabel">Profiles and communities</span>
            {filters.profile ? <button type="button" className="linkbtn" onClick={() => patchFilters({ profile: null, profileLabel: null })}>Show all results again</button> : <span className="count">click one to see only their posts</span>}
          </div>
          <div className="pgrid">
            {profiles.slice(0, shown).map((x) => <ProfileCard key={x.key} p={x} active={filters.profile === x.key} followed={!!followed[`${x.provider}|${x.value}`]} onOpen={openProfile} onFollow={add} />)}
          </div>
          {profiles.length > shown ? <button type="button" className="linkbtn more" onClick={() => setShown((n) => n + 8)}>Show {Math.min(8, profiles.length - shown)} more of {profiles.length}</button> : null}
        </div>
      ) : null}
      {srcs.length ? (
        <div className="foundsrc">
          <span className="tlabel">Found in the results</span>
          <div className="tchips">
            {srcs.map((s) => (
              <button type="button" key={`${s.provider}|${s.value}`} className={`tchip${followed[`${s.provider}|${s.value}`] ? ' on' : ''}`} style={{ '--tc': '#93B4DF' }} onClick={() => add(s)} disabled={followed[`${s.provider}|${s.value}`]} title="Add as a source">
                <Icon name={followed[`${s.provider}|${s.value}`] ? 'check' : 'plus'} /><span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const fmtCount = (n) => { n = Number(n) || 0; return n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n); };

function Controls({ total }) {
  const { filters, opts, mix, setMix, setFilters, patchFilters, applyMood, presets, kinks, fantasies, askOut, clearSearch } = useApp();
  const [summary, setSummary] = useState(null);
  useEffect(() => { api('/home/summary').then((r) => setSummary(r.text)).catch(() => {}); }, []);
  const toggleFormat = (f) => {
    const cur = filters.formats || [];
    patchFilters({ formats: cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f] });
  };
  return (
    <>
      <div className="hello">
        <h2>{greeting()}</h2>
        <p className={`hello-sum${askOut ? ' answer' : ''}`} aria-live="polite">{askOut || summary || ''}</p>
      </div>
      <SearchCard />
      <section className="tuner" aria-label="Tune the feed">
        <FeedWindow />
        <div className="tline tline-top">
          <span className="tlabel">Mood</span>
          <div className="moodcards">
            {MOODS.map((m) => (
              <button key={m.id} type="button" className={`moodcard${opts.mood === m.id ? ' on' : ''}`} style={{ '--tc': m.color }} onClick={() => applyMood(m.id)}>
                <span className="mc-ic"><Icon name={m.icon} /></span>
                <strong>{m.label}</strong>
                <small>{m.hint}</small>
              </button>
            ))}
          </div>
        </div>
        {presets.length ? (
          <div className="tline">
            <span className="tlabel">Right now</span>
            <div className="tchips">{presets.map((p, i) => {
              const k = NOW_KIND[p.kind] || NOW_KIND.tag;
              return (
                <button type="button" key={`${p.kind}${p.label}`} className={`nowchip${opts.preset === i ? ' on' : ''}`} style={{ '--tc': k.color }} onClick={() => setFilters(p.filters, { preset: i })} title={`${k.label}: ${p.label}`}>
                  <Icon name={k.icon} /><span className="nk">{k.label}</span><span>{p.label}</span>{p.match !== null ? <small>{p.match}%</small> : null}
                </button>
              );
            })}</div>
          </div>
        ) : null}
        <div className="tline">
          <span className="tlabel">Formats</span>
          <div className="tchips">{Object.entries(FORMATS).map(([f, label]) => <TChip key={f} on={(filters.formats || []).includes(f)} icon={FORMAT_ICON[f]} color={FORMAT_COLOR[f]} label={label} onClick={() => toggleFormat(f)} />)}</div>
        </div>
        <Balance />
        <div className="tline">
          <span className="tlabel">New to you</span>
          <div className="uslider-row">
            <input className="uslider" type="range" id="mix" min="0" max="40" step="5" value={mix} onChange={(e) => setMix(Number(e.target.value))} aria-label="How much new to you" />
            <output htmlFor="mix">{mix}%</output>
            <span className="count">{filters.onlyNew ? 'only things you haven’t opened' : mix ? `about 1 in ${Math.max(2, Math.round(100 / mix))} is new to you` : 'nothing new mixed in'}</span>
          </div>
        </div>
      </section>
    </>
  );
}

export default function FeedView() {
  const { filters, opts, mix, feedKey, toast, refreshMeta, search, searchMore } = useApp();
  const narrow = useNarrow();
  const [items, setItems] = useState([]);
  const [wins, setWins] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [finding, setFinding] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [wider, setWider] = useState(false);
  const [fresh, setFresh] = useState(0);
  const dry = useRef(0);
  const retries = useRef(0);
  const relaxed = useRef(false);
  const retryTimer = useRef(null);
  const prefetching = useRef(false);
  const [deeper, setDeeper] = useState({});
  const deeperCount = useRef(0);
  const shown = useRef(new Set());
  const busy = useRef(false);
  const sentinel = useRef(null);
  const winCursor = useRef(0);
  const gen = useRef(0);
  const searching = !!filters.search;

  const loadMoreRef = useRef(null);
  const loadMore = useCallback(async (reset = false) => {
    if (busy.current && !reset) return;
    busy.current = true;
    const my = gen.current;
    setLoading(true);
    begin('feed', searching ? 'Loading search results' : 'Loading the feed', { quiet: !reset || !searching });
    try {
      flushNow();
      const first = [];
      if (reset && opts.focus) {
        try { first.push(await api(`/items/${opts.focus}`)); } catch {}
      }
      const hasFilter = Object.keys(filters || {}).length > 0;
      const f = () => (relaxed.current ? { ...filters, relaxed: true } : filters);
      let r = await api('/feed', { method: 'POST', body: { filters: f(), exclude: [...shown.current, ...first.map((x) => x.id)], limit: 8, mix } });
      if (my !== gen.current) return;
      // A search fetches from the sources itself; the feed only asks the sources for more when there is no search.
      if (!searching && r.items.length < 8 && dry.current < 3) {
        setFinding(true);
        begin('more', 'Fetching more from your sources', { quiet: true });
        let got = 0;
        try {
          const more = await api('/feed/more', { method: 'POST', body: { filters: f() } });
          if (my !== gen.current) return;
          got = more.added || 0;
          dry.current = more.added ? 0 : dry.current + 1;
          if (!more.added && hasFilter && dry.current >= 2 && !relaxed.current) { relaxed.current = true; dry.current = 0; }
          r = await api('/feed', { method: 'POST', body: { filters: f(), exclude: [...shown.current, ...first.map((x) => x.id)], limit: 8, mix } });
        } catch { dry.current++; } finally { end('more', 'done', got ? `${got} new posts` : 'nothing new'); if (my === gen.current) setFinding(false); }
        if (my !== gen.current) return;
      }
      if (!searching && r.total < 30 && !prefetching.current && dry.current < 3) {
        prefetching.current = true;
        api('/feed/more', { method: 'POST', body: { filters: f() } }).catch(() => {}).finally(() => { prefetching.current = false; });
      }
      // When nothing is left, look again a couple of times, then stop and say so instead of trying forever.
      if (!searching && dry.current >= 3 && r.items.length === 0 && retries.current < 2) {
        retries.current++;
        clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => { if (my === gen.current) { dry.current = 1; loadMoreRef.current?.(); } }, 20000);
      }
      const next = [...first, ...r.items].filter((x) => !shown.current.has(x.id));
      next.forEach((x) => { shown.current.add(x.id); for (const m of x.collection?.members || []) shown.current.add(m); });
      setItems((cur) => [...cur, ...next]);
      setTotal(r.total + first.length);
      setDone(r.items.length === 0 && (searching || (dry.current >= 3 && retries.current >= 2)));
      setWaiting(!searching && r.items.length === 0 && dry.current >= 3 && retries.current < 2 && retries.current > 0);
      setWider(relaxed.current);
      setError(null);
      if (narrow && next.length) {
        const n = Math.ceil(next.length / 5);
        const w = await api(`/windows?cursor=${winCursor.current}&count=${n}&side=2`);
        winCursor.current += n;
        setWins((cur) => [...cur, ...w.windows]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      end('feed');
      if (my === gen.current) {
        busy.current = false;
        setLoading(false);
        setTimeout(() => {
          const el = sentinel.current;
          if (my === gen.current && el && dry.current < 3 && el.getBoundingClientRect().top < window.innerHeight + 1400) loadMoreRef.current?.();
        }, 400);
      }
    }
  }, [filters, mix, opts.focus, narrow, searching]);
  loadMoreRef.current = loadMore;

  const reset = useCallback(() => {
    gen.current++;
    busy.current = false;
    shown.current = new Set();
    winCursor.current = 0;
    dry.current = 0;
    retries.current = 0;
    relaxed.current = false;
    clearTimeout(retryTimer.current);
    setWaiting(false);
    setWider(false);
    setFresh(0);
    setItems([]);
    setWins([]);
    setDeeper({});
    deeperCount.current = 0;
    setDone(false);
    setTotal(null);
    loadMoreRef.current?.(true);
  }, []);

  useEffect(() => { reset(); }, [feedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Results from the sources come in while you look: shown right away near the top or when the feed is empty,
  // otherwise offered with a button so the feed does not jump under you.
  useEffect(() => {
    const on = (e) => {
      if (e.detail?.id !== filters.search) return;
      if (window.scrollY < 700 || shown.current.size === 0) reset();
      else if (e.type === 'uc-search-done') setFresh(e.detail.found || 1);
      else if (done) { setDone(false); busy.current = false; loadMoreRef.current?.(); }
    };
    window.addEventListener('uc-search-done', on);
    window.addEventListener('uc-search-progress', on);
    return () => { window.removeEventListener('uc-search-done', on); window.removeEventListener('uc-search-progress', on); };
  }, [filters.search, reset, done]);

  const WHY = { dwell: 'You stayed on this', play: 'You played this', up: 'You liked this', save: 'You saved this', rate: 'You rated this high', comments: 'You opened the comments', performer: 'You looked at who is in this' };
  const onStrong = useCallback(async (item, why) => {
    if (deeperCount.current > 40) return;
    deeperCount.current++;
    begin(`sim${item.id}`, 'Finding similar posts');
    try {
      const r = await api(`/items/${item.id}/similar?limit=${why === 'dwell' ? 2 : 3}&exclude=${[...shown.current].slice(-300).join(',')}`);
      const fresh = (r.items || []).filter((x) => !shown.current.has(x.id));
      if (!fresh.length) return;
      fresh.forEach((x) => shown.current.add(x.id));
      const label = r.performers?.length && fresh[0].performers?.some((p) => r.performers.includes(String(p).toLowerCase())) ? `more with ${r.performers[0]}` : `going deeper into ${(r.tags || []).slice(0, 2).join(' and ')}`;
      setDeeper((cur) => ({ ...cur, [item.id]: { why: `${WHY[why] || 'You were into this'}, ${label}`, items: fresh } }));
    } catch {} finally { end(`sim${item.id}`); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting && !done) loadMore(); }, { rootMargin: '1400px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, done]);

  async function fetchNew() {
    toast('Fetching new posts from your sources…');
    try {
      const r = await api('/ingest', { method: 'POST', body: { force: true } });
      toast(r.skipped ? 'Already fetching, try again in a moment.' : `${r.added} new posts.`);
      refreshMeta();
      dry.current = 0;
      busy.current = false;
      setDone(false);
      loadMore();
    } catch (e) { toast(e.message); }
  }

  const list = [];
  items.forEach((it, i) => {
    list.push(<ErrorBoundary key={it.id} name="Post"><Post item={it} focus={opts.focus === it.id} onStrong={onStrong} /></ErrorBoundary>);
    const d = deeper[it.id];
    if (d) {
      list.push(<div key={`d${it.id}`} className="deeper"><span className="deeper-why">{d.why}</span></div>);
      d.items.forEach((x) => list.push(<ErrorBoundary key={x.id} name="Post"><Post item={{ ...x, label: 'deeper' }} onStrong={onStrong} /></ErrorBoundary>));
    }
    if (narrow && (i + 1) % 5 === 0 && wins[Math.floor(i / 5)]) {
      const w = wins[Math.floor(i / 5)];
      list.push(<ErrorBoundary key={w.uid} name="Window" quiet><Window w={w} /></ErrorBoundary>);
    }
  });

  return (
    <section className="center" style={{ paddingTop: 0 }}>
      <Controls total={total} />
      <div className="feed">{list}</div>
      {error ? <div className="empty">{error}</div> : null}
      {wider && items.length ? <div className="deeper"><span className="deeper-why">Few exact matches left, now also showing close matches</span></div> : null}
      {fresh ? <button type="button" className="freshbar" onClick={() => { reset(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>New results from your sources are in · Show them</button> : null}
      <div className="sentinel" ref={sentinel}>
        {finding || loading || waiting ? (
          <span className="finding"><span className="spin" />{finding ? 'Finding more like this on your sources…' : waiting ? 'Nothing left that matches. Checking your sources once more shortly…' : 'Loading more…'}</span>
        ) : searching && search?.id === filters.search && !search.done ? (
          <span className="finding"><span className="spin" />Still searching your sources…</span>
        ) : searching && done ? (
          <span className="endnote">That is everything found for this search so far. <button type="button" className="linkbtn" onClick={searchMore}>Search further on your sources</button></span>
        ) : done ? (
          <span className="endnote">Nothing more matches right now. <button type="button" className="linkbtn" onClick={fetchNew}>Fetch new posts now</button></span>
        ) : <button type="button" className="linkbtn" onClick={fetchNew}>Fetch new posts now</button>}
      </div>
    </section>
  );
}
