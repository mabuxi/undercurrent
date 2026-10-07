import { useEffect, useRef, useState } from 'react';
import { ago, api } from '../api.js';
import { useApp } from '../context.jsx';
import { Icon } from '../icons.jsx';
import { t, tn } from '../i18n.js';
import HistoryDb from './History.jsx';

// Each memory category gets its own colour and icon, so the page reads at a glance.
const CAT_META = {
  'Right now': { icon: 'pulse', color: '#7FD0C2', hint: t('Moods and cravings for these days') },
  'Kinks and interests': { icon: 'flame', color: '#F2894E', hint: t('What turns you on') },
  Fantasies: { icon: 'spark', color: '#F6C35B', hint: t('Scenarios you think about') },
  'Turn-offs and limits': { icon: 'less', color: '#E07070', hint: t('What you never want to see') },
  'Formats and moods': { icon: 'video', color: '#B79BF0', hint: t('Videos, stories, length, pace') },
  'Creators and communities': { icon: 'person', color: '#8EA6C9', hint: t('People and places you follow') },
  Notes: { icon: 'book', color: '#B6A8B0', hint: t('Anything else') }
};
const metaOf = (c) => CAT_META[c] || { icon: 'edit', color: '#81737B', hint: '' };

function MemoryItem({ m, categories, onChange, showCat = false }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(m.content);
  const [cat, setCat] = useState(m.category);
  async function patch(body) { await api(`/memory/${m.id}`, { method: 'PATCH', body }); onChange(); }
  async function remove() { await api(`/memory/${m.id}`, { method: 'DELETE' }); onChange(); }
  return (
    <div className={`memitem${m.status === 'proposed' ? ' proposed' : ''}`}>
      {edit ? (
        <form className="memedit" onSubmit={async (e) => { e.preventDefault(); if (!text.trim()) return; await patch({ content: text.trim(), category: cat }); setEdit(false); }}>
          <textarea id={`mem-${m.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={2} aria-label={t('Memory text')} />
          <div className="rowline">
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t('Category')}>{categories.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select>
            <button type="submit" className="ghost-btn small accent"><Icon name="check" />{t('Save')}</button>
            <button type="button" className="ghost-btn small" onClick={() => { setEdit(false); setText(m.content); }}><Icon name="x" />{t('Cancel')}</button>
          </div>
        </form>
      ) : (
        <>
          <div className="memtext">
            {showCat ? <span className="memcat" style={{ '--c': metaOf(m.category).color }}><Icon name={metaOf(m.category).icon} />{t(m.category)}</span> : null}
            {m.status === 'proposed' && !showCat ? <span className="sugg">{t('Suggested')}</span> : null}
            {m.status === 'recheck' ? <span className="sugg ask">{t('Still true?')}</span> : null}
            {m.pinned ? <span className="sugg pin">{t('Pinned')}</span> : null}
            <p>{m.content}</p>
            {m.evidence ? <span className="wnote">{t('Because: {evidence}', { evidence: m.evidence })}</span> : null}
          </div>
          <div className="memacts">
            {m.status === 'proposed' ? (
              <>
                <button type="button" className="ghost-btn small accent" onClick={() => patch({ status: 'active' })}><Icon name="check" />{t('Keep')}</button>
                <button type="button" className="ghost-btn small" onClick={remove}><Icon name="less" />{t('Not right')}</button>
              </>
            ) : m.status === 'recheck' ? (
              <>
                <button type="button" className="ghost-btn small accent" onClick={() => patch({ status: 'active' })}><Icon name="check" />{t('Still true')}</button>
                <button type="button" className="ghost-btn small" onClick={() => patch({ status: 'archived' })}><Icon name="x" />{t('Not anymore')}</button>
              </>
            ) : null}
            <button type="button" className="icon-btn" onClick={() => patch({ pinned: !m.pinned })} aria-label={m.pinned ? t('Unpin') : t('Pin')} title={m.pinned ? t('Unpin') : t('Pin')}><Icon name="pin" /></button>
            <button type="button" className="icon-btn" onClick={() => setEdit(true)} aria-label={t('Edit')} title={t('Edit')}><Icon name="edit" /></button>
            <button type="button" className="icon-btn" onClick={remove} aria-label={t('Delete')} title={t('Delete')}><Icon name="trash" /></button>
          </div>
        </>
      )}
    </div>
  );
}

const kindCount = (k, n) => (k === 'down' ? tn(n, '{n} thumbs down', '{n} thumbs down [many]') : k === 'block' ? tn(n, '{n} block', '{n} blocks') : tn(n, '{n} hide', '{n} hides'));

// What you probably did not like: only from the closer looks after you hid, disliked or blocked something, and only
// what still counts against posts (not what you like or feel neutral about now).
function DislikedBlock() {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const load = () => api('/memory/disliked').then(setD).catch(() => setD({ tags: [], blocked: [] }));
  useEffect(() => { load(); }, []);
  async function forgive(tag) {
    setD((cur) => ({ ...cur, tags: cur.tags.filter((x) => x.tag !== tag) }));
    try { await api(`/memory/disliked/${encodeURIComponent(tag)}`, { method: 'DELETE' }); toast(t('{tag} no longer counts against posts.', { tag })); } catch (e) { toast(e.message); }
  }
  async function verify(tag, ok) {
    setD((cur) => ({ ...cur, verify: cur.verify.filter((x) => x.tag !== tag) }));
    try { await api(`/memory/verify/${encodeURIComponent(tag)}`, { method: 'POST', body: { ok } }); if (ok) load(); toast(ok ? t('{tag} now counts against posts.', { tag }) : t('{tag} dropped.', { tag })); } catch (e) { toast(e.message); }
  }
  async function unblock(b) {
    setD((cur) => ({ ...cur, blocked: cur.blocked.filter((x) => x.id !== b.id) }));
    try { await api(`/creators/blocked/${b.id}`, { method: 'DELETE' }); toast(t('{name} is unblocked.', { name: b.name })); } catch (e) { toast(e.message); }
  }
  return (
    <div className="disblock">
      <div className="disblock-h"><span className="fb-label"><Icon name="less" />{t('Did not like')}</span><span className="count">{(d?.tags?.length || 0) + (d?.verify?.length ? ` · ${tn(d.verify.length, '{n} to verify', '{n} to verify [many]')}` : '')}</span></div>
      <div className="disblock-b">
        <p className="wnote">{t('What you said you did not like when you hid, disliked or blocked something. Only what still counts against posts shows here; tap × to take it back.')}</p>
        {d === null ? <p className="wnote">{t('Loading…')}</p> : d.tags.length ? (
          <div className="dislist">
            {d.tags.map((x) => (
              <span key={x.tag} className="dchip big" title={Object.entries(x.kinds).map(([k, n]) => kindCount(k, n)).join(', ')}>
                {x.tag}<em>{Object.entries(x.kinds).map(([k, n]) => kindCount(k, n)).join(' · ')}</em>
                <button type="button" onClick={() => forgive(x.tag)} aria-label={t('That was not it: {tag}', { tag: x.tag })} title={t('That is fine')}><Icon name="x" /></button>
              </span>
            ))}
          </div>
        ) : <p className="wnote">{t('Nothing yet. When you hide, dislike or block something, what you probably did not like shows up here.')}</p>}
        {d?.verify?.length ? (
          <div className="verifylist">
            <span className="fb-label">{t('To verify')}</span>
            <p className="wnote">{t('Guesses from the bigger model after you hid or blocked something without saying why. They do not count until you confirm them.')}</p>
            <div className="dislist">
              {d.verify.map((x) => (
                <span key={x.tag} className="dchip big guess"><Icon name="why" />{x.tag}<em>{Object.entries(x.kinds).map(([k, n]) => kindCount(k, n)).join(' · ')}</em>
                  <button type="button" onClick={() => verify(x.tag, true)} aria-label={t('Yes, that was it: {tag}', { tag: x.tag })} title={t('Yes, that was it')}><Icon name="check" /></button>
                  <button type="button" onClick={() => verify(x.tag, false)} aria-label={t('That was not it: {tag}', { tag: x.tag })} title={t('That was not it')}><Icon name="x" /></button>
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {d?.blocked?.length ? (
          <div className="blocklist">
            <span className="fb-label">{t('Blocked creators')}</span>
            {d.blocked.map((b) => (
              <div key={b.id} className="blockrow">
                <Icon name="block" /><strong>{b.name}</strong><span className="mini-meta">{b.kind === 'performer' ? t('performer, every source') : b.source} · {ago(Math.round((b.ts || 0) / 1000))}</span>
                <button type="button" className="ghost-btn small" onClick={() => unblock(b)}><Icon name="refresh" />{t('Unblock')}</button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const KIND_LABEL = { search: t('search'), question: t('question'), command: t('command'), feedback: t('post feedback'), memory: t('saved to memory') };

function PromptLog() {
  const { toast } = useApp();
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const load = () => api('/prompts?limit=300').then((r) => setList(r.prompts)).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const shown = (list || []).filter((p) => !q || p.text.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="card2 memsec" id="mem-log">
      <h3><span className="secic" style={{ '--c': '#8EA6C9' }}><Icon name="thread" /></span>{t('Prompt log')} <span className="count">{list?.length || 0}</span></h3>
      <p className="wnote">{t('Everything you typed to the assistant. Searches, questions and feedback on posts stay here and are not memory; only things you say about your taste are saved to memory.')}</p>
      <div className="rowline wrapline">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search the log')} aria-label={t('Search the prompt log')} style={{ flex: 2 }} />
        <button type="button" className="ghost-btn small" onClick={async () => { await api('/prompts/all', { method: 'DELETE' }); load(); toast(t('Prompt log cleared.')); }} disabled={!list?.length}><Icon name="trash" />{t('Clear log')}</button>
      </div>
      <div className="promptlog">
        {shown.slice(0, 150).map((p) => (
          <div key={p.id} className="prow">
            <span className={`evtype t-${p.kind === 'memory' ? 'save' : p.kind === 'search' ? 'dwell' : 'open'}`}>{KIND_LABEL[p.kind] || p.kind}</span>
            <div className="ptxt"><strong>{p.text}</strong>{p.result ? <span className="mini-meta">{p.result}</span> : null}</div>
            <em>{ago(Math.round(p.ts / 1000))}</em>
            <button type="button" className="icon-btn" aria-label={t('Delete from log')} onClick={async () => { await api(`/prompts/${p.id}`, { method: 'DELETE' }); setList((cur) => cur.filter((x) => x.id !== p.id)); }}><Icon name="trash" /></button>
          </div>
        ))}
        {list && !shown.length ? <p className="wnote">{t('Nothing yet.')}</p> : null}
      </div>
    </div>
  );
}

function FantasyIdeas({ onSaved }) {
  const { toast } = useApp();
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api('/suggestions?kind=fantasy').then((r) => setList(r.suggestions)).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const act = async (sg, action) => {
    await api(`/suggestions/${sg.id}`, { method: 'POST', body: { action } });
    setList((cur) => cur.filter((x) => x.id !== sg.id));
    if (action === 'save') { toast(t('Saved to your fantasies.')); onSaved(); }
  };
  return (
    <div className="card2">
      <h3><span className="secic" style={{ '--c': '#F6C35B' }}><Icon name="why" /></span>{t("Fantasies the assistant thinks you'd like")} <span className="count">{list?.length || 0}</span></h3>
      <p className="wnote">{t('Written from what you liked, heated and saved: up to four ideas it is at least 75% sure about, and a new set every two sessions.')}</p>
      {list?.length ? (
        <div className="fantgrid">
          {list.map((sg) => (
            <div className="fantcard idea" key={sg.id}>
              <div className="fc-head"><strong>{sg.title}</strong><span className="fc-pct">{sg.confidence}%</span></div>
              <span className="wtext">{sg.body}</span>
              <span className="mini-meta">{(sg.data.kinks || []).map((k) => k.name).concat(sg.data.tags || []).join(' · ')}{sg.data.why ? ` · ${sg.data.why}` : ''}</span>
              <div className="memacts">
                <button type="button" className="ghost-btn small accent" onClick={() => act(sg, 'save')}><Icon name="check" />{t('Save')}</button>
                <button type="button" className="ghost-btn small" onClick={() => act(sg, 'dismiss')}><Icon name="less" />{t('Not for me')}</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {list && !list.length ? <p className="wnote">{t('No ideas yet. They come as you like, heat and save posts.')}</p> : null}
      <div className="wbtns"><button type="button" className="ghost-btn small" disabled={busy} onClick={async () => { setBusy(true); try { await api('/suggestions/refresh', { method: 'POST', body: { kind: 'fantasy' } }); toast(t('Thinking about new fantasies in the background. They show up here in a minute or two.')); setTimeout(load, 60000); } finally { setBusy(false); } }}><Icon name="why" />{t('Suggest fantasies now')}</button></div>
    </div>
  );
}

export default function MemoryView() {
  const { toast, refreshMeta, kinks, fantasies, openMode } = useApp();
  const [mem, setMem] = useState(null);
  const [text, setText] = useState('');
  const [cat, setCat] = useState('Kinks and interests');
  const [busy, setBusy] = useState(false);
  const [newFant, setNewFant] = useState({ name: '', description: '', kinks: [] });
  const formRef = useRef(null);

  const load = () => api('/memory').then(setMem).catch((e) => toast(e.message));
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    if (!text.trim()) { toast(t('Write something to remember first.')); return; }
    await api('/memory', { method: 'POST', body: { content: text.trim(), category: cat } });
    setText('');
    load();
  }

  async function reflect() {
    setBusy(true);
    try {
      const r = await api('/memory/reflect', { method: 'POST', body: {} });
      toast(r.proposed ? tn(r.proposed, '{n} suggestion to review.', '{n} suggestions to review.') : t('Nothing new to suggest yet.'));
      load();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  const groups = mem?.groups || [];
  const proposed = groups.flatMap((g) => g.items.filter((m) => m.status === 'proposed' || m.status === 'recheck'));
  const kept = groups.map((g) => ({ ...g, items: g.items.filter((m) => m.status !== 'proposed' && m.status !== 'recheck').sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) }));
  // Turn-offs and limits always shows: what you did not like lives in it too.
  const filled = kept.filter((g) => g.items.length || g.category === 'Turn-offs and limits');
  const empty = kept.filter((g) => !g.items.length && g.category !== 'Turn-offs and limits');
  const total = kept.reduce((a, g) => a + g.items.length, 0);
  const pinned = kept.reduce((a, g) => a + g.items.filter((m) => m.pinned).length, 0);
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const addTo = (c) => { setCat(c); formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => document.getElementById('newMem')?.focus({ preventScroll: true }), 350); };
  const nav = [
    proposed.length ? { id: 'mem-review', icon: 'check', label: t('To review'), n: proposed.length, hot: true } : null,
    { id: 'mem-about', icon: 'brain', label: t('About you'), n: total },
    { id: 'mem-fant', icon: 'spark', label: t('Fantasies'), n: fantasies.length },
    { id: 'mem-disliked', icon: 'less', label: t('Turn-offs and limits') },
    { id: 'mem-history', icon: 'clock', label: t('Everything you did') },
    { id: 'mem-log', icon: 'thread', label: t('Prompt log') }
  ].filter(Boolean);

  return (
    <section className="center memview" style={{ paddingTop: 0 }}>
      <div className="jhead">
        <div><h2>{t('Memory')}</h2><p>{t("What the assistant knows about you, in your words and its own. Everything here is editable, and it's used for asking, tagging and recommendations. It never leaves this computer.")}</p></div>
        <button type="button" className="ghost-btn accent" onClick={reflect} disabled={busy}>{busy ? <><span className="spin" />{t('Thinking')}</> : <><Icon name="why" />{t('Suggest new memories')}</>}</button>
      </div>

      <div className="memtiles">
        <button type="button" className="memtile" onClick={() => go('mem-about')} style={{ '--c': '#E39A83' }}><Icon name="brain" /><b>{total}</b><span>{tn(total, 'memory', 'memories')}</span></button>
        <button type="button" className={`memtile${proposed.length ? ' hot' : ''}`} onClick={() => go(proposed.length ? 'mem-review' : 'mem-about')} style={{ '--c': '#F6C35B' }}><Icon name="check" /><b>{proposed.length}</b><span>{t('to review')}</span></button>
        <button type="button" className="memtile" onClick={() => go('mem-about')} style={{ '--c': '#7FD0C2' }}><Icon name="pin" /><b>{pinned}</b><span>{t('pinned')}</span></button>
        <button type="button" className="memtile" onClick={() => go('mem-fant')} style={{ '--c': '#B79BF0' }}><Icon name="spark" /><b>{fantasies.length}</b><span>{tn(fantasies.length, 'fantasy', 'fantasies')}</span></button>
      </div>

      <nav className="memnav" aria-label={t('Memory sections')}>
        {nav.map((n) => <button type="button" key={n.id} className={`memnav-b${n.hot ? ' hot' : ''}`} onClick={() => go(n.id)}><Icon name={n.icon} />{n.label}{n.n != null ? <em>{n.n}</em> : null}</button>)}
      </nav>

      {proposed.length ? (
        <div className="card2 memsec review" id="mem-review">
          <h3><span className="secic" style={{ '--c': '#F6C35B' }}><Icon name="check" /></span>{t('To review')} <span className="count">{tn(proposed.length, '{n} suggestion', '{n} suggestions')}</span></h3>
          <p className="wnote">{t('The assistant noticed these from what you did, and asks again about older ones that may have changed. Keep what is right, drop what is not.')}</p>
          <div className="memlist">{proposed.map((m) => <MemoryItem key={m.id} m={m} categories={mem.categories} onChange={load} showCat />)}</div>
        </div>
      ) : null}

      <form className="card2 addmem" onSubmit={add} ref={formRef}>
        <h3><span className="secic" style={{ '--c': metaOf(cat).color }}><Icon name="plus" /></span>{t('Remember something')}</h3>
        <div className="catpick" role="radiogroup" aria-label={t('Category')}>
          {(mem?.categories || []).map((c) => (
            <button type="button" key={c} role="radio" aria-checked={cat === c} className={`catchip${cat === c ? ' on' : ''}`} style={{ '--c': metaOf(c).color }} onClick={() => setCat(c)}><Icon name={metaOf(c).icon} />{t(c)}</button>
          ))}
        </div>
        <textarea id="newMem" value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={t('I like slow builds more than anything fast. Never show me …')} aria-label={t('New memory')} />
        <div className="rowline">
          <span className="wnote">{metaOf(cat).hint}</span>
          <button type="submit" className="ghost-btn small accent" style={{ marginLeft: 'auto' }}><Icon name="brain" />{t('Remember')}</button>
        </div>
      </form>

      <div className="memsec" id="mem-about">
        <div className="sechead"><h3><span className="secic" style={{ '--c': '#E39A83' }}><Icon name="brain" /></span>{t('About you')}</h3><span className="count">{tn(total, '{n} memory', '{n} memories')}</span></div>
        {mem === null ? <p className="wnote">{t('Loading…')}</p> : null}
        <div className="catgrid">
          {filled.map((g) => {
            const meta = metaOf(g.category);
            const lim = g.category === 'Turn-offs and limits';
            return (
              <div className={`card2 catcard${lim ? ' limits' : ''}`} key={g.category} id={lim ? 'mem-disliked' : undefined} style={{ '--c': meta.color }}>
                <div className="catcard-h">
                  <span className="catic"><Icon name={meta.icon} /></span>
                  <div><h3>{t(g.category)}</h3><span className="mini-meta">{meta.hint}</span></div>
                  <span className="catn">{g.items.length}</span>
                  <button type="button" className="icon-btn" onClick={() => addTo(g.category)} aria-label={t('Add to {name}', { name: t(g.category) })} title={t('Add to {name}', { name: t(g.category) })}><Icon name="plus" /></button>
                </div>
                {g.items.length ? <div className="memlist scrolly">{g.items.map((m) => <MemoryItem key={m.id} m={m} categories={mem.categories} onChange={load} />)}</div> : null}
                {lim ? <DislikedBlock /> : null}
              </div>
            );
          })}
        </div>
        {empty.length ? (
          <div className="catempty">
            <span className="wnote">{t('Nothing yet in:')}</span>
            {empty.map((g) => <button type="button" key={g.category} className="catchip" style={{ '--c': metaOf(g.category).color }} onClick={() => addTo(g.category)}><Icon name={metaOf(g.category).icon} />{t(g.category)}<Icon name="plus" /></button>)}
          </div>
        ) : null}
      </div>

      <div className="card2 kinkslink">
        <span className="catic" style={{ '--c': '#F2894E' }}><Icon name="map" /></span>
        <div><h3>{t('Kinks')}</h3><p className="wnote">{t('Your kinks and their groups live in Your map now: see them all, open one for everything about it, rename, regroup, combine or remove them there.')}</p></div>
        <button type="button" className="ghost-btn small accent" onClick={() => openMode('map')}><Icon name="map" />{t('Open your kinks')}</button>
      </div>

      <div className="memsec" id="mem-fant">
        <div className="sechead"><h3><span className="secic" style={{ '--c': '#F6C35B' }}><Icon name="spark" /></span>{t('Fantasies')}</h3><span className="count">{fantasies.length}</span></div>
        <FantasyIdeas onSaved={refreshMeta} />
        <div className="card2">
          <h3>{t('Your fantasies')} <span className="count">{fantasies.length}</span></h3>
          <p className="wnote">{t('Fantasies are bigger than kinks: a scenario that ties several together.')}</p>
          {fantasies.length ? (
            <div className="fantgrid">
              {fantasies.map((f) => (
                <div className={`fantcard${f.saved ? ' saved' : ''}`} key={f.id}>
                  <div className="fc-head"><strong>{f.name}</strong><span className="fc-pct" title={t('Match with you')}>{f.match}%</span></div>
                  {f.description ? <span className="wtext">{f.description}</span> : null}
                  <div className="fc-kinks">{f.kinks.length ? f.kinks.map((k) => <span key={k.id || k.name} className="chip" style={{ '--c': k.color || '#F6C35B', '--c2': `color-mix(in srgb, ${k.color || '#F6C35B'} 16%, transparent)` }}>{k.name}</span>) : <span className="mini-meta">{t('no kinks linked')}</span>}</div>
                  <div className="memacts">
                    <button type="button" className={`ghost-btn small${f.saved ? ' accent' : ''}`} onClick={async () => { await api(`/fantasies/${f.id}`, { method: 'PATCH', body: { saved: !f.saved } }); refreshMeta(); }}><Icon name="save" filled={!!f.saved} />{f.saved ? t('Saved [button state]') : t('Save')}</button>
                    <button type="button" className="icon-btn" onClick={async () => { await api(`/fantasies/${f.id}`, { method: 'DELETE' }); refreshMeta(); }} aria-label={t('Delete fantasy')}><Icon name="trash" /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <form className="fantform" onSubmit={async (e) => { e.preventDefault(); if (!newFant.name.trim()) { toast(t('Give the fantasy a name.')); return; } await api('/fantasies', { method: 'POST', body: newFant }); setNewFant({ name: '', description: '', kinks: [] }); refreshMeta(); }}>
            <span className="fb-label">{t('New fantasy')}</span>
            <input id="newFantName" value={newFant.name} onChange={(e) => setNewFant({ ...newFant, name: e.target.value })} placeholder={t('Fantasy name')} aria-label={t('Fantasy name')} />
            <textarea id="newFantDesc" value={newFant.description} onChange={(e) => setNewFant({ ...newFant, description: e.target.value })} rows={2} placeholder={t('Describe the scenario in your own words')} aria-label={t('Fantasy description')} />
            <div className="chiprow">{kinks.filter((k) => k.status === 'active').map((k) => (
              <button type="button" key={k.id} className={`chip btn${newFant.kinks.includes(k.id) ? ' on' : ''}`} onClick={() => setNewFant({ ...newFant, kinks: newFant.kinks.includes(k.id) ? newFant.kinks.filter((x) => x !== k.id) : [...newFant.kinks, k.id] })}>{k.name}</button>
            ))}</div>
            <button type="submit" className="ghost-btn small accent"><Icon name="plus" />{t('Add fantasy')}</button>
          </form>
        </div>
      </div>


      <div className="memsec" id="mem-history">
        <HistoryDb />
      </div>

      <PromptLog />
    </section>
  );
}
