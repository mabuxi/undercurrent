import { useEffect, useMemo, useRef, useState } from 'react';
import { api, rgba, FORMATS, ago } from '../api.js';
import { useApp } from '../context.jsx';
import BrainCanvas from './BrainCanvas.jsx';
import KinkBoard, { evidenceLine, ColorDot } from './KinkBoard.jsx';
import { deeperSpec } from './Windows.jsx';
import { Icon } from '../icons.jsx';
import { t, tn } from '../i18n.js';
import { EVENT_LABEL, secs, Thumb } from './History.jsx';

const TYPE_LABEL = { kink: t('Kink'), tag: t('Hot tag'), fantasy: t('Fantasy') };
function HoverCard({ hover, brain }) {
  if (!hover) return null;
  const n = hover.node;
  const links = brain.edges.filter((e) => e.a === n.key || e.b === n.key).sort((a, b) => b.w - a.w).slice(0, 3)
    .map((e) => ({ name: brain.nodes.find((x) => x.key === (e.a === n.key ? e.b : e.a))?.name, w: e.w })).filter((x) => x.name);
  const d = n.lately - n.allTime;
  return (
    <div className="hovercard" style={{ left: Math.min(hover.x + 16, 9999), top: hover.y + 12 }}>
      <div className="hc-head"><span className="win-dot" style={{ '--c': n.color }} /><b>{n.name}</b><em>{TYPE_LABEL[n.type]}{n.origin === 'tag' ? ` · ${t('grew from a tag')}` : n.status === 'proposed' ? ` · ${t('suggested')}` : ''}</em></div>
      {n.type !== 'fantasy' ? <div className="hc-row"><span>{t('All time {n}%', { n: n.allTime })}</span><span>{t('Lately {n}%', { n: n.lately })}</span><span className={d >= 0 ? 'up' : 'down'}>{d >= 0 ? '▲' : '▼'} {Math.abs(d)}</span></div> : null}
      <div className="hc-row"><span>{t('Strength {n}', { n: Math.round(n.activity || 0) })}</span><span>{n.last ? t('last {when}', { when: ago(Math.round(n.last / 1000)) }) : t('no interaction yet')}</span></div>
      {n.tags?.length ? <div className="hc-tags">{n.tags.slice(0, 6).join(' · ')}</div> : null}
      {links.length ? <div className="hc-links">{links.map((l) => <span key={l.name}><i style={{ opacity: 0.25 + l.w * 0.75 }} />{l.name} {Math.round(l.w * 100)}%</span>)}</div> : null}
      {n.type === 'tag' && n.promote ? <div className="hc-note">{t('You keep coming back to this. It is about to become a kink.')}</div> : null}
    </div>
  );
}

function AiWidget({ nodeKey }) {
  const [text, setText] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = (fresh = false) => {
    setBusy(true);
    api(`/brain/insight/${nodeKey}${fresh ? '?fresh=1' : ''}`).then((r) => setText(r.text || r.error || t('The local model had nothing to say yet.'))).catch((e) => setText(e.message)).finally(() => setBusy(false));
  };
  useEffect(() => { setText(null); load(); }, [nodeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="bw ai wide">
      <div className="bw-h"><span>{t('What the assistant thinks')}</span><button type="button" className="linkbtn" onClick={() => load(true)} disabled={busy}>{busy ? t('thinking…') : t('refresh')}</button></div>
      {text ? <p className="aitext">{text}</p> : <p className="aitext dim"><span className="spinner inline" /> {t('Thinking about this…')}</p>}
    </div>
  );
}

function Detail({ nodeKey, brain, reload, onSelect, startEdit = false }) {
  const { setFilters, openMode, toast, refreshMeta, kinks: allKinks } = useApp();
  const node = brain.nodes.find((n) => n.key === nodeKey);
  const [d, setD] = useState(null);
  const [posts, setPosts] = useState([]);
  const [name, setName] = useState(node?.name || '');
  const [editing, setEditing] = useState(startEdit);
  const [combine, setCombine] = useState(false);
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
  // Always every tag of the kink, with its weight, so changing one never loses the others.
  const allTags = d?.kinkTags || full?.tags?.map((x) => ({ name: x.name, weight: x.weight ?? 1 })) || (node.tags || []).map((x) => ({ name: x, weight: 1 }));
  async function patch(body, msg) {
    try { await api(`/kinks/${node.id}`, { method: 'PATCH', body }); if (msg) toast(msg); await reload(); refreshMeta(); loadDetail(); } catch (e) { toast(e.message); }
  }
  const setTags = (list, msg) => patch({ tags: list }, msg);
  const addTag = (tag, msg) => { const v = tag.trim().toLowerCase(); if (!v || allTags.some((x) => x.name === v)) return; setTags([...allTags, { name: v, weight: 1 }], msg); };
  async function saveName() {
    const v = name.trim();
    setEditing(false);
    if (v && v !== node.name) await patch({ name: v }, t('Renamed.'));
  }
  async function combineWith(k) {
    setCombine(false);
    try { const r = await api(`/kinks/${node.id}/merge`, { method: 'POST', body: { into: k.id } }); toast(t('Combined into {name}, with every tag of both.', { name: k.name })); await reload(); refreshMeta(); onSelect(`k${r.id}`); } catch (err) { toast(err.message); }
  }
  const links = brain.edges.filter((e) => e.a === nodeKey || e.b === nodeKey).map((e) => ({ ...e, other: brain.nodes.find((x) => x.key === (e.a === nodeKey ? e.b : e.a)) })).filter((e) => e.other).sort((a, b) => b.w - a.w);
  const d7 = node.lately - node.allTime;
  const groups = brain.groups;
  const journey = (mode) => openMode('journey', { ...(node.type === 'fantasy' ? { fantasy: node.id } : { kink: node.id }), mode });
  const color = full?.color || node.color;
  return (
    <div className="braindetail" style={{ '--c': color }}>
      <div className="kback-wrap"><button type="button" className="kback" onClick={() => onSelect(null)}><Icon name="chevL" />{t('All kinks')}</button></div>
      <div className="bw head khead">
        <div className="ktitle">
          {kinkObj ? <ColorDot big color={color} onChange={(c) => patch({ color: c })} label={t('Colour')} /> : <span className="win-dot" style={{ '--c': node.color }} />}
          {kinkObj && editing ? (
            <form className="kname-form" onSubmit={(e) => { e.preventDefault(); saveName(); }}>
              <input className="kname" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label={t('Name')} />
              <button type="submit" className="ghost-btn small accent"><Icon name="check" />{t('Save')}</button>
              <button type="button" className="ghost-btn small" onClick={() => { setName(node.name); setEditing(false); }}>{t('Cancel')}</button>
            </form>
          ) : (
            <>
              <b className="kname static">{node.name}</b>
              {kinkObj ? <button type="button" className="icon-btn kedit" onClick={() => setEditing(true)} aria-label={t('Edit {name}', { name: node.name })} title={t('Rename')}><Icon name="edit" /></button> : null}
            </>
          )}
        </div>
        <span className="count ktype">{TYPE_LABEL[node.type]}{node.origin === 'tag' ? ` · ${t('grew from a tag you kept coming back to')}` : ''}{node.status === 'proposed' ? ` · ${t('suggested')}` : ''}</span>

        <div className="kacts">
          <button type="button" className="kact-main" onClick={() => setFilters(d?.filter || (node.type === 'tag' ? { tags: [node.name] } : node.type === 'fantasy' ? { fantasy: node.id } : { kink: node.id }))}><Icon name="eye" />{t('Show in feed')}</button>
          {node.type !== 'tag' ? (
            <div className="kact-explore">
              {node.type === 'fantasy' ? <button type="button" onClick={async () => { const fs = await api('/fantasies').then((r) => r.fantasies).catch(() => []); const f = fs.find((x) => x.id === node.id); if (f) openMode('deeper', { fantasy: deeperSpec(f) }); }}><Icon name="spark" /><span>{t('Go deeper')}</span></button> : null}
              <button type="button" onClick={() => journey('close')}><Icon name="route" /><span>{t('Dive deeper')}</span></button>
              <button type="button" onClick={() => journey('branch')}><Icon name="branch" /><span>{t('Branch out')}</span></button>
              <button type="button" onClick={() => journey('genre')}><Icon name="spark" /><span>{t('Something new near it')}</span></button>
            </div>
          ) : null}
          <div className="kact-manage">
            {node.type === 'tag' ? <button type="button" className="ghost-btn small accent" onClick={async () => { const r = await api(`/brain/promote/${node.id}`, { method: 'POST', body: {} }); toast(t('It is a kink now.')); await reload(); refreshMeta(); onSelect(`k${r.id}`); }}><Icon name="flame" />{t('Make it a kink')}</button> : null}
            {kinkObj?.status === 'proposed' ? <button type="button" className="ghost-btn small accent" onClick={() => patch({ status: 'active' }, t('Kept.'))}><Icon name="check" />{t('Keep')}</button> : null}
            {kinkObj ? <button type="button" className={`ghost-btn small${editing ? ' accent' : ''}`} onClick={() => setEditing((x) => !x)}><Icon name="edit" />{t('Edit')}</button> : null}
            {kinkObj ? <button type="button" className={`ghost-btn small${combine ? ' accent' : ''}`} onClick={() => setCombine((x) => !x)} aria-expanded={combine}><Icon name="grid" />{t('Combine')}</button> : null}
            {kinkObj ? <button type="button" className="ghost-btn small" onClick={() => patch({ status: 'hidden' }, t('Hidden. It stays hidden until you bring it back.'))}><Icon name="less" />{t('Hide')}</button> : null}
            {kinkObj ? <button type="button" className="ghost-btn small danger" onClick={async () => { await api(`/kinks/${node.id}`, { method: 'DELETE' }); toast(t("Removed. It won't come back by itself.")); onSelect(null); reload(); refreshMeta(); }}><Icon name="trash" />{t('Remove')}</button> : null}
            {node.type === 'fantasy' ? <button type="button" className="ghost-btn small danger" onClick={async () => { await api(`/fantasies/${node.id}`, { method: 'DELETE' }); onSelect(null); reload(); }}><Icon name="trash" />{t('Delete')}</button> : null}
          </div>
          {combine ? (
            <div className="kcombine">
              <p className="wnote">{t('Combine {name} into which kink? The one you pick stays, with every tag of both.', { name: node.name })}</p>
              <div className="chiprow">{allKinks.filter((k) => !k.isGroup && k.id !== node.id && k.status !== 'hidden').sort((a, b) => a.name.localeCompare(b.name)).map((k) => <button type="button" key={k.id} className="chip btn" style={{ '--c': k.color }} onClick={() => combineWith(k)}><span className="kc-dot" />{k.name}</button>)}</div>
            </div>
          ) : null}
        </div>

        {node.type === 'kink' ? (
          <div className="ktags">
            <div className="bw-h"><span>{t('Tags')}</span><span className="count">{allTags.length}</span></div>
            <div className="chiprow">
              {allTags.map((x) => <span key={x.name} className="chip ghost">{x.name}<button type="button" className="chipx" aria-label={t('Remove {tag}', { tag: x.name })} onClick={() => setTags(allTags.filter((y) => y.name !== x.name))}>×</button></span>)}
              <form onSubmit={(e) => { e.preventDefault(); if (tagIn.trim()) { addTag(tagIn, t('Tag added.')); setTagIn(''); } }}><input className="tagadd" value={tagIn} onChange={(e) => setTagIn(e.target.value)} placeholder={t('+ tag')} aria-label={t('Add tag')} /></form>
            </div>
            <div className="rowline wrapline kgroup"><span className="fb-label">{t('Group')}</span>
              <select value={node.group || ''} onChange={(e) => patch({ parentId: e.target.value ? Number(e.target.value) : null }, t('Moved.'))} aria-label={t('Group')}>
                <option value="">{t('No group')}</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.parentId ? `  ${groups.find((x) => x.id === g.parentId)?.name || ''} › ${g.name}` : g.name}</option>)}
              </select>
            </div>
            {d?.relatedTags?.length ? (
              <div className="kimprove">
                <div className="kimprove-h"><Icon name="spark" /><b>{t('Update tags to kink to improve')}</b></div>
                <p className="wnote">{t('These often come with it in your posts. Tap one to add it to {name}, so the feed finds more of it.', { name: node.name })}</p>
                <div className="chiprow">{d.relatedTags.map((tag) => <button type="button" key={tag} className="chip btn" onClick={() => addTag(tag, t('Added {tag}.', { tag }))} title={t('Add to this kink')}>+ {tag}</button>)}</div>
              </div>
            ) : null}
          </div>
        ) : node.type === 'tag' && d?.relatedTags?.length ? (
          <div className="ktags"><div className="bw-h"><span>{t('Often comes with')}</span></div><div className="chiprow">{d.relatedTags.map((x) => <button type="button" key={x} className="chip btn" onClick={() => setFilters({ tags: [node.name, x] })}>{x}</button>)}</div></div>
        ) : null}
      </div>

      <div className="bwgrid kgridw">
        {kinkObj ? (
          <div className="bw wide">
            <div className="bw-h"><span>{t('Why this is a kink')}</span></div>
            <p className="aitext small">{full?.evidence ? evidenceLine(full.evidence) : full?.origin === 'user' ? t('You made this one yourself.') : t('Not enough clear likes behind it yet.')}</p>
            {edited ? (
              <div className="rowline wrapline">
                <span className="wnote">{t('You changed {what} by hand, so that stays as you set it.', { what: Object.keys(full.locks || {}).filter((x) => full.locks[x]).map((x) => ({ name: t('the name'), tags: t('the tags'), parent: t('the group'), color: t('the colour'), status: t('whether it shows') }[x])).filter(Boolean).join(', ') || t('this') })}</span>
                <button type="button" className="linkbtn" onClick={async () => { try { await api(`/kinks/${node.id}/unlock`, { method: 'POST', body: {} }); toast(t('It updates by itself again.')); await reload(); refreshMeta(); loadDetail(); } catch (e) { toast(e.message); } }}>{t('Let it update by itself again')}</button>
              </div>
            ) : <p className="wnote">{t('It updates by itself: tags join as you like them, and it fades if you stop.')}</p>}
          </div>
        ) : null}
        <AiWidget nodeKey={nodeKey} />
        <div className="bw half">
          <div className="bw-h"><span>{t('This week vs before')}</span></div>
          <div className="bars">
            <div className="barrow"><div className="bt"><span>{t('All time')}</span><em>{node.allTime}%</em></div><div className="track2"><i style={{ width: `${node.allTime}%`, background: rgba(node.color, 0.5) }} /></div></div>
            <div className="barrow"><div className="bt"><span>{t('Lately')}</span><em className={d7 >= 0 ? 'up' : 'down'}>{node.lately}% ({d7 >= 0 ? '+' : ''}{d7})</em></div><div className="track2"><i style={{ width: `${node.lately}%`, background: node.color }} /></div></div>
            {node.now !== undefined ? <div className="barrow"><div className="bt"><span>{t('Right now')}</span><em>{node.now}%</em></div><div className="track2"><i style={{ width: `${node.now}%`, background: 'var(--flame)' }} /></div></div> : null}
          </div>
          {d ? <p className="wnote">{tn(d.week, '{n} post this week, {before} a week before that.', '{n} posts this week, {before} a week before that.', { before: d.perWeekBefore })} {Object.entries(d.counts || {}).filter(([ev]) => ev !== 'impression').map(([ev, c]) => `${c} ${EVENT_LABEL[ev] || ev}`).slice(0, 5).join(', ')}</p> : null}
        </div>
        <div className="bw half">
          <div className="bw-h"><span>{t('Linked with')}</span><span className="count">{links.length}</span></div>
          <div className="linklist">
            {links.slice(0, 10).map((l) => (
              <button type="button" key={l.other.key} className="linkrow" onClick={() => onSelect(l.other.key)} title={l.why || (l.together ? tn(l.together, '{n} shared interaction', '{n} shared interactions') : '')}>
                <span className="win-dot" style={{ '--c': l.other.color }} /><span className="ln">{l.other.name}</span>
                <span className="lbar"><i style={{ width: `${Math.round(l.w * 100)}%`, opacity: 0.35 + l.w * 0.65 }} /></span><em>{Math.round(l.w * 100)}%</em>
              </button>
            ))}
            {!links.length ? <p className="wnote">{t('No links yet. They grow as you like posts that carry both.')}</p> : null}
          </div>
          {node.type === 'kink' ? (
            <select value="" onChange={async (e) => { const v = e.target.value; if (!v) return; await api('/kinks/links', { method: 'POST', body: { a: node.id, b: Number(v) } }); reload(); }} aria-label={t('Link with another kink')}>
              <option value="">{t('+ link with…')}</option>
              {kinks.filter((k) => k.id !== node.id && !links.some((l) => l.other.key === k.key)).map((k) => <option key={k.key} value={k.id}>{k.name}</option>)}
            </select>
          ) : null}
        </div>
        <div className="bw wide">
          <div className="bw-h"><span>{t('Best matches')}</span></div>
          <div className="postrow">
            {posts.map((it) => <button type="button" key={it.id} className="postcard" onClick={() => setFilters(d?.filter || {}, { focus: it.id })} title={it.title}><Thumb media={it.media} /><span>{it.title}</span></button>)}
            {!posts.length ? <p className="wnote">{t('Loading…')}</p> : null}
          </div>
        </div>
        <div className="bw wide">
          <div className="bw-h"><span>{t('Recent interactions with this')}</span></div>
          <div className="evlist">
            {(d?.recent || []).slice(0, 12).map((r) => (
              <button type="button" key={r.item_id} className="evrow evpost" onClick={() => setFilters({}, { focus: r.item_id })} title={t('Open: {title}', { title: r.title || '' })}>
                <span className="evthumb"><Thumb media={r.media} /></span>
                <span className="evtitle">{r.title || t('Post {id}', { id: r.item_id })}</span>
                <span className="evchips">{r.events.filter((e) => e.type !== 'dwell' || e.value >= 6000).slice(0, 4).map((e) => <span key={e.type} className={`evtype t-${e.type}`}>{EVENT_LABEL[e.type] || e.type}{e.type === 'dwell' ? ` ${secs(e.value)}` : e.type === 'rate' ? ` ${e.value}` : e.n > 1 ? ` ${e.n}×` : ''}</span>)}</span>
                <em>{ago(Math.round(r.ts / 1000))}</em>
              </button>
            ))}
            {d && !d.recent?.length ? <p className="wnote">{t('Nothing yet.')}</p> : null}
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
        <div className="bw-h"><span>{t('New fantasy')}</span></div>
        <input className="kname" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Name it')} aria-label={t('Fantasy name')} />
        <textarea className="kdesc" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t('Describe the scenario')} />
        <div className="chiprow">{kinks.map((k) => <button type="button" key={k.key} className={`chip btn${sel.has(k.id) ? ' on' : ''}`} onClick={() => setSel((cur) => { const n = new Set(cur); if (n.has(k.id)) n.delete(k.id); else n.add(k.id); return n; })}>{k.name}</button>)}</div>
        <div className="wbtns">
          <button type="button" className="ghost-btn small accent" onClick={async () => { if (!name.trim() || !sel.size) { toast(t('Name it and pick at least one kink.')); return; } await api('/fantasies', { method: 'POST', body: { name: name.trim(), description: desc, kinks: [...sel], saved: 1 } }); toast(t('Fantasy added to your map.')); await reload(); onDone(); }}><Icon name="check" />{t('Save')}</button>
          <button type="button" className="ghost-btn small" onClick={onDone}><Icon name="x" />{t('Cancel')}</button>
        </div>
      </div>
    </div>
  );
}

export default function MapView() {
  const { setFilters, toast, refreshMeta } = useApp();
  const [brain, setBrain] = useState(null);
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  const [editSel, setEditSel] = useState(false);
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

  function select(key, { edit = false } = {}) {
    setSel(key);
    setEditSel(edit);
    setNewFantasy(false);
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  // A kink that faded is brought back when you open it: opening it says you still care.
  async function openKink(k, how = {}) {
    if (k.status === 'hidden') {
      try { await api(`/kinks/${k.id}`, { method: 'PATCH', body: { status: 'active' } }); toast(t('{name} is back and stays.', { name: k.name })); await load(); refreshMeta(); } catch (e) { toast(e.message); return; }
    }
    select(`k${k.id}`, how);
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
          <h2>{t('Your map')}</h2>
          <p>{t('Everything the assistant knows about your taste, live. Kinks are the bright circles, sized by how much you are into them; kinks of the same family share a colour. Hollow dots are things you are clearly into that are almost a kink. Gold diamonds are fantasies. Lines get stronger every time you enjoy things together. Hover for details, click a circle or a kink below for everything about it, drag to rearrange.')}</p>
        </div>
        <div className="wbtns">
          <button type="button" className="ghost-btn" onClick={() => run('find', async () => { const r = await api('/kinks/refresh', { method: 'POST', body: {} }); const parts = [r.created?.length ? t('new: {list}', { list: r.created.join(', ') }) : null, r.back?.length ? t('back: {list}', { list: r.back.join(', ') }) : null, r.faded?.length ? t('faded: {list}', { list: r.faded.join(', ') }) : null, r.merged?.length ? t('combined {n}', { n: r.merged.length }) : null].filter(Boolean); toast(parts.length ? t('Kinks updated. {changes}.', { changes: parts.join(' · ') }) : t('Kinks are up to date.')); await load(); refreshMeta(); })} disabled={!!busy}>{busy === 'find' ? t('Updating') : t('Update kinks now')}</button>
          <button type="button" className="ghost-btn" onClick={() => { setSel(null); setNewFantasy(true); }}>{t('New fantasy')}</button>
        </div>
      </div>
      <div className="braintools">
        <div className="seg">{[['all', t('All time')], ['week', t('This week')]].map(([k, l]) => <button key={k} type="button" className={view.sizeBy === k ? 'on' : ''} onClick={() => setView((v) => ({ ...v, sizeBy: k }))}>{l}</button>)}</div>
        <button type="button" className={`chip btn${view.showTags ? ' on' : ''}`} onClick={() => setView((v) => ({ ...v, showTags: !v.showTags }))}>{t('Hot tags')}</button>
        <button type="button" className={`chip btn${view.showFantasies ? ' on' : ''}`} onClick={() => setView((v) => ({ ...v, showFantasies: !v.showFantasies }))}>{t('Fantasies')}</button>
        <button type="button" className={`chip btn${view.labelsAll ? ' on' : ''}`} onClick={() => setView((v) => ({ ...v, labelsAll: !v.labelsAll }))}>{t('All labels')}</button>
        <button type="button" className={`chip btn${view.allLinks ? ' on' : ''}`} onClick={() => setView((v) => ({ ...v, allLinks: !v.allLinks }))} title={t('Show more links per kink')}>{t('More links')}</button>
        <select value={view.focusGroup || ''} onChange={(e) => setView((v) => ({ ...v, focusGroup: e.target.value ? Number(e.target.value) : null }))} aria-label={t('Focus on a family')}>
          <option value="">{t('All families')}</option>
          {(brain?.groups || []).map((g) => <option key={g.id} value={g.id}>{g.parentId ? `› ${g.name}` : g.name}</option>)}
        </select>
        <label className="ctl" htmlFor="minLink"><span className="fb-label" style={{ minWidth: 0 }}>{t('Links')}</span><input type="range" id="minLink" min="0" max="0.8" step="0.05" value={view.minLink} onChange={(e) => setView((v) => ({ ...v, minLink: Number(e.target.value) }))} /></label>
        <div className="brainfind">
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder={t('Find…')} aria-label={t('Find on map')} />
          {matches.length ? <div className="findpop">{matches.map((m) => <button type="button" key={m.key} onClick={() => { select(m.key); setFind(''); }}>{m.name}<em>{TYPE_LABEL[m.type]}</em></button>)}</div> : null}
        </div>
      </div>
      <div className="brainwrap">
        {brain ? <BrainCanvas data={brain} view={view} selected={sel} onSelect={select} onHover={setHover} height={680} /> : <div className="brainbox loadingbox"><span className="spinner inline" /> {t('Loading your map…')}</div>}
        {brain ? <HoverCard hover={hover} brain={brain} /> : null}
        {counts ? <div className="brainlegend"><span><i className="lg kink" />{tn(counts.kinks, '{n} kink', '{n} kinks')}</span><span><i className="lg tag" />{tn(counts.tags, '{n} hot tag', '{n} hot tags')}</span><span><i className="lg fant" />{tn(counts.fantasies, '{n} fantasy', '{n} fantasies')}</span><span><i className="lg link" />{tn(counts.links, '{n} link', '{n} links')}</span><span><i className="lg pulse" />{t('recent activity')}</span></div> : null}
      </div>
      <div ref={detailRef} className="detailwrap">
        {sel && brain ? <Detail key={sel} nodeKey={sel} brain={brain} reload={load} onSelect={select} startEdit={editSel} /> : null}
        {newFantasy && brain ? <FantasyEditor brain={brain} reload={load} onDone={() => setNewFantasy(false)} /> : null}
        {!sel && !newFantasy ? <KinkBoard onOpen={openKink} onChange={async () => { await load(); refreshMeta(); }} /> : null}
      </div>
      <div className="map-grid">
        <div className="card2">
          <h3>{t('Lately vs all time')}</h3>
          <div className="bars">
            {kinks.length ? kinks.slice(0, 10).map((k) => { const d = k.lately - k.allTime; return (
              <div className="barrow" key={k.id} onClick={() => select(`k${k.id}`)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') select(`k${k.id}`); }}>
                <div className="bt"><span>{k.name}{k.status === 'proposed' ? ` (${t('suggested')})` : ''}</span><em className={d >= 0 ? 'up' : 'down'}>{d >= 0 ? '+' : ''}{d}</em></div>
                <div className="duo"><div className="track2"><i style={{ width: `${k.allTime}%`, background: rgba(k.color, 0.45) }} /></div><div className="track2"><i style={{ width: `${k.lately}%`, background: k.color }} /></div></div>
              </div>
            ); }) : <p className="wnote">{t("No kinks yet. They appear once you've given heat to, liked or saved a few posts, or add your own below.")}</p>}
          </div>
        </div>
        <div className="card2">
          <h3>{t('Pairs that work for you')}</h3>
          <div className="bars">
            {data?.pairs?.length ? data.pairs.map((p) => (
              <div className="barrow" key={`${p.a.id}-${p.b.id}`}>
                <div className="bt"><span>{p.a.name} × {p.b.name}</span><span className="rowline"><em>{p.score}%</em><button type="button" className="chip btn" onClick={() => setFilters({ pair: [p.a.id, p.b.id] })}>{t('Open')}</button></span></div>
                <div className="track2"><i style={{ width: `${p.score}%`, background: `linear-gradient(90deg, ${p.a.color}, ${p.b.color})` }} /></div>
              </div>
            )) : <p className="wnote">{t('Pairs show up when two kinks keep appearing together in posts you love.')}</p>}
          </div>
        </div>
        <div className="card2">
          <h3>{t('Formats')}</h3>
          <div className="bars">
            {data?.formats?.map((f) => (
              <div className="barrow" key={f.format}>
                <div className="bt"><span>{FORMATS[f.format]}</span><em>{t('{all}% · lately {lately}%', { all: f.allTime, lately: f.lately })}</em></div>
                <div className="duo"><div className="track2"><i style={{ width: `${f.allTime}%`, background: 'rgba(227,154,131,.45)' }} /></div><div className="track2"><i style={{ width: `${f.lately}%`, background: '#E39A83' }} /></div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card2">
          <h3>{t('Strongest tags')}</h3>
          <div className="tagcloud">
            {data?.tags?.length ? data.tags.map((t) => <button type="button" key={t.id} style={{ fontSize: `${Math.round(11 + Math.min(11, Math.max(0, t.long) * 5))}px`, color: t.long < 0 ? '#E07070' : undefined }} onClick={() => setFilters({ tags: [t.name] })}>{t.name}</button>) : <p className="wnote">{t('Nothing yet.')}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
