import { VersionCard } from './Updates.jsx';
import { useEffect, useState } from 'react';
import { api, fmtBytes } from '../api.js';
import { useApp } from '../context.jsx';
import { Icon } from '../icons.jsx';
import { SourcesSection as ProvidersSection, ExtremeSection } from './SourcesSettings.jsx';

function Toggle({ id, label, hint, value, onChange }) {
  return (
    <label className="toggle" htmlFor={id}>
      <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
      <span className="tbox" aria-hidden="true" />
      <span><b>{label}</b>{hint ? <small>{hint}</small> : null}</span>
    </label>
  );
}

function RedditSection({ s, reload }) {
  const { toast } = useApp();
  const [f, setF] = useState({ clientId: s?.reddit?.clientId || '', clientSecret: '', username: s?.reddit?.username || '', password: '' });
  const [diag, setDiag] = useState(null);
  const [busy, setBusy] = useState(null);
  async function run(name, fn) {
    setBusy(name);
    try { await fn(); } catch (e) { toast(e.message); } finally { setBusy(null); }
  }
  const connected = !!s?.reddit?.clientId;
  return (
    <div className="card2">
      <h3>Reddit {connected ? <span className="okpill">connected as u/{s.reddit.username}</span> : <span className="okpill">works through RSS</span>}</h3>
      <p className="wtext">Add subreddits and users as sources above (Reddit card) or from any Reddit post. This works without an account through Reddit’s public RSS feeds, which Reddit limits to about one request per minute, so new sources fill in gradually.</p>
      <RedditFeedKey s={s} reload={reload} />
      <details className="howto"><summary>Full API access (optional)</summary>
      <details className="howto">
        <summary>How to connect your account</summary>
        <ol>
          <li>Since late 2025 Reddit only allows API access after approval under its Responsible Builder Policy. Request it through the developer support form linked on that policy page and wait for a yes.</li>
          <li>Once approved, go to reddit.com/prefs/apps while logged in and choose "create another app".</li>
          <li>Pick <b>script</b>, give it any name, and use http://127.0.0.1 as the redirect URI.</li>
          <li>Copy the short code under the app name (client ID) and the secret into the form below, with your Reddit username and password.</li>
          <li>Press Test. It checks the login, your subscriptions, and whether Reddit returns NSFW posts to your app.</li>
        </ol>
        <p className="wnote">The details are stored only in the local database on this computer and only sent to Reddit to log in.</p>
      </details>
      <form className="formgrid" onSubmit={(e) => { e.preventDefault(); run('save', async () => { await api('/settings/reddit', { method: 'PUT', body: f }); toast('Reddit details saved.'); reload(); }); }}>
        <label htmlFor="rcid">Client ID<input id="rcid" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })} autoComplete="off" /></label>
        <label htmlFor="rsec">Secret<input id="rsec" type="password" value={f.clientSecret} onChange={(e) => setF({ ...f, clientSecret: e.target.value })} placeholder={s?.reddit?.hasSecret ? 'saved, leave empty to keep' : ''} autoComplete="off" /></label>
        <label htmlFor="rusr">Username<input id="rusr" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoComplete="username" /></label>
        <label htmlFor="rpw">Password<input id="rpw" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder={s?.reddit?.hasPassword ? 'saved, leave empty to keep' : ''} autoComplete="current-password" /></label>
        <div className="rowline wrapline">
          <button type="submit" className="ghost-btn small accent" disabled={!!busy}>Save</button>
          <button type="button" className="ghost-btn small" disabled={!connected || !!busy} onClick={() => run('test', async () => setDiag(await api('/reddit/test', { method: 'POST', body: {} })))}>{busy === 'test' ? 'Testing' : 'Test'}</button>
          <button type="button" className="ghost-btn small" disabled={!connected || !!busy} onClick={() => run('sync', async () => { const r = await api('/reddit/sync', { method: 'POST', body: {} }); toast(`${r.subscriptions} subscriptions synced (${r.nsfw} NSFW). Fetching posts now.`); reload(); })}>{busy === 'sync' ? 'Syncing' : 'Sync subscriptions'}</button>
          <button type="button" className="ghost-btn small" disabled={!connected || !!busy} onClick={() => run('import', async () => { const r = await api('/reddit/import', { method: 'POST', body: {} }); toast(`Imported ${r.upvoted} upvoted and ${r.saved} saved posts into your profile.`); })}>{busy === 'import' ? 'Importing' : 'Import upvoted and saved'}</button>
        </div>
      </form>
      {diag ? (
        <div className={`diag ${diag.error ? 'bad' : 'good'}`}>
          <p><b>Login:</b> {diag.login ? `works (u/${diag.account})` : `failed: ${diag.error}`}</p>
          {diag.login ? <p><b>Subscriptions:</b> {diag.subscriptions}, of which {diag.nsfwSubscriptions} NSFW</p> : null}
          {diag.login && diag.accountOver18 === false ? <p><b>Heads up:</b> your account has "I am over eighteen" turned off in Reddit settings, which hides NSFW posts.</p> : null}
          {diag.nsfwPostsVisible === true ? <p><b>NSFW posts:</b> Reddit returns them with media ({diag.sample.withMedia} of {diag.sample.returned} from r/{diag.sample.subreddit}). Everything works.</p> : null}
          {diag.nsfwPostsVisible === false ? <p><b>NSFW posts:</b> Reddit returned {diag.sample.returned} posts from r/{diag.sample.subreddit} but none with media. Since July 2023 Reddit limits mature content for third-party apps, so for NSFW the app leans on RedGIFs and the boards below. Your follows, votes and SFW subreddits still work.</p> : null}
          {diag.login && diag.nsfwPostsVisible === null ? <p><b>NSFW posts:</b> you don't follow any NSFW subreddits yet, so there was nothing to check.</p> : null}
        </div>
      ) : null}
      <Toggle id="syncVotes" label="Send my votes to Reddit" hint="Upvotes here count as upvotes on Reddit" value={s?.general.syncVotes} onChange={(v) => api('/settings/general', { method: 'PUT', body: { syncVotes: v } }).then(reload)} />
      <Toggle id="syncSaves" label="Save to Reddit too" hint="Off keeps your saves private to this app" value={s?.general.syncSaves} onChange={(v) => api('/settings/general', { method: 'PUT', body: { syncSaves: v } }).then(reload)} />
      <Toggle id="syncFollows" label="Join subreddits on Reddit when I follow them here" value={s?.general.syncFollows} onChange={(v) => api('/settings/general', { method: 'PUT', body: { syncFollows: v } }).then(reload)} />
      </details>
    </div>
  );
}

function RedditFeedKey({ s, reload }) {
  const { toast } = useApp();
  const [url, setUrl] = useState('');
  return (
    <form className="rowline wrapline" onSubmit={async (e) => { e.preventDefault(); try { const r = await api('/settings/reddit-feed', { method: 'PUT', body: { url } }); setUrl(''); toast(r.set ? 'Feed key saved. Reddit feeds now load every few seconds instead of once a minute.' : 'Feed key removed.'); reload(); } catch (err) { toast(err.message); } }}>
      <span className="fb-label">Feed key</span>
      <input id="redditFeed" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={s?.redditFeed?.set ? `saved for u/${s.redditFeed.user}, paste a new link to replace` : 'Paste any private feed link from reddit.com/prefs/feeds (optional)'} aria-label="Reddit private feed link" style={{ flex: 2 }} />
      <button type="submit" className="ghost-btn small">{url ? 'Save' : s?.redditFeed?.set ? 'Remove' : 'Save'}</button>
    </form>
  );
}

function BoardSection({ name, label, s, reload }) {
  const { toast } = useApp();
  const [f, setF] = useState({ userId: s?.boorus?.[name]?.userId || '', apiKey: '' });
  const has = !!s?.boorus?.[name]?.hasKey;
  return (
    <form className="formgrid inline" onSubmit={async (e) => { e.preventDefault(); await api(`/settings/booru/${name}`, { method: 'PUT', body: f }); toast(`${label} key saved.`); reload(); }}>
      <b className="flabel">{label} {has ? <span className="okpill">key saved</span> : null}</b>
      <label htmlFor={`${name}-uid`}>User ID<input id={`${name}-uid`} value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })} autoComplete="off" /></label>
      <label htmlFor={`${name}-key`}>API key<input id={`${name}-key`} type="password" value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} placeholder={has ? 'saved, leave empty to keep' : ''} autoComplete="off" /></label>
      <button type="submit" className="ghost-btn small">Save</button>
    </form>
  );
}

const KIND_LABEL = { subreddit: 'Subreddit', reddit_user: 'Reddit user', redgifs_tag: 'RedGIFs tag', redgifs_user: 'RedGIFs creator', redgifs_trending: 'RedGIFs', booru_query: 'Board search' };

function SourcesSection() {
  const { toast } = useApp();
  const [follows, setFollows] = useState([]);
  const [kind, setKind] = useState('redgifs_tag');
  const [value, setValue] = useState('');
  const [board, setBoard] = useState('rule34');
  const load = () => api('/follows').then((r) => setFollows(r.follows)).catch(() => {});
  useEffect(() => { load(); }, []);
  async function add(e) {
    e.preventDefault();
    const v = value.trim();
    if (!v) { toast('Type what to follow first.'); return; }
    await api('/follow', { method: 'POST', body: { kind, value: kind === 'booru_query' ? `${board}|${v}` : v.replace(/^r\//, '').replace(/^u\//, ''), on: true } });
    setValue('');
    toast('Added. Fetching posts in the background.');
    load();
  }
  return (
    <div className="card2">
      <h3>Sources <span className="count">{follows.filter((f) => f.active).length} active</span></h3>
      <form className="rowline wrapline" onSubmit={add}>
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Source type">
          <option value="redgifs_tag">RedGIFs tag</option>
          <option value="redgifs_user">RedGIFs creator</option>
          <option value="subreddit">Subreddit</option>
          <option value="reddit_user">Reddit user</option>
          <option value="booru_query">Board search</option>
        </select>
        {kind === 'booru_query' ? <select value={board} onChange={(e) => setBoard(e.target.value)} aria-label="Board"><option value="rule34">Rule34</option><option value="gelbooru">Gelbooru</option></select> : null}
        <input id="followIn" value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === 'booru_query' ? 'tags separated by spaces, e.g. tag_one tag_two' : kind === 'subreddit' ? 'subreddit name' : 'name'} aria-label="Follow" style={{ flex: 2 }} />
        <button type="submit" className="ghost-btn small accent">Follow</button>
        <button type="button" className="ghost-btn small" onClick={async () => { const r = await api('/ingest', { method: 'POST', body: { force: true } }); toast(r.skipped ? 'Already fetching.' : `${r.added} new posts.`); load(); }}><Icon name="refresh" />Fetch now</button>
      </form>
      <div className="follist">
        {follows.map((f) => (
          <div key={f.id} className={`folrow${f.active ? '' : ' dim'}`}>
            <span className="chip ghost">{KIND_LABEL[f.kind] || f.kind}</span>
            <span className="folname">{f.kind === 'booru_query' ? f.value.replace('|', ': ') : f.label || f.value}</span>
            {f.synced_from === 'reddit' ? <span className="count">from your Reddit</span> : null}
            <span className="count">{f.last_fetch ? `fetched ${Math.round((Date.now() - f.last_fetch) / 60000)} min ago` : 'not fetched yet'}</span>
            <button type="button" className="ghost-btn small" onClick={async () => { await api('/follow', { method: 'POST', body: { kind: f.kind, value: f.value, on: !f.active } }); load(); }}>{f.active ? 'Pause' : 'Resume'}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelSection({ s, reload }) {
  const { toast } = useApp();
  const [m, setM] = useState(null);
  const [custom, setCustom] = useState('');
  const [test, setTest] = useState(null);
  const load = () => api('/models').then(setM).catch((e) => toast(e.message));
  useEffect(() => { load(); }, []);
  async function pick(name) {
    await api('/models/active', { method: 'PUT', body: { name } });
    toast(`Now using ${name}.`);
    load();
  }
  const rec = m?.system?.recommendation;
  return (
    <div className="card2">
      <h3>Local AI model</h3>
      {m ? (
        <>
          <p className="wtext">This computer: {m.system.memoryGb} GB memory, {m.system.cores} cores ({m.system.cpu}). {rec?.note}</p>
          {rec?.tag ? <p className="wnote">Suggested: <code>ollama pull orcarouter/Qwen3.8-27B-Uncensored:{rec.tag}</code></p> : null}
          {m.error ? <p className="diag bad">{m.error}</p> : null}
          <div className="follist">
            {m.models.map((x) => (
              <div key={x.name} className={`folrow${x.name === m.active ? ' current' : ''}`}>
                <span className="folname">{x.name}</span>
                <span className="count">{x.parameterSize} · {x.quantization} · {fmtBytes(x.size)}{x.vision ? ' · sees images' : ''}</span>
                {m.running.some((r) => r.name === x.name) ? <span className="okpill">loaded</span> : null}
                {x.name === m.active ? <span className="okpill">active</span> : <button type="button" className="ghost-btn small" onClick={() => pick(x.name)}>Use this</button>}
              </div>
            ))}
            {!m.models.length && !m.error ? <p className="wnote">No models installed yet. Run the pull command above in a terminal.</p> : null}
          </div>
          <form className="rowline wrapline" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) pick(custom.trim()); }}>
            <input id="modelIn" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={`Or type a model name (active: ${m.active})`} aria-label="Model name" style={{ flex: 2 }} />
            <button type="submit" className="ghost-btn small">Set</button>
            <button type="button" className="ghost-btn small" onClick={async () => { setTest('Asking the model…'); try { const r = await api('/models/test', { method: 'POST', body: {} }); setTest(`${r.reply} (${(r.ms / 1000).toFixed(1)} s)`); } catch (e) { setTest(e.message); } }}>Test</button>
          </form>
          {test ? <p className="answer">{test}</p> : null}
        </>
      ) : <p className="wnote">Checking Ollama…</p>}
      <Toggle id="taggerOn" label="Tag new posts in the background" hint="Every post first gets instant tags from its title and the site's own tags. The model then adds 14 to 22 specific tags per post, several posts per request" value={s?.general.taggerOn} onChange={(v) => api('/settings/general', { method: 'PUT', body: { taggerOn: v } }).then(reload)} />
      <Toggle id="taggerVision" label="Look at the picture for posts you really liked" hint="Only for posts you watched a minute or more, rated, saved or explained. Needs a model that sees images" value={s?.general.taggerVision} onChange={(v) => api('/settings/general', { method: 'PUT', body: { taggerVision: v } }).then(reload)} />
    </div>
  );
}

function TaggerSection({ s, reload }) {
  const { toast } = useApp();
  const [m, setM] = useState(null);
  const [st, setSt] = useState(null);
  const [pulls, setPulls] = useState([]);
  const load = () => api('/models').then(setM).catch(() => {});
  useEffect(() => {
    load();
    let alive = true;
    const tick = async () => {
      try {
        const [a, b] = await Promise.all([api('/status'), api('/models/pull')]);
        if (!alive) return;
        setSt(a.tagger);
        setPulls(b.pulls);
        if (b.pulls.some((x) => x.status === 'done' && !m?.models?.some((y) => y.name === x.name))) load();
      } catch {}
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  async function setAi(patch) {
    await api('/settings/ai', { method: 'PUT', body: patch });
    reload();
    load();
  }
  async function install(name) {
    await api('/models/pull', { method: 'POST', body: { name } });
    toast(`Downloading ${name} through Ollama. You can keep browsing.`);
  }
  const fast = m?.fast;
  const installed = new Set((m?.models || []).map((x) => x.name));
  return (
    <div className="card2">
      <h3>Tagging model {st ? <span className="count">{st.tagged} tagged · {st.pending} waiting{st.perMin ? ` · ${st.perMin} per minute` : ''}{st.etaMin ? ` · about ${st.etaMin < 90 ? `${st.etaMin} min` : `${Math.round(st.etaMin / 60)} h`} left` : ''}</span> : null}</h3>
      <p className="wtext">Tagging runs thousands of times, so it works best on a small, fast model. The big model stays for the assistant, summaries and naming your kinks. On this Mac the 27B writes about 8 words a second; a 4B model is roughly 8 times faster and keeps the fans quiet.</p>
      {m ? (
        <div className="follist">
          {(m.models || []).map((x) => (
            <div key={x.name} className={`folrow${x.name === fast ? ' current' : ''}`}>
              <span className="folname">{x.name}</span>
              <span className="count">{x.parameterSize}{x.vision ? ' · sees images' : ''}</span>
              {x.name === fast ? <span className="okpill">tags posts</span> : <button type="button" className="ghost-btn small" onClick={() => setAi({ fastModel: x.name })}>Use for tagging</button>}
              {x.vision ? (x.name === (s?.ai?.deepModel || fast) ? <span className="okpill">looks at frames</span> : <button type="button" className="ghost-btn small" onClick={() => setAi({ deepModel: x.name })}>Use for close looks</button>) : null}
            </div>
          ))}
          {(m.suggested || []).filter((x) => !installed.has(x.name)).map((x) => {
            const p = pulls.find((y) => y.name === x.name);
            const pct = p?.total ? Math.round((p.completed / p.total) * 100) : 0;
            return (
              <div key={x.name} className="folrow">
                <span className="folname">{x.name}</span>
                <span className="count">{x.size} · {x.note}</span>
                {p?.status === 'pulling' ? <span className="okpill">{pct ? `${pct}%` : 'starting'}</span> : p?.status === 'error' ? <span className="count down">{p.error}</span> : <button type="button" className="ghost-btn small accent" onClick={() => install(x.name)}>Install</button>}
              </div>
            );
          })}
        </div>
      ) : <p className="wnote">Checking Ollama…</p>}
      <div className="fb-line"><span className="fb-label">Pace</span>
        <div className="seg">{[['eco', 'Quiet'], ['normal', 'Normal'], ['fast', 'Fast']].map(([k, label]) => <button key={k} type="button" className={(s?.ai?.taggerPace || 'normal') === k ? 'on' : ''} onClick={() => setAi({ taggerPace: k })}>{label}</button>)}</div>
        <span className="lenhint">Quiet pauses between batches so the fans stay down</span>
      </div>
      {st?.lastError ? <p className="diag bad">Last tagging error: {st.lastError}</p> : null}
      {st ? <p className="wnote">Close looks at video frames: {st.deepDone || 0} done, {st.deepQueue || 0} waiting (posts you scrolled past get a quick look, posts you liked get a careful one).</p> : null}
      {st?.lastBatch ? <p className="wnote">Last batch: {st.lastBatch.ok} of {st.lastBatch.n} posts in {(st.lastBatch.ms / 1000).toFixed(1)} s with {st.model}. {st.deepQueue ? `${st.deepQueue} liked posts waiting for a closer look.` : ''}</p> : null}
    </div>
  );
}

function LimitsSection() {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [t, setT] = useState('');
  const load = () => api('/limits').then(setD).catch(() => {});
  useEffect(() => { load(); }, []);
  return (
    <div className="card2">
      <h3>Hard limits</h3>
      <p className="wnote">Posts with these tags are never shown or suggested. On top of your own list, a built-in safety filter ({d?.safetyTerms || 0} terms) always removes anything suggesting a person under 18. It can't be turned off.</p>
      <div className="limits">{d?.limits.map((l) => <span className="limit" key={l}>{l}<button type="button" aria-label={`Remove ${l}`} onClick={async () => { await api(`/limits/${encodeURIComponent(l)}`, { method: 'DELETE' }); load(); }}><Icon name="close" /></button></span>)}</div>
      <form className="rowline" onSubmit={async (e) => { e.preventDefault(); if (!t.trim()) return; const r = await api('/limits', { method: 'POST', body: { tag: t } }); toast(`Blocked. ${r.hidden} posts hidden.`); setT(''); load(); }}>
        <input id="limitAdd" value={t} onChange={(e) => setT(e.target.value)} placeholder="Tag to block" aria-label="Tag to block" />
        <button type="submit" className="ghost-btn small">Block</button>
      </form>
    </div>
  );
}

function DataSection() {
  const { toast } = useApp();
  const [confirm, setConfirm] = useState('');
  return (
    <div className="card2">
      <h3>Your data</h3>
      <p className="wnote">Everything lives in one file on this computer (data/undercurrent.db). Export gives you a readable copy of your memory, kinks, fantasies, sources and profile.</p>
      <div className="rowline wrapline">
        <a className="ghost-btn small" href="/api/export" download>Export profile</a>
        <input id="resetConfirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder='type "reset" to wipe your taste profile' aria-label="Confirm reset" />
        <button type="button" className="ghost-btn small" disabled={confirm !== 'reset'} onClick={async () => { await api('/reset-profile', { method: 'POST', body: { confirm } }); setConfirm(''); toast('Taste profile wiped. Memory, kinks and fantasies were kept.'); }}>Wipe taste profile</button>
      </div>
    </div>
  );
}

// Web search for looking people up (their usernames on other platforms). Uses Ollama's web search API with your
// own free key from ollama.com/settings/keys. Only the name you look up is sent, never your profile.
function WebSearchSection() {
  const { toast } = useApp();
  const [st, setSt] = useState(null);
  const [key, setKey] = useState('');
  const load = () => api('/settings/websearch').then(setSt).catch(() => {});
  useEffect(() => { load(); }, []);
  async function save(e) {
    e.preventDefault();
    try {
      const r = await api('/settings/websearch', { method: 'PUT', body: { key } });
      setKey('');
      toast(!key ? 'Web search key removed.' : r.ok ? 'Web search works. Looking someone up now also searches the web for their profiles.' : `Key saved, but the test search failed: ${r.error}`);
      load();
    } catch (err) { toast(err.message); }
  }
  return (
    <div className="card2">
      <h3>Web search {st?.set ? <span className="okpill">on</span> : <span className="count">off</span>}</h3>
      <p className="wtext">The local models have no internet of their own. With a free Ollama API key, looking up a performer or creator also searches the web for the usernames they use on Reddit, RedGIFs, Bluesky and elsewhere. Only the name you look up is sent to ollama.com.</p>
      <form className="rowline wrapline" onSubmit={save}>
        <span className="fb-label">API key</span>
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={st?.set ? (st.fromEnv ? 'set in .env (OLLAMA_API_KEY)' : 'saved, paste a new key to replace') : 'Paste a key from ollama.com/settings/keys'} aria-label="Ollama API key" style={{ flex: 2 }} autoComplete="off" />
        <button type="submit" className="ghost-btn small">{key ? 'Save and test' : st?.set && !st.fromEnv ? 'Remove' : 'Save'}</button>
      </form>
    </div>
  );
}

// A Lustpress scraper server that runs somewhere else (never on this computer). With its address, Pornhub, XNXX,
// RedTube, XVideos, xHamster, YouPorn, Eporner and TXXX are searched through it, next to the official APIs.
function ScraperSection() {
  const { toast } = useApp();
  const [st, setSt] = useState(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api('/settings/lustpress').then(setSt).catch(() => {});
  useEffect(() => { load(); }, []);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('/settings/lustpress', { method: 'PUT', body: { url } });
      setUrl('');
      toast(r.url ? `Scraper server works (${r.results} test results). Its sites are on and fetching now.` : 'Scraper server removed. Its sites are off again.');
      load();
    } catch (err) { toast(err.message); } finally { setBusy(false); }
  }
  return (
    <div className="card2">
      <h3>Scraper server {st?.url ? <span className="okpill">on</span> : <span className="count">off</span>}</h3>
      <p className="wtext">XVideos, XNXX, xHamster, YouPorn and TXXX have no official API. A Lustpress server reads their search results, and adds more results for Pornhub, RedTube and Eporner next to their own APIs. The public Lustpress server was shut down, so run your own copy somewhere other than this computer (a small cloud host works) and paste its address. Undercurrent never starts one here.</p>
      {st?.url ? <p className="wtext">Using <b>{st.url}</b></p> : null}
      <form className="rowline wrapline" onSubmit={save}>
        <span className="fb-label">Address</span>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={st?.url ? 'paste a new address to replace' : 'https://your-lustpress-server.example'} aria-label="Scraper server address" style={{ flex: 2 }} autoComplete="off" />
        <button type="submit" className="ghost-btn small" disabled={busy}>{busy ? 'Testing' : url ? 'Save and test' : st?.url ? 'Remove' : 'Save'}</button>
      </form>
    </div>
  );
}

export default function SettingsView() {
  const { settings, setSettings } = useApp();
  const reload = () => api('/settings').then(setSettings).catch(() => {});
  useEffect(() => { reload(); }, []);
  if (!settings) return <div className="empty">Loading settings…</div>;
  return (
    <section className="center" style={{ paddingTop: 0 }}>
      <div className="jhead"><div><h2>Settings</h2><p>Sources, filters, the local model and accounts.</p></div></div>
      <VersionCard />
      <ProvidersSection />
      <ScraperSection />
      <ExtremeSection />
      <LimitsSection />
      <TaggerSection s={settings} reload={reload} />
      <ModelSection s={settings} reload={reload} />
      <WebSearchSection />
      <RedditSection s={settings} reload={reload} />
      <DataSection />
    </section>
  );
}
