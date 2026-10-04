import { useEffect, useMemo, useRef, useState } from 'react';
import { api, rgba, FORMATS, ago, proxied, imgSrc } from '../api.js';
import { useApp } from '../context.jsx';
import BrainCanvas from './BrainCanvas.jsx';
import KinkBoard, { evidenceLine } from './KinkBoard.jsx';
import { Icon } from '../icons.jsx';

const TYPE_LABEL = { kink: 'Kink', tag: 'Hot tag', fantasy: 'Fantasy' };
const EVENT_LABEL = {
  impression: 'seen', dwell: 'watched', open: 'opened', play: 'played', progress: 'watched part', complete: 'watched to the end', rewatch: 'rewatched', up: 'liked', down: 'disliked', unvote: 'removed vote',
  save: 'saved', unsave: 'unsaved', rate: 'heat', less: 'less like this', more: 'more like this', reason: 'said why', ask: 'asked', comments: 'read comments', profile: 'looked at profile', follow: 'followed'
};

function secs(ms) {
  const s = Math.round((ms || 0) / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

function Thumb({ media }) {
  const u = media?.poster || media?.thumbs?.[0] || media?.mid || media?.items?.[0]?.mid || (media?.kind === 'image' ? media.src : null);
  if (!u) return <span className="histph" />;
  return <img src={imgSrc(u)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { if (!e.currentTarget.dataset.p) { e.currentTarget.dataset.p = 1; e.currentTarget.src = proxied(u); } else e.currentTarget.style.visibility = 'hidden'; }} />;
}

function HoverCard({ hover, brain }) {
  if (!hover) return null;
  const n = hover.node;
  const links = brain.edges.filter((e) => e.a === n.key || e.b === n.key).sort((a, b) => b.w - a.w).slice(0, 3)
    .map((e) => ({ name: brain.nodes.find((x) => x.key === (e.a === n.key ? e.b : e.a))?.name, w: e.w })).filter((x) => x.name);
  const d = n.lately - n.allTime;
  return (
    <div className="hovercard" style={{ left: Math.min(hover.x + 16, 9999), top: hover.y + 12 }}>
      <div className="hc-head"><span className="win-dot" style={{ '--c': n.color }} /><b>{n.name}</b><em>{TYPE_LABEL[n.type]}{n.origin === 'tag' ? ' · grew from a tag' : n.status === 'proposed' ? ' · suggested' : ''}</em></div>
      {n.type !== 'fantasy' ? <div className="hc-row"><span>All time {n.allTime}%</span><span>Lately {n.lately}%</span><span className={d >= 0 ? 'up' : 'down'}>{d >= 0 ? '▲' : '▼'} {Math.abs(d)}</span></div> : null}
      <div className="hc-row"><span>Strength {Math.round(n.activity || 0)}</span><span>{n.last ? `last ${ago(Math.round(n.last / 1000))}` : 'no interaction yet'}</span></div>
      {n.tags?.length ? <div className="hc-tags">{n.tags.slice(0, 6).join(' · ')}</div> : null}
      {links.length ? <div className="hc-links">{links.map((l) => <span key={l.name}><i style={{ opacity: 0.25 + l.w * 0.75 }} />{l.name} {Math.round(l.w * 100)}%</span>)}</div> : null}
      {n.type === 'tag' && n.promote ? <div className="hc-note">You keep coming back to this. It is about to become a kink.</div> : null}
    </div>
  );
}

function AiWidget({ nodeKey }) {
  const [t, setT] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = (fresh = false) => {
    setBusy(true);
    api(`/brain/insight/${nodeKey}${fresh ? '?fresh=1' : ''}`).then((r) => setT(r.text || r.error || 'The local model had nothing to say yet.')).catch((e) => setT(e.message)).finally(() => setBusy(false));
  };
  useEffect(() => { setT(null); load(); }, [nodeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="bw ai">
      <div className="bw-h"><span>What the assistant thinks</span><button type="button" className="linkbtn" onClick={() => load(true)} disabled={busy}>{busy ? 'thinking…' : 'refresh'}</button></div>
      {t ? <p className="aitext">{t}</p> : <p className="aitext dim"><span className="spinner inline" /> Thinking about this…</p>}
    </div>
  );
}

function Detail({ nodeKey, brain, reload, onSelect }) {
  const { setFilters, openMode, toast, refreshMeta, kinks: allKinks } = useApp();
  const node = brain.nodes.find((n) => n.key === nodeKey);
  const [d, setD] = useState(null);
  const [posts, setPosts] = useState([]);
  const [name, setName] = useState(node?.name || '');
  const [tagIn, setTagIn] = useState('');
  const kinks = useMemo(() => brain.nodes.filter((n) => n.type === 'kink'), [brain]);
  const loadDetail = () => api(`/brain/node/${nodeKey}`).then((r) => {
    setD(r);
    api('/feed', { method: 'POST', body: { filters: { ...r.filter, includeSeen: true }, limit: 6, mix: 0 } }).then((f) => setPosts(f.items)).catch(() => {});
  }).catch(() => setD(null));
  useEffect(() => { setName(node?.name || ''); setD(null); setPosts([]); loadDetail(); }, [nodeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!node) return null;
  const kinkObj = node.type === 'kink' ? node : null;
  const full = kinkObj ? allKinks.find((k) => k.id === node.id) : null;
  const edited = full && (Object.keys(full.locks || {}).length > 0 || full.origin === 'user');
  async function patch(body, msg) {
    try { await api(`/kinks/${node.id}`, { method: 'PATCH', body }); if (msg) toast(msg); await reload(); refreshMeta(); loadDetail(); } catch (e) { toast(e.message); }
  }
  const links = brain.edges.filter((e) => e.a === nodeKey || e.b === nodeKey).map((e) => ({ ...e, other: brain.nodes.find((x) => x.key === (e.a === nodeKey ? e.b : e.a)) })).filter((e) => e.other).sort((a, b) => b.w - a.w);
  const d7 = node.lately - node.allTime;
  const groups = brain.groups;
  return (
    <div className="braindetail">
      <div className="bw head">
        <button type="button" className="ghost-btn small backbtn" onClick={() => onSelect(null)}><Icon name="chevL" />All kinks</button>
        {kinkObj ? <label className="colorpick" title="Colour"><input type="color" value={full?.color || node.color} onChange={(e) => patch({ color: e.target.value })} aria-label="Colour" /></label> : <span className="win-dot" style={{ '--c': node.color }} />}
        {node.type === 'kink' ? <input className="kname" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== node.name && patch({ name: name.trim() }, 'Renamed.')} aria-label="Name" /> : <b className="kname static">{node.name}</b>}
        <span className="count">{TYPE_LABEL[node.type]}{node.origin === 'tag' ? ' · grew from a tag you kept coming back to' : ''}{node.status === 'proposed' ? ' · suggested' : ''}</span>
        <div className="wbtns">
          <button type="button" className="ghost-btn small accent" onClick={() => setFilters(d?.filter || (node.type === 'tag' ? { tags: [node.name] } : node.type === 'fantasy' ? { fantasy: node.id } : { kink: node.id }))}>Show in feed</button>
          {node.type !== 'tag' ? (
            <>
              <button type="button" className="ghost-btn small" onClick={() => openMode('journey', { ...(node.type === 'fantasy' ? { fantasy: node.id } : { kink: node.id }), mode: 'close' })}><Icon name="route" />Dive deeper</button>
              <button type="button" className="ghost-btn small" onClick={() => openMode('journey', { ...(node.type === 'fantasy' ? { fantasy: node.id } : { kink: node.id }), mode: 'branch' })}><Icon name="route" />Branch out</button>
              <button type="button" className="ghost-btn small" onClick={() => openMode('journey', { ...(node.type === 'fantasy' ? { fantasy: node.id } : { kink: node.id }), mode: 'genre' })}><Icon name="route" />Surprise me, same family</button>
            </>
          ) : null}
          {node.type === 'tag' ? <button type="button" className="ghost-btn small" onClick={async () => { const r = await api(`/brain/promote/${node.id}`, { method: 'POST', body: {} }); toast('It is a kink now.'); await reload(); refreshMeta(); onSelect(`k${r.id}`); }}>Make it a kink</button> : null}
          {kinkObj?.status === 'proposed' ? <button type="button" className="ghost-btn small" onClick={() => patch({ status: 'active' }, 'Kept.')}>Keep</button> : null}
          {kinkObj ? <button type="button" className="ghost-btn small" onClick={() => patch({ status: 'hidden' }, 'Hidden. It stays hidden until you bring it back.')}>Hide</button> : null}
          {kinkObj ? <button type="button" className="ghost-btn small" onClick={async () => { await api(`/kinks/${node.id}`, { method: 'DELETE' }); toast('Removed. It won\'t come back by itself.'); onSelect(null); reload(); refreshMeta(); }}>Remove</button> : null}
          {node.type === 'fantasy' ? <button type="button" className="ghost-btn small" onClick={async () => { await api(`/fantasies/${node.id}`, { method: 'DELETE' }); onSelect(null); reload(); }}>Delete</button> : null}
        </div>
      </div>
      <div className="bwgrid">
        {kinkObj ? (
          <div className="bw">
            <div className="bw-h"><span>Why this is a kink</span></div>
            <p className="aitext">{full?.evidence ? evidenceLine(full.evidence) : full?.origin === 'user' ? 'You made this one yourself.' : 'Not enough clear likes behind it yet.'}</p>
            {edited ? (
              <div className="rowline wrapline">
                <span className="wnote">You changed {Object.keys(full.locks || {}).filter((x) => full.locks[x]).map((x) => ({ name: 'the name', tags: 'the tags', parent: 'the group', color: 'the colour', status: 'whether it shows' }[x])).filter(Boolean).join(', ') || 'this'} by hand, so that stays as you set it.</span>
                <button type="button" className="linkbtn" onClick={async () => { try { await api(`/kinks/${node.id}/unlock`, { method: 'POST', body: {} }); toast('It updates by itself again.'); await reload(); refreshMeta(); loadDetail(); } catch (e) { toast(e.message); } }}>Let it update by itself again</button>
              </div>
            ) : <p className="wnote">It updates by itself: tags join as you like them, and it fades if you stop.</p>}
            <select value="" onChange={async (e) => { const v = Number(e.target.value); if (!v) return; try { const r = await api(`/kinks/${node.id}/merge`, { method: 'POST', body: { into: v } }); toast('Combined into one kink.'); await reload(); refreshMeta(); onSelect(`k${r.id}`); } catch (err) { toast(err.message); } }} aria-label="Combine with another kink">
              <option value="">Combine with…</option>
              {allKinks.filter((k) => !k.isGroup && k.id !== node.id && k.status !== 'hidden').sort((a, b) => a.name.localeCompare(b.name)).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </div>
        ) : null}
        <AiWidget nodeKey={nodeKey} />
        <div className="bw">
          <div className="bw-h"><span>This week vs before</span></div>
          <div className="bars">
            <div className="barrow"><div className="bt"><span>All time</span><em>{node.allTime}%</em></div><div className="track2"><i style={{ width: `${node.allTime}%`, background: rgba(node.color, 0.5) }} /></div></div>
            <div className="barrow"><div className="bt"><span>Lately</span><em className={d7 >= 0 ? 'up' : 'down'}>{node.lately}% ({d7 >= 0 ? '+' : ''}{d7})</em></div><div className="track2"><i style={{ width: `${node.lately}%`, background: node.color }} /></div></div>
            {node.now !== undefined ? <div className="barrow"><div className="bt"><span>Right now</span><em>{node.now}%</em></div><div className="track2"><i style={{ width: `${node.now}%`, background: 'var(--flame)' }} /></div></div> : null}
          </div>
          {d ? <p className="wnote">{d.week} posts this week, {d.perWeekBefore} a week before that. {Object.entries(d.counts || {}).filter(([t]) => t !== 'impression').map(([t, c]) => `${c} ${EVENT_LABEL[t] || t}`).slice(0, 5).join(', ')}</p> : null}
        </div>
        <div className="bw">
          <div className="bw-h"><span>Linked with</span><span className="count">{links.length}</span></div>
          <div className="linklist">
            {links.slice(0, 10).map((l) => (
              <button type="button" key={l.other.key} className="linkrow" onClick={() => onSelect(l.other.key)} title={l.why || (l.together ? `${l.together} shared interactions` : '')}>
                <span className="win-dot" style={{ '--c': l.other.color }} /><span className="ln">{l.other.name}</span>
                <span className="lbar"><i style={{ width: `${Math.round(l.w * 100)}%`, opacity: 0.35 + l.w * 0.65 }} /></span><em>{Math.round(l.w * 100)}%</em>
              </button>
            ))}
            {!links.length ? <p className="wnote">No links yet. They grow as you like posts that carry both.</p> : null}
          </div>
          {node.type === 'kink' ? (
            <select value="" onChange={async (e) => { const v = e.target.value; if (!v) return; await api('/kinks/links', { method: 'POST', body: { a: node.id, b: Number(v) } }); reload(); }} aria-label="Link with another kink">
              <option value="">+ link with…</option>
              {kinks.filter((k) => k.id !== node.id && !links.some((l) => l.other.key === k.key)).map((k) => <option key={k.key} value={k.id}>{k.name}</option>)}
            </select>
          ) : null}
        </div>
        {node.type === 'kink' ? (
          <div className="bw">
            <div className="bw-h"><span>Tags and group</span></div>
            <div className="chiprow">
              {(node.tags || []).map((t) => <span key={t} className="chip ghost">{t}<button type="button" className="chipx" aria-label={`Remove ${t}`} onClick={() => patch({ tags: node.tags.filter((x) => x !== t).map((x) => ({ name: x, weight: 1 })) })}>×</button></span>)}
              <form onSubmit={(e) => { e.preventDefault(); if (tagIn.trim()) { patch({ tags: [...(node.tags || []), tagIn.trim()].map((x) => ({ name: x, weight: 1 })) }, 'Tag added.'); setTagIn(''); } }}><input className="tagadd" value={tagIn} onChange={(e) => setTagIn(e.target.value)} placeholder="+ tag" aria-label="Add tag" /></form>
            </div>
            {d?.relatedTags?.length ? <><div className="fb-label">Often comes with</div><div className="chiprow">{d.relatedTags.map((t) => <button type="button" key={t} className="chip btn" onClick={() => patch({ tags: [...(node.tags || []), t].map((x) => ({ name: x, weight: 1 })) }, `Added ${t}.`)} title="Add to this kink">+ {t}</button>)}</div></> : null}
            <div className="rowline wrapline"><span className="fb-label">Group</span>
              <select value={node.group || ''} onChange={(e) => patch({ parentId: e.target.value ? Number(e.target.value) : null }, 'Moved.')} aria-label="Group">
                <option value="">No group</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.parentId ? `  ${groups.find((x) => x.id === g.parentId)?.name || ''} › ${g.name}` : g.name}</option>)}
              </select>
            </div>
          </div>
        ) : node.type === 'tag' && d?.relatedTags?.length ? (
          <div className="bw"><div className="bw-h"><span>Often comes with</span></div><div className="chiprow">{d.relatedTags.map((t) => <button type="button" key={t} className="chip btn" onClick={() => setFilters({ tags: [node.name, t] })}>{t}</button>)}</div></div>
        ) : null}
        <div className="bw wide">
          <div className="bw-h"><span>Best matches</span></div>
          <div className="postrow">
            {posts.map((it) => <button type="button" key={it.id} className="postcard" onClick={() => setFilters(d?.filter || {}, { focus: it.id })} title={it.title}><Thumb media={it.media} /><span>{it.title}</span></button>)}
            {!posts.length ? <p className="wnote">Loading…</p> : null}
          </div>
        </div>
        <div className="bw wide">
          <div className="bw-h"><span>Recent interactions with this</span></div>
          <div className="evlist">
            {(d?.recent || []).slice(0, 12).map((r) => (
              <button type="button" key={r.item_id} className="evrow evpost" onClick={() => setFilters({}, { focus: r.item_id })} title={`Open: ${r.title || ''}`}>
                <span className="evthumb"><Thumb media={r.media} /></span>
                <span className="evtitle">{r.title || `Post ${r.item_id}`}</span>
                <span className="evchips">{r.events.filter((e) => e.type !== 'dwell' || e.value >= 6000).slice(0, 4).map((e) => <span key={e.type} className={`evtype t-${e.type}`}>{EVENT_LABEL[e.type] || e.type}{e.type === 'dwell' ? ` ${secs(e.value)}` : e.type === 'rate' ? ` ${e.value}` : e.n > 1 ? ` ${e.n}×` : ''}</span>)}</span>
                <em>{ago(Math.round(r.ts / 1000))}</em>
              </button>
            ))}
            {d && !d.recent?.length ? <p className="wnote">Nothing yet.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function FantasyEditor({ brain, reload, onDone }) {
  const { toast } = useApp();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [sel, setSel] = useState(new Set());
  const kinks = brain.nodes.filter((n) => n.type === 'kink');
  return (
    <div className="braindetail">
      <div className="bw">
        <div className="bw-h"><span>New fantasy</span></div>
        <input className="kname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name it" aria-label="Fantasy name" />
        <textarea className="kdesc" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Describe the scenario" />
        <div className="chiprow">{kinks.map((k) => <button type="button" key={k.key} className={`chip btn${sel.has(k.id) ? ' on' : ''}`} onClick={() => setSel((cur) => { const n = new Set(cur); if (n.has(k.id)) n.delete(k.id); else n.add(k.id); return n; })}>{k.name}</button>)}</div>
        <div className="wbtns">
          <button type="button" className="ghost-btn small accent" onClick={async () => { if (!name.trim() || !sel.size) { toast('Name it and pick at least one kink.'); return; } await api('/fantasies', { method: 'POST', body: { name: name.trim(), description: desc, kinks: [...sel], saved: 1 } }); toast('Fantasy added to your map.'); await reload(); onDone(); }}>Save</button>
          <button type="button" className="ghost-btn small" onClick={onDone}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function HistoryDb() {
  const { toast, setFilters } = useApp();
  const [items, setItems] = useState(null);
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const load = () => api(`/history?limit=200${type ? `&type=${type}` : ''}`).then((r) => setItems(r.items)).catch(() => setItems([]));
  useEffect(() => { load(); }, [type]); // eslint-disable-line react-hooks/exhaustive-deps
  async function forget(it, less) {
    setItems((cur) => cur.filter((x) => x.id !== it.id));
    try { await api(`/history/${it.id}${less ? '?less=1' : ''}`, { method: 'DELETE' }); toast(less ? 'Removed, and it counts against similar posts now.' : 'Forgotten. It no longer counts for your taste.'); } catch (e) { toast(e.message); }
  }
  const shown = (items || []).filter((it) => !q || `${it.title} ${it.author || ''} ${it.community || ''}`.toLowerCase().includes(q.toLowerCase()));
  // Only what matters: watch time for videos, watched to the end and rewatches up front, then the strong signals.
  // Seen, short stays and partial plays are left out.
  const chips = (it) => {
    const out = [];
    const video = ['long', 'short', 'gif'].includes(it.format);
    if (it.rewatches) out.push(<span key="rw" className="evtype big t-rewatch">rewatched{it.rewatches > 1 ? ` ${it.rewatches}×` : ''}</span>);
    if (it.completed) out.push(<span key="cp" className="evtype big t-complete">watched to the end</span>);
    if (video && it.watchMs >= 3000) out.push(<span key="wt" className="evtype t-dwell" title="Time watched">⏱ {secs(it.watchMs)}{it.watched && !it.completed ? ` · ${Math.round(it.watched * 100)}%` : ''}</span>);
    else if (!video && it.dwellMs >= 6000) out.push(<span key="st" className="evtype t-dwell">{it.format === 'story' || it.format === 'discussion' ? 'read' : 'looked'} {secs(it.dwellMs)}</span>);
    for (const t of ['rate', 'save', 'up', 'follow', 'reason', 'more', 'down', 'less', 'comments', 'profile', 'ask', 'open']) {
      const c = it.counts[t];
      if (!c) continue;
      const label = t === 'rate' ? `heat ${it.rating || c.max}` : `${EVENT_LABEL[t] || t}${c.n > 1 ? ` ${c.n}×` : ''}`;
      out.push(<span key={t} className={`evtype t-${t}`} title={`last ${ago(Math.round(c.t / 1000))}`}>{label}</span>);
    }
    return out;
  };
  return (
    <div className="card2 wide">
      <h3>Everything you did <span className="count">the data your taste profile learns from</span></h3>
      <div className="rowline wrapline">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, creators, communities" aria-label="Search history" style={{ flex: 2 }} />
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by interaction">
          <option value="">All interactions</option>
          {['rewatch', 'complete', 'rate', 'save', 'up', 'follow', 'reason', 'more', 'down', 'less', 'comments', 'profile', 'ask', 'open'].map((t) => <option key={t} value={t}>{EVENT_LABEL[t]}</option>)}
        </select>
      </div>
      {items === null ? <p className="wnote">Loading…</p> : !shown.length ? <p className="wnote">Nothing here yet.</p> : (
        <div className="histlist">
          {shown.map((it) => (
            <div key={it.id} className="histrow clickable" role="button" tabIndex={0} onClick={(e) => { if (!e.target.closest('button')) setFilters({}, { focus: it.id }); }} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) setFilters({}, { focus: it.id }); }}>
              <Thumb media={it.media} />
              <span className={`scorebadge${it.score >= 3 ? ' hi' : it.score < 0 ? ' neg' : ''}`} title="How much this counted for your taste (likes, heat and saves weigh the most)">{it.score > 0 ? '+' : ''}{it.score}</span>
              <div className="histtext">
                <span className="mini-title">{it.title}</span>
                <span className="mini-meta">{it.author || it.community || it.source} · {it.source} · {ago(Math.round(it.last / 1000))}</span>
                <div className="evchips">{chips(it)}</div>
              </div>
              <button type="button" className="ghost-btn small" onClick={(e) => { e.stopPropagation(); forget(it, false); }} title="Remove from what your profile learned">Forget</button>
              <button type="button" className="ghost-btn small" onClick={(e) => { e.stopPropagation(); forget(it, true); }} title="Forget it and show less like it">Not for me</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MapView() {
  const { setFilters, toast, refreshMeta } = useApp();
  const [brain, setBrain] = useState(null);
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  const [hover, setHover] = useState(null);
  const [busy, setBusy] = useState(null);
  const [newFantasy, setNewFantasy] = useState(false);
  const [view, setView] = useState({ sizeBy: 'all', showTags: true, showFantasies: true, minLink: 0.05, focusGroup: null, labelsAll: false });
  const [find, setFind] = useState('');
  const detailRef = useRef(null);

  const load = async () => {
    try {
      const [b, m] = await Promise.all([api('/brain'), api('/map')]);
      setBrain(b);
      setData(m);
    } catch (e) { toast(e.message); }
  };
  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) api('/brain').then(setBrain).catch(() => {}); }, 8000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function select(key) {
    setSel(key);
    setNewFantasy(false);
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: key ? 'nearest' : 'start' }), 60);
  }

  // A kink that faded is brought back when you open it: opening it says you still care.
  async function openKink(k) {
    if (k.status === 'hidden') {
      try { await api(`/kinks/${k.id}`, { method: 'PATCH', body: { status: 'active' } }); toast(`${k.name} is back and stays.`); await load(); refreshMeta(); } catch (e) { toast(e.message); return; }
    }
    select(`k${k.id}`);
  }

  async function run(name, fn) {
    setBusy(name);
    try { await fn(); } catch (e) { toast(e.message); } finally { setBusy(null); }
  }

  const kinks = (data?.kinks || []).filter((k) => !k.isGroup);
  const counts = brain ? { kinks: brain.nodes.filter((n) => n.type === 'kink').length, tags: brain.nodes.filter((n) => n.type === 'tag').length, fantasies: brain.nodes.filter((n) => n.type === 'fantasy').length, links: brain.edges.length } : null;
  const matches = find && brain ? brain.nodes.filter((n) => n.name.toLowerCase().includes(find.toLowerCase())).slice(0, 6) : [];
  return (
    <section className="center" style={{ paddingTop: 0 }}>
      <div className="jhead">
        <div>
          <h2>Your map</h2>
          <p>Everything the assistant knows about your taste, live. Kinks are the bright circles, sized by how much you are into them; kinks of the same family share a colour. Hollow dots are things you are clearly into that are almost a kink. Gold diamonds are fantasies. Lines get stronger every time you enjoy things together. Hover for details, click a circle or a kink below for everything about it, drag to rearrange.</p>
        </div>
        <div className="wbtns">
          <button type="button" className="ghost-btn" onClick={() => run('find', async () => { const r = await api('/kinks/refresh', { method: 'POST', body: {} }); const parts = [r.created?.length ? `new: ${r.created.join(', ')}` : null, r.back?.length ? `back: ${r.back.join(', ')}` : null, r.faded?.length ? `faded: ${r.faded.join(', ')}` : null, r.merged?.length ? `combined ${r.merged.length}` : null].filter(Boolean); toast(parts.length ? `Kinks updated. ${parts.join(' · ')}.` : 'Kinks are up to date.'); await load(); refreshMeta(); })} disabled={!!busy}>{busy === 'find' ? 'Updating' : 'Update kinks now'}</button>
          <button type="button" className="ghost-btn" onClick={() => { setSel(null); setNewFantasy(true); }}>New fantasy</button>
        </div>
      </div>
      <div className="braintools">
        <div className="seg">{[['all', 'All time'], ['week', 'This week']].map(([k, l]) => <button key={k} type="button" className={view.sizeBy === k ? 'on' : ''} onClick={() => setView((v) => ({ ...v, sizeBy: k }))}>{l}</button>)}</div>
        <button type="button" className={`chip btn${view.showTags ? ' on' : ''}`} onClick={() => setView((v) => ({ ...v, showTags: !v.showTags }))}>Hot tags</button>
        <button type="button" className={`chip btn${view.showFantasies ? ' on' : ''}`} onClick={() => setView((v) => ({ ...v, showFantasies: !v.showFantasies }))}>Fantasies</button>
        <button type="button" className={`chip btn${view.labelsAll ? ' on' : ''}`} onClick={() => setView((v) => ({ ...v, labelsAll: !v.labelsAll }))}>All labels</button>
        <button type="button" className={`chip btn${view.allLinks ? ' on' : ''}`} onClick={() => setView((v) => ({ ...v, allLinks: !v.allLinks }))} title="Show more links per kink">More links</button>
        <select value={view.focusGroup || ''} onChange={(e) => setView((v) => ({ ...v, focusGroup: e.target.value ? Number(e.target.value) : null }))} aria-label="Focus on a family">
          <option value="">All families</option>
          {(brain?.groups || []).map((g) => <option key={g.id} value={g.id}>{g.parentId ? `› ${g.name}` : g.name}</option>)}
        </select>
        <label className="ctl" htmlFor="minLink"><span className="fb-label" style={{ minWidth: 0 }}>Links</span><input type="range" id="minLink" min="0" max="0.8" step="0.05" value={view.minLink} onChange={(e) => setView((v) => ({ ...v, minLink: Number(e.target.value) }))} /></label>
        <div className="brainfind">
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find…" aria-label="Find on map" />
          {matches.length ? <div className="findpop">{matches.map((m) => <button type="button" key={m.key} onClick={() => { select(m.key); setFind(''); }}>{m.name}<em>{TYPE_LABEL[m.type]}</em></button>)}</div> : null}
        </div>
      </div>
      <div className="brainwrap">
        {brain ? <BrainCanvas data={brain} view={view} selected={sel} onSelect={select} onHover={setHover} height={680} /> : <div className="brainbox loadingbox"><span className="spinner inline" /> Loading your map…</div>}
        {brain ? <HoverCard hover={hover} brain={brain} /> : null}
        {counts ? <div className="brainlegend"><span><i className="lg kink" />{counts.kinks} kinks</span><span><i className="lg tag" />{counts.tags} hot tags</span><span><i className="lg fant" />{counts.fantasies} fantasies</span><span><i className="lg link" />{counts.links} links</span><span><i className="lg pulse" />recent activity</span></div> : null}
      </div>
      <div ref={detailRef}>
        {sel && brain ? <Detail key={sel} nodeKey={sel} brain={brain} reload={load} onSelect={select} /> : null}
        {newFantasy && brain ? <FantasyEditor brain={brain} reload={load} onDone={() => setNewFantasy(false)} /> : null}
        {!sel && !newFantasy ? <KinkBoard onOpen={openKink} onChange={async () => { await load(); refreshMeta(); }} /> : null}
      </div>
      <div className="map-grid">
        <div className="card2">
          <h3>Lately vs all time</h3>
          <div className="bars">
            {kinks.length ? kinks.slice(0, 10).map((k) => { const d = k.lately - k.allTime; return (
              <div className="barrow" key={k.id} onClick={() => select(`k${k.id}`)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') select(`k${k.id}`); }}>
                <div className="bt"><span>{k.name}{k.status === 'proposed' ? ' (suggested)' : ''}</span><em className={d >= 0 ? 'up' : 'down'}>{d >= 0 ? '+' : ''}{d}</em></div>
                <div className="duo"><div className="track2"><i style={{ width: `${k.allTime}%`, background: rgba(k.color, 0.45) }} /></div><div className="track2"><i style={{ width: `${k.lately}%`, background: k.color }} /></div></div>
              </div>
            ); }) : <p className="wnote">No kinks yet. They appear once you've given heat to, liked or saved a few posts, or add your own below.</p>}
          </div>
        </div>
        <div className="card2">
          <h3>Pairs that work for you</h3>
          <div className="bars">
            {data?.pairs?.length ? data.pairs.map((p) => (
              <div className="barrow" key={`${p.a.id}-${p.b.id}`}>
                <div className="bt"><span>{p.a.name} × {p.b.name}</span><span className="rowline"><em>{p.score}%</em><button type="button" className="chip btn" onClick={() => setFilters({ pair: [p.a.id, p.b.id] })}>Open</button></span></div>
                <div className="track2"><i style={{ width: `${p.score}%`, background: `linear-gradient(90deg, ${p.a.color}, ${p.b.color})` }} /></div>
              </div>
            )) : <p className="wnote">Pairs show up when two kinks keep appearing together in posts you love.</p>}
          </div>
        </div>
        <div className="card2">
          <h3>Formats</h3>
          <div className="bars">
            {data?.formats?.map((f) => (
              <div className="barrow" key={f.format}>
                <div className="bt"><span>{FORMATS[f.format]}</span><em>{f.allTime}% · lately {f.lately}%</em></div>
                <div className="duo"><div className="track2"><i style={{ width: `${f.allTime}%`, background: 'rgba(227,154,131,.45)' }} /></div><div className="track2"><i style={{ width: `${f.lately}%`, background: '#E39A83' }} /></div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card2">
          <h3>Strongest tags</h3>
          <div className="tagcloud">
            {data?.tags?.length ? data.tags.map((t) => <button type="button" key={t.id} style={{ fontSize: `${Math.round(11 + Math.min(11, Math.max(0, t.long) * 5))}px`, color: t.long < 0 ? '#E07070' : undefined }} onClick={() => setFilters({ tags: [t.name] })}>{t.name}</button>) : <p className="wnote">Nothing yet.</p>}
          </div>
        </div>
      </div>
      <HistoryDb />
    </section>
  );
}
