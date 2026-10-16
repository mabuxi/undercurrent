import { useCallback, useEffect, useRef, useState } from 'react';
import { api, FORMATS, flushNow, imgSrc, takeEvents, track } from '../api.js';
import { useApp, MOODS, crumbList } from '../context.jsx';
import { Icon } from '../icons.jsx';
import Post from './Post.jsx';
import { Window, solidSet } from './Windows.jsx';
import Immersive, { inViewer, TK_MODES, tkModeOf } from './Immersive.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { refreshWindows, DEEPER, isFiltered } from './SideColumn.jsx';
import { begin, end } from '../activity.js';
import { waitingFor } from '../waiting.js';
import SimilarRow from './SimilarRow.jsx';
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
        <span className="gwrap"><span className="gband" aria-hidden="true" title={t('Hetero')} /><input className="uslider gender" type="range" min="0" max="100" step="5" value={male} disabled={g.auto} aria-label={t('Balance between women and men')} onChange={(e) => save({ male: Number(e.target.value) })} /></span>
        <span className="gsym m" title={t('Men')}><Icon name="male" /></span>
        <output>{male >= 90 ? t('men only') : male <= 10 ? t('women only') : male >= 45 && male <= 55 ? t('hetero only') : t('{w}% women · {m}% men', { w: 100 - male, m: male })}</output>
      </div>
      <TChip on={g.auto} icon="auto" color="#B6A8B0" label={t('Auto')} sub={g.auto ? t('from what you like') : null} onClick={() => save({ auto: !g.auto }, !g.auto ? t('The balance now follows what you like, heat and save.') : t('Balance set by hand again.'))} title={t('Let the balance follow what you interact with')} />
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
function FeedHead() {
  return (
    <div className="feedhead" id="feedStart">
      <SearchCard />
    </div>
  );
}

// The panel stays open or closed as you left it.
const PANEL_KEY = 'uc-filters-open';
function readOpen() { try { return localStorage.getItem(PANEL_KEY) === '1'; } catch { return false; } }

function Controls({ total, loading }) {
  const { filters, opts, mix, setMix, setFilters, patchFilters, applyMood, presets, askOut, kinks, fantasies } = useApp();
  const [summary, setSummary] = useState(null);
  const [tuneOpen, setTuneOpen] = useState(readOpen);
  useEffect(() => { api('/home/summary').then((r) => setSummary(r.text)).catch(() => {}); }, []);
  const toggleOpen = () => setTuneOpen((o) => { try { localStorage.setItem(PANEL_KEY, o ? '0' : '1'); } catch {} return !o; });
  const toggleFormat = (f) => {
    const cur = filters.formats || [];
    patchFilters({ formats: cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f] });
  };
  const active = (filters.formats?.length ? 1 : 0) + (filters.window ? 1 : 0) + (opts.mood ? 1 : 0) + (mix !== 15 ? 1 : 0);
  // What the feed shows takes the place of the summary under the greeting: the assistant's answer, or "Showing: …"
  // with how many posts match.
  const mood = opts?.mood ? MOODS.find((m) => m.id === opts.mood) : null;
  const crumbs = crumbList(filters, { kinks, fantasies });
  const what = crumbs.filter(([k]) => k !== 'search').map(([, l]) => l);
  if (mood) what.unshift(t('Mood: {mood}', { mood: mood.label }));
  const filtered = what.length > 0 || !!filters.search;
  const q = filters.search ? String(filters.searchLabel || t('your search')).trim() : '';
  const all = [...(q ? [q.charAt(0).toUpperCase() + q.slice(1)] : []), ...what];
  const count = filtered && total != null && !loading ? tn(total, '{n} post matches', '{n} posts match') : null;
  const main = askOut || (filtered ? t('Showing: {what}', { what: all.join(' · ') }) : summary || '');
  return (
    <>
      <div className="hello" id={askOut || filtered ? 'feedAnswer' : undefined}>
        <h2>{greeting()}</h2>
        <p className={`hello-sum${askOut || filtered ? ' answer' : ''}`} aria-live="polite">{main}</p>
        {filtered ? (
          <p className="hello-count">
            {askOut ? <span>{t('Showing: {what}', { what: all.join(' · ') })}</span> : null}
            {count ? <em>{count}</em> : loading ? <em className="fh-wait"><span className="spin" />{t('Loading…')}</em> : null}
          </p>
        ) : null}
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
              <button key={m.id} type="button" className={`moodcard${opts.mood === m.id ? ' on' : ''}`} style={{ '--tc': m.color }} onClick={() => applyMood(m.id)} title={`${m.label}: ${m.hint}`}>
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
  const { filters, opts, mix, feedKey, toast, refreshMeta, search, searchMore, withoutFilters, patchFilters, clearFilter, clearSearch, kinks, fantasies } = useApp();
  // The balance between women and men always narrows what a search finds, so a search can always be shown without it.
  const narrowing = !filters.noTune;
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
  // Rows of similar posts under posts you were into, by the post they hang under: { items, why, sel }.
  const [strips, setStrips] = useState({});
  const stripOf = useRef(new Map());
  // The post on screen (its place in the feed), what has been on screen, and the feed as it is right now.
  const [curIdx, setCurIdx] = useState(0);
  const curRef = useRef(0);
  const seenIds = useRef(new Set());
  const itemsRef = useRef([]);
  itemsRef.current = items;
  // The full screen viewer on a phone: which post it opened on.
  const [tk, setTk] = useState(null);
  const tkRef = useRef(null);
  tkRef.current = tk;
  // A change made from inside the viewer (its mode switch or its filter chips) keeps it open on the new feed.
  const tkStay = useRef(false);
  const strongDone = useRef(new Set());
  const deeperCount = useRef(0);
  const retuning = useRef(false);
  const retuneT = useRef(null);
  const sinceRetune = useRef(0);
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
        const w = await api(`/windows?cursor=${winCursor.current}&count=${n}&side=2${isFiltered(filters) ? '&filtered=1' : ''}`);
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
    setStrips({});
    stripOf.current = new Map();
    seenIds.current = new Set();
    curRef.current = 0;
    setCurIdx(0);
    if (tkStay.current && tkRef.current) setTk((x) => (x ? { ...x, gen: (x.gen || 0) + 1 } : x));
    else setTk(null);
    tkStay.current = false;
    strongDone.current = new Set();
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

  const WHY = { dwell: t('You stayed on this'), up: t('You liked this'), save: t('You saved this'), rate: t('You found this hot'), complete: t('You watched this to the end'), rewatch: t('You watched this again'), follow: t('You followed them') };
  const WEAK_WHY = new Set(['play', 'comments', 'performer']);
  const searchingRef = useRef(searching);
  searchingRef.current = searching || isFiltered(filters);
  // Into a post (a like, heat, a save, a long watch, watched to the end): a row of small previews of posts like it
  // shows under it. Only on the plain feed: with a search, a kink or any other filter on, the feed shows only what you
  // asked for. A post played from a row belongs to that row.
  const onStrong = useCallback(async (item, why) => {
    if (searchingRef.current || WEAK_WHY.has(why)) return;
    const host = stripOf.current.get(item.id) ?? item.id;
    if (deeperCount.current > 40 || strongDone.current.has(host)) return;
    const hostItem = itemsRef.current.find((x) => x.id === host);
    if (!hostItem) return;
    strongDone.current.add(host);
    deeperCount.current++;
    begin(`sim${host}`, t('Finding similar posts'), { quiet: true });
    try {
      const r = await api(`/items/${item.id}/similar?strip=1&limit=6&exclude=${[...shown.current].slice(-300).join(',')}`);
      const fresh = (r.items || []).filter((x) => !shown.current.has(x.id) && x.id !== host);
      if (fresh.length < 2) { strongDone.current.delete(host); return; }
      fresh.forEach((x) => { shown.current.add(x.id); stripOf.current.set(x.id, host); });
      stripOf.current.set(host, host);
      setStrips((cur) => ({ ...cur, [host]: { why: `${WHY[why] || t('You were into this')} · ${t('more like it')}`, items: [hostItem, ...fresh], sel: host } }));
    } catch { strongDone.current.delete(host); } finally { end(`sim${host}`); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A dislike, hide or block of the post takes its row away; of a post played from the row, it goes back to the post.
  const onWeak = useCallback((item) => {
    const host = stripOf.current.get(item.id) ?? item.id;
    setStrips((cur) => {
      const st = cur[host];
      if (!st) return cur;
      const n = { ...cur };
      if (item.id === host) { delete n[host]; strongDone.current.delete(host); }
      else n[host] = { ...st, items: st.items.filter((x) => x.id !== item.id), sel: st.sel === item.id ? host : st.sel };
      return n;
    });
  }, []);
  const pickInStrip = useCallback((host, it) => {
    setStrips((cur) => (cur[host] ? { ...cur, [host]: { ...cur[host], sel: it.id } } : cur));
    if (it.id !== host) track(it.id, 'open');
  }, []);

  // Which post is on screen: the next ones load ahead, and only posts after the next few may still change.
  const onSeen = useCallback((id) => {
    seenIds.current.add(id);
    const host = stripOf.current.get(id) ?? id;
    const i = itemsRef.current.findIndex((x) => x.id === host);
    if (i >= 0 && i !== curRef.current) { curRef.current = i; setCurIdx(i); }
  }, []);

  // The feed reacts right away: after you react to a post (or every two posts), the posts after the next two (three in
  // the full screen viewer) are picked again with what you just did already counted, so it follows you within a post
  // or two. The next ones never change under you (they are loading already), and nothing below a post you scrolled
  // back to is touched.
  const firstFree = (list, from) => {
    let i = from + 1;
    let n = 0;
    const keep = tkRef.current ? 3 : 2;
    while (i < list.length && n < keep) { if (!tkRef.current || inViewer(list[i])) n++; i++; }
    return i;
  };
  const retuneRef = useRef(null);
  retuneRef.current = async () => {
    if (retuning.current || busy.current || searchingRef.current) return;
    const list = itemsRef.current;
    const cut = firstFree(list, curRef.current);
    const tail = list.slice(cut);
    if (!tail.length || tail.some((x) => seenIds.current.has(x.id) || strips[x.id])) return;
    retuning.current = true;
    const my = gen.current;
    try {
      const drop = new Set(tail.flatMap((x) => [x.id, ...(x.collection?.members || [])]));
      const keepShown = [...shown.current].filter((id) => !drop.has(id));
      const r = await api('/feed', { method: 'POST', body: { filters: relaxed.current ? { ...filters, relaxed: true } : filters, exclude: keepShown, limit: Math.min(12, Math.max(6, tail.length)), mix, events: takeEvents() } });
      if (my !== gen.current || !r.items?.length) return;
      const now = itemsRef.current;
      const at = now.findIndex((x) => x.id === tail[0].id);
      if (at < 0) return;
      const from = Math.max(at, firstFree(now, curRef.current));
      const keep = now.slice(0, from);
      const keepIds = new Set(keep.flatMap((x) => [x.id, ...(x.collection?.members || [])]));
      const fresh = r.items.filter((x) => !keepIds.has(x.id));
      if (!fresh.length) return;
      for (const x of now.slice(from)) for (const id of [x.id, ...(x.collection?.members || [])]) shown.current.delete(id);
      for (const x of fresh) for (const id of [x.id, ...(x.collection?.members || [])]) shown.current.add(id);
      const next = [...keep, ...fresh];
      itemsRef.current = next;
      setItems(next);
    } catch {} finally { retuning.current = false; }
  };
  useEffect(() => {
    const on = (e) => {
      const { type, value, itemId } = e.detail || {};
      const strongType = ['up', 'down', 'save', 'rate', 'less', 'complete', 'rewatch', 'follow'].includes(type);
      if (type === 'impression') { if (++sinceRetune.current < 2) return; }
      else if (!strongType && type !== 'skip' && !(type === 'dwell' && (Number(value) >= 15000 || Number(value) < 2500))) return;
      sinceRetune.current = 0;
      clearTimeout(retuneT.current);
      retuneT.current = setTimeout(() => retuneRef.current?.(), strongType ? 400 : 900);
      // Watching a video to the end (or again) is being into it too.
      if ((type === 'complete' || type === 'rewatch') && !tkRef.current) {
        const it = itemsRef.current.find((x) => x.id === Number(itemId)) || [...Object.values(strips)].flatMap((st) => st.items).find((x) => x.id === Number(itemId));
        if (it) onStrong(it, type);
      }
    };
    window.addEventListener('uc-track', on);
    return () => { window.removeEventListener('uc-track', on); clearTimeout(retuneT.current); };
  }, [onStrong, strips]);

  // Only a few posts left after the one on screen: the next ones load now, long before you reach the end.
  useEffect(() => { if (!done && !busy.current && items.length && items.length - curIdx <= 5) loadMoreRef.current?.(); }, [curIdx, items.length, done]);

  // The feed loading with nothing on screen yet: the Mac puts its background work aside until it shows.
  useEffect(() => { waitingFor('feed', loading && !items.length); return () => waitingFor('feed', false); }, [loading, items.length]);

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

  const openTk = useCallback((it) => { if (inViewer(it)) setTk({ id: it.id, gen: 0 }); }, []);
  // What the feed shows, as chips at the top of the viewer, and which of short, mixed and long form it is.
  const tkCrumbs = crumbList(filters, { kinks, fantasies });
  const tkOthers = tkCrumbs.filter(([k]) => k !== 'formats');
  const tkMode = tkModeOf(filters, tkOthers.length);
  const tkChips = tkMode === 'custom' && filters.formats?.length ? tkCrumbs : tkOthers;
  const setTkMode = useCallback((id) => {
    const m = TK_MODES.find((x) => x.id === id);
    if (!m) return;
    tkStay.current = true;
    patchFilters({ formats: m.formats.length ? m.formats : null });
  }, [patchFilters]);
  const clearTkChip = useCallback((k) => {
    tkStay.current = true;
    if (k === 'formats') patchFilters({ formats: null });
    else clearFilter(k);
  }, [clearFilter, patchFilters]);
  const clearTkAll = useCallback(() => { tkStay.current = true; clearSearch(); }, [clearSearch]);
  // The feed follows the viewer in the background (so what is above the post has loaded and settled by the time you
  // come back), and leaving the viewer puts it exactly on the post you were last on.
  const toPost = useCallback((id) => {
    // The viewer is on this post: the feed knows where you are, for loading ahead and picking what comes next.
    const vi = itemsRef.current.findIndex((x) => x.id === id);
    if (vi >= 0 && vi !== curRef.current) { curRef.current = vi; setCurIdx(vi); }
    if (id) seenIds.current.add(id);
    const el = id && document.querySelector(`.feed article.post[data-id="${id}"]`);
    if (!el) return;
    const top = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--toph'), 10) || 60;
    window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - top, behavior: 'auto' });
  }, []);
  const closeTk = useCallback((lastId) => {
    setTk(null);
    toPost(lastId);
    requestAnimationFrame(() => { toPost(lastId); setTimeout(() => toPost(lastId), 120); });
  }, [toPost]);
  // The full screen viewer opens from the full screen button on every screen, the Mac too.
  const imm = openTk;
  const list = [];
  const flat = [];
  const phoneWins = isFiltered(filters) ? wins.filter((w) => !DEEPER.has(w.type)) : wins;
  const phoneSolids = narrow ? solidSet(phoneWins) : new Set();
  // The next post loads ahead fully, the one after it too unless it is a long video, the third only gets ready.
  const preloadOf = (i, it) => {
    if (tk) return false;
    const d = i - curIdx;
    if (d === 1) return 'full';
    if (d === 2) return it.format === 'long' ? 'light' : 'full';
    if (d === 3) return 'light';
    return false;
  };
  items.forEach((it, i) => {
    // A post with a row of similar posts shows the one picked in the row.
    const st = strips[it.id];
    const here = st && st.sel !== it.id ? st.items.find((x) => x.id === st.sel) || it : it;
    flat.push(here);
    list.push(<ErrorBoundary key={`${it.id}:${here.id}`} name="Post"><Post item={here} focus={opts.focus === it.id} onStrong={onStrong} onWeak={onWeak} onImmersive={imm} onSeen={onSeen} preload={preloadOf(i, here)} /></ErrorBoundary>);
    if (st && st.items.length > 1) list.push(<ErrorBoundary key={`s${it.id}`} name="Similar" quiet><SimilarRow strip={st} onPick={(x) => pickInStrip(it.id, x)} /></ErrorBoundary>);
    // On a phone a window comes after every 3 to 5 posts.
    const slot = WIN_AFTER.indexOf(i + 1);
    if (narrow && slot >= 0 && phoneWins[slot]) {
      const w = phoneWins[slot];
      list.push(<ErrorBoundary key={w.uid} name="Window" quiet><Window w={w} solid={phoneSolids.has(w.uid)} /></ErrorBoundary>);
    }
  });

  return (
    <section className="center" style={{ paddingTop: 0 }}>
      <Controls total={total} loading={loading && !items.length} />
      <FeedHead />
      <div className="feed" style={items.length < 2 && !done ? { minHeight: '100vh' } : undefined}>{list}</div>
      {error ? <div className="empty">{error}</div> : null}
      {wider && items.length ? <div className="deeper"><span className="deeper-why">{t('Few exact matches left, now also showing close matches')}</span></div> : null}
      {fresh ? <button type="button" className="freshbar" onClick={() => { reset(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{t('New results from your sources are in · Show them')}</button> : null}
      {tk ? <ErrorBoundary name="Viewer"><Immersive items={flat} startId={tk.id} gen={tk.gen || 0} onClose={closeTk} onCurrent={toPost} onMore={() => loadMoreRef.current?.()} loading={loading || finding} done={done} mode={tkMode} onMode={setTkMode} chips={tkChips} onClearChip={clearTkChip} onClearAll={clearTkAll} /></ErrorBoundary> : null}
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
