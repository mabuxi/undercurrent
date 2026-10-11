import { useEffect, useRef, useState } from 'react';
import { api, ago } from '../api.js';
import { useApp } from '../context.jsx';
import { Icon } from '../icons.jsx';
import { t, tn, getLang } from '../i18n.js';
import { KShape, Shape, SHAPES, SHAPE_FAMILIES, PATTERNS, useKinkShape } from '../shapes.jsx';

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

// The names of the families of shapes.
export const FAMILY_NAMES = {
  round: t('Round shapes'), arch: t('Arches'), pill: t('Capsules'), star: t('Stars'), wave: t('Waves'), drop: t('Drops'), petal: t('Petals'),
  angle: t('Angles'), block: t('Blocks'), sky: t('Sky'), link: t('Links'), cluster: t('Clusters'), frame: t('Frames'), leaf: t('Leaves')
};

// A kink's or a group's shape as a button: it opens a small panel to pick another shape (a group picks its family of
// shapes, its kinks follow) and the colour. "Let the app choose" goes back to the shape the app picks.
export function ShapeButton({ k, size = 30, onPatch, className = '' }) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const wrap = useRef(null);
  const cur = useKinkShape(k.id);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const choose = (shape) => { onPatch({ shape }); setOpen(false); };
  const fams = Object.keys(SHAPE_FAMILIES);
  const others = fams.filter((f) => f !== cur.fam);
  return (
    <span className={`shapebtn-wrap ${className}`} ref={wrap} style={{ '--c': k.color }}>
      <button type="button" className="shapebtn" onClick={() => setOpen((x) => !x)} aria-expanded={open} aria-label={t('Shape and colour of {name}', { name: k.name })} title={t('Shape and colour')}>
        <KShape id={k.id} color={k.color} size={size} />
      </button>
      {open ? (
        <div className="shapepop" role="dialog" aria-label={t('Shape and colour of {name}', { name: k.name })}>
          {k.isGroup ? (
            <>
              <div className="sp-t">{t('Shapes of {name}', { name: k.name })}</div>
              <p className="wnote">{t('Every kink in the group gets its own shape from this family.')}</p>
              <div className="sp-grid fams">
                {fams.map((f) => (
                  <button type="button" key={f} className={`sp-opt${cur.fam === f ? ' on' : ''}`} onClick={() => choose(f)} title={FAMILY_NAMES[f]}>
                    <Shape shape={SHAPE_FAMILIES[f][0]} pattern={PATTERNS[f]} color={k.color} size={26} /><span>{FAMILY_NAMES[f]}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="sp-t">{t('Shape of {name}', { name: k.name })}</div>
              <div className="sp-grid">
                {SHAPE_FAMILIES[cur.fam].map((s) => <button type="button" key={s} className={`sp-opt solo${cur.shape === s ? ' on' : ''}`} onClick={() => choose(s)} aria-label={s}><Shape shape={s} pattern={cur.pattern} color={k.color} size={30} /></button>)}
              </div>
              {more ? others.map((f) => (
                <div key={f} className="sp-fam">
                  <span className="fb-label">{FAMILY_NAMES[f]}</span>
                  <div className="sp-grid">{SHAPE_FAMILIES[f].map((s) => <button type="button" key={s} className={`sp-opt solo${cur.shape === s ? ' on' : ''}`} onClick={() => choose(s)} aria-label={s}><Shape shape={s} pattern={PATTERNS[f]} color={k.color} size={26} /></button>)}</div>
                </div>
              )) : <button type="button" className="linkbtn sp-more" onClick={() => setMore(true)}>{t('Other shapes')}</button>}
            </>
          )}
          <div className="sp-foot">
            <span className="sp-col"><ColorDot color={k.color} onChange={(c) => onPatch({ color: c })} label={t('Colour of {name}', { name: k.name })} />{t('Colour')}</span>
            {k.shape ? <button type="button" className="ghost-btn small" onClick={() => choose(null)}><Icon name="spark" />{t('Let the app choose')}</button> : null}
          </div>
        </div>
      ) : null}
    </span>
  );
}

// Who may change a kink, with an icon, a name and what it means.
export const KINK_MODES = [
  { id: 'lock', icon: 'lock', name: t('Locked'), short: t('Locked'), text: t('Only you change it. The app never renames it, never touches its tags or communities and never fades it. It can still suggest things for you to add.') },
  { id: 'grow', icon: 'unlock', name: t('Grows'), short: t('Grows'), text: t('The app can add tags and communities that fit, but never removes anything, never renames it and never fades it. Its match can drop under 50% without it fading.') },
  { id: 'ai', icon: 'why', name: t('Managed by the app'), short: t('Managed'), text: t('The app manages it like the kinks it finds itself: it adds and removes tags, renames it, and fades it when its match stays under 50%.') }
];
export const modeInfo = (id) => KINK_MODES.find((m) => m.id === id) || KINK_MODES[2];

// Points over time as bars on a scale of 100%: lately first, with an arrow saying whether it went up or down
// against all time.
export function shareBars(p, withNow = false) {
  const all = p?.shareAll || 0;
  const late = p?.shareLately || 0;
  const trend = late - all >= 0.5 ? 'up' : all - late >= 0.5 ? 'down' : null;
  return [
    { key: 'lately', label: t('Lately'), share: late, pts: p?.lately || 0, trend },
    { key: 'all', label: t('All time'), share: all, pts: p?.all || 0 },
    ...(withNow ? [{ key: 'now', label: t('Right now'), share: p?.shareNow || 0, pts: p?.now || 0 }] : [])
  ].map((r) => ({ ...r, w: Math.max(0, Math.min(100, r.share)) }));
}
export const pct = (v) => `${String(Math.round(v * 10) / 10).replace('.', getLang() === 'fr' ? ',' : '.')}%`;

function KinkCard({ k, onOpen }) {
  const fresh = k.created && Date.now() - k.created < 3 * DAY;
  const mode = modeInfo(k.mode);
  const open = () => onOpen(k);
  const bars = shareBars(k.points);
  return (
    <div role="button" tabIndex={0} className={`kcard clickable notched${k.status !== 'active' ? ' dim' : ''}`} style={{ '--c': k.color }} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}>
      <div className="kc-top">
        <KShape id={k.id} color={k.color} size={44} className="kc-shape" />
        <span className="grow" />
        {k.match != null ? <span className={`kc-match${k.match >= 50 ? ' ok' : ''}`} title={t('How much of a match it is to you. From 50% it is a kink.')}>{k.match}%</span> : null}
        <button type="button" className="kc-edit notch-btn" onClick={(e) => { e.stopPropagation(); onOpen(k); }} aria-label={t('Edit {name}', { name: k.name })} title={t('Edit')}><Icon name="edit" /></button>
      </div>
      <div className="kc-name">
        <strong title={k.name}>{k.name}</strong>
        <span className={`kc-mode m-${k.mode}`} title={`${mode.name}: ${mode.text}`}><Icon name={mode.icon} /><span>{mode.short}</span></span>
      </div>
      {(fresh && k.status === 'active') || k.status === 'hidden' ? (
        <div className="kc-badges">
          {fresh && k.status === 'active' ? <span className="sugg">{t('New')}</span> : null}
          {k.status === 'hidden' ? <span className="sugg">{k.fadedAt ? t('Faded {when}', { when: ago(Math.round(k.fadedAt / 1000)) }) : t('Faded')}</span> : null}
        </div>
      ) : null}
      <div className="kc-bars" title={t('The part of all your points that went to posts with it')}>
        {bars.map((b) => <div key={b.key} className={`kb-${b.key}`}><span>{b.label}</span><div className="track2"><i style={{ width: `${b.w}%` }} /></div><em title={tn(b.pts, '{n} point', '{n} points')}>{b.trend ? <Icon name={b.trend} /> : null}{pct(b.share)}</em></div>)}
      </div>
      {k.evidence ? <p className="kc-why">{evidenceLine(k.evidence)}</p> : null}
      <div className="kc-tags">{k.tags.slice(0, 3).map((x) => <span key={x.name} className="chip ghost">{x.name}</span>)}{k.tags.length > 3 ? <span className="chip ghost more">+{k.tags.length - 3}</span> : null}</div>
    </div>
  );
}

function GroupHead({ g, count, onChange }) {
  const { toast } = useApp();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(g.name);
  const s = useKinkShape(g.id);
  async function patch(body, msg) {
    try { await api(`/kinks/${g.id}`, { method: 'PATCH', body }); if (msg) toast(msg); onChange(); } catch (e) { toast(e.message); }
  }
  return (
    <div className="ks-head" style={{ '--c': g.color }}>
      <ShapeButton k={g} size={30} onPatch={(b) => patch(b, 'shape' in b ? t('Shapes changed.') : null)} />
      {edit ? (
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) patch({ name: name.trim() }, t('Group renamed.')); setEdit(false); }}>
          <input className="ksname" value={name} onChange={(e) => setName(e.target.value)} autoFocus onBlur={() => setEdit(false)} aria-label={t('Group name')} />
        </form>
      ) : <span className="ks-name">{g.name}</span>}
      <span className="count">{count}</span>
      <span className="ks-line" />
      <span className="ks-fam">{FAMILY_NAMES[s.fam]}</span>
      <button type="button" className="icon-btn" onClick={() => setEdit(true)} aria-label={t('Rename {name}', { name: g.name })} title={t('Rename')}><Icon name="edit" /></button>
      <button type="button" className="icon-btn" onClick={async () => { await api(`/kinks/${g.id}`, { method: 'DELETE' }); toast(t("{name} removed. Its kinks are on their own now and this family won't be grouped again.", { name: g.name })); onChange(); }} aria-label={t('Remove the group {name}', { name: g.name })} title={t('Remove the group (keeps the kinks)')}><Icon name="trash" /></button>
    </div>
  );
}

// A shape for something that is not a kink yet: the one its name calls for, drawn as a dashed outline.
const RISE_SHAPES = Object.keys(SHAPES);
function riseShape(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return RISE_SHAPES[h % RISE_SHAPES.length];
}

// Every kink, grouped by family, the way the map colours them. Click one for the same view as clicking it on the map.
export default function KinkBoard({ onOpen, onChange }) {
  const { kinks, toast } = useApp();
  const [extra, setExtra] = useState({ rising: [], removed: [] });
  const [showFaded, setShowFaded] = useState(false);
  const [q, setQ] = useState('');
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
  // Searching your kinks: the name, every tag and every Reddit community count, faded kinks too.
  const needle = q.trim().toLowerCase().replace(/^r\//, '');
  const found = needle ? sort(plain).map((k) => {
    const inName = k.name.toLowerCase().includes(needle);
    const tags = (k.tags || []).filter((x) => x.name.toLowerCase().includes(needle)).map((x) => x.name);
    const subs = (k.subs || []).filter((s) => s.toLowerCase().includes(needle)).map((s) => `r/${s}`);
    return inName || tags.length || subs.length ? { k, hits: [...subs, ...tags].slice(0, 4), inName } : null;
  }).filter(Boolean).sort((a, b) => Number(b.inName) - Number(a.inName)) : null;

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
  const grid = (list) => <div className="kgrid">{list.map((k) => <KinkCard key={k.id} k={k} onOpen={onOpen} />)}</div>;

  return (
    <div className="kinkboard">
      <div className="kb-head">
        <div>
          <h2>{t('Your kinks')} <span className="count">{active.length}</span></h2>
          <p className="wnote">{t('A kink is one specific thing you keep coming back to, proven by heat, likes and saves, not by watching. It has to be in clearly more of what you loved than in everything you see, so tags that are on almost every video never count. The % is how much of a match it is to you: from 50% it is a kink. Each kink has a lock, an open lock or sparkles: only you change it, the app may only add to it, or the app manages it.')} {t('Each group has its own family of shapes; tap a shape to change it or its colour.')}</p>
        </div>
        <div className="wbtns">
          <button type="button" className={`ghost-btn${form === 'kink' ? ' accent' : ' main'}`} onClick={() => setForm(form === 'kink' ? null : 'kink')}><Icon name="plus" />{t('New kink')}</button>
          <button type="button" className={`ghost-btn${form === 'group' ? ' accent' : ''}`} onClick={() => setForm(form === 'group' ? null : 'group')}><Icon name="plus" />{t('New group')}</button>
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

      <div className="kb-search">
        <Icon name="search" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search your kinks, tags and communities')} aria-label={t('Search your kinks')} />
        {q ? <button type="button" className="icon-btn" onClick={() => setQ('')} aria-label={t('Clear the search')}><Icon name="x" /></button> : null}
      </div>
      {found ? (
        <div className="ksection wide">
          <div className="ks-head plain"><Icon name="search" /><span className="ks-name">{tn(found.length, '{n} kink found', '{n} kinks found')}</span><span className="ks-line" /></div>
          {found.length ? <div className="kgrid">{found.map(({ k, hits }) => (
            <div key={k.id} className="kfound">
              <KinkCard k={k} onOpen={onOpen} />
              {hits.length ? <p className="kfound-hits">{t('Matches: {what}', { what: hits.join(', ') })}</p> : null}
            </div>
          ))}</div> : <p className="wnote">{t('No kink has that in its name, tags or communities.')}</p>}
        </div>
      ) : null}
      {found ? null : (
        <div className="ksections">
          {sections.map(({ g, members }) => (
            <div key={g.id} className={`ksection${members.length > 2 ? ' wide' : ''}`} style={{ '--c': g.color }}>
              <GroupHead g={g} count={members.length} onChange={changed} />
              {grid(members)}
            </div>
          ))}
          {loose.length ? (
            <div className={`ksection${loose.length > 2 ? ' wide' : ''}`}>
              <div className="ks-head plain"><Shape shape="dice" size={26} color="#B6A8B0" /><span className="ks-name">{t('On their own')}</span><span className="count">{loose.length}</span><span className="ks-line" /><span className="ks-fam">{t('each with its own shape')}</span></div>
              {grid(loose)}
            </div>
          ) : null}
        </div>
      )}
      {!active.length ? <p className="wnote">{t("No kinks yet. They show up once you've given heat to, liked or saved a few posts that share something specific, on more than one day.")}</p> : null}

      {extra.rising?.length ? (
        <div className="ksection wide rising-sec">
          <div className="ks-head plain"><Shape shape="ring" size={26} color="#B6A8B0" hollow /><span className="ks-name">{t('Almost a kink')}</span><span className="ks-line" /><span className="ks-fam">{t('At 50% they become kinks by themselves')}</span></div>
          <p className="wnote">{t('At 50% they become kinks by themselves. Think one already is? Tap + and it is kept.')}</p>
          <div className="chiprow">{extra.rising.map((r) => (
            <span key={r.concept} className="chip ghost rising" title={`${tn(r.n, '{n} post you clearly liked, {lift}× more than usual', '{n} posts you clearly liked, {lift}× more than usual', { lift: dec(r.lift) })}${r.need ? `. ${t('{n} more and it becomes a kink.', { n: r.need })}` : `. ${t('Needs a bit more, or another day.')}`}`}>
              <Shape shape={riseShape(r.concept)} size={16} color="#B6A8B0" hollow />{r.name}<em className="dim"> {r.match}%</em>
              <button type="button" className="chipx keep" onClick={async () => { try { await api(`/kinks/rising/${encodeURIComponent(r.concept)}`, { method: 'POST', body: {} }); toast(t('{name} is a kink now, and it is kept.', { name: r.name })); changed(); } catch (e) { toast(e.message); } }} aria-label={t('Make {name} a kink', { name: r.name })} title={t('Make it a kink')}><Icon name="plus" /></button>
            </span>
          ))}</div>
        </div>
      ) : null}
      {faded.length ? (
        <div className="ksection wide">
          <button type="button" className="linkbtn" onClick={() => setShowFaded((x) => !x)}>{showFaded ? tn(faded.length, 'Hide {n} faded kink', 'Hide {n} faded kinks') : tn(faded.length, 'Show {n} faded kink', 'Show {n} faded kinks')}</button>
          {showFaded ? grid(sort(faded)) : null}
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

