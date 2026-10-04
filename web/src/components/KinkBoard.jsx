import { useEffect, useState } from 'react';
import { api, ago } from '../api.js';
import { useApp } from '../context.jsx';
import { Icon } from '../icons.jsx';

const DAY = 86400000;

// Why something is a kink, in numbers you can check: how many posts you clearly liked with it, how much more often
// it is in those than in everything you see, and over how many days.
export function evidenceLine(e) {
  if (!e) return null;
  const did = [e.heat ? `heat on ${e.heat}` : null, e.up ? `liked ${e.up}` : null, e.save ? `saved ${e.save}` : null].filter(Boolean).join(', ');
  return `${e.n} posts you clearly liked${did ? ` (${did})` : ''} · ${e.lift}× more often than in everything you see · on ${e.days} ${e.days === 1 ? 'day' : 'days'}`;
}

function KinkCard({ k, onOpen }) {
  const fresh = k.created && Date.now() - k.created < 3 * DAY;
  const edited = Object.keys(k.locks || {}).length > 0 || k.origin === 'user';
  return (
    <button type="button" className={`kcard clickable${k.status !== 'active' ? ' dim' : ''}`} style={{ '--c': k.color }} onClick={() => onOpen(k)}>
      <div className="kc-head">
        <span className="kc-dot" />
        <strong>{k.name}</strong>
        {fresh && k.status === 'active' ? <span className="sugg">New</span> : null}
        {edited ? <span className="sugg pin" title="You changed this by hand, so it stays the way you set it">Yours</span> : null}
        {k.status === 'hidden' ? <span className="sugg">{k.fadedAt ? `Faded ${ago(Math.round(k.fadedAt / 1000))}` : 'Hidden'}</span> : null}
      </div>
      <div className="kc-bars">
        <div><span>All time</span><div className="track2"><i style={{ width: `${k.allTime}%`, background: k.color }} /></div><em>{k.allTime}%</em></div>
        <div><span>Lately</span><div className="track2"><i style={{ width: `${k.lately}%`, background: k.color }} /></div><em>{k.lately}%</em></div>
      </div>
      {k.evidence ? <p className="kc-why">{evidenceLine(k.evidence)}</p> : null}
      <div className="kc-tags">{k.tags.slice(0, 5).map((t) => <span key={t.name} className="chip ghost">{t.name}</span>)}{k.tags.length > 5 ? <span className="chip ghost more">+{k.tags.length - 5}</span> : null}</div>
    </button>
  );
}

function GroupHead({ g, count, onChange }) {
  const { toast } = useApp();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(g.name);
  async function patch(body, msg) {
    try { await api(`/kinks/${g.id}`, { method: 'PATCH', body }); if (msg) toast(msg); onChange(); } catch (e) { toast(e.message); }
  }
  return (
    <div className="ks-head" style={{ '--c': g.color }}>
      <span className="kc-dot" />
      {edit ? (
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) patch({ name: name.trim() }, 'Group renamed.'); setEdit(false); }}>
          <input className="ksname" value={name} onChange={(e) => setName(e.target.value)} autoFocus onBlur={() => setEdit(false)} aria-label="Group name" />
        </form>
      ) : <span>{g.name}</span>}
      <span className="count">{count}</span>
      <span className="grow" />
      <label className="colorpick" title="Group colour"><input type="color" value={g.color || '#B6A8B0'} onChange={(e) => patch({ color: e.target.value })} aria-label={`Colour of ${g.name}`} /></label>
      <button type="button" className="icon-btn" onClick={() => setEdit(true)} aria-label={`Rename ${g.name}`} title="Rename"><Icon name="edit" /></button>
      <button type="button" className="icon-btn" onClick={async () => { await api(`/kinks/${g.id}`, { method: 'DELETE' }); toast(`${g.name} removed. Its kinks are on their own now and this family won't be grouped again.`); onChange(); }} aria-label={`Remove the group ${g.name}`} title="Remove the group (keeps the kinks)"><Icon name="trash" /></button>
    </div>
  );
}

// Every kink, grouped by family, the way the map colours them. Click one for the same view as clicking it on the map.
export default function KinkBoard({ onOpen, onChange }) {
  const { kinks, toast } = useApp();
  const [extra, setExtra] = useState({ rising: [], removed: [] });
  const [showFaded, setShowFaded] = useState(false);
  const [form, setForm] = useState(null);
  const [nk, setNk] = useState({ name: '', tags: '', parent: '' });
  const [ng, setNg] = useState({ name: '', kinks: [] });
  const loadExtra = () => Promise.all([api('/kinks/rising'), api('/kinks/removed')]).then(([r, d]) => setExtra({ rising: r.rising, removed: d.removed, rules: r.rules })).catch(() => {});
  useEffect(() => { loadExtra(); }, [kinks.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = kinks.filter((k) => k.isGroup && k.status !== 'hidden');
  const plain = kinks.filter((k) => !k.isGroup);
  const active = plain.filter((k) => k.status !== 'hidden');
  const faded = plain.filter((k) => k.status === 'hidden');
  const sort = (list) => list.slice().sort((a, b) => (b.allTime + b.lately) - (a.allTime + a.lately));
  const sections = groups.map((g) => ({ g, members: sort(active.filter((k) => k.parentId === g.id)) })).filter((s) => s.members.length).sort((a, b) => b.members.length - a.members.length);
  const loose = sort(active.filter((k) => !k.parentId || !groups.some((g) => g.id === k.parentId)));
  const changed = () => { onChange(); loadExtra(); };

  async function addKink(e) {
    e.preventDefault();
    if (!nk.name.trim()) { toast('Give the kink a name.'); return; }
    try {
      await api('/kinks', { method: 'POST', body: { name: nk.name.trim(), tags: nk.tags.split(',').map((t) => t.trim()).filter(Boolean), parentId: nk.parent ? Number(nk.parent) : null } });
      setNk({ name: '', tags: '', parent: '' });
      setForm(null);
      toast('Kink added. It stays exactly as you made it.');
      changed();
    } catch (err) { toast(err.message); }
  }
  async function addGroup(e) {
    e.preventDefault();
    if (!ng.name.trim()) { toast('Give the group a name.'); return; }
    try {
      await api('/kinks/groups', { method: 'POST', body: { name: ng.name.trim(), kinks: ng.kinks } });
      setNg({ name: '', kinks: [] });
      setForm(null);
      toast('Group made.');
      changed();
    } catch (err) { toast(err.message); }
  }

  return (
    <div className="card2 kinkboard">
      <div className="kb-head">
        <div>
          <h3>Your kinks <span className="count">{active.length}</span></h3>
          <p className="wnote">A kink is one specific thing you keep coming back to, proven by heat, likes and saves, not by watching. It has to be in clearly more of what you loved than in everything you see, so tags that are on almost every video never count. Kinks update by themselves as your taste moves; anything you change by hand stays as you set it.</p>
        </div>
        <div className="wbtns">
          <button type="button" className={`ghost-btn small${form === 'kink' ? ' accent' : ''}`} onClick={() => setForm(form === 'kink' ? null : 'kink')}><Icon name="plus" />New kink</button>
          <button type="button" className={`ghost-btn small${form === 'group' ? ' accent' : ''}`} onClick={() => setForm(form === 'group' ? null : 'group')}><Icon name="plus" />New group</button>
        </div>
      </div>
      {form === 'kink' ? (
        <form className="rowline wrapline kb-form" onSubmit={addKink}>
          <input value={nk.name} onChange={(e) => setNk({ ...nk, name: e.target.value })} placeholder="Name, like Jockstrap" aria-label="New kink name" />
          <input value={nk.tags} onChange={(e) => setNk({ ...nk, tags: e.target.value })} placeholder="tags, comma separated (optional)" aria-label="Tags" style={{ flex: 2 }} />
          <select value={nk.parent} onChange={(e) => setNk({ ...nk, parent: e.target.value })} aria-label="Group"><option value="">No group</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          <button type="submit" className="ghost-btn small accent">Add</button>
        </form>
      ) : null}
      {form === 'group' ? (
        <form className="kb-form" onSubmit={addGroup}>
          <div className="rowline"><input value={ng.name} onChange={(e) => setNg({ ...ng, name: e.target.value })} placeholder="Group name, like Ethnicity" aria-label="New group name" style={{ flex: 1 }} /><button type="submit" className="ghost-btn small accent">Make group</button></div>
          <div className="chiprow">{sort(active).map((k) => <button type="button" key={k.id} className={`chip btn${ng.kinks.includes(k.id) ? ' on' : ''}`} onClick={() => setNg({ ...ng, kinks: ng.kinks.includes(k.id) ? ng.kinks.filter((x) => x !== k.id) : [...ng.kinks, k.id] })}>{k.name}</button>)}</div>
        </form>
      ) : null}

      {sections.map(({ g, members }) => (
        <div key={g.id} className="ksection">
          <GroupHead g={g} count={members.length} onChange={changed} />
          <div className="kgrid">{members.map((k) => <KinkCard key={k.id} k={k} onOpen={onOpen} />)}</div>
        </div>
      ))}
      {loose.length ? (
        <div className="ksection">
          <div className="ks-head" style={{ '--c': '#B6A8B0' }}><span className="kc-dot" />On their own<span className="count">{loose.length}</span></div>
          <div className="kgrid">{loose.map((k) => <KinkCard key={k.id} k={k} onOpen={onOpen} />)}</div>
        </div>
      ) : null}
      {!active.length ? <p className="wnote">No kinks yet. They show up once you've given heat to, liked or saved a few posts that share something specific, on more than one day.</p> : null}

      {extra.rising?.length ? (
        <div className="ksection">
          <div className="ks-head" style={{ '--c': '#B6A8B0' }}><span className="kc-dot hollow" />Almost a kink</div>
          <div className="chiprow">{extra.rising.map((r) => <span key={r.concept} className="chip ghost" title={`${r.n} posts you clearly liked, ${r.lift}× more than usual${r.need ? `. ${r.need} more and it becomes a kink.` : '. Needs a bit more, or another day.'}`}>{r.name}<em className="dim"> {r.n}</em></span>)}</div>
        </div>
      ) : null}
      {faded.length ? (
        <div className="ksection">
          <button type="button" className="linkbtn" onClick={() => setShowFaded((x) => !x)}>{showFaded ? 'Hide' : 'Show'} {faded.length} faded or hidden {faded.length === 1 ? 'kink' : 'kinks'}</button>
          {showFaded ? <div className="kgrid">{sort(faded).map((k) => <KinkCard key={k.id} k={k} onOpen={onOpen} />)}</div> : null}
        </div>
      ) : null}
      {extra.removed?.length ? (
        <p className="wnote">You removed {extra.removed.map((r, i) => (
          <span key={r.concept}>{i ? ', ' : ''}<button type="button" className="linkbtn" title="Allow it again" onClick={async () => { await api(`/kinks/removed/${encodeURIComponent(r.concept)}`, { method: 'DELETE' }); toast(`${r.name} can come back when the evidence is there.`); changed(); }}>{r.name}</button></span>
        ))}. They won't come back by themselves; click one to allow it again.</p>
      ) : null}
    </div>
  );
}
