import { VersionCard } from './Updates.jsx';
import { ModelsCard } from './ModelChooser.jsx';
import { ProfilesCard } from './Profiles.jsx';
import { LanguageCard } from './Language.jsx';
import { Fragment, useEffect, useState } from 'react';
import { api, fmtBytes } from '../api.js';
import { useApp } from '../context.jsx';
import { Icon } from '../icons.jsx';
import { SourcesSection as ProvidersSection, ExtremeSection } from './SourcesSettings.jsx';
import { t, tn, locale } from '../i18n.js';

const dec = (x) => Number(x).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const rich = (s, key, node) => s.split(`{${key}}`).map((x, i) => (i ? <Fragment key={i}>{node}{x}</Fragment> : x));

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
      <h3>Reddit {connected ? <span className="okpill">{t('connected as u/{user}', { user: s.reddit.username })}</span> : <span className="okpill">{t('works through RSS')}</span>}</h3>
      <p className="wtext">{t('Add subreddits and users as sources above (Reddit card) or from any Reddit post. This works without an account through Reddit’s public RSS feeds, which Reddit limits to about one request per minute, so new sources fill in gradually.')}</p>
      <RedditFeedKey s={s} reload={reload} />
      <details className="howto"><summary>{t('Full API access (optional)')}</summary>
      <details className="howto">
        <summary>{t('How to connect your account')}</summary>
        <ol>
          <li>{t('Since late 2025 Reddit only allows API access after approval under its Responsible Builder Policy. Request it through the developer support form linked on that policy page and wait for a yes.')}</li>
          <li>{t('Once approved, go to reddit.com/prefs/apps while logged in and choose "create another app".')}</li>
          <li>{rich(t('Pick {script}, give it any name, and use http://127.0.0.1 as the redirect URI.'), 'script', <b>script</b>)}</li>
          <li>{t('Copy the short code under the app name (client ID) and the secret into the form below, with your Reddit username and password.')}</li>
          <li>{t('Press Test. It checks the login, your subscriptions, and whether Reddit returns NSFW posts to your app.')}</li>
        </ol>
        <p className="wnote">{t('The details are stored only in the local database on this computer and only sent to Reddit to log in.')}</p>
      </details>
      <form className="formgrid" onSubmit={(e) => { e.preventDefault(); run('save', async () => { await api('/settings/reddit', { method: 'PUT', body: f }); toast(t('Reddit details saved.')); reload(); }); }}>
        <label htmlFor="rcid">{t('Client ID')}<input id="rcid" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })} autoComplete="off" /></label>
        <label htmlFor="rsec">{t('Secret')}<input id="rsec" type="password" value={f.clientSecret} onChange={(e) => setF({ ...f, clientSecret: e.target.value })} placeholder={s?.reddit?.hasSecret ? t('saved, leave empty to keep') : ''} autoComplete="off" /></label>
        <label htmlFor="rusr">{t('Username')}<input id="rusr" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoComplete="username" /></label>
        <label htmlFor="rpw">{t('Password')}<input id="rpw" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder={s?.reddit?.hasPassword ? t('saved, leave empty to keep') : ''} autoComplete="current-password" /></label>
        <div className="rowline wrapline">
          <button type="submit" className="ghost-btn small accent" disabled={!!busy}>{t('Save')}</button>
          <button type="button" className="ghost-btn small" disabled={!connected || !!busy} onClick={() => run('test', async () => setDiag(await api('/reddit/test', { method: 'POST', body: {} })))}>{busy === 'test' ? t('Testing') : t('Test')}</button>
          <button type="button" className="ghost-btn small" disabled={!connected || !!busy} onClick={() => run('sync', async () => { const r = await api('/reddit/sync', { method: 'POST', body: {} }); toast(tn(r.subscriptions, '{n} subscription synced ({nsfw} NSFW). Fetching posts now.', '{n} subscriptions synced ({nsfw} NSFW). Fetching posts now.', { nsfw: r.nsfw })); reload(); })}>{busy === 'sync' ? t('Syncing') : t('Sync subscriptions')}</button>
          <button type="button" className="ghost-btn small" disabled={!connected || !!busy} onClick={() => run('import', async () => { const r = await api('/reddit/import', { method: 'POST', body: {} }); toast(t('Imported {upvoted} upvoted and {saved} saved posts into your profile.', { upvoted: r.upvoted, saved: r.saved })); })}>{busy === 'import' ? t('Importing') : t('Import upvoted and saved')}</button>
        </div>
      </form>
      {diag ? (
        <div className={`diag ${diag.error ? 'bad' : 'good'}`}>
          <p><b>{t('Login:')}</b> {diag.login ? t('works (u/{account})', { account: diag.account }) : t('failed: {error}', { error: diag.error })}</p>
          {diag.login ? <p><b>{t('Subscriptions:')}</b> {t('{n}, of which {nsfw} NSFW', { n: diag.subscriptions, nsfw: diag.nsfwSubscriptions })}</p> : null}
          {diag.login && diag.accountOver18 === false ? <p><b>{t('Heads up:')}</b> {t('your account has "I am over eighteen" turned off in Reddit settings, which hides NSFW posts.')}</p> : null}
          {diag.nsfwPostsVisible === true ? <p><b>{t('NSFW posts:')}</b> {t('Reddit returns them with media ({withMedia} of {returned} from r/{subreddit}). Everything works.', { withMedia: diag.sample.withMedia, returned: diag.sample.returned, subreddit: diag.sample.subreddit })}</p> : null}
          {diag.nsfwPostsVisible === false ? <p><b>{t('NSFW posts:')}</b> {t('Reddit returned {returned} posts from r/{subreddit} but none with media. Since July 2023 Reddit limits mature content for third-party apps, so for NSFW the app leans on RedGIFs and the boards below. Your follows, votes and SFW subreddits still work.', { returned: diag.sample.returned, subreddit: diag.sample.subreddit })}</p> : null}
          {diag.login && diag.nsfwPostsVisible === null ? <p><b>{t('NSFW posts:')}</b> {t("you don't follow any NSFW subreddits yet, so there was nothing to check.")}</p> : null}
        </div>
      ) : null}
      <Toggle id="syncVotes" label={t('Send my votes to Reddit')} hint={t('Upvotes here count as upvotes on Reddit')} value={s?.general.syncVotes} onChange={(v) => api('/settings/general', { method: 'PUT', body: { syncVotes: v } }).then(reload)} />
      <Toggle id="syncSaves" label={t('Save to Reddit too')} hint={t('Off keeps your saves private to this app')} value={s?.general.syncSaves} onChange={(v) => api('/settings/general', { method: 'PUT', body: { syncSaves: v } }).then(reload)} />
      <Toggle id="syncFollows" label={t('Join subreddits on Reddit when I follow them here')} value={s?.general.syncFollows} onChange={(v) => api('/settings/general', { method: 'PUT', body: { syncFollows: v } }).then(reload)} />
      </details>
    </div>
  );
}

function RedditFeedKey({ s, reload }) {
  const { toast } = useApp();
  const [url, setUrl] = useState('');
  return (
    <form className="rowline wrapline" onSubmit={async (e) => { e.preventDefault(); try { const r = await api('/settings/reddit-feed', { method: 'PUT', body: { url } }); setUrl(''); toast(r.set ? t('Feed key saved. Reddit feeds now load every few seconds instead of once a minute.') : t('Feed key removed.')); reload(); } catch (err) { toast(err.message); } }}>
      <span className="fb-label">{t('Feed key')}</span>
      <input id="redditFeed" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={s?.redditFeed?.set ? t('saved for u/{user}, paste a new link to replace', { user: s.redditFeed.user }) : t('Paste any private feed link from reddit.com/prefs/feeds (optional)')} aria-label={t('Reddit private feed link')} style={{ flex: 2 }} />
      <button type="submit" className="ghost-btn small">{url ? t('Save') : s?.redditFeed?.set ? t('Remove') : t('Save')}</button>
    </form>
  );
}

function BoardSection({ name, label, s, reload }) {
  const { toast } = useApp();
  const [f, setF] = useState({ userId: s?.boorus?.[name]?.userId || '', apiKey: '' });
  const has = !!s?.boorus?.[name]?.hasKey;
  return (
    <form className="formgrid inline" onSubmit={async (e) => { e.preventDefault(); await api(`/settings/booru/${name}`, { method: 'PUT', body: f }); toast(t('{label} key saved.', { label })); reload(); }}>
      <b className="flabel">{label} {has ? <span className="okpill">{t('key saved')}</span> : null}</b>
      <label htmlFor={`${name}-uid`}>{t('User ID')}<input id={`${name}-uid`} value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })} autoComplete="off" /></label>
      <label htmlFor={`${name}-key`}>{t('API key')}<input id={`${name}-key`} type="password" value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} placeholder={has ? t('saved, leave empty to keep') : ''} autoComplete="off" /></label>
      <button type="submit" className="ghost-btn small">{t('Save')}</button>
    </form>
  );
}

const KIND_LABEL = { subreddit: t('Subreddit'), reddit_user: t('Reddit user'), redgifs_tag: t('RedGIFs tag'), redgifs_user: t('RedGIFs creator'), redgifs_trending: 'RedGIFs', booru_query: t('Board search') };

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
    if (!v) { toast(t('Type what to follow first.')); return; }
    await api('/follow', { method: 'POST', body: { kind, value: kind === 'booru_query' ? `${board}|${v}` : v.replace(/^r\//, '').replace(/^u\//, ''), on: true } });
    setValue('');
    toast(t('Added. Fetching posts in the background.'));
    load();
  }
  const activeCount = follows.filter((f) => f.active).length;
  return (
    <div className="card2">
      <h3>{t('Sources')} <span className="count">{tn(activeCount, '{n} active', '{n} active')}</span></h3>
      <form className="rowline wrapline" onSubmit={add}>
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t('Source type')}>
          <option value="redgifs_tag">{t('RedGIFs tag')}</option>
          <option value="redgifs_user">{t('RedGIFs creator')}</option>
          <option value="subreddit">{t('Subreddit')}</option>
          <option value="reddit_user">{t('Reddit user')}</option>
          <option value="booru_query">{t('Board search')}</option>
        </select>
        {kind === 'booru_query' ? <select value={board} onChange={(e) => setBoard(e.target.value)} aria-label={t('Board')}><option value="rule34">Rule34</option><option value="gelbooru">Gelbooru</option></select> : null}
        <input id="followIn" value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === 'booru_query' ? t('tags separated by spaces, e.g. tag_one tag_two') : kind === 'subreddit' ? t('subreddit name') : t('name')} aria-label={t('Follow')} style={{ flex: 2 }} />
        <button type="submit" className="ghost-btn small accent">{t('Follow')}</button>
        <button type="button" className="ghost-btn small" onClick={async () => { const r = await api('/ingest', { method: 'POST', body: { force: true } }); toast(r.skipped ? t('Already fetching.') : tn(r.added, '{n} new post.', '{n} new posts.')); load(); }}><Icon name="refresh" />{t('Fetch now')}</button>
      </form>
      <div className="follist">
        {follows.map((f) => (
          <div key={f.id} className={`folrow${f.active ? '' : ' dim'}`}>
            <span className="chip ghost">{KIND_LABEL[f.kind] || f.kind}</span>
            <span className="folname">{f.kind === 'booru_query' ? f.value.replace('|', ': ') : f.label || f.value}</span>
            {f.synced_from === 'reddit' ? <span className="count">{t('from your Reddit')}</span> : null}
            <span className="count">{f.last_fetch ? t('fetched {m} min ago', { m: Math.round((Date.now() - f.last_fetch) / 60000) }) : t('not fetched yet')}</span>
            <button type="button" className="ghost-btn small" onClick={async () => { await api('/follow', { method: 'POST', body: { kind: f.kind, value: f.value, on: !f.active } }); load(); }}>{f.active ? t('Pause') : t('Resume')}</button>
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
    toast(t('Now using {name}.', { name }));
    load();
  }
  return (
    <div className="card2">
      <h3>{t('Installed models')}</h3>
      {m ? (
        <>
          <p className="wtext">{t('Every model Ollama has on this Mac. "Use this" makes it the assistant model.')}</p>
          {m.error ? <p className="diag bad">{m.error}</p> : null}
          <div className="follist">
            {m.models.map((x) => (
              <div key={x.name} className={`folrow${x.name === m.active ? ' current' : ''}`}>
                <span className="folname">{x.name}</span>
                <span className="count">{x.parameterSize} · {x.quantization} · {fmtBytes(x.size)}{x.vision ? ` · ${t('sees images')}` : ''}</span>
                {m.running.some((r) => r.name === x.name) ? <span className="okpill">{t('loaded')}</span> : null}
                {x.name === m.active ? <span className="okpill">{t('active')}</span> : <button type="button" className="ghost-btn small" onClick={() => pick(x.name)}>{t('Use this')}</button>}
              </div>
            ))}
            {!m.models.length && !m.error ? <p className="wnote">{t('No models installed yet. Choose them above and press Download.')}</p> : null}
          </div>
          <form className="rowline wrapline" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) pick(custom.trim()); }}>
            <input id="modelIn" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={t('Or type a model name (active: {name})', { name: m.active })} aria-label={t('Model name')} style={{ flex: 2 }} />
            <button type="submit" className="ghost-btn small">{t('Set')}</button>
            <button type="button" className="ghost-btn small" onClick={async () => { setTest(t('Asking the model…')); try { const r = await api('/models/test', { method: 'POST', body: {} }); setTest(`${r.reply} (${dec(r.ms / 1000)} s)`); } catch (e) { setTest(e.message); } }}>{t('Test')}</button>
          </form>
          {test ? <p className="answer">{test}</p> : null}
        </>
      ) : <p className="wnote">{t('Checking Ollama…')}</p>}
      <Toggle id="taggerOn" label={t('Tag new posts in the background')} hint={t("Every post first gets instant tags from its title and the site's own tags. The model then adds 14 to 22 specific tags per post, several posts per request")} value={s?.general.taggerOn} onChange={(v) => api('/settings/general', { method: 'PUT', body: { taggerOn: v } }).then(reload)} />
      <Toggle id="taggerVision" label={t('Look at the picture for posts you really liked')} hint={t('Only for posts you watched a minute or more, rated, saved or explained. Needs a model that sees images')} value={s?.general.taggerVision} onChange={(v) => api('/settings/general', { method: 'PUT', body: { taggerVision: v } }).then(reload)} />
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
    const timer = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  async function setAi(patch) {
    await api('/settings/ai', { method: 'PUT', body: patch });
    reload();
    load();
  }
  async function install(name) {
    await api('/models/pull', { method: 'POST', body: { name } });
    toast(t('Downloading {name} through Ollama. You can keep browsing.', { name }));
  }
  const fast = m?.fast;
  const installed = new Set((m?.models || []).map((x) => x.name));
  return (
    <div className="card2">
      <h3>{t('Tagging model')} {st ? <span className="count">{t('{tagged} tagged · {pending} waiting', { tagged: st.tagged, pending: st.pending })}{st.perMin ? ` · ${t('{n} per minute', { n: st.perMin })}` : ''}{st.etaMin ? ` · ${t('about {time} left', { time: st.etaMin < 90 ? `${st.etaMin} min` : `${Math.round(st.etaMin / 60)} h` })}` : ''}</span> : null}</h3>
      <p className="wtext">{t('Tagging runs thousands of times, so it works best on a small, fast model. The big model stays for the assistant, summaries and naming your kinks. On this Mac the 27B writes about 8 words a second; a 4B model is roughly 8 times faster and keeps the fans quiet.')}</p>
      {m ? (
        <div className="follist">
          {(m.models || []).map((x) => (
            <div key={x.name} className={`folrow${x.name === fast ? ' current' : ''}`}>
              <span className="folname">{x.name}</span>
              <span className="count">{x.parameterSize}{x.vision ? ` · ${t('sees images')}` : ''}</span>
              {x.name === fast ? <span className="okpill">{t('tags posts')}</span> : <button type="button" className="ghost-btn small" onClick={() => setAi({ fastModel: x.name })}>{t('Use for tagging')}</button>}
              {x.vision ? (x.name === (s?.ai?.deepModel || fast) ? <span className="okpill">{t('looks at frames')}</span> : <button type="button" className="ghost-btn small" onClick={() => setAi({ deepModel: x.name })}>{t('Use for close looks')}</button>) : null}
            </div>
          ))}
          {(m.suggested || []).filter((x) => !installed.has(x.name)).map((x) => {
            const p = pulls.find((y) => y.name === x.name);
            const pct = p?.total ? Math.round((p.completed / p.total) * 100) : 0;
            return (
              <div key={x.name} className="folrow">
                <span className="folname">{x.name}</span>
                <span className="count">{x.size} · {x.note}</span>
                {p?.status === 'pulling' ? <span className="okpill">{pct ? `${pct}%` : t('starting')}</span> : p?.status === 'error' ? <span className="count down">{p.error}</span> : <button type="button" className="ghost-btn small accent" onClick={() => install(x.name)}>{t('Install')}</button>}
              </div>
            );
          })}
        </div>
      ) : <p className="wnote">{t('Checking Ollama…')}</p>}
      <div className="fb-line"><span className="fb-label">{t('Pace')}</span>
        <div className="seg">{[['eco', t('Quiet')], ['normal', t('Normal')], ['fast', t('Fast')]].map(([k, label]) => <button key={k} type="button" className={(s?.ai?.taggerPace || 'normal') === k ? 'on' : ''} onClick={() => setAi({ taggerPace: k })}>{label}</button>)}</div>
        <span className="lenhint">{t('Quiet pauses between batches so the fans stay down')}</span>
      </div>
      {st?.lastError ? <p className="diag bad">{t('Last tagging error: {error}', { error: st.lastError })}</p> : null}
      {st ? <p className="wnote">{t('Close looks at video frames: {done} done, {waiting} waiting (posts you scrolled past get a quick look, posts you liked get a careful one).', { done: st.deepDone || 0, waiting: st.deepQueue || 0 })}</p> : null}
      {st?.lastBatch ? <p className="wnote">{t('Last batch: {ok} of {n} posts in {sec} s with {model}.', { ok: st.lastBatch.ok, n: st.lastBatch.n, sec: dec(st.lastBatch.ms / 1000), model: st.model })} {st.deepQueue ? tn(st.deepQueue, '{n} liked post waiting for a closer look.', '{n} liked posts waiting for a closer look.') : ''}</p> : null}
    </div>
  );
}

function LimitsSection() {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [tag, setTag] = useState('');
  const load = () => api('/limits').then(setD).catch(() => {});
  useEffect(() => { load(); }, []);
  return (
    <div className="card2">
      <h3>{t('Hard limits')}</h3>
      <p className="wnote">{t("Posts with these tags are never shown or suggested. On top of your own list, a built-in safety filter ({n} terms) always removes anything suggesting a person under 18. It can't be turned off.", { n: d?.safetyTerms || 0 })}</p>
      <div className="limits">{d?.limits.map((l) => <span className="limit" key={l}>{l}<button type="button" aria-label={t('Remove {tag}', { tag: l })} onClick={async () => { await api(`/limits/${encodeURIComponent(l)}`, { method: 'DELETE' }); load(); }}><Icon name="close" /></button></span>)}</div>
      <form className="rowline" onSubmit={async (e) => { e.preventDefault(); if (!tag.trim()) return; const r = await api('/limits', { method: 'POST', body: { tag } }); toast(tn(r.hidden, 'Blocked. {n} post hidden.', 'Blocked. {n} posts hidden.')); setTag(''); load(); }}>
        <input id="limitAdd" value={tag} onChange={(e) => setTag(e.target.value)} placeholder={t('Tag to block')} aria-label={t('Tag to block')} />
        <button type="submit" className="ghost-btn small">{t('Block')}</button>
      </form>
    </div>
  );
}

function DataSection() {
  const { toast } = useApp();
  const [confirm, setConfirm] = useState('');
  return (
    <div className="card2">
      <h3>{t('Your data')}</h3>
      <p className="wnote">{t('Everything lives in one file on this computer (data/undercurrent.db). Export gives you a readable copy of your memory, kinks, fantasies, sources and profile.')}</p>
      <div className="rowline wrapline">
        <a className="ghost-btn small" href="/api/export" download>{t('Export profile')}</a>
        <input id="resetConfirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t('type "reset" to wipe your taste profile')} aria-label={t('Confirm reset')} />
        <button type="button" className="ghost-btn small" disabled={confirm !== 'reset'} onClick={async () => { await api('/reset-profile', { method: 'POST', body: { confirm } }); setConfirm(''); toast(t('Taste profile wiped. Memory, kinks and fantasies were kept.')); }}>{t('Wipe taste profile')}</button>
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
      toast(!key ? t('Web search key removed.') : r.ok ? t('Web search works. Looking someone up now also searches the web for their profiles.') : t('Key saved, but the test search failed: {error}', { error: r.error }));
      load();
    } catch (err) { toast(err.message); }
  }
  return (
    <div className="card2">
      <h3>{t('Web search')} {st?.set ? <span className="okpill">{t('on')}</span> : <span className="count">{t('off')}</span>}</h3>
      <p className="wtext">{t('The local models have no internet of their own. With a free Ollama API key, looking up a performer or creator also searches the web for the usernames they use on Reddit, RedGIFs, Bluesky and elsewhere. Only the name you look up is sent to ollama.com.')}</p>
      <form className="rowline wrapline" onSubmit={save}>
        <span className="fb-label">{t('API key')}</span>
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={st?.set ? (st.fromEnv ? t('set in .env (OLLAMA_API_KEY)') : t('saved, paste a new key to replace')) : t('Paste a key from ollama.com/settings/keys')} aria-label={t('Ollama API key')} style={{ flex: 2 }} autoComplete="off" />
        <button type="submit" className="ghost-btn small">{key ? t('Save and test') : st?.set && !st.fromEnv ? t('Remove') : t('Save')}</button>
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
      toast(r.url ? t('Scraper server works ({n} test results). Its sites are on and fetching now.', { n: r.results }) : t('Scraper server removed. Its sites are off again.'));
      load();
    } catch (err) { toast(err.message); } finally { setBusy(false); }
  }
  return (
    <div className="card2">
      <h3>{t('Scraper server')} {st?.url ? <span className="okpill">{t('on')}</span> : <span className="count">{t('off')}</span>}</h3>
      <p className="wtext">{t('XVideos, XNXX, xHamster, YouPorn and TXXX have no official API. A Lustpress server reads their search results, and adds more results for Pornhub, RedTube and Eporner next to their own APIs. The public Lustpress server was shut down, so run your own copy somewhere other than this computer (a small cloud host works) and paste its address. Undercurrent never starts one here.')}</p>
      {st?.url ? <p className="wtext">{rich(t('Using {url}'), 'url', <b>{st.url}</b>)}</p> : null}
      <form className="rowline wrapline" onSubmit={save}>
        <span className="fb-label">{t('Address')}</span>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={st?.url ? t('paste a new address to replace') : 'https://your-lustpress-server.example'} aria-label={t('Scraper server address')} style={{ flex: 2 }} autoComplete="off" />
        <button type="submit" className="ghost-btn small" disabled={busy}>{busy ? t('Testing') : url ? t('Save and test') : st?.url ? t('Remove') : t('Save')}</button>
      </form>
    </div>
  );
}

export default function SettingsView() {
  const { settings, setSettings } = useApp();
  const reload = () => api('/settings').then(setSettings).catch(() => {});
  useEffect(() => { reload(); }, []);
  if (!settings) return <div className="empty">{t('Loading settings…')}</div>;
  return (
    <section className="center" style={{ paddingTop: 0 }}>
      <div className="jhead"><div><h2>{t('Settings')}</h2><p>{t('Sources, filters, the local model and accounts.')}</p></div></div>
      <LanguageCard />
      <ProfilesCard />
      <VersionCard />
      <ProvidersSection />
      <ScraperSection />
      <ExtremeSection />
      <LimitsSection />
      <TaggerSection s={settings} reload={reload} />
      <ModelsCard />
      <ModelSection s={settings} reload={reload} />
      <WebSearchSection />
      <RedditSection s={settings} reload={reload} />
      <DataSection />
    </section>
  );
}
