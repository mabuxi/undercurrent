import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, sessionId } from './api.js';
import { AppCtx, MOODS } from './context.jsx';
import TopBar from './components/TopBar.jsx';
import SideColumn from './components/SideColumn.jsx';
import FeedView from './components/FeedView.jsx';
import MapView from './components/MapView.jsx';
import JourneyView from './components/JourneyView.jsx';
import MemoryView from './components/MemoryView.jsx';
import SettingsView from './components/SettingsView.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { refreshWindows } from './components/SideColumn.jsx';
import { begin, end } from './activity.js';
import Onboarding from './components/Onboarding.jsx';
import { useUpdates, UpdateModal, WhatsNew } from './components/Updates.jsx';
import TabBar from './components/TabBar.jsx';
import { useNarrow } from './components/FeedView.jsx';
import { t, tn } from './i18n.js';

export default function App() {
  const [filters, setFiltersState] = useState({});
  const [opts, setOpts] = useState({ activeWin: null, preset: null, mood: null, focus: null });
  const [mix, setMix] = useState(15);
  const [mode, setMode] = useState('feed');
  const [journeySpec, setJourneySpec] = useState(null);
  const [feedKey, setFeedKey] = useState(0);
  const [kinks, setKinks] = useState([]);
  const [fantasies, setFantasies] = useState([]);
  const [presets, setPresets] = useState([]);
  const [toastMsg, setToastMsg] = useState(null);
  const [askOut, setAskOut] = useState(null);
  const [search, setSearch] = useState(null);
  const pollRef = useRef(null);
  const seenRef = useRef({ id: null, filter: false, client: 0, answer: null, done: false, found: 0 });
  const [settings, setSettings] = useState(null);
  const [onboarding, setOnboarding] = useState(false);
  const updates = useUpdates();
  const narrow = useNarrow();
  const [updateOpen, setUpdateOpen] = useState(false);
  // The Mac app's menu (Settings…, Check for Updates…) reaches in here.
  useEffect(() => {
    window.ucOpen = (what) => {
      if (what === 'updates' && updates.info?.available) setUpdateOpen(true);
      else { setMode('settings'); window.scrollTo({ top: 0 }); }
    };
    return () => { delete window.ucOpen; };
  }, [updates.info]);
  // On a phone the feed snaps from post to post.
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle('narrow', narrow);
    el.classList.toggle('snap', narrow && mode === 'feed');
    el.classList.toggle('standalone', !!window.navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches);
  }, [narrow, mode]);
  const toastTimer = useRef(null);
  const centerRef = useRef(null);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2800);
  }, []);

  const refreshMeta = useCallback(async () => {
    try {
      const [k, f, p] = await Promise.all([api('/kinks'), api('/fantasies'), api('/presets')]);
      setKinks(k.kinks);
      setFantasies(f.fantasies);
      setPresets(p.presets);
    } catch {}
  }, []);

  useEffect(() => {
    refreshMeta();
    api('/setup/status').then((st) => { if (!st.onboarded) setOnboarding(true); }).catch(() => {});
    api('/settings').then(setSettings).catch(() => {});
    const timer = setInterval(refreshMeta, 60000);
    return () => clearInterval(timer);
  }, [refreshMeta]);

  // After a search, a click on a tag or any other change of what the feed shows: straight to where the feed starts,
  // with the line that says what is shown.
  const scrollToFeed = useCallback(() => {
    const el = document.getElementById('feedStart');
    if (!el) return;
    const head = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--toph'), 10) || 92;
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - head - 8), behavior: 'smooth' });
  }, []);

  const setFilters = useCallback((f, o = {}) => {
    setFiltersState({ ...(f || {}) });
    setOpts({ activeWin: o.win || null, preset: o.preset ?? null, mood: o.mood || null, focus: o.focus ?? null });
    if (o.mix !== undefined) setMix(o.mix);
    else if (!o.keepMix) setMix(15);
    setMode('feed');
    setFeedKey((k) => k + 1);
    if (!o.keepAnswer) setAskOut(null);
    if (!o.noScroll) setTimeout(scrollToFeed, 60);
  }, [scrollToFeed]);

  const patchFilters = useCallback((patch) => {
    setFiltersState((cur) => {
      const next = { ...cur, ...patch };
      for (const k of Object.keys(next)) if (next[k] === null || next[k] === undefined || next[k] === false || (Array.isArray(next[k]) && !next[k].length)) delete next[k];
      return next;
    });
    setOpts((o) => ({ ...o, preset: null, mood: null, activeWin: null, focus: null }));
    setFeedKey((k) => k + 1);
    setAskOut(null);
    setTimeout(scrollToFeed, 60);
  }, [scrollToFeed]);

  const applyMood = useCallback((id) => {
    const m = MOODS.find((x) => x.id === id);
    if (!m) return;
    if (opts.mood === id) { setFilters({}); return; }
    setFilters(m.filters, { mood: id, mix: m.mix ?? 15 });
    setAskOut(t('Mood set to {mood}. The feed follows it until you change it.', { mood: m.label.toLowerCase() }));
  }, [opts.mood, setFilters]);

  const openMode = useCallback((m, spec = null) => {
    setMode(m);
    if (m === 'journey') setJourneySpec({ ...spec, key: Date.now() });
    setTimeout(() => {
      const el = centerRef.current;
      if (el && el.getBoundingClientRect().top < 0) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 8, behavior: 'smooth' });
    }, 30);
  }, []);

  const applyClient = useCallback(async (actions = [], { onPatch } = {}) => {
    for (const a of actions || []) {
      if (a.type === 'filter') setFilters(a.filters || {}, { focus: a.focus ?? null });
      else if (a.type === 'open') openMode(a.view || 'feed');
      else if (a.type === 'journey') openMode('journey', { kink: a.kink, fantasy: a.fantasy, mode: a.mode });
      else if (a.type === 'refresh') setFeedKey((k) => k + 1);
      else if (a.type === 'meta') refreshMeta();
      else if (a.type === 'item') onPatch?.(a.patch || {});
      else if (a.type === 'fetch') {
        api('/ingest', { method: 'POST', body: {} }).then(() => setFeedKey((k) => k + 1)).catch(() => {});
      }
    }
  }, [setFilters, openMode, refreshMeta]);

  // The search bar runs a job on the server; this follows it, applies what it decided and tells the feed when
  // results from the sources come in.
  const follow = useCallback((id) => {
    clearTimeout(pollRef.current);
    const tick = async () => {
      let v;
      try { v = await api(`/search/${id}`); } catch (e) { setSearch((cur) => (cur && cur.id === id ? { ...cur, done: true, error: e.message } : cur)); return; }
      const seen = seenRef.current;
      if (seen.id !== id) return;
      setSearch(v);
      if (v.filter && !seen.filter) { seen.filter = true; setFilters(v.filter, { keepMix: true }); }
      if (v.client?.length > seen.client) {
        const fresh = v.client.slice(seen.client);
        seen.client = v.client.length;
        for (const c of fresh) if (c.type === 'gender') { window.dispatchEvent(new Event('uc-gender')); refreshWindows(); }
        await applyClient(fresh.filter((c) => c.type !== 'gender'));
      }
      if (v.answer && v.answer !== seen.answer) { seen.answer = v.answer; setAskOut(v.answer); }
      if (v.found > seen.found) { seen.found = v.found; window.dispatchEvent(new CustomEvent('uc-search-progress', { detail: { id, found: v.found } })); }
      if (v.done && !seen.done) { seen.done = true; window.dispatchEvent(new CustomEvent('uc-search-done', { detail: { id, found: v.found } })); }
      if (!v.done) pollRef.current = setTimeout(tick, 600);
    };
    tick();
  }, [setFilters, applyClient]);

  const runSearch = useCallback(async (q, { deep = false } = {}) => {
    const v = await api('/search', { method: 'POST', body: { q, deep } });
    seenRef.current = { id: v.id, filter: false, client: 0, answer: null, done: false, found: 0 };
    setSearch(v);
    setAskOut(null);
    follow(v.id);
    return v;
  }, [follow]);

  const searchMore = useCallback(async () => {
    if (!search) return;
    const v = await api(`/search/${search.id}/more`, { method: 'POST', body: {} });
    seenRef.current = { ...seenRef.current, id: v.id, done: false };
    setSearch(v);
    follow(v.id);
  }, [search, follow]);

  const editChip = useCallback(async (chip) => {
    if (!search) return;
    try {
      const v = await api(`/search/${search.id}/chip`, { method: 'POST', body: { kind: chip.kind, value: chip.value, remove: true } });
      setSearch(v);
      if (chip.kind === 'source') patchFilters({ sources: v.filter?.sources?.length ? v.filter.sources : null, sourcesLabel: v.filter?.sources?.length ? v.filter.sourcesLabel : null });
      else setFeedKey((k) => k + 1);
    } catch (e) { toast(e.message); }
  }, [search, toast, patchFilters]);

  const clearSearch = useCallback(() => {
    clearTimeout(pollRef.current);
    seenRef.current = { id: null, filter: false, client: 0, answer: null, done: false, found: 0 };
    setSearch(null);
    setAskOut(null);
    setFilters({});
  }, [setFilters]);

  // Taking one filter away from what is shown (the row under the search bar).
  const clearFilter = useCallback((key) => {
    if (key === 'search') { clearSearch(); return; }
    if (key === 'mood') { setFilters({}); return; }
    if (key === 'profile') { patchFilters({ profile: null, profileLabel: null }); return; }
    if (key === 'sources') { patchFilters({ sources: null, sourcesLabel: null }); return; }
    if (key.startsWith('tag:')) { patchFilters({ tags: (filters.tags || []).filter((tag) => `tag:${tag}` !== key) }); return; }
    patchFilters({ [key]: null });
  }, [clearSearch, setFilters, patchFilters, filters]);

  // Only the posts of one profile or community from the search: their posts are fetched first.
  const openProfile = useCallback(async (p) => {
    if (!search) return;
    begin(`prof${p.key}`, t('Loading posts from {name}', { name: p.name }));
    try {
      const r = await api(`/search/${search.id}/profile`, { method: 'POST', body: { key: p.key } });
      setFilters(r.filter, { keepMix: true, top: true });
      end(`prof${p.key}`, 'done', tn(r.count, '{n} post', '{n} posts'));
    } catch (e) { end(`prof${p.key}`, 'fail', e.message); toast(e.message); }
  }, [search, setFilters, toast]);

  const ctx = useMemo(() => ({
    filters, opts, mix, setMix: (v) => { setMix(v); setFeedKey((k) => k + 1); }, mode, setFilters, patchFilters, applyMood, openMode,
    kinks, fantasies, presets, refreshMeta, toast, sessionId, update: updates.info, openUpdate: () => setUpdateOpen(true), askOut, setAskOut, settings, setSettings, feedKey, applyClient, refreshFeed: () => setFeedKey((k) => k + 1),
    search, runSearch, searchMore, editChip, clearSearch, openProfile, clearFilter
  }), [filters, opts, mix, mode, setFilters, patchFilters, applyMood, openMode, kinks, fantasies, presets, refreshMeta, toast, askOut, settings, feedKey, applyClient, search, runSearch, searchMore, editChip, clearSearch, openProfile, clearFilter, updates.info]);

  return (
    <AppCtx.Provider value={ctx}>
      <div className="shell">
        <TopBar />
        {settings?.mock ? <div className="mockbar">{t('Test mode: fake posts and a fake model, so you can try everything without accounts.')}</div> : null}
        <div className="grid">
          <SideColumn side={0} />
          <main className="center" ref={centerRef}>
            <ErrorBoundary name={mode} big key={mode}>
              {mode === 'feed' ? <FeedView key="feed" /> : null}
              {mode === 'map' ? <MapView /> : null}
              {mode === 'journey' && journeySpec ? <JourneyView key={journeySpec.key} spec={journeySpec} /> : null}
              {mode === 'memory' ? <MemoryView /> : null}
              {mode === 'settings' ? <SettingsView /> : null}
            </ErrorBoundary>
          </main>
          <SideColumn side={1} />
        </div>
      </div>
      {narrow ? <TabBar /> : null}
      {toastMsg ? <div className="toast" role="status">{toastMsg}</div> : null}
      {onboarding ? <Onboarding onDone={() => { setOnboarding(false); refreshMeta(); setFeedKey((k) => k + 1); toast(t('Welcome. Your feed is filling up.')); }} /> : null}
      {!onboarding && updates.news ? <WhatsNew info={updates.news} onClose={updates.closeNews} /> : null}
      {updateOpen && updates.info ? <UpdateModal info={updates.info} onClose={() => setUpdateOpen(false)} /> : null}
    </AppCtx.Provider>
  );
}
