import { useEffect, useState } from 'react';
import { ago, api } from '../api.js';
import { useApp } from '../context.jsx';
import { Icon } from '../icons.jsx';
import { t, tn } from '../i18n.js';

function MemoryItem({ m, categories, onChange }) {
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
            <button type="submit" className="ghost-btn small accent">{t('Save')}</button>
            <button type="button" className="ghost-btn small" onClick={() => { setEdit(false); setText(m.content); }}>{t('Cancel')}</button>
          </div>
        </form>
      ) : (
        <>
          <div className="memtext">
            {m.status === 'proposed' ? <span className="sugg">{t('Suggested')}</span> : null}
            {m.pinned ? <span className="sugg pin">{t('Pinned')}</span> : null}
            <p>{m.content}</p>
            {m.evidence ? <span className="wnote">{t('Because: {evidence}', { evidence: m.evidence })}</span> : null}
          </div>
          <div className="memacts">
            {m.status === 'proposed' ? (
              <>
                <button type="button" className="ghost-btn small accent" onClick={() => patch({ status: 'active' })}><Icon name="check" />{t('Keep')}</button>
                <button type="button" className="ghost-btn small" onClick={remove}>{t('Not right')}</button>
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

const KIND_LABEL = { search: t('search'), question: t('question'), command: t('command'), feedback: t('post feedback'), memory: t('saved to memory') };

function PromptLog() {
  const { toast } = useApp();
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const load = () => api('/prompts?limit=300').then((r) => setList(r.prompts)).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const shown = (list || []).filter((p) => !q || p.text.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="card2">
      <h3>{t('Prompt log')} <span className="count">{list?.length || 0}</span></h3>
      <p className="wnote">{t('Everything you typed to the assistant. Searches, questions and feedback on posts stay here and are not memory; only things you say about your taste are saved to memory.')}</p>
      <div className="rowline wrapline">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search the log')} aria-label={t('Search the prompt log')} style={{ flex: 2 }} />
        <button type="button" className="ghost-btn small" onClick={async () => { await api('/prompts/all', { method: 'DELETE' }); load(); toast(t('Prompt log cleared.')); }} disabled={!list?.length}>{t('Clear log')}</button>
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
      <h3>{t("Fantasies the assistant thinks you'd like")} <span className="count">{list?.length || 0}</span></h3>
      <p className="wnote">{t('Written from what you liked, heated and saved. Only ideas it is at least 75% sure about are shown.')}</p>
      {(list || []).map((sg) => (
        <div className="kinkrow" key={sg.id}>
          <span className="win-dot" style={{ '--c': '#F6C35B' }} />
          <div className="kinfo"><strong>{sg.title}</strong><span className="wtext">{sg.body}</span><span className="mini-meta">{(sg.data.kinks || []).map((k) => k.name).concat(sg.data.tags || []).join(' · ')}{sg.data.why ? ` · ${sg.data.why}` : ''}</span></div>
          <span className="count">{sg.confidence}%</span>
          <div className="memacts">
            <button type="button" className="ghost-btn small accent" onClick={() => act(sg, 'save')}>{t('Save')}</button>
            <button type="button" className="ghost-btn small" onClick={() => act(sg, 'dismiss')}>{t('Not for me')}</button>
          </div>
        </div>
      ))}
      {list && !list.length ? <p className="wnote">{t('No ideas yet. They come as you like, heat and save posts.')}</p> : null}
      <div className="wbtns"><button type="button" className="ghost-btn small" disabled={busy} onClick={async () => { setBusy(true); try { await api('/suggestions/refresh', { method: 'POST', body: { kind: 'fantasy' } }); toast(t('Thinking about new fantasies in the background. They show up here in a minute or two.')); setTimeout(load, 60000); } finally { setBusy(false); } }}>{t('Suggest fantasies now')}</button></div>
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

  const proposedCount = mem?.groups.reduce((a, g) => a + g.items.filter((m) => m.status === 'proposed').length, 0) || 0;

  return (
    <section className="center" style={{ paddingTop: 0 }}>
      <div className="jhead">
        <div><h2>{t('Memory')}</h2><p>{t("What the assistant knows about you, in your words and its own. Everything here is editable, and it's used for asking, tagging and recommendations. It never leaves this computer.")}</p></div>
        <button type="button" className="ghost-btn accent" onClick={reflect} disabled={busy}>{busy ? t('Thinking') : t('Suggest new memories')}</button>
      </div>

      <form className="card2 addmem" onSubmit={add}>
        <h3>{t('Remember something')}</h3>
        <textarea id="newMem" value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={t('I like slow builds more than anything fast. Never show me …')} aria-label={t('New memory')} />
        <div className="rowline">
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t('Category')}>{(mem?.categories || []).map((c) => <option key={c} value={c}>{t(c)}</option>)}</select>
          <button type="submit" className="ghost-btn small accent">{t('Remember')}</button>
          {proposedCount ? <span className="count">{tn(proposedCount, '{n} suggestion to review below', '{n} suggestions to review below')}</span> : null}
        </div>
      </form>

      {mem?.groups.map((g) => (
        <div className="card2" key={g.category}>
          <h3>{t(g.category)} <span className="count">{g.items.length}</span></h3>
          {g.items.length ? g.items.map((m) => <MemoryItem key={m.id} m={m} categories={mem.categories} onChange={load} />) : <p className="wnote">{t('Nothing here yet.')}</p>}
        </div>
      ))}

      <div className="card2">
        <h3>{t('Kinks')}</h3>
        <p className="wnote">{t('Your kinks and their groups live in Your map now: see them all, open one for everything about it, rename, regroup, combine or remove them there.')}</p>
        <div className="wbtns"><button type="button" className="ghost-btn small accent" onClick={() => openMode('map')}><Icon name="map" />{t('Open your kinks')}</button></div>
      </div>

      <FantasyIdeas onSaved={refreshMeta} />

      <div className="card2">
        <h3>{t('Fantasies')} <span className="count">{fantasies.length}</span></h3>
        <p className="wnote">{t('Fantasies are bigger than kinks: a scenario that ties several together.')}</p>
        {fantasies.map((f) => (
          <div className="kinkrow" key={f.id}>
            <span className="win-dot" style={{ '--c': '#F6C35B' }} />
            <div className="kinfo"><strong>{f.name}</strong><span className="mini-meta">{f.kinks.map((k) => k.name).join(' + ') || t('no kinks linked')}</span>{f.description ? <span className="wnote">{f.description}</span> : null}</div>
            <span className="count">{f.match}%</span>
            <div className="memacts">
              <button type="button" className="ghost-btn small" onClick={async () => { await api(`/fantasies/${f.id}`, { method: 'PATCH', body: { saved: !f.saved } }); refreshMeta(); }}>{f.saved ? t('Saved [button state]') : t('Save')}</button>
              <button type="button" className="icon-btn" onClick={async () => { await api(`/fantasies/${f.id}`, { method: 'DELETE' }); refreshMeta(); }} aria-label={t('Delete fantasy')}><Icon name="trash" /></button>
            </div>
          </div>
        ))}
        <form className="fantform" onSubmit={async (e) => { e.preventDefault(); if (!newFant.name.trim()) { toast(t('Give the fantasy a name.')); return; } await api('/fantasies', { method: 'POST', body: newFant }); setNewFant({ name: '', description: '', kinks: [] }); refreshMeta(); }}>
          <input id="newFantName" value={newFant.name} onChange={(e) => setNewFant({ ...newFant, name: e.target.value })} placeholder={t('Fantasy name')} aria-label={t('Fantasy name')} />
          <textarea id="newFantDesc" value={newFant.description} onChange={(e) => setNewFant({ ...newFant, description: e.target.value })} rows={2} placeholder={t('Describe the scenario in your own words')} aria-label={t('Fantasy description')} />
          <div className="chiprow">{kinks.filter((k) => k.status === 'active').map((k) => (
            <button type="button" key={k.id} className={`chip btn${newFant.kinks.includes(k.id) ? ' on' : ''}`} onClick={() => setNewFant({ ...newFant, kinks: newFant.kinks.includes(k.id) ? newFant.kinks.filter((x) => x !== k.id) : [...newFant.kinks, k.id] })}>{k.name}</button>
          ))}</div>
          <button type="submit" className="ghost-btn small accent">{t('Add fantasy')}</button>
        </form>
      </div>

      <PromptLog />
    </section>
  );
}
