import { useEffect, useState } from 'react';
import { api, FORMATS } from '../api.js';
import { useApp } from '../context.jsx';
import { Icon } from '../icons.jsx';
import { t, tn, locale } from '../i18n.js';

const dec = (x) => Number(x).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function since(ts) {
  if (!ts) return t('never fetched');
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 1 ? t('fetched just now') : m < 60 ? t('fetched {m} min ago', { m }) : t('fetched {h} h ago', { h: Math.round(m / 60) });
}

function KeyForm({ p, onSaved }) {
  const { toast } = useApp();
  const [f, setF] = useState({ userId: '', apiKey: '' });
  return (
    <form className="formgrid" onSubmit={async (e) => { e.preventDefault(); await api(`/settings/booru/${p.id}`, { method: 'PUT', body: f }); toast(t('{label} key saved.', { label: p.label })); onSaved(); }}>
      <label htmlFor={`${p.id}-uid`}>{t('User ID')}<input id={`${p.id}-uid`} value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })} autoComplete="off" /></label>
      <label htmlFor={`${p.id}-key`}>{t('API key')}<input id={`${p.id}-key`} type="password" value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} placeholder={p.hasKeys ? t('saved, leave empty to keep') : ''} autoComplete="off" /></label>
      <div className="rowline"><button type="submit" className="ghost-btn small"><Icon name="check" />{t('Save key')}</button><span className="wnote">{t('Find both on your account options page on {label}.', { label: p.label })}</span></div>
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
  const PLACE = { search: t('what to search for'), community: p.id === 'reddit' ? t('subreddit, like RealGirls') : t('community, like gonewildstories@lemmit.online'), creator: p.id === 'bluesky' ? t('handle, like name.bsky.social') : p.id === 'lemmy' ? t('user, like name@lemmynsfw.com') : t('exact name') };
  const [value, setValue] = useState('');
  const locked = !p.hasKeys;

  async function toggle(on) {
    await api(`/providers/${p.id}`, { method: 'PUT', body: { enabled: on } });
    toast(on ? t('{label} on. Fetching posts now.', { label: p.label }) : t("{label} off. Its posts stay in the feed until you've seen them.", { label: p.label }));
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
    if (!v) { toast(t('Type a search or a name first.')); return; }
    await api('/follow', { method: 'POST', body: { kind: mode, value: `${p.id}|${v}`, on: true, label: `${p.label}: ${v}` } });
    setValue('');
    toast(t('Added. Fetching in the background.'));
    reload();
  }

  return (
    <div className={`provcard${p.enabled ? ' on' : ''}`}>
      <div className="provhead">
        <div>
          <h4>{p.label}</h4>
          <div className="chiprow">{p.formats.map((f) => <span key={f} className="chip ghost">{FORMATS[f]}</span>)}</div>
        </div>
        <label className="toggle compact" htmlFor={`prov-${p.id}`} title={locked ? (p.needs === 'lustpress' ? t('Set a scraper server first (below)') : t('Add the keys first')) : ''}>
          <input id={`prov-${p.id}`} type="checkbox" checked={p.enabled} disabled={locked} onChange={(e) => toggle(e.target.checked)} />
          <span className="tbox" aria-hidden="true" />
          <span className="sr">{p.enabled ? t('On') : t('Off')}</span>
        </label>
      </div>
      <p className="wtext">{p.about}</p>
      {locked && p.needs === 'lustpress' ? <p className="diag">{t('Needs a scraper server: add its address under Scraper server below and this source turns on by itself.')}</p> : null}
      {p.alsoScraper ? <p className="count">{t('Official API plus your scraper server, results merged')}</p> : null}
      <p className="count">{tn(p.stats.items || 0, '{n} post', '{n} posts')}{p.stats.filtered ? ` · ${tn(p.stats.filtered, '{n} filtered out', '{n} filtered out')}` : ''} · {since(p.stats.lastFetch)}</p>
      {p.stats.lastError ? <p className="diag bad">{t('Last error: {error}', { error: p.stats.lastError })}</p> : null}
      {p.id === 'rule34' || p.id === 'gelbooru' ? <KeyForm p={p} onSaved={reload} /> : null}
      {p.id === 'lemmy' ? (
        <form className="rowline wrapline" onSubmit={async (e) => { e.preventDefault(); const r = await api('/settings/lemmy', { method: 'PUT', body: { instance: inst } }); setSettings?.((s) => ({ ...s, lemmyInstance: r.instance || inst })); toast(t('Lemmy server set to {server}.', { server: r.instance || inst })); reload(); }}>
          <label className="fb-label" htmlFor="lemmyInst">{t('Server')}</label>
          <input id="lemmyInst" value={inst} onChange={(e) => setInst(e.target.value)} aria-label={t('Lemmy server')} />
          <button type="submit" className="ghost-btn small"><Icon name="check" />{t('Save')}</button>
        </form>
      ) : null}
      {p.id === 'reddit' && p.rss ? <p className="count">{p.rss.authenticated ? t('Feed key set: fast updates') : p.rss.waiting ? t('One request per minute, {n} waiting', { n: p.rss.waiting }) : t('One request per minute')}{p.rss.lastError ? ` · ${p.rss.lastError}` : ''}</p> : null}
      {p.hasKeys ? (
        <div className="rowline wrapline">
          <button type="button" className="ghost-btn small" onClick={runTest} disabled={busy}><Icon name="pulse" />{busy ? t('Testing') : t('Test')}</button>
          {test ? (test.ok
            ? <span className="count">{tn(test.fetched, 'Works: {n} post in {sec} s', 'Works: {n} posts in {sec} s', { sec: dec(test.ms / 1000) })}{test.filtered ? `, ${tn(test.filtered, '{n} filtered out', '{n} filtered out')}` : ''}</span>
            : <span className="count down">{t('Failed: {error}', { error: test.error })}</span>) : null}
        </div>
      ) : null}
      {(p.can.search || p.can.creator) && p.hasKeys ? (
        <>
          <form className="rowline wrapline" onSubmit={add}>
            <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label={t('Type')}>
              {p.can.community ? <option value="community">{p.id === 'reddit' ? t('Subreddit') : t('Community')}</option> : null}
              {p.can.search ? <option value="search">{t('Search')}</option> : null}
              {p.can.creator ? <option value="creator">{p.id === 'pornhub' || p.id === 'redtube' ? t('Performer') : p.id === 'reddit' ? t('Reddit user') : p.id === 'bluesky' ? t('Handle') : p.id === 'lemmy' ? t('User') : t('Creator')}</option> : null}
            </select>
            <input id={`add-${p.id}`} value={value} onChange={(e) => setValue(e.target.value)} placeholder={PLACE[mode]} aria-label={t('Search or name')} />
            <button type="submit" className="ghost-btn small"><Icon name="plus" />{t('Add')}</button>
          </form>
          {p.follows.length ? (
            <div className="follist">
              {p.follows.map((f) => (
                <div key={f.id} className={`folrow srcfol${f.active ? '' : ' dim'}`}>
                  <span className="chip ghost">{f.target?.mode === 'creator' ? t('creator') : f.target?.mode === 'subreddit' ? t('subreddit') : f.target?.mode === 'search' ? t('search') : f.target?.mode === 'community' ? t('community') : f.target?.mode}</span>
                  <div className="folmain">
                    <span className="folname">{f.target?.value || f.value}</span>
                    <div className="folmeta">
                      {f.synced_from === 'auto' ? <em className="autotag">{f.active ? t('auto') : t('resting')}{f.topic ? `: ${f.topic.split(',')[0]}` : /(?:matches|correspond à) (.+)$/.test(f.label || '') ? `: ${f.label.match(/(?:matches|correspond à) (.+)$/)[1]}` : ''}</em> : null}
                      {f.why ? <em className="autotag why">{f.why}</em> : null}
                      <span className="count">{since(f.last_fetch)}</span>
                    </div>
                  </div>
                  <div className="folbtns">
                    <button type="button" className="icon-btn" onClick={async () => { await api('/follow', { method: 'POST', body: { kind: f.kind, value: f.value, on: !f.active } }); reload(); }} aria-label={f.active ? t('Pause') : t('Resume')} title={f.active ? t('Pause') : t('Resume')}><Icon name={f.active ? 'min' : 'plus'} /></button>
                    <button type="button" className="icon-btn" onClick={async () => { await api(`/follows/${f.id}`, { method: 'DELETE' }); reload(); }} aria-label={t('Remove')} title={t('Remove')}><Icon name="trash" /></button>
                  </div>
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
  if (!d) return <div className="card2"><h3>{t('Sources')}</h3><p className="wnote">{t('Loading…')}</p></div>;
  const onCount = d.providers.filter((p) => p.enabled).length;
  return (
    <div className="card2">
      <h3>{t('Sources')} <span className="count">{tn(onCount, '{n} on', '{n} on')}</span></h3>
      <p className="wnote">{t('Every source uses its own official API. Turn sources on or off, add searches, creators and performers to follow, and test the connection. New posts are tagged and mixed into your feed by match.')}</p>
      <label className="toggle" htmlFor="autoDiscover">
        <input id="autoDiscover" type="checkbox" checked={d.autoDiscover} onChange={async (e) => { await api('/settings/discovery', { method: 'PUT', body: { autoDiscover: e.target.checked } }); load(); }} />
        <span className="tbox" aria-hidden="true" />
        <span><b>{t('Search every source for your top tags automatically')}</b><small>{d.autoTags.length ? t('Right now: {tags}', { tags: d.autoTags.join(', ') }) : t('Starts once you’ve rated, saved or spent time on a few posts')}</small></span>
      </label>
      <div className="rowline wrapline"><button type="button" className="ghost-btn small accent" onClick={async () => { toast(t('Looking for subreddits, RedGIFs niches, Lemmy communities and Bluesky creators that match your taste…')); try { const r = await api('/discover', { method: 'POST', body: {} }); const n = r.added || 0; toast(`${n ? tn(n, 'Following {n} new source that matches {terms}.', 'Following {n} new sources that match {terms}.', { terms: r.terms.slice(0, 3).join(', ') }) : t('Nothing new to add right now.')}${r.aiChecked ? ` ${tn(r.aiChecked, 'Checking {n} AI-picked subreddit on Reddit first.', 'Checking {n} AI-picked subreddits on Reddit first.')}` : ''}${r.pruned?.length ? ` ${tn(r.pruned.length, 'Rested {n} that got little attention (kept for later).', 'Rested {n} that got little attention (kept for later).')}` : ''}`); load(); } catch (e) { toast(e.message); } }}><Icon name="plus" />{t('Find more sources for my taste')}</button><span className="wnote">{t('Runs by itself every hour and follows what you are into right now. Auto sources are marked "auto", show how many of their posts you saw and how many points they earned, and rest when they get little attention; they wake up when you get into that topic again. Sources you follow yourself are never touched.')}</span></div>
      <div className="rowline"><button type="button" className="ghost-btn small" onClick={async () => { toast(t('Fetching from all sources…')); const r = await api('/ingest', { method: 'POST', body: { force: true } }); toast(r.skipped ? t('Already fetching, try again in a moment.') : `${tn(r.added, '{n} new post', '{n} new posts')}${r.blocked ? `, ${tn(r.blocked, '{n} filtered out', '{n} filtered out')}` : ''}.`); load(); }}><Icon name="refresh" />{t('Fetch everything now')}</button></div>
      <div className="provgrid">{d.providers.map((p) => <ProviderCard key={p.id} p={p} reload={load} />)}</div>
    </div>
  );
}

export function ExtremeSection() {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [word, setWord] = useState('');
  const load = () => api('/settings/extreme').then(setD).catch(() => {});
  useEffect(() => { load(); }, []);
  async function save(patch) {
    const r = await api('/settings/extreme', { method: 'PUT', body: patch });
    toast(`${r.blocked ? `${tn(r.blocked, '{n} post hidden.', '{n} posts hidden.')} ` : ''}${r.restored ? `${tn(r.restored, '{n} post back.', '{n} posts back.')} ` : ''}${t('Saved.')}`);
    load();
  }
  if (!d) return null;
  return (
    <div className="card2">
      <h3>{t('Extreme content')}</h3>
      <label className="toggle" htmlFor="extremeOn">
        <input id="extremeOn" type="checkbox" checked={d.on} onChange={(e) => save({ on: e.target.checked })} />
        <span className="tbox" aria-hidden="true" />
        <span><b>{t('Hide extreme content')}</b><small>{t('Posts tagged or titled with any of these words never reach the feed')}</small></span>
      </label>
      <div className="limits">{d.terms.map((x) => <span className="limit" key={x}>{x}<button type="button" aria-label={t('Remove {tag}', { tag: x })} onClick={() => save({ terms: d.terms.filter((y) => y !== x) })}><Icon name="close" /></button></span>)}</div>
      <form className="rowline" onSubmit={(e) => { e.preventDefault(); if (!word.trim()) return; save({ terms: [...d.terms, word.trim()] }); setWord(''); }}>
        <input id="extremeAdd" value={word} onChange={(e) => setWord(e.target.value)} placeholder={t('Add a word')} aria-label={t('Add a word')} />
        <button type="submit" className="ghost-btn small"><Icon name="plus" />{t('Add')}</button>
        <button type="button" className="ghost-btn small" onClick={() => save({ terms: d.defaults })}><Icon name="refresh" />{t('Reset to defaults')}</button>
      </form>
    </div>
  );
}
