import { useEffect, useRef, useState } from 'react';
import { api, fmtBytes, fmtNum } from '../api.js';
import { useApp, crumbList, MOODS } from '../context.jsx';
import { Icon } from '../icons.jsx';
import { useActivity } from '../activity.js';
import { t, tn, getLang } from '../i18n.js';
import { PhoneModal } from './Phone.jsx';
import { useNarrow } from './FeedView.jsx';

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

const CHIP_ICON = { gender: null, person: 'person', format: 'grid', tag: null, syn: null, source: 'globe' };

function Chip({ c, onRemove }) {
  const g = c.kind === 'gender' ? (c.value === 'both' ? 'both' : String(c.value).startsWith('women') ? 'f' : 'm') : null;
  return (
    <span className={`schip schip-${c.kind}${g ? ` g-${g}` : ''}`} title={c.kind === 'syn' ? t('Similar to {tag}', { tag: c.of }) : undefined}>
      {c.kind === 'gender' ? (g === 'both' ? <><Icon name="female" /><Icon name="male" /></> : <Icon name={g === 'f' ? 'female' : 'male'} />) : null}
      {CHIP_ICON[c.kind] ? <Icon name={CHIP_ICON[c.kind]} /> : null}
      <span>{c.text}</span>
      <button type="button" onClick={() => onRemove(c)} aria-label={t('Remove {name}', { name: c.text })}><Icon name="x" /></button>
    </span>
  );
}

export default function TopBar() {
  const { setFilters, filters, openMode, mode, askOut, setAskOut, search, runSearch, editChip, toast, clearSearch, clearFilter, kinks, fantasies, opts, update, openUpdate, clearAll: clearEverything } = useApp();
  const acts = useActivity();
  const [q, setQ] = useState('');
  const [deep, setDeep] = useState(readDeep);
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [phone, setPhone] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [stepsFull, setStepsFull] = useState(false);
  const [barHover, setBarHover] = useState(false);
  const [typing, setTyping] = useState(false);
  const narrow = useNarrow();
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
    const timer = setInterval(load, 8000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  // The search field shows what is being searched, also when a search starts from a tag or a performer.
  useEffect(() => { if (search?.q) setQ(search.q); }, [search?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeNow = !!search && !!filters.search && filters.search === search.id;
  useEffect(() => { if (!filters.search && search) setQ(''); }, [filters.search]); // eslint-disable-line react-hooks/exhaustive-deps


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
      toast(d ? t('Normal thinking: quick answers from the 9B model.') : t('Deep thinking: the big model thinks it through first. Slower, better with complicated requests.'));
      return !d;
    });
  }

  async function submit(e) {
    setTyping(false);
    e.preventDefault();
    const text = q.trim();
    if (!text) { setAskOut(t('Type what you want to see, or tell it what to do.')); return; }
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
  const hide = () => { if (!pinned) hideTimer.current = setTimeout(() => setOpen(false), 200); };
  useEffect(() => {
    if (!pinned) return undefined;
    const away = (e) => { if (!e.target.closest?.('.statusdot-wrap')) { setPinned(false); setOpen(false); } };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [pinned]);
  const ok = !!status?.ollama?.ok;

  const steps = search?.steps || [];
  const busy = [...steps].reverse().find((s) => s.state === 'run') || acts.find((a) => a.state === 'run');
  const nRun = steps.filter((s) => s.state === 'run').length + acts.filter((a) => a.state === 'run').length;
  const activeSearch = search && filters.search === search.id;
  const chips = activeSearch ? search.chips || [] : [];
  const shownSteps = stepsOpen || ((barHover || typing) && steps.length && search?.done) ? steps : [];
  // Background loading (the feed fetching more while you scroll) stays in the small pill and never pushes a list open.
  const others = acts.filter((a) => !steps.some((s) => s.key === a.key) && (!a.quiet || stepsOpen));

  // What the feed is showing (filters) and what the search looks for. On a Mac they sit inside the search bar,
  // before what you type; on a phone under it.
  const chipRow = (() => {
      // What the feed is showing (filters) and what the search looks for, in one row with one look.
      const list = crumbList(filters, { kinks, fantasies }).filter(([k]) => !(k === 'search' && activeNow) && !(k === 'sources' && chips.some((c) => c.kind === 'source')));
      const mood = opts?.mood ? MOODS.find((m) => m.id === opts.mood) : null;
      if (mood) for (const k of Object.keys(mood.filters || {})) { const i = list.findIndex(([x]) => x === k); if (i >= 0) list.splice(i, 1); }
      if (!list.length && !mood && !chips.length) return null;
      return (
        <div className="sb-chips" aria-label={t('What the feed is showing')}>
          {mood ? <span className="schip schip-filter"><span>{t('Mood: {mood}', { mood: mood.label })}</span><button type="button" onClick={() => clearFilter('mood')} aria-label={t('Remove the {mood} mood', { mood: mood.label })}><Icon name="x" /></button></span> : null}
          {list.map(([k, label]) => <span key={k} className={`schip schip-filter${k.startsWith('tag:') ? ' schip-tag' : ''}${['formats', 'window', 'noTune'].includes(k) ? ' schip-tune' : ''}`}><span>{label}</span><button type="button" onClick={() => clearFilter(k)} aria-label={t('Remove {name}', { name: label })}><Icon name="x" /></button></span>)}
          {chips.map((c) => <Chip key={`${c.kind}:${c.value}`} c={c} onRemove={editChip} />)}
        </div>
      );
  })();
  const hasChips = !!chipRow;

  return (
    <header className="top" ref={headRef}>
      <button type="button" className="brand" onClick={() => setFilters({})} aria-label={t('Back to the mixed feed')}>
        <h1>Undercurrent</h1>
      </button>
      <div className="askwrap">
        <form className="ask" onSubmit={submit} role="search" onMouseEnter={() => setBarHover(true)} onMouseLeave={() => setBarHover(false)}>
          <div className="statusdot-wrap" onMouseEnter={show} onMouseLeave={hide}>
            <button type="button" className={`statusdot${status ? (ok ? ' ok' : ' off') : ''}${status?.mock ? ' mock' : ''}`} onClick={() => { if (pinned) { setPinned(false); setOpen(false); } else { setPinned(true); setOpen(true); } }} aria-expanded={open} aria-controls="statusPop" title={ok ? (status?.mock ? t('Local model (test)') : t('Local model ready')) : t('Local model offline')} aria-label={t('What runs on this Mac')}>
              <i />
            </button>
            {open && status ? (
              <div className="statuspop" id="statusPop" role="dialog" aria-label={t('What runs on this Mac')}>
                <div className="sp-head"><span className={`live${ok ? '' : ' off'}`}><i className={ok ? '' : 'off'} />{ok ? (status.mock ? t('Local model (test)') : t('Local model ready')) : t('Local model offline')}</span><span className="bytes">{tn(nReq, '0 B profile data sent · {n} content request', '0 B profile data sent · {n} content requests')}</span></div>
                <div className="sp-row"><b>{t('Model')}</b><span>{status.model}</span></div>
                <div className="sp-row"><b>Ollama</b><span>{status.ollama.ok ? t('running {v}', { v: status.ollama.version }) : status.ollama.error}</span></div>
                {status.running?.map((m) => <div className="sp-row" key={m.name}><b>{t('Loaded')}</b><span>{m.name} · {t('{size} in GPU memory', { size: fmtBytes(m.vram) })}</span></div>)}
                <div className="sp-row"><b>{t('This session')}</b><span>{tn(u?.requests || 0, '{n} AI call', '{n} AI calls')} · {t('{n} tokens', { n: fmtNum((u?.promptTokens || 0) + (u?.completionTokens || 0)) })}{tps ? ` · ${t('{n} tokens/s', { n: getLang() === 'fr' ? tps.replace('.', ',') : tps })}` : ''}</span></div>
                <div className="sp-row"><b>{t('Tagging')}</b><span>{t('{n} waiting', { n: status.tagger.pending })} · {t('{n} tagged', { n: status.tagger.tagged })}{status.tagger.lastError ? ` · ${status.tagger.lastError}` : ''}</span></div>
                <div className="sp-row"><b>{t('Machine')}</b><span>{t('{gb} GB memory · {n} cores', { gb: status.system.memoryGb, n: status.system.cores })}</span></div>
                <div className="sp-sep" />
                <p className="sp-note">{status.webSearch ? t('Your profile, memory and history never leave this computer. The AI runs locally. The only outgoing traffic is fetching posts and media, plus web searches for names when you look someone up:') : t('Your profile, memory and history never leave this computer. The AI runs locally. The only outgoing traffic is fetching posts and media:')}</p>
                {reqs.length ? reqs.slice(0, 8).map((r) => (
                  <div className="sp-row" key={r.host + r.purpose}><b>{r.host}</b><span>{r.n}× {r.purpose} · {t('{out} out · {in} in', { out: fmtBytes(r.bytesOut), in: fmtBytes(r.bytesIn) })}</span></div>
                )) : <div className="sp-row full"><span>{t('No outgoing requests since you opened the app.')}</span></div>}
                {status.ingest?.log?.[0] ? <p className="sp-note">{t('Last fetch: {msg}', { msg: status.ingest.log[0].msg })}</p> : null}
              </div>
            ) : null}
          </div>
          <div className={`sbar${busy ? ' working' : ''}`}>
            <Icon name="search" />
            <div className={`sb-field${!narrow && hasChips ? ' has-chips' : ''}`}>
              {!narrow ? chipRow : null}
              <input id="askIn" type="text" autoComplete="off" value={q} onChange={(e) => { setQ(e.target.value); setTyping(!!e.target.value); }} onBlur={() => setTyping(false)} placeholder={!narrow && hasChips ? t('Search or ask…') : t('Search or ask: hairy muscle daddy · woman with big tits · content from a creator · remove a kink and show me more…')} aria-label={t('Search or tell the assistant what to do')} />
            </div>
            {busy ? (
              <button type="button" className="sb-now" onClick={() => setStepsOpen((x) => !x)} aria-live="polite" title={t('Show every step')}>
                <span className="spin" aria-hidden="true" /><span className="sb-now-l">{busy.label}</span>{nRun > 1 ? <span className="sb-n">+{nRun - 1}</span> : null}
              </button>
            ) : steps.length ? (
              <button type="button" className="sb-now done" onClick={() => setStepsOpen((x) => !x)} title={t('Show what the search did')}>
                <Icon name="check" /><span className="sb-now-l">{search.found ? t('{n} found', { n: fmtNum(search.found) }) : t('Done')}</span>
              </button>
            ) : null}
            <button type="button" className={`deepbtn${deep ? ' on' : ''}`} onClick={toggleDeep} aria-pressed={deep} title={deep ? t('Deep thinking is on: the big model thinks before it acts (slower)') : t('Turn on deep thinking: the big model thinks before it acts')}>
              <Icon name="brain" />
            </button>
          </div>
          {(activeNow && q.trim() === (search.q || '').trim()) || (!q.trim() && hasChips) ? (
            <button className="btn-clear" type="button" onClick={() => { setQ(''); clearEverything(!narrow); document.getElementById('askIn')?.focus(); }} aria-label={t('Clear the search and every filter shown here')} title={t('Clear the search and every filter shown here')}><Icon name="x" /></button>
          ) : (
            <button className="btn-accent" type="submit" disabled={running} aria-label={t('Search')}><span className="btn-l">{running ? t('Working') : t('Search')}</span><span className="btn-ic" aria-hidden="true">{running ? <span className="spin" /> : <Icon name="go" />}</span></button>
          )}
          {shownSteps.length || others.length ? (() => {
            // Only the latest line shows; pointing at it (or tapping it) folds the earlier steps out above it.
            const all = [...shownSteps, ...others];
            // The one line is a summary of the whole search when there is one: what was searched for and where.
            const sum = shownSteps.length && search?.summary ? { key: 'summary', label: search.summary, state: search.done ? 'done' : 'run', detail: search.done && search.found ? tn(search.found, '{n} found', '{n} found') : null } : null;
            const latest = sum || [...all].reverse().find((x) => x.state === 'run') || all[all.length - 1];
            const older = sum ? all : all.filter((x) => x !== latest);
            const full = stepsFull || barHover || typing;
            return (
              <div className={`sb-steps${full ? ' open' : ''}${older.length ? ' has-older' : ''}`} aria-label={t('What is happening')} onMouseEnter={() => setStepsFull(true)} onMouseLeave={() => setStepsFull(false)} onClick={() => setStepsFull((x) => !x)}>
                {older.length ? <div className="sb-older"><ul>{older.map((x) => <Step key={x.key} s={x} />)}</ul></div> : null}
                <ul className="sb-latest"><Step key={latest.key} s={latest} />{older.length ? <li className="sb-more" aria-hidden="true">{full ? <Icon name="chevU" /> : <>+{older.length}<Icon name="chevD" /></>}</li> : null}</ul>
              </div>
            );
          })() : null}
        </form>
        {narrow ? chipRow : null}
        {mode !== 'feed' && askOut ? <div id="askOut" aria-live="polite">{askOut}</div> : null}
      </div>
      <div className="topright">
        {update?.available ? <button type="button" className="uppill" onClick={openUpdate} title={t('Version {v} is available', { v: update.latest })}><Icon name="spark" />{t('Update to {v}', { v: update.latest })}</button> : null}
        {!window.navigator.standalone && !/iPhone|iPad|Android/i.test(navigator.userAgent) ? <button type="button" className="phonebtn" onClick={() => setPhone(true)} title={t('Open on your iPhone')} aria-label={t('Open on your iPhone')}><Icon name="phone" /></button> : null}
        <nav className="nav" aria-label={t('Views')}>
          <button type="button" className={mode === 'feed' && !filters.saved ? 'on' : ''} onClick={() => { if (filters.saved) setFilters({}); openMode('feed'); }} title={t('Feed')} aria-label={t('Feed')}><Icon name="home" /></button>
          <button type="button" className={mode === 'feed' && filters.saved ? 'on' : ''} onClick={() => { openMode('feed'); setFilters({ saved: true }); }} title={t('Saved posts')} aria-label={t('Saved posts')}><Icon name="save" /></button>
          <button type="button" className={mode === 'map' ? 'on' : ''} onClick={() => openMode('map')} title={t('Your map')} aria-label={t('Your map')}><Icon name="map" /></button>
          <button type="button" className={mode === 'memory' ? 'on' : ''} onClick={() => openMode('memory')} title={t('Memory, kinks and fantasies')} aria-label={t('Memory')}><Icon name="brain" /></button>
          <button type="button" className={mode === 'settings' ? 'on' : ''} onClick={() => openMode('settings')} title={t('Settings')} aria-label={t('Settings')}><Icon name="gear" /></button>
        </nav>
      </div>
      {phone ? <PhoneModal onClose={() => setPhone(false)} /> : null}
    </header>
  );
}
