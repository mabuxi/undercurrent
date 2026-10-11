import { useEffect, useRef, useState } from 'react';
import { api, ago } from '../api.js';
import { useApp } from '../context.jsx';
import { Icon } from '../icons.jsx';
import { t, tn, getLang } from '../i18n.js';

const DAY = 86400000;
const dec = (x) => (getLang() === 'fr' ? String(x).replace('.', ',') : x);

// Why something is a kink, in numbers you can check: how many posts you clearly liked with it, how much more often
// it is in those than in everything you see, and over how many days.
export function evidenceLine(e) {
  if (!e) return null;
  const did = [e.heat ? t('heat on {n}', { n: e.heat }) : null, e.up ? t('liked {n}', { n: e.up }) : null, e.save ? t('saved {n}', { n: e.save }) : null].filter(Boolean).join(', ');
  return `${tn(e.n, '{n} post you clearly liked', '{n} posts you clearly liked')}${did ? ` (${did})` : ''} · ${t('{lift}× more often than in everything you see', { lift: dec(e.lift) })} · ${tn(e.days, 'on {n} day', 'on {n} days')}`;
}

// The colour of a kink or a group as a plain dot; tapping it opens the colour picker.
export function ColorDot({ color, onChange, label, big = false }) {
  const [v, setV] = useState(color || '#B6A8B0');
  const timer = useRef(null);
  useEffect(() => { setV(color || '#B6A8B0'); }, [color]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const pick = (c) => { setV(c); clearTimeout(timer.current); timer.current = setTimeout(() => onChange(c), 350); };
  return (
    <label className={`cdot${big ? ' big' : ''}`} style={{ '--c': v }} title={label}>
      <input type="color" value={v} onChange={(e) => pick(e.target.value)} aria-label={label} />
    </label>
  );
}

// Who may change a kink, with an icon, a name and what it means.
export const KINK_MODES = [
  { id: 'lock', icon: 'lock', name: t('Locked'), text: t('Only you change it. The app never renames it, never touches its tags or communities and never fades it. It can still suggest things for you to add.') },
  { id: 'grow', icon: 'unlock', name: t('Grows'), text: t('The app can add tags and communities that fit, but never removes anything, never renames it and never fades it. Its match can drop under 50% without it fading.') },
  { id: 'ai', icon: 'why', name: t('Managed by the app'), text: t('The app manages it like the kinks it finds itself: it adds and removes tags, renames it, and fades it when its match stays under 50%.') }
];
export const modeInfo = (id) => KINK_MODES.find((m) => m.id === id) || KINK_MODES[2];

// Points over time as two or three bars, each scaled against the biggest, so a change really shows.
export function shareBars(p, withNow = false) {
  const rows = [
    { key: 'all', label: t('All time'), share: p?.shareAll || 0, pts: p?.all || 0 },
    { key: 'lately', label: t('Lately'), share: p?.shareLately || 0, pts: p?.lately || 0 },
    ...(withNow ? [{ key: 'now', label: t('Right now'), share: p?.shareNow || 0, pts: p?.now || 0 }] : [])
  ];
  const top = Math.max(1, ...rows.map((r) => r.share));
  return rows.map((r) => ({ ...r, w: Math.round((r.share / top) * 100) }));
}
const pct = (v) => `${String(Math.round(v * 10) / 10).replace('.', getLang() === 'fr' ? ',' : '.')}%`;

function KinkCard({ k, onOpen }) {
  const fresh = k.created && Date.now() - k.created < 3 * DAY;
  const mode = modeInfo(k.mode);
  const open = () => onOpen(k);
  const bars = shareBars(k.points);
  return (
    <div role="button" tabIndex={0} className={`kcard clickable${k.status !== 'active' ? ' dim' : ''}`} style={{ '--c': k.color }} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}>
      <div className="kc-head">
        <span className="kc-dot" />
        <strong>{k.name}</strong>
        <span className={`kc-mode m-${k.mode}`} title={`${mode.name}: ${mode.text}`}><Icon name={mode.icon} /></span>
        {k.match != null ? <span className={`kc-match${k.match >= 50 ? ' ok' : ''}`} title={t('How much of a match it is to you. From 50% it is a kink.')}>{k.match}%</span> : null}
        <button type="button" className="kc-edit" onClick={(e) => { e.stopPropagation(); onOpen(k); }} aria-label={t('Edit {name}', { name: k.name })} title={t('Edit')}><Icon name="edit" /></button>
      </div>
      {(fresh && k.status === 'active') || k.status === 'hidden' ? (
        <div className="kc-badges">
          {fresh && k.status === 'active' ? <span className="sugg">{t('New')}</span> : null}
          {k.status === 'hidden' ? <span className="sugg">{k.fadedAt ? t('Faded {when}', { when: ago(Math.round(k.fadedAt / 1000)) }) : t('Faded')}</span> : null}
        </div>
      ) : null}
      <div className="kc-bars" title={t('The part of all your points that went to posts with it')}>
        {bars.map((b) => <div key={b.key}><span>{b.label}</span><div className="track2"><i style={{ width: `${b.w}%`, background: k.color, opacity: b.key === 'all' ? 0.55 : 1 }} /></div><em title={tn(b.pts, '{n} point', '{n} points')}>{pct(b.share)}</em></div>)}
      </div>
      {k.evidence ? <p className="kc-why">{evidenceLine(k.evidence)}</p> : null}
      <div className="kc-tags">{k.tags.slice(0, 4).map((x) => <span key={x.name} className="chip ghost">{x.name}</span>)}{k.tags.length > 4 ? <span className="chip ghost more">+{k.tags.length - 4}</span> : null}</div>
    </div>
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
      <ColorDot color={g.color || '#B6A8B0'} onChange={(c) => patch({ color: c })} label={t('Colour of {name}', { name: g.name })} />
      {edit ? (
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) patch({ name: name.trim() }, t('Group renamed.')); setEdit(false); }}>
          <input className="ksname" value={name} onChange={(e) => setName(e.target.value)} autoFocus onBlur={() => setEdit(false)} aria-label={t('Group name')} />
        </form>
      ) : <span>{g.name}</span>}
      <span className="count">{count}</span>
      <span className="grow" />
      <button type="button" className="icon-btn" onClick={() => setEdit(true)} aria-label={t('Rename {name}', { name: g.name })} title={t('Rename')}><Icon name="edit" /></button>
      <button type="button" className="icon-btn" onClick={async () => { await api(`/kinks/${g.id}`, { method: 'DELETE' }); toast(t("{name} removed. Its kinks are on their own now and this family won't be grouped again.", { name: g.name })); onChange(); }} aria-label={t('Remove the group {name}', { name: g.name })} title={t('Remove the group (keeps the kinks)')}><Icon name="trash" /></button>
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
  const sort = (list) => list.slice().sort((a, b) => (b.match ?? 0) - (a.match ?? 0) || (b.points?.all || 0) - (a.points?.all || 0));
  const sections = groups.map((g) => ({ g, members: sort(active.filter((k) => k.parentId === g.id)) })).filter((s) => s.members.length).sort((a, b) => b.members.length - a.members.length);
  const loose = sort(active.filter((k) => !k.parentId || !groups.some((g) => g.id === k.parentId)));
  const changed = () => { onChange(); loadExtra(); };

  async function addKink(e) {
    e.preventDefault();
    if (!nk.name.trim()) { toast(t('Give the kink a name.')); return; }
    try {
      await api('/kinks', { method: 'POST', body: { name: nk.name.trim(), tags: nk.tags.split(',').map((t) => t.trim()).filter(Boolean), parentId: nk.parent ? Number(nk.parent) : null } });
      setNk({ name: '', tags: '', parent: '' });
      setForm(null);
      toast(t('Kink added. The app adds tags that fit, and never removes yours.'));
      changed();
    } catch (err) { toast(err.message); }
  }
  async function addGroup(e) {
    e.preventDefault();
    if (!ng.name.trim()) { toast(t('Give the group a name.')); return; }
    try {
      await api('/kinks/groups', { method: 'POST', body: { name: ng.name.trim(), kinks: ng.kinks } });
      setNg({ name: '', kinks: [] });
      setForm(null);
      toast(t('Group made.'));
      changed();
    } catch (err) { toast(err.message); }
  }

  return (
    <div className="card2 kinkboard">
      <div className="kb-head">
        <div>
          <h3>{t('Your kinks')} <span className="count">{active.length}</span></h3>
          <p className="wnote">{t('A kink is one specific thing you keep coming back to, proven by heat, likes and saves, not by watching. It has to be in clearly more of what you loved than in everything you see, so tags that are on almost every video never count. The % is how much of a match it is to you: from 50% it is a kink. Each kink has a lock, an open lock or sparkles: only you change it, the app may only add to it, or the app manages it.')}</p>
        </div>
        <div className="wbtns">
          <button type="button" className={`ghost-btn small${form === 'kink' ? ' accent' : ''}`} onClick={() => setForm(form === 'kink' ? null : 'kink')}><Icon name="plus" />{t('New kink')}</button>
          <button type="button" className={`ghost-btn small${form === 'group' ? ' accent' : ''}`} onClick={() => setForm(form === 'group' ? null : 'group')}><Icon name="plus" />{t('New group')}</button>
        </div>
      </div>
      {form === 'kink' ? (
        <form className="rowline wrapline kb-form" onSubmit={addKink}>
          <input value={nk.name} onChange={(e) => setNk({ ...nk, name: e.target.value })} placeholder={t('Name, like Jockstrap')} aria-label={t('New kink name')} />
          <input value={nk.tags} onChange={(e) => setNk({ ...nk, tags: e.target.value })} placeholder={t('tags, comma separated (optional)')} aria-label={t('Tags')} style={{ flex: 2 }} />
          <select value={nk.parent} onChange={(e) => setNk({ ...nk, parent: e.target.value })} aria-label={t('Group')}><option value="">{t('No group')}</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          <button type="submit" className="ghost-btn small accent"><Icon name="plus" />{t('Add')}</button>
        </form>
      ) : null}
      {form === 'group' ? (
        <form className="kb-form" onSubmit={addGroup}>
          <div className="rowline"><input value={ng.name} onChange={(e) => setNg({ ...ng, name: e.target.value })} placeholder={t('Group name, like Ethnicity')} aria-label={t('New group name')} style={{ flex: 1 }} /><button type="submit" className="ghost-btn small accent"><Icon name="plus" />{t('Make group')}</button></div>
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
          <div className="ks-head" style={{ '--c': '#B6A8B0' }}><span className="kc-dot" />{t('On their own')}<span className="count">{loose.length}</span></div>
          <div className="kgrid">{loose.map((k) => <KinkCard key={k.id} k={k} onOpen={onOpen} />)}</div>
        </div>
      ) : null}
      {!active.length ? <p className="wnote">{t("No kinks yet. They show up once you've given heat to, liked or saved a few posts that share something specific, on more than one day.")}</p> : null}

      {extra.rising?.length ? (
        <div className="ksection">
          <div className="ks-head" style={{ '--c': '#B6A8B0' }}><span className="kc-dot hollow" />{t('Almost a kink')}</div>
          <p className="wnote">{t('At 50% they become kinks by themselves. Think one already is? Tap + and it is kept.')}</p>
          <div className="chiprow">{extra.rising.map((r) => (
            <span key={r.concept} className="chip ghost rising" title={`${tn(r.n, '{n} post you clearly liked, {lift}× more than usual', '{n} posts you clearly liked, {lift}× more than usual', { lift: dec(r.lift) })}${r.need ? `. ${t('{n} more and it becomes a kink.', { n: r.need })}` : `. ${t('Needs a bit more, or another day.')}`}`}>
              {r.name}<em className="dim"> {r.match}%</em>
              <button type="button" className="chipx keep" onClick={async () => { try { await api(`/kinks/rising/${encodeURIComponent(r.concept)}`, { method: 'POST', body: {} }); toast(t('{name} is a kink now, and it is kept.', { name: r.name })); changed(); } catch (e) { toast(e.message); } }} aria-label={t('Make {name} a kink', { name: r.name })} title={t('Make it a kink')}><Icon name="plus" /></button>
            </span>
          ))}</div>
        </div>
      ) : null}
      {faded.length ? (
        <div className="ksection">
          <button type="button" className="linkbtn" onClick={() => setShowFaded((x) => !x)}>{showFaded ? tn(faded.length, 'Hide {n} faded kink', 'Hide {n} faded kinks') : tn(faded.length, 'Show {n} faded kink', 'Show {n} faded kinks')}</button>
          {showFaded ? <div className="kgrid">{sort(faded).map((k) => <KinkCard key={k.id} k={k} onOpen={onOpen} />)}</div> : null}
        </div>
      ) : null}
      {extra.removed?.length ? (
        <p className="wnote">{t('You removed')} {extra.removed.map((r, i) => (
          <span key={r.concept}>{i ? ', ' : ''}<button type="button" className="linkbtn" title={t('Allow it again')} onClick={async () => { await api(`/kinks/removed/${encodeURIComponent(r.concept)}`, { method: 'DELETE' }); toast(t('{name} can come back when the evidence is there.', { name: r.name })); changed(); }}>{r.name}</button></span>
        ))}. {t("They won't come back by themselves; click one to allow it again.")}</p>
      ) : null}
    </div>
  );
}
