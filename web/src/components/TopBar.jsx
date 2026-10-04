import { useEffect, useRef, useState } from 'react';
import { api, fmtBytes, fmtNum } from '../api.js';
import { useApp, crumbList, MOODS } from '../context.jsx';
import { Icon } from '../icons.jsx';
import { useActivity } from '../activity.js';

const LOADED = Date.now();

function readDeep() {
  try { return localStorage.getItem('uc-deep') === '1'; } catch { return false; }
}

function Step({ s }) {
  return (
    <li className={`act act-${s.state}`}>
      <span className="act-ic" aria-hidden="true">{s.state === 'run' ? <span className="spin" /> : s.state === 'done' ? <Icon name="check" /> : s.state === 'skip' ? <Icon name="min" /> : <Icon name="x" />}</span>
      <span className="act-l">{s.label}</span>
      {s.detail ? <span className="act-d">{s.detail}</span> : null}
    </li>
  );
}

const CHIP_ICON = { gender: null, person: 'person', format: 'grid', tag: null, syn: null };

function Chip({ c, onRemove }) {
  const g = c.kind === 'gender' ? (c.value === 'both' ? 'both' : String(c.value).startsWith('women') ? 'f' : 'm') : null;
  return (
    <span className={`schip schip-${c.kind}${g ? ` g-${g}` : ''}`} title={c.kind === 'syn' ? `Similar to ${c.of}` : undefined}>
      {c.kind === 'gender' ? (g === 'both' ? <><Icon name="female" /><Icon name="male" /></> : <Icon name={g === 'f' ? 'female' : 'male'} />) : null}
      {CHIP_ICON[c.kind] ? <Icon name={CHIP_ICON[c.kind]} /> : null}
      <span>{c.text}</span>
      <button type="button" onClick={() => onRemove(c)} aria-label={`Remove ${c.text}`}><Icon name="x" /></button>
    </span>
  );
}

export default function TopBar() {
  const { setFilters, filters, openMode, mode, askOut, setAskOut, search, runSearch, editChip, toast, clearSearch, clearFilter, kinks, fantasies, opts, update, openUpdate } = useApp();
  const acts = useActivity();
  const [q, setQ] = useState('');
  const [deep, setDeep] = useState(readDeep);
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const hideTimer = useRef(null);
  const stepTimer = useRef(null);
  const headRef = useRef(null);
  useEffect(() => {
    const el = headRef.current;
    if (!el) return undefined;
    const set = () => document.documentElement.style.setProperty('--toph', `${Math.round(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () => api(`/status?since=${LOADED}`).then((s) => alive && setStatus(s)).catch(() => {});
    load();
    const t = setInterval(load, 8000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // The search field shows what is being searched, also when a search starts from a tag or a performer.
  useEffect(() => { if (search?.q) setQ(search.q); }, [search?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeNow = !!search && !!filters.search && filters.search === search.id;
  useEffect(() => { if (!filters.search && search) setQ(''); }, [filters.search]); // eslint-disable-line react-hooks/exhaustive-deps

  function clearAll() {
    setQ('');
    clearSearch();
    document.getElementById('askIn')?.focus();
  }

  // The list of steps stays open while a search runs and folds away a few seconds after it is done.
  const running = !!search && !search.done;
  useEffect(() => {
    clearTimeout(stepTimer.current);
    if (running) setStepsOpen(true);
    else if (search?.done) stepTimer.current = setTimeout(() => setStepsOpen(false), 6000);
    return () => clearTimeout(stepTimer.current);
  }, [running, search?.done, search?.id]);

  function toggleDeep() {
    setDeep((d) => {
      try { localStorage.setItem('uc-deep', d ? '0' : '1'); } catch {}
      toast(d ? 'Normal thinking: quick answers from the 9B model.' : 'Deep thinking: the big model thinks it through first. Slower, better with complicated requests.');
      return !d;
    });
  }

  async function submit(e) {
    e.preventDefault();
    const text = q.trim();
    if (!text) { setAskOut('Type what you want to see, or tell it what to do.'); return; }
    try {
      await runSearch(text, { deep });
    } catch (err) {
      setAskOut(err.message);
    }
  }

  const reqs = status?.privacy?.requests || [];
  const nReq = reqs.reduce((a, b) => a + b.n, 0);
  const u = status?.usage?.session;
  const tps = u && u.ms ? (u.completionTokens / (u.ms / 1000)).toFixed(1) : null;
  const show = () => { clearTimeout(hideTimer.current); setOpen(true); };
  const hide = () => { hideTimer.current = setTimeout(() => setOpen(false), 200); };

  const steps = search?.steps || [];
  const busy = [...steps].reverse().find((s) => s.state === 'run') || acts.find((a) => a.state === 'run');
  const nRun = steps.filter((s) => s.state === 'run').length + acts.filter((a) => a.state === 'run').length;
  const activeSearch = search && filters.search === search.id;
  const chips = activeSearch ? search.chips || [] : [];
  const shownSteps = stepsOpen ? steps : [];
  // Background loading (the feed fetching more while you scroll) stays in the small pill and never pushes a list open.
  const others = acts.filter((a) => !steps.some((s) => s.key === a.key) && (!a.quiet || stepsOpen));

  return (
    <header className="top" ref={headRef}>
      <button type="button" className="brand" onClick={() => setFilters({})} aria-label="Back to the mixed feed">
        <h1>Undercurrent</h1><span>Local browser</span>
      </button>
      <div className="askwrap">
        <form className="ask" onSubmit={submit} role="search">
          <div className={`sbar${busy ? ' working' : ''}`}>
            <Icon name="search" />
            <input id="askIn" type="text" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or ask: hairy muscle daddy · woman with big tits · content from a creator · remove a kink and show me more…" aria-label="Search or tell the assistant what to do" />
            {busy ? (
              <button type="button" className="sb-now" onClick={() => setStepsOpen((x) => !x)} aria-live="polite" title="Show every step">
                <span className="spin" aria-hidden="true" /><span className="sb-now-l">{busy.label}</span>{nRun > 1 ? <span className="sb-n">+{nRun - 1}</span> : null}
              </button>
            ) : steps.length ? (
              <button type="button" className="sb-now done" onClick={() => setStepsOpen((x) => !x)} title="Show what the search did">
                <Icon name="check" /><span className="sb-now-l">{search.found ? `${fmtNum(search.found)} found` : 'Done'}</span>
              </button>
            ) : null}
            <button type="button" className={`deepbtn${deep ? ' on' : ''}`} onClick={toggleDeep} aria-pressed={deep} title={deep ? 'Deep thinking is on: the big model thinks before it acts (slower)' : 'Turn on deep thinking: the big model thinks before it acts'}>
              <Icon name="brain" />
            </button>
          </div>
          {activeNow && q.trim() === (search.q || '').trim() ? (
            <button className="btn-clear" type="button" onClick={clearAll} aria-label="Clear the search and go back to the feed" title="Clear the search and go back to the feed"><Icon name="x" /></button>
          ) : (
            <button className="btn-accent" type="submit" disabled={running}>{running ? 'Working' : 'Search'}</button>
          )}
        </form>
        {shownSteps.length || others.length ? (
          <ul className="sb-steps" aria-label="What is happening">
            {shownSteps.map((s) => <Step key={s.key} s={s} />)}
            {others.map((s) => <Step key={s.key} s={s} />)}
          </ul>
        ) : null}
        {(() => {
          // What the feed is showing, when it is not the plain mixed feed. The search itself is in the field above.
          const list = crumbList(filters, { kinks, fantasies }).filter(([k]) => !(k === 'search' && activeNow));
          const mood = opts?.mood ? MOODS.find((m) => m.id === opts.mood) : null;
          if (mood) for (const k of Object.keys(mood.filters || {})) { const i = list.findIndex(([x]) => x === k); if (i >= 0) list.splice(i, 1); }
          if (!list.length && !mood) return null;
          return (
            <div className="sb-crumbs" aria-label="What the feed is showing">
              <span className="tlabel">Showing</span>
              {mood ? <span className="crumb top">Mood: {mood.label}<button type="button" onClick={() => clearFilter('mood')} aria-label={`Remove the ${mood.label} mood`}><Icon name="x" /></button></span> : null}
              {list.map(([k, label]) => <span key={k} className="crumb top">{label}<button type="button" onClick={() => clearFilter(k)} aria-label={`Remove ${label}`}><Icon name="x" /></button></span>)}
            </div>
          );
        })()}
        {chips.length ? (
          <div className="sb-chips" aria-label="What this search looks for">
            {chips.map((c) => <Chip key={`${c.kind}:${c.value}`} c={c} onRemove={editChip} />)}
          </div>
        ) : null}
        {mode !== 'feed' && askOut ? <div id="askOut" aria-live="polite">{askOut}</div> : null}
      </div>
      <div className="topright">
        {update?.available ? <button type="button" className="uppill" onClick={openUpdate} title={`Version ${update.latest} is available`}><Icon name="spark" />Update to {update.latest}</button> : null}
        <nav className="nav" aria-label="Views">
          <button type="button" className={mode === 'feed' && !filters.saved ? 'on' : ''} onClick={() => { if (filters.saved) setFilters({}); openMode('feed'); }} title="Feed" aria-label="Feed"><Icon name="home" /></button>
          <button type="button" className={mode === 'feed' && filters.saved ? 'on' : ''} onClick={() => { openMode('feed'); setFilters({ saved: true }); }} title="Saved posts" aria-label="Saved posts"><Icon name="save" /></button>
          <button type="button" className={mode === 'map' ? 'on' : ''} onClick={() => openMode('map')} title="Your map" aria-label="Your map"><Icon name="map" /></button>
          <button type="button" className={mode === 'memory' ? 'on' : ''} onClick={() => openMode('memory')} title="Memory, kinks and fantasies" aria-label="Memory"><Icon name="brain" /></button>
          <button type="button" className={mode === 'settings' ? 'on' : ''} onClick={() => openMode('settings')} title="Settings" aria-label="Settings"><Icon name="gear" /></button>
        </nav>
        <div className="status" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} tabIndex={0} aria-describedby="statusPop">
          <span className="live"><i className={status?.ollama?.ok ? '' : 'off'} />{status?.ollama?.ok ? `Local model ${status?.mock ? '(test)' : 'ready'}` : 'Local model offline'}</span>
          <span className="bytes">0 B profile data sent · {nReq} content requests</span>
          {open && status ? (
            <div className="statuspop" id="statusPop" role="tooltip">
              <div className="sp-row"><b>Model</b><span>{status.model}</span></div>
              <div className="sp-row"><b>Ollama</b><span>{status.ollama.ok ? `running ${status.ollama.version}` : status.ollama.error}</span></div>
              {status.running?.map((m) => <div className="sp-row" key={m.name}><b>Loaded</b><span>{m.name} · {fmtBytes(m.vram)} in GPU memory</span></div>)}
              <div className="sp-row"><b>This session</b><span>{u?.requests || 0} AI calls · {fmtNum((u?.promptTokens || 0) + (u?.completionTokens || 0))} tokens{tps ? ` · ${tps} tokens/s` : ''}</span></div>
              <div className="sp-row"><b>Tagging</b><span>{status.tagger.pending} waiting · {status.tagger.tagged} tagged{status.tagger.lastError ? ` · ${status.tagger.lastError}` : ''}</span></div>
              <div className="sp-row"><b>Machine</b><span>{status.system.memoryGb} GB memory · {status.system.cores} cores</span></div>
              <div className="sp-sep" />
              <p className="sp-note">Your profile, memory and history never leave this computer. The AI runs locally. The only outgoing traffic is fetching posts and media{status.webSearch ? ', plus web searches for names when you look someone up' : ''}:</p>
              {reqs.length ? reqs.slice(0, 8).map((r) => (
                <div className="sp-row" key={r.host + r.purpose}><b>{r.host}</b><span>{r.n}× {r.purpose} · {fmtBytes(r.bytesOut)} out · {fmtBytes(r.bytesIn)} in</span></div>
              )) : <div className="sp-row full"><span>No outgoing requests since you opened the app.</span></div>}
              {status.ingest?.log?.[0] ? <p className="sp-note">Last fetch: {status.ingest.log[0].msg}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
