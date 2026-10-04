import { useEffect, useRef, useState } from 'react';
import { api, fmtNum, imgSrc, track } from '../api.js';
import { useApp } from '../context.jsx';
import { FLAME_PATH, Icon } from '../icons.jsx';

export const RATE_TEXT = ['Not rated', 'Not for me', 'Okay', 'Good', 'Great', 'Perfect'];

export function Avatar({ name, size = 'm' }) {
  const n = String(name || '?').replace(/^u\//, '');
  let h = 0;
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const colors = ['#E3A58F', '#B5A2E8', '#86C7B8', '#E0C07A', '#93B4DF', '#D6A0CF', '#E8B4A6', '#A9C98D'];
  const parts = n.split(/[_\-\s.]+/).filter(Boolean);
  const ini = ((parts[0]?.[0] || '?') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase();
  return <span className={`avatar av-${size}`} style={{ background: colors[h % colors.length] }}>{ini}</span>;
}

export function Flames({ value, onChange, id }) {
  const [pop, setPop] = useState(-1);
  const prev = useRef(value);
  function change(v) {
    if (v > prev.current) setPop(v - 1);
    prev.current = v;
    onChange(v);
  }
  return (
    <div className="flames">
      <div className="flamerow" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((k) => (
          <svg key={`${k}-${pop === k - 1 ? value : 0}`} viewBox="0 0 24 24" fill="currentColor" className={`${k <= value ? `lit${value >= 4 ? ' hot' : ''}` : ''}${pop === k - 1 ? ' pop' : ''}`}><path d={FLAME_PATH} /></svg>
        ))}
      </div>
      <div className="flameline">
        <input type="range" id={id} min="0" max="5" step="1" value={value} onChange={(e) => change(Number(e.target.value))} aria-label="Flame rating" />
        <output htmlFor={id}>{RATE_TEXT[value]}</output>
      </div>
    </div>
  );
}

export function RatePanel({ item, onRated }) {
  const [v, setV] = useState(item.rating || 0);
  const t = useRef(null);
  const { toast } = useApp();
  function change(n) {
    setV(n);
    onRated(n);
    clearTimeout(t.current);
    t.current = setTimeout(() => {
      api(`/items/${item.id}/rate`, { method: 'POST', body: { value: n } }).then(() => { if (n) toast(`${n} ${n === 1 ? 'flame' : 'flames'}. Your map is updated.`); }).catch((e) => toast(e.message));
    }, 350);
  }
  return (
    <>
      <div className="pt">How did this land?</div>
      <Flames value={v} onChange={change} id={`rate-${item.id}`} />
      <p className="wnote">Ratings count far more than watching to the end.</p>
    </>
  );
}

export function WhyPanel({ item }) {
  return (
    <>
      <div className="pt">Why this · {item.match}% match</div>
      {item.why?.map((w, i) => <p className="answer" key={i}>{w}</p>)}
      {item.tags?.length ? <div className="chiprow">{item.tags.map((t) => <span className="chip ghost" key={t}>{t}</span>)}</div> : null}
    </>
  );
}

const SUGGEST = ['More like this', 'Follow this performer', 'Save this'];

export function AskPanel({ item, onPatch }) {
  const { applyClient } = useApp();
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  async function ask(text) {
    const question = (text ?? q).trim();
    if (!question) { setAnswer('Type a question or tell me what to do with this post.'); return; }
    setQ(question);
    setBusy(true);
    setAnswer(null);
    try {
      const r = await api(`/items/${item.id}/ask`, { method: 'POST', body: { question } });
      setAnswer(r.answer);
      applyClient(r.client || [], { onPatch });
    } catch (err) {
      setAnswer(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="pt">Ask or tell the assistant</div>
      <form className="askrow" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input ref={inputRef} id={`ask-${item.id}`} type="text" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="I liked the…, more like this, follow her, block this tag" aria-label="Ask or tell the assistant about this post" />
        <button className="ghost-btn small accent" type="submit" disabled={busy}>{busy ? 'Working' : 'Go'}</button>
      </form>
      <div className="chiprow">
        <button type="button" className="chip btn accent" onClick={() => { setQ('I liked this because '); inputRef.current?.focus(); }}>I liked this because…</button>
        {(item.tags || []).slice(0, 3).map((t) => <button type="button" key={t} className="chip btn" onClick={() => ask(`I liked the ${t}`)}>Loved the {t}</button>)}
        {SUGGEST.filter((s) => s !== 'Follow this performer' || item.performers?.length || item.author).map((s) => <button type="button" key={s} className="chip btn" onClick={() => ask(s)}>{s}</button>)}
      </div>
      <p className="wnote">Tell it what you liked, even things only visible in the video: "her accent", "the slow start", "the eye contact". It turns that into tags for your feed.</p>
      {busy ? <p className="answer">Working on it…</p> : null}
      {answer ? <p className="answer">{answer}</p> : null}
    </>
  );
}

const HEAT_WORDS = ['How hot?', 'Warm', 'Hot', 'Very hot', 'On fire', 'Scorching'];

export function HeatSlider({ value = 0, onChange, compact = false }) {
  const [v, setV] = useState(value);
  const [flick, setFlick] = useState(0);
  const timer = useRef(null);
  const last = useRef(value);
  useEffect(() => { setV(value); last.current = value; }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  function set(n, now = false) {
    const next = Math.max(0, Math.min(5, Math.round(n * 2) / 2));
    if (next > v) setFlick((x) => x + 1);
    setV(next);
    clearTimeout(timer.current);
    const commit = () => { if (next !== last.current) { last.current = next; onChange(next); } };
    if (now) commit(); else timer.current = setTimeout(commit, 450);
  }
  const size = 16 + v * 4.4;
  const word = HEAT_WORDS[Math.ceil(v)] || HEAT_WORDS[0];
  return (
    <div className={`heat${compact ? ' compact' : ''}${v >= 3 ? ' blaze' : ''}${v > 0 ? ' on' : ''}`} style={{ '--h': v / 5 }}>
      <button type="button" className="heatflame" onClick={() => set(v > 0 ? 0 : 1, true)} aria-label={v > 0 ? 'Clear how hot this was' : 'Mark as hot'} title={v > 0 ? 'Click to clear' : 'Hot'}>
        <svg key={flick} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ width: size, height: size }}><path d={FLAME_PATH} /></svg>
      </button>
      <input type="range" min="0" max="5" step="0.5" value={v} onChange={(e) => set(Number(e.target.value))} onPointerUp={(e) => set(Number(e.currentTarget.value), true)} aria-label="How hot was this" aria-valuetext={word} />
      {!compact ? <span className="heatword">{word}</span> : null}
    </div>
  );
}

export function InlineFlames({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const [pop, setPop] = useState(0);
  const shown = hover || value;
  return (
    <div className="iflames" role="radiogroup" aria-label="Rate with flames" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((k) => (
        <button
          type="button"
          key={k}
          role="radio"
          aria-checked={value === k}
          aria-label={`${k} ${k === 1 ? 'flame' : 'flames'}${value === k ? ', click again to clear' : ''}`}
          title={RATE_TEXT[k]}
          className={`${k <= shown ? `lit${shown >= 4 ? ' hot' : ''}` : ''}${pop === k ? ' pop' : ''}`}
          onMouseEnter={() => setHover(k)}
          onFocus={() => setHover(k)}
          onBlur={() => setHover(0)}
          onClick={() => { const n = value === k ? 0 : k; setPop(n); onChange(n); }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={FLAME_PATH} /></svg>
        </button>
      ))}
    </div>
  );
}

export function PerformerPanel({ name }) {
  const { setFilters, toast, runSearch } = useApp();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = (fetchMore) => {
    setLoading(true);
    return api(`/performers/${encodeURIComponent(name)}${fetchMore ? '?fetch=1' : ''}`).then(setD).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(false).then(() => load(true)); }, [name]);
  async function follow() {
    try {
      await api(`/performers/${encodeURIComponent(name)}/follow`, { method: 'POST', body: { on: !d.followed } });
      setD({ ...d, followed: !d.followed });
      toast(d.followed ? `Unfollowed ${name}.` : `Following ${name} on every source that has them.`);
    } catch (e) { toast(e.message); }
  }
  if (error) return <p className="answer">{error}</p>;
  if (!d) return <p className="answer">Looking up {name} across your sources…</p>;
  const SRC = { pornhub: 'Pornhub', redtube: 'RedTube', eporner: 'Eporner', redgifs: 'RedGIFs', lemmy: 'Lemmy', bluesky: 'Bluesky', reddit: 'Reddit' };
  return (
    <>
      <div className="prof">{d.thumb ? <img className="perfimg" src={imgSrc(d.thumb)} alt="" referrerPolicy="no-referrer" /> : <Avatar name={name} size="l" />}<div className="pn"><strong>{d.name}</strong><span>Performer{d.videosElsewhere ? ` · ${fmtNum(d.videosElsewhere)} videos on Pornhub` : ''} · {d.count} posts here across {Object.keys(d.bySource).length} {Object.keys(d.bySource).length === 1 ? 'source' : 'sources'}{loading ? ' · searching for more' : ''}</span></div></div>
      <div className="pstats">
        {Object.entries(d.bySource).map(([s, n]) => <span key={s}><b>{n}</b>{SRC[s] || s}</span>)}
        {d.match !== null ? <span><b>{d.match}%</b>match with you</span> : null}
      </div>
      {d.tags.length ? <div className="chiprow">{d.tags.map((t) => <button type="button" key={t} className="chip ghost link" onClick={() => setFilters({ tags: [name.toLowerCase()], q: t })}>{t}</button>)}</div> : null}
      {d.items.length ? (
        <div className="perfgrid">
          {d.items.slice(0, 8).map((it) => {
            const u = it.media?.poster || it.media?.thumbs?.[0] || it.media?.mid || it.media?.items?.[0]?.mid;
            return (
              <button type="button" key={it.id} className="ptile" onClick={() => setFilters({ tags: [name.toLowerCase()] }, { focus: it.id })} title={it.title}>
                {u ? <img src={imgSrc(u)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /> : null}
                <span className="tb">{SRC[it.source] || it.source}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="wbtns">
        <button type="button" className={`ghost-btn small ${d.followed ? '' : 'accent'}`} onClick={follow}>{d.followed ? 'Following' : 'Follow everywhere'}</button>
        <button type="button" className="ghost-btn small" onClick={() => runSearch(`content from ${name}`).catch((e) => toast(e.message))}>Find everything from {name}</button>
      </div>
    </>
  );
}

export function CommentsPanel({ item }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    track(item.id, 'comments');
    api(`/items/${item.id}/comments`).then(setData).catch((e) => setError(e.message));
  }, [item.id]);
  return (
    <>
      <div className="pt">Top comments · {fmtNum(item.comments)}</div>
      {error ? <p className="answer">{error}</p> : null}
      {!data && !error ? <p className="answer">Loading comments…</p> : null}
      {data && !data.comments.length ? <p className="answer">{item.source === 'reddit' ? 'No comments came back. Connect Reddit in Settings to load them.' : 'This source doesn’t have comments.'}</p> : null}
      <div className="replies">
        {data?.comments.map((c) => (
          <div className="reply" key={c.id}>
            <Avatar name={c.author} size="s" />
            <div className="rb">
              <b>u/{c.author} <em>{fmtNum(c.score)} up</em></b>
              <span className="cbody">{c.body}</span>
              {c.replies?.map((r, i) => <span className="subreply" key={i}><b>u/{r.author}</b> {r.body}</span>)}
            </div>
          </div>
        ))}
      </div>
      {item.url ? <div className="wbtns"><a className="ghost-btn small" href={item.url} target="_blank" rel="noreferrer noopener"><Icon name="open" />Full thread on the source</a></div> : null}
    </>
  );
}

const SOURCE_NAME = { bluesky: 'Bluesky', reddit: 'Reddit', redgifs: 'RedGIFs', lemmy: 'Lemmy', pornhub: 'Pornhub', redtube: 'RedTube', eporner: 'Eporner', any: 'the web' };

// A person named in a post: where they post, how much, and a way to go there or follow them.
export function PersonPanel({ person, item }) {
  const { setFilters, toast, runSearch } = useApp();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (item) track(item.id, 'profile');
    api(`/people/lookup?handle=${encodeURIComponent(person.handle)}&platform=${person.platform || 'any'}`).then(setD).catch((e) => setError(e.message));
  }, [person.handle, person.platform]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <p className="answer">{error}</p>;
  const handle = String(person.handle || '').replace(/^@+/, '');
  if (!d) return <p className="answer">Looking up {handle}…</p>;
  const localN = d.local.reduce((a, b) => a + b.n, 0);
  const search = () => runSearch(handle).catch((e) => toast(e.message));
  return (
    <>
      <div className="prof"><Avatar name={handle} size="l" /><div className="pn"><strong>{handle}</strong><span>{d.profiles.length ? `found on ${d.profiles.filter((x) => !x.unverified).map((x) => SOURCE_NAME[x.platform]).join(', ') || 'Reddit (not checked)'}` : 'not found on the sources that can be checked'}{localN ? ` · ${localN} posts in your feed` : ''}</span></div></div>
      <div className="wbtns">
        <button type="button" className={`ghost-btn small${d.profiles.length ? '' : ' accent'}`} onClick={search}><Icon name="search" />Search everywhere for {handle}</button>
        {localN ? <button type="button" className="ghost-btn small" onClick={() => setFilters({ tags: [handle.toLowerCase()] })}>Show their {localN} posts here</button> : null}
      </div>
      {d.profiles.map((pr) => (
        <div key={pr.platform} className="personrow">
          {pr.avatar ? <img className="avatar av-m avimg" src={pr.avatar} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <Avatar name={pr.name} />}
          <div className="pn"><strong>{pr.name}</strong><span>{SOURCE_NAME[pr.platform]}{pr.posts != null ? ` · ${fmtNum(pr.posts)} posts` : ''}{pr.followers != null ? ` · ${fmtNum(pr.followers)} followers` : ''}{pr.unverified ? ' · not checked' : ''}</span>{pr.about ? <em>{pr.about}</em> : null}</div>
          <div className="memacts">
            {pr.url ? <a className="ghost-btn small" href={pr.url} target="_blank" rel="noreferrer noopener">Open</a> : null}
            <button type="button" className="ghost-btn small" onClick={() => setFilters({ author: pr.handle })}>Show here</button>
            <button type="button" className="ghost-btn small accent" onClick={async () => { try { const r = await api('/follow-creator', { method: 'POST', body: { source: pr.platform, name: pr.handle } }); toast(`Following ${pr.handle} on ${r.followed.length} ${r.followed.length === 1 ? 'source' : 'sources'}.`); } catch (e) { toast(e.message); } }}>Follow</button>
          </div>
        </div>
      ))}
    </>
  );
}

export function ProfilePanel({ item }) {
  const { setFilters, toast } = useApp();
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    track(item.id, 'profile');
    api(`/authors/${item.source}/${encodeURIComponent(item.author)}`).then(setP).catch((e) => setError(e.message));
  }, [item.id, item.source, item.author]);
  async function toggleFollow() {
    try {
      if (p.followed) {
        await api('/follow', { method: 'POST', body: { kind: p.kind, value: p.followValue, on: false } });
        setP({ ...p, followed: false });
        toast(`Unfollowed ${p.name}.`);
        return;
      }
      setP({ ...p, followed: true });
      toast(`Following ${p.name}. Looking for them on your other sources too…`);
      const r = await api('/follow-creator', { method: 'POST', body: { source: item.source, name: p.name, itemId: item.id } });
      toast(`Following ${p.name} on ${r.followed.length} ${r.followed.length === 1 ? 'source' : 'sources'}. New posts show up in your feed as Following.`);
    } catch (e) { toast(e.message); }
  }
  async function followCommunity() {
    const c = item.community || '';
    const isReddit = item.source === 'reddit' && c.startsWith('r/');
    const value = isReddit ? `reddit|${c.slice(2)}` : `${item.source}|${c}`;
    await api('/follow', { method: 'POST', body: { kind: 'community', value, on: true, label: c } });
    toast(`Added ${c} to your sources. Its new posts are mixed into your feed.`);
  }
  if (error) return <p className="answer">{error}</p>;
  if (!p) return <p className="answer">Loading profile…</p>;
  return (
    <>
      <div className="prof"><Avatar name={p.name} size="l" /><div className="pn"><strong>{p.name}</strong><span>{item.source === 'reddit' ? `u/${p.name}` : `@${p.name}`} · mostly in {p.community || item.community}</span></div></div>
      <div className="pstats">{p.platformPosts != null ? <span><b>{fmtNum(p.platformPosts)}</b>posts on {SOURCE_NAME[item.source] || item.source}</span> : <span><b>{p.posts}</b>posts in your feed</span>}{p.followers != null ? <span><b>{fmtNum(p.followers)}</b>followers</span> : null}<span><b>{fmtNum(p.score)}</b>total score</span>{p.match !== null ? <span><b>{p.match}%</b>match with you</span> : null}</div>
      {p.tags?.length ? <div className="chiprow">{p.tags.map((t) => <span key={t} className="chip ghost">{t}</span>)}</div> : null}
      <div className="wbtns">
        {p.canFollow ? <button type="button" className={`ghost-btn small ${p.followed ? '' : 'accent'}`} onClick={toggleFollow}>{p.followed ? 'Following' : 'Follow'}</button> : null}
        <button type="button" className="ghost-btn small" onClick={() => setFilters({ author: p.name })}>Only this creator in the feed</button>
        {p.profileUrl ? <a className="ghost-btn small" href={p.profileUrl} target="_blank" rel="noreferrer noopener">Open on {SOURCE_NAME[item.source] || item.source}</a> : null}
        {item.community && ['reddit', 'lemmy'].includes(item.source) ? <button type="button" className="ghost-btn small" onClick={followCommunity}>Add {item.community} as a source</button> : null}
      </div>
      <p className="wnote">Following checks RedGIFs, Bluesky and Reddit for the same name and follows them there too. Only their new posts show up, marked Following.</p>
    </>
  );
}
