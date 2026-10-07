import { useCallback, useEffect, useRef, useState } from 'react';
import { api, FORMATS, flushNow, imgSrc } from '../api.js';
import { useApp, MOODS, crumbList } from '../context.jsx';
import { Icon } from '../icons.jsx';
import Post from './Post.jsx';
import { Window } from './Windows.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { refreshWindows } from './SideColumn.jsx';
import { begin, end } from '../activity.js';
import { Avatar } from './Panels.jsx';
import { t, tn, getLang } from '../i18n.js';

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
  kink: { label: t('kink'), icon: 'flame', color: '#E39A83' },
  tag: { label: t('tag'), icon: 'pulse', color: '#E8C66B' },
  person: { label: t('person'), icon: 'person', color: '#D6A0CF' },
  creator: { label: t('creator'), icon: 'person', color: '#8EA6C9' },
  pair: { label: t('pair'), icon: 'route', color: '#B79BF0' },
  fantasy: { label: t('fantasy'), icon: 'spark', color: '#F6C35B' },
  new: { label: t('new'), icon: 'spark', color: '#7FD0C2' }
};

// Where windows go between posts on a phone: after 4, then every 3 to 5 posts.
const WIN_AFTER = (() => { const out = []; let at = 0; const gaps = [4, 3, 5, 4, 5, 3]; for (let i = 0; i < 200; i++) { at += gaps[i % gaps.length]; out.push(at); } return out; })();

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? t('Good night') : h < 12 ? t('Good morning') : h < 18 ? t('Good afternoon') : t('Good evening');
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
      <span className="tlabel">{t('Gender')}</span>
      <div className="uslider-row">
        <span className="gsym f" title={t('Women')}><Icon name="female" /></span>
        <input className="uslider gender" type="range" min="0" max="100" step="5" value={male} disabled={g.auto || g.everyone} aria-label={t('Balance between women and men')} onChange={(e) => save({ male: Number(e.target.value) })} />
        <span className="gsym m" title={t('Men')}><Icon name="male" /></span>
        <output>{g.everyone ? t('everyone') : male >= 90 ? t('men only') : male <= 10 ? t('women only') : male >= 45 && male <= 65 ? t('hetero only') : t('{w}% women · {m}% men', { w: 100 - male, m: male })}</output>
      </div>
      <TChip on={g.auto} icon="auto" color="#B6A8B0" label={t('Auto')} sub={g.auto ? t('from what you like') : null} onClick={() => save({ auto: !g.auto }, !g.auto ? t('The balance now follows what you like, heat and save.') : t('Balance set by hand again.'))} title={t('Let the balance follow what you interact with')} />
      <TChip on={g.everyone} icon="grid" color="#E8C66B" label={t('Everyone')} sub={g.everyone ? t('all of it') : null} onClick={() => save({ everyone: !g.everyone }, !g.everyone ? t('Showing everyone: men, women and both together.') : t('The balance decides again.'))} title={t('Show posts with anyone, whatever the balance says')} />
      <TChip on={g.trans} icon="trans" color="#C9A7E8" label={t('Trans')} sub={g.trans ? t('allowed') : t('hidden')} onClick={() => save({ trans: !g.trans })} title={t('Allow trans content')} />
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
      <span className="tlabel">{t('Feed')}</span>
      <div className="fw">
        <label className="fsel"><Icon name={mode === 'new' ? 'spark' : mode === 'popular' ? 'flame' : 'grid'} />
          <select value={filters.window ? mode : 'mixed'} onChange={(e) => set(e.target.value)} aria-label={t('Feed')}>
            <option value="mixed">{t('Mixed')}</option>
            <option value="new">{t('Only new posts')}</option>
            <option value="popular">{t('Only popular')}</option>
          </select>
        </label>
        {filters.window ? (
          <label className="fsel"><Icon name="clock" />
            <select value={period} onChange={(e) => set(mode, e.target.value)} aria-label={t('Period')}>
              <option value="day">{t('Today')}</option>
              <option value="week">{t('This week')}</option>
              <option value="month">{t('This month')}</option>
              <option value="year">{t('This year')}</option>
            </select>
          </label>
        ) : null}
        <span className="count">{!filters.window ? t('everything, ordered by how well it fits you') : mode === 'new' ? t('only posts from this period') : t('only the most upvoted and viewed posts of this period')}</span>
      </div>
    </div>
  );
}

const PLATFORM = { bluesky: 'Bluesky', reddit: 'Reddit', redgifs: 'RedGIFs', lemmy: 'Lemmy', pornhub: 'Pornhub', redtube: 'RedTube', eporner: 'Eporner', xvideos: 'XVideos', xnxx: 'XNXX', xhamster: 'xHamster', youporn: 'YouPorn', txxx: 'TXXX' };

function ProfileCard({ p, active, followed, onOpen, onFollow }) {
  const [bad, setBad] = useState(false);
  const stats = [
    p.followers != null ? (p.kind === 'community' ? tn(p.followers, '{n} member', '{n} members', { n: fmtCount(p.followers) }) : tn(p.followers, '{n} follower', '{n} followers', { n: fmtCount(p.followers) })) : null,
    p.posts != null ? (p.kind === 'name' || ['pornhub', 'redtube', 'eporner', 'xvideos', 'xnxx', 'xhamster', 'youporn', 'txxx'].includes(p.platform) ? tn(p.posts, '{n} video', '{n} videos', { n: fmtCount(p.posts) }) : tn(p.posts, '{n} post', '{n} posts', { n: fmtCount(p.posts) })) : null,
    p.views ? tn(p.views, '{n} view', '{n} views', { n: fmtCount(p.views) }) : null
  ].filter(Boolean).join(' · ');
  return (
    <div className={`pcard${active ? ' on' : ''}`}>
      <button type="button" className="pcard-main" onClick={() => onOpen(p)} title={t('Show only posts from {name}', { name: p.name })}>
        {p.avatar && !bad ? <img src={imgSrc(p.avatar)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} /> : <Avatar name={p.name} size="m" />}
        <span className="pcard-txt">
          <strong>{p.name}</strong>
          <span className="pcard-sub"><em className={`plat plat-${p.platform}`}>{p.kind === 'community' ? t('{platform} community', { platform: PLATFORM[p.platform] || p.platform }) : p.kind === 'performer' ? t('{platform} performer', { platform: PLATFORM[p.platform] || p.platform }) : PLATFORM[p.platform] || p.platform}</em>{p.handle && p.handle !== p.name ? ` ${p.handle}` : ''}</span>
          {stats ? <span className="pcard-stats">{stats}</span> : <span className="pcard-stats dim">{t('no follower count from this source')}</span>}
        </span>
      </button>
      <div className="pcard-acts">
        {p.url ? <a href={p.url} target="_blank" rel="noreferrer noopener" aria-label={t('Open {name} on {platform}', { name: p.name, platform: PLATFORM[p.platform] || p.platform })} title={t('Open on the site')}><Icon name="open" /></a> : null}
        {p.kind !== 'name' ? <button type="button" onClick={() => onFollow(p)} disabled={followed} aria-label={followed ? t('Added to your sources') : t('Add {name} to your sources', { name: p.name })} title={followed ? t('Added to your sources') : t('Add to your sources')}><Icon name={followed ? 'check' : 'plus'} /></button> : null}
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
    try { await api(`/search/${search.id}/follow`, { method: 'POST', body }); setFollowed((f) => ({ ...f, [`${s.provider}|${s.value}`]: true })); toast(t('Added {label} to your sources.', { label: body.label })); } catch (e) { toast(e.message); }
  }
  return (
    <div className="searchcard">
      {p ? (
        <div className="personcard">
          {p.avatar ? <img className="pc-img" src={imgSrc(p.avatar)} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <Avatar name={p.display} size="l" />}
          <div className="pc-main">
            <strong>{p.display}</strong>
            <span>{[p.videos ? tn(p.videos, '{n} video on Pornhub', '{n} videos on Pornhub', { n: fmtCount(p.videos) }) : null, p.views ? tn(p.views, '{n} view on the videos found', '{n} views on the videos found', { n: fmtCount(p.views) }) : null, p.profiles.length ? t('profiles on {sites}', { sites: [...new Set(p.profiles.map((x) => PLATFORM[x.platform] || x.platform))].join(', ') }) : null].filter(Boolean).join(' · ') || t('searching every source')}</span>
            {p.links.length ? <div className="pc-links">{p.links.map((l) => <a key={l.url} className="pc-ext" href={l.url} target="_blank" rel="noreferrer noopener"><Icon name="globe" />{l.platform}: {l.handle}</a>)}</div> : null}
          </div>
        </div>
      ) : null}
      {profiles.length ? (
        <div className="profiles">
          <div className="profiles-head">
            <span className="tlabel">{t('Profiles and communities')}</span>
            {filters.profile ? <button type="button" className="linkbtn" onClick={() => patchFilters({ profile: null, profileLabel: null })}>{t('Show all results again')}</button> : <span className="count">{t('click one to see only their posts')}</span>}
          </div>
          <div className="pgrid">
            {profiles.slice(0, shown).map((x) => <ProfileCard key={x.key} p={x} active={filters.profile === x.key} followed={!!followed[`${x.provider}|${x.value}`]} onOpen={openProfile} onFollow={add} />)}
          </div>
          {profiles.length > shown ? <button type="button" className="linkbtn more" onClick={() => setShown((n) => n + 8)}>{t('Show {n} more of {total}', { n: Math.min(8, profiles.length - shown), total: profiles.length })}</button> : null}
        </div>
      ) : null}
      {srcs.length ? (
        <div className="foundsrc">
          <span className="tlabel">{t('Found in the results')}</span>
          <div className="tchips">
            {srcs.map((s) => (
              <button type="button" key={`${s.provider}|${s.value}`} className={`tchip${followed[`${s.provider}|${s.value}`] ? ' on' : ''}`} style={{ '--tc': '#93B4DF' }} onClick={() => add(s)} disabled={followed[`${s.provider}|${s.value}`]} title={t('Add as a source')}>
                <Icon name={followed[`${s.provider}|${s.value}`] ? 'check' : 'plus'} /><span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const dec = (s) => (getLang() === 'fr' ? s.replace('.', ',') : s);
const fmtCount = (n) => { n = Number(n) || 0; return n >= 1e6 ? `${dec((n / 1e6).toFixed(1).replace(/\.0$/, ''))}M` : n >= 1000 ? `${dec((n / 1000).toFixed(1).replace(/\.0$/, ''))}k` : String(n); };

// Right where the feed starts: what it is showing now and how much matched, or the assistant's answer. A search,
// a tag or any other change scrolls here.
function FeedHead({ total, loading }) {
  const { filters, opts, kinks, fantasies } = useApp();
  const mood = opts?.mood ? MOODS.find((m) => m.id === opts.mood) : null;
  // The search itself is in the answer and the search bar; this line says what else narrows the feed.
  const what = crumbList(filters, { kinks, fantasies }).filter(([k]) => k !== 'search').map(([, l]) => l);
  if (mood) what.unshift(t('Mood: {mood}', { mood: mood.label }));
  const filtered = what.length > 0 || !!filters.search;
  const count = filtered && total != null && !loading ? tn(total, '{n} post matches', '{n} posts match') : null;
  return (
    <div className="feedhead" id="feedStart">
      {filtered ? (
        <div className="fh-line" aria-live="polite">
          {filtered ? <p className="fh-what">{what.length ? <span>{t('Showing: {what}', { what: what.join(' · ') })}</span> : null}{count ? <em>{count}</em> : loading ? <em className="fh-wait"><span className="spin" />{t('Loading…')}</em> : null}</p> : null}
        </div>
      ) : null}
      <SearchCard />
    </div>
  );
}

// The panel stays open or closed as you left it.
const PANEL_KEY = 'uc-filters-open';
function readOpen() { try { return localStorage.getItem(PANEL_KEY) === '1'; } catch { return false; } }

function Controls() {
  const { filters, opts, mix, setMix, setFilters, patchFilters, applyMood, presets, askOut } = useApp();
  const [summary, setSummary] = useState(null);
  const [tuneOpen, setTuneOpen] = useState(readOpen);
  useEffect(() => { api('/home/summary').then((r) => setSummary(r.text)).catch(() => {}); }, []);
  const toggleOpen = () => setTuneOpen((o) => { try { localStorage.setItem(PANEL_KEY, o ? '0' : '1'); } catch {} return !o; });
  const toggleFormat = (f) => {
    const cur = filters.formats || [];
    patchFilters({ formats: cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f] });
  };
  const active = (filters.formats?.length ? 1 : 0) + (filters.window ? 1 : 0) + (opts.mood ? 1 : 0) + (mix !== 15 ? 1 : 0);
  return (
    <>
      <div className="hello" id={askOut ? 'feedAnswer' : undefined}>
        <h2>{greeting()}</h2>
        <p className={`hello-sum${askOut ? ' answer' : ''}`} aria-live="polite">{askOut || summary || ''}</p>
        <div className="hello-row">
          <button type="button" className={`tunebtn${tuneOpen ? ' on' : ''}`} onClick={toggleOpen} aria-expanded={tuneOpen}>
            <Icon name="sliders" />{t('Filters')}{active ? <em className="tunecount">{active}</em> : null}<Icon name={tuneOpen ? 'chevU' : 'chevD'} />
          </button>
          {presets.length ? (
            <div className="nowrow" aria-label={t('Right now')}>
              {presets.map((p, i) => {
                const k = NOW_KIND[p.kind] || NOW_KIND.tag;
                return (
                  <button type="button" key={`${p.kind}${p.label}`} className={`nowchip${opts.preset === i ? ' on' : ''}`} style={{ '--tc': k.color }} onClick={() => setFilters(p.filters, { preset: i })} title={`${k.label}: ${p.label}`}>
                    <Icon name={k.icon} /><span className="nk">{k.label}</span><span>{p.label}</span>{p.match !== null ? <small>{p.match}%</small> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      {tuneOpen ? <section className="tuner" aria-label={t('Filters')}>
        <FeedWindow />
        <div className="tline tline-top">
          <span className="tlabel">{t('Mood')}</span>
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
        <div className="tline">
          <span className="tlabel">{t('Formats')}</span>
          <div className="tchips">{Object.entries(FORMATS).map(([f, label]) => <TChip key={f} on={(filters.formats || []).includes(f)} icon={FORMAT_ICON[f]} color={FORMAT_COLOR[f]} label={label} onClick={() => toggleFormat(f)} />)}</div>
        </div>
        <Balance />
        <div className="tline">
          <span className="tlabel">{t('New to you')}</span>
          <div className="uslider-row">
            <input className="uslider" type="range" id="mix" min="0" max="40" step="5" value={mix} onChange={(e) => setMix(Number(e.target.value))} aria-label={t('How much new to you')} />
            <output htmlFor="mix">{mix}%</output>
            <span className="count">{filters.onlyNew ? t('only things you haven’t opened') : mix ? t('about 1 in {n} is new to you', { n: Math.max(2, Math.round(100 / mix)) }) : t('nothing new mixed in')}</span>
          </div>
        </div>
        <p className="wnote">{t('Your filters stay set, also after closing Undercurrent, and apply to searches too.')}</p>
      </section> : null}
    </>
  );
}

export default function FeedView() {
  const { filters, opts, mix, feedKey, toast, refreshMeta, search, searchMore, withoutFilters } = useApp();
  const [genderOpen, setGenderOpen] = useState(true);
  useEffect(() => {
    const load = () => api('/settings/gender').then((g) => setGenderOpen(!!g.everyone)).catch(() => {});
    load();
    window.addEventListener('uc-gender', load);
    return () => window.removeEventListener('uc-gender', load);
  }, []);
  const narrowing = !filters.noTune && !!(filters.formats?.length || filters.window || filters.minMatch || filters.length || opts.mood || !genderOpen);
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
    begin('feed', searching ? t('Loading search results') : t('Loading the feed'), { quiet: !reset || !searching });
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
        begin('more', t('Fetching more from your sources'), { quiet: true });
        let got = 0;
        try {
          const more = await api('/feed/more', { method: 'POST', body: { filters: f() } });
          if (my !== gen.current) return;
          got = more.added || 0;
          dry.current = more.added ? 0 : dry.current + 1;
          if (!more.added && hasFilter && dry.current >= 2 && !relaxed.current) { relaxed.current = true; dry.current = 0; }
          r = await api('/feed', { method: 'POST', body: { filters: f(), exclude: [...shown.current, ...first.map((x) => x.id)], limit: 8, mix } });
        } catch { dry.current++; } finally { end('more', 'done', got ? tn(got, '{n} new post', '{n} new posts') : t('nothing new')); if (my === gen.current) setFinding(false); }
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
        const n = Math.ceil(next.length / 3);
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

  const WHY = { dwell: t('You stayed on this'), play: t('You played this'), up: t('You liked this'), save: t('You saved this'), rate: t('You rated this high'), comments: t('You opened the comments'), performer: t('You looked at who is in this') };
  const searchingRef = useRef(searching);
  searchingRef.current = searching;
  // "Going deeper" (similar posts after one you were into) is for the feed: a search shows only what you searched for.
  const onStrong = useCallback(async (item, why) => {
    if (searchingRef.current || deeperCount.current > 40) return;
    deeperCount.current++;
    begin(`sim${item.id}`, t('Finding similar posts'));
    try {
      const r = await api(`/items/${item.id}/similar?limit=${why === 'dwell' ? 2 : 3}&exclude=${[...shown.current].slice(-300).join(',')}`);
      const fresh = (r.items || []).filter((x) => !shown.current.has(x.id));
      if (!fresh.length) return;
      fresh.forEach((x) => shown.current.add(x.id));
      const label = r.performers?.length && fresh[0].performers?.some((p) => r.performers.includes(String(p).toLowerCase())) ? t('more with {name}', { name: r.performers[0] }) : t('going deeper into {tags}', { tags: (r.tags || []).slice(0, 2).join(t(' and ')) });
      setDeeper((cur) => ({ ...cur, [item.id]: { why: `${WHY[why] || t('You were into this')}, ${label}`, items: fresh } }));
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
    toast(t('Fetching new posts from your sources…'));
    try {
      const r = await api('/ingest', { method: 'POST', body: { force: true } });
      toast(r.skipped ? t('Already fetching, try again in a moment.') : tn(r.added, '{n} new post.', '{n} new posts.'));
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
    // On a phone a window comes after every 3 to 5 posts.
    const slot = WIN_AFTER.indexOf(i + 1);
    if (narrow && slot >= 0 && wins[slot]) {
      const w = wins[slot];
      list.push(<ErrorBoundary key={w.uid} name="Window" quiet><Window w={w} /></ErrorBoundary>);
    }
  });

  return (
    <section className="center" style={{ paddingTop: 0 }}>
      <Controls />
      <FeedHead total={total} loading={loading && !items.length} />
      <div className="feed" style={items.length < 2 && !done ? { minHeight: '100vh' } : undefined}>{list}</div>
      {error ? <div className="empty">{error}</div> : null}
      {wider && items.length ? <div className="deeper"><span className="deeper-why">{t('Few exact matches left, now also showing close matches')}</span></div> : null}
      {fresh ? <button type="button" className="freshbar" onClick={() => { reset(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{t('New results from your sources are in · Show them')}</button> : null}
      <div className="sentinel" ref={sentinel}>
        {finding || loading || waiting ? (
          <span className="finding"><span className="spin" />{finding ? t('Finding more like this on your sources…') : waiting ? t('Nothing left that matches. Checking your sources once more shortly…') : t('Loading more…')}</span>
        ) : searching && search?.id === filters.search && !search.done ? (
          <span className="finding"><span className="spin" />{t('Still searching your sources…')}</span>
        ) : searching && done ? (
          <span className="endnote">
            {t('That is everything found for this search so far.')}
            {narrowing ? <button type="button" className="ghost-btn small accent" onClick={withoutFilters}><Icon name="sliders" />{t('Remove filters to find more results')}</button> : null}
            <button type="button" className="ghost-btn small" onClick={searchMore}><Icon name="search" />{t('Search further on your sources')}</button>
          </span>
        ) : done ? (
          <span className="endnote">{t('Nothing more matches right now.')} <button type="button" className="linkbtn" onClick={fetchNew}>{t('Fetch new posts now')}</button></span>
        ) : <button type="button" className="linkbtn" onClick={fetchNew}>{t('Fetch new posts now')}</button>}
      </div>
    </section>
  );
}
