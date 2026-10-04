import { useEffect, useState } from 'react';
import { api, FORMATS } from '../api.js';
import { useApp } from '../context.jsx';
import { Icon } from '../icons.jsx';

function since(ts) {
  if (!ts) return 'never fetched';
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 1 ? 'fetched just now' : m < 60 ? `fetched ${m} min ago` : `fetched ${Math.round(m / 60)} h ago`;
}

function KeyForm({ p, onSaved }) {
  const { toast } = useApp();
  const [f, setF] = useState({ userId: '', apiKey: '' });
  return (
    <form className="formgrid" onSubmit={async (e) => { e.preventDefault(); await api(`/settings/booru/${p.id}`, { method: 'PUT', body: f }); toast(`${p.label} key saved.`); onSaved(); }}>
      <label htmlFor={`${p.id}-uid`}>User ID<input id={`${p.id}-uid`} value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })} autoComplete="off" /></label>
      <label htmlFor={`${p.id}-key`}>API key<input id={`${p.id}-key`} type="password" value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} placeholder={p.hasKeys ? 'saved, leave empty to keep' : ''} autoComplete="off" /></label>
      <div className="rowline"><button type="submit" className="ghost-btn small">Save key</button><span className="wnote">Find both on your account options page on {p.label}.</span></div>
    </form>
  );
}

function ProviderCard({ p, reload }) {
  const { toast } = useApp();
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(p.can.community ? 'community' : p.can.search ? 'search' : 'creator');
  const { settings, setSettings } = useApp();
  const [inst, setInst] = useState(settings?.lemmyInstance || 'lemmynsfw.com');
  const PLACE = { search: 'what to search for', community: p.id === 'reddit' ? 'subreddit, like RealGirls' : 'community, like gonewildstories@lemmit.online', creator: p.id === 'bluesky' ? 'handle, like name.bsky.social' : p.id === 'lemmy' ? 'user, like name@lemmynsfw.com' : 'exact name' };
  const [value, setValue] = useState('');
  const locked = !p.hasKeys;

  async function toggle(on) {
    await api(`/providers/${p.id}`, { method: 'PUT', body: { enabled: on } });
    toast(on ? `${p.label} on. Fetching posts now.` : `${p.label} off. Its posts stay in the feed until you've seen them.`);
    reload();
  }

  async function runTest() {
    setBusy(true);
    setTest(null);
    try {
      setTest(await api(`/providers/${p.id}/test`, { method: 'POST', body: {} }));
      reload();
    } finally { setBusy(false); }
  }

  async function add(e) {
    e.preventDefault();
    const v = value.trim();
    if (!v) { toast('Type a search or a name first.'); return; }
    await api('/follow', { method: 'POST', body: { kind: mode, value: `${p.id}|${v}`, on: true, label: `${p.label}: ${v}` } });
    setValue('');
    toast('Added. Fetching in the background.');
    reload();
  }

  return (
    <div className={`provcard${p.enabled ? ' on' : ''}`}>
      <div className="provhead">
        <div>
          <h4>{p.label}</h4>
          <div className="chiprow">{p.formats.map((f) => <span key={f} className="chip ghost">{FORMATS[f]}</span>)}</div>
        </div>
        <label className="toggle compact" htmlFor={`prov-${p.id}`} title={locked ? (p.needs === 'lustpress' ? 'Set a scraper server first (below)' : 'Add the keys first') : ''}>
          <input id={`prov-${p.id}`} type="checkbox" checked={p.enabled} disabled={locked} onChange={(e) => toggle(e.target.checked)} />
          <span className="tbox" aria-hidden="true" />
          <span className="sr">{p.enabled ? 'On' : 'Off'}</span>
        </label>
      </div>
      <p className="wtext">{p.about}</p>
      {locked && p.needs === 'lustpress' ? <p className="diag">Needs a scraper server: add its address under Scraper server below and this source turns on by itself.</p> : null}
      {p.alsoScraper ? <p className="count">Official API plus your scraper server, results merged</p> : null}
      <p className="count">{p.stats.items || 0} posts{p.stats.filtered ? ` · ${p.stats.filtered} filtered out` : ''} · {since(p.stats.lastFetch)}</p>
      {p.stats.lastError ? <p className="diag bad">Last error: {p.stats.lastError}</p> : null}
      {p.id === 'rule34' || p.id === 'gelbooru' ? <KeyForm p={p} onSaved={reload} /> : null}
      {p.id === 'lemmy' ? (
        <form className="rowline wrapline" onSubmit={async (e) => { e.preventDefault(); const r = await api('/settings/lemmy', { method: 'PUT', body: { instance: inst } }); setSettings?.((s) => ({ ...s, lemmyInstance: r.instance || inst })); toast(`Lemmy server set to ${r.instance || inst}.`); reload(); }}>
          <label className="fb-label" htmlFor="lemmyInst">Server</label>
          <input id="lemmyInst" value={inst} onChange={(e) => setInst(e.target.value)} aria-label="Lemmy server" />
          <button type="submit" className="ghost-btn small">Save</button>
        </form>
      ) : null}
      {p.id === 'reddit' && p.rss ? <p className="count">{p.rss.authenticated ? 'Feed key set: fast updates' : `One request per minute${p.rss.waiting ? `, ${p.rss.waiting} waiting` : ''}`}{p.rss.lastError ? ` · ${p.rss.lastError}` : ''}</p> : null}
      {p.hasKeys ? (
        <div className="rowline wrapline">
          <button type="button" className="ghost-btn small" onClick={runTest} disabled={busy}>{busy ? 'Testing' : 'Test'}</button>
          {test ? (test.ok
            ? <span className="count">Works: {test.fetched} posts in {(test.ms / 1000).toFixed(1)} s{test.filtered ? `, ${test.filtered} filtered out` : ''}</span>
            : <span className="count down">Failed: {test.error}</span>) : null}
        </div>
      ) : null}
      {(p.can.search || p.can.creator) && p.hasKeys ? (
        <>
          <form className="rowline wrapline" onSubmit={add}>
            <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Type">
              {p.can.community ? <option value="community">{p.id === 'reddit' ? 'Subreddit' : 'Community'}</option> : null}
              {p.can.search ? <option value="search">Search</option> : null}
              {p.can.creator ? <option value="creator">{p.id === 'pornhub' || p.id === 'redtube' ? 'Performer' : p.id === 'reddit' ? 'Reddit user' : p.id === 'bluesky' ? 'Handle' : p.id === 'lemmy' ? 'User' : 'Creator'}</option> : null}
            </select>
            <input id={`add-${p.id}`} value={value} onChange={(e) => setValue(e.target.value)} placeholder={PLACE[mode]} aria-label="Search or name" />
            <button type="submit" className="ghost-btn small">Add</button>
          </form>
          {p.follows.length ? (
            <div className="follist">
              {p.follows.map((f) => (
                <div key={f.id} className={`folrow${f.active ? '' : ' dim'}`}>
                  <span className="chip ghost">{f.target?.mode === 'creator' ? 'creator' : f.target?.mode === 'subreddit' ? 'subreddit' : f.target?.mode}</span>
                  <span className="folname">{f.target?.value || f.value}{f.synced_from === 'auto' ? <em className="autotag">{f.active ? 'auto' : 'resting'}{f.topic ? `: ${f.topic.split(',')[0]}` : f.label?.includes('matches') ? `: ${f.label.split('matches ').pop()}` : ''}</em> : null}{f.why ? <em className="autotag why">{f.why}</em> : null}</span>
                  <span className="count">{since(f.last_fetch)}</span>
                  <button type="button" className="icon-btn" onClick={async () => { await api('/follow', { method: 'POST', body: { kind: f.kind, value: f.value, on: !f.active } }); reload(); }} aria-label={f.active ? 'Pause' : 'Resume'} title={f.active ? 'Pause' : 'Resume'}><Icon name={f.active ? 'min' : 'plus'} /></button>
                  <button type="button" className="icon-btn" onClick={async () => { await api(`/follows/${f.id}`, { method: 'DELETE' }); reload(); }} aria-label="Remove" title="Remove"><Icon name="trash" /></button>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function SourcesSection() {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const load = () => api('/providers').then(setD).catch((e) => toast(e.message));
  useEffect(() => { load(); }, []);
  if (!d) return <div className="card2"><h3>Sources</h3><p className="wnote">Loading…</p></div>;
  return (
    <div className="card2">
      <h3>Sources <span className="count">{d.providers.filter((p) => p.enabled).length} on</span></h3>
      <p className="wnote">Every source uses its own official API. Turn sources on or off, add searches, creators and performers to follow, and test the connection. New posts are tagged and mixed into your feed by match.</p>
      <label className="toggle" htmlFor="autoDiscover">
        <input id="autoDiscover" type="checkbox" checked={d.autoDiscover} onChange={async (e) => { await api('/settings/discovery', { method: 'PUT', body: { autoDiscover: e.target.checked } }); load(); }} />
        <span className="tbox" aria-hidden="true" />
        <span><b>Search every source for your top tags automatically</b><small>{d.autoTags.length ? `Right now: ${d.autoTags.join(', ')}` : 'Starts once you’ve rated, saved or spent time on a few posts'}</small></span>
      </label>
      <div className="rowline wrapline"><button type="button" className="ghost-btn small accent" onClick={async () => { toast('Looking for subreddits, RedGIFs niches, Lemmy communities and Bluesky creators that match your taste…'); try { const r = await api('/discover', { method: 'POST', body: {} }); const n = r.added || 0; toast(`${n ? `Following ${n} new sources that match ${r.terms.slice(0, 3).join(', ')}.` : 'Nothing new to add right now.'}${r.aiChecked ? ` Checking ${r.aiChecked} AI-picked subreddits on Reddit first.` : ''}${r.pruned?.length ? ` Rested ${r.pruned.length} that got little attention (kept for later).` : ''}`); load(); } catch (e) { toast(e.message); } }}><Icon name="plus" />Find more sources for my taste</button><span className="wnote">Runs by itself every hour and follows what you are into right now. Auto sources are marked "auto", show how many of their posts you saw and how many points they earned, and rest when they get little attention; they wake up when you get into that topic again. Sources you follow yourself are never touched.</span></div>
      <div className="rowline"><button type="button" className="ghost-btn small" onClick={async () => { toast('Fetching from all sources…'); const r = await api('/ingest', { method: 'POST', body: { force: true } }); toast(r.skipped ? 'Already fetching, try again in a moment.' : `${r.added} new posts${r.blocked ? `, ${r.blocked} filtered out` : ''}.`); load(); }}><Icon name="refresh" />Fetch everything now</button></div>
      <div className="provgrid">{d.providers.map((p) => <ProviderCard key={p.id} p={p} reload={load} />)}</div>
    </div>
  );
}

export function ExtremeSection() {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [t, setT] = useState('');
  const load = () => api('/settings/extreme').then(setD).catch(() => {});
  useEffect(() => { load(); }, []);
  async function save(patch) {
    const r = await api('/settings/extreme', { method: 'PUT', body: patch });
    toast(`${r.blocked ? `${r.blocked} posts hidden. ` : ''}${r.restored ? `${r.restored} posts back. ` : ''}Saved.`);
    load();
  }
  if (!d) return null;
  return (
    <div className="card2">
      <h3>Extreme content</h3>
      <label className="toggle" htmlFor="extremeOn">
        <input id="extremeOn" type="checkbox" checked={d.on} onChange={(e) => save({ on: e.target.checked })} />
        <span className="tbox" aria-hidden="true" />
        <span><b>Hide extreme content</b><small>Posts tagged or titled with any of these words never reach the feed</small></span>
      </label>
      <div className="limits">{d.terms.map((x) => <span className="limit" key={x}>{x}<button type="button" aria-label={`Remove ${x}`} onClick={() => save({ terms: d.terms.filter((y) => y !== x) })}><Icon name="close" /></button></span>)}</div>
      <form className="rowline" onSubmit={(e) => { e.preventDefault(); if (!t.trim()) return; save({ terms: [...d.terms, t.trim()] }); setT(''); }}>
        <input id="extremeAdd" value={t} onChange={(e) => setT(e.target.value)} placeholder="Add a word" aria-label="Add a word" />
        <button type="submit" className="ghost-btn small">Add</button>
        <button type="button" className="ghost-btn small" onClick={() => save({ terms: d.defaults })}>Reset to defaults</button>
      </form>
    </div>
  );
}
