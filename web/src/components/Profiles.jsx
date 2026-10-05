import { useEffect, useState } from 'react';
import { api, ago, fmtBytes } from '../api.js';
import { useApp } from '../context.jsx';
import { Icon } from '../icons.jsx';
import { t, tn, locale } from '../i18n.js';

// Waits for the server to come back on the other profile, then reloads the page.
function waitForProfile(id, onTimeout) {
  let tries = 0;
  const timer = setInterval(async () => {
    tries++;
    try {
      const s = await api('/status');
      if (s.profile?.id === id) { clearInterval(timer); window.location.reload(); }
    } catch {}
    if (tries > 80) { clearInterval(timer); onTimeout?.(); }
  }, 750);
}

function ProfileRow({ p, onChange, onSwitch }) {
  const { toast } = useApp();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(p.name);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(null);
  async function act(what, fn) {
    setBusy(what);
    try { await fn(); } catch (e) { toast(e.message); }
    setBusy(null);
  }
  return (
    <div className={`profrow${p.active ? ' current' : ''}`} style={{ '--c': p.color }}>
      <label className="profdot" title={t('Colour')}><input type="color" value={p.color || '#E39A83'} onChange={(e) => api(`/profiles/${p.id}`, { method: 'PATCH', body: { color: e.target.value } }).then(onChange)} aria-label={t('Colour of {name}', { name: p.name })} /></label>
      <div className="profinfo">
        {edit ? (
          <form onSubmit={(e) => { e.preventDefault(); act('rename', async () => { await api(`/profiles/${p.id}`, { method: 'PATCH', body: { name } }); setEdit(false); onChange(); }); }}>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus onBlur={() => setEdit(false)} aria-label={t('Profile name')} />
          </form>
        ) : <strong>{p.name}{p.active ? <span className="okpill">{t('open now')}</span> : null}</strong>}
        <span className="count">{tn(p.kinks, '{n} kink', '{n} kinks')} · {tn(p.liked, '{n} liked post', '{n} liked posts')} · {fmtBytes(p.size)}{p.onboarded ? '' : ` · ${t('not set up yet')}`} · {t('made {ago}', { ago: ago(Math.round(p.created / 1000)) })}</span>
      </div>
      {confirm ? (
        <div className="profacts">
          <span className="diag bad">{t('Delete {name} and everything in it for good?', { name: p.name })}</span>
          <button type="button" className="ghost-btn small danger" onClick={() => act('delete', async () => { await api(`/profiles/${p.id}`, { method: 'DELETE' }); toast(t('{name} deleted.', { name: p.name })); onChange(); })}>{t('Delete')}</button>
          <button type="button" className="ghost-btn small" onClick={() => setConfirm(false)}>{t('Cancel')}</button>
        </div>
      ) : (
        <div className="profacts">
          {!p.active ? <button type="button" className="ghost-btn small accent" onClick={() => onSwitch(p)}>{t('Switch')}</button> : null}
          <button type="button" className="ghost-btn small" disabled={busy === 'backup'} onClick={() => act('backup', async () => { const r = await api(`/profiles/${p.id}/backup`, { method: 'POST', body: {} }); toast(t('Backed up {name} ({size}).', { name: p.name, size: fmtBytes(r.size) })); onChange(); })}>{busy === 'backup' ? t('Backing up…') : t('Back up')}</button>
          <button type="button" className="icon-btn" onClick={() => { setName(p.name); setEdit(true); }} aria-label={t('Rename {name}', { name: p.name })} title={t('Rename')}><Icon name="edit" /></button>
          {!p.active ? <button type="button" className="icon-btn" onClick={() => setConfirm(true)} aria-label={t('Delete {name}', { name: p.name })} title={t('Delete')}><Icon name="trash" /></button> : null}
        </div>
      )}
    </div>
  );
}

export function ProfilesCard() {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [name, setName] = useState('');
  const [switching, setSwitching] = useState(null);
  const load = () => api('/profiles').then(setD).catch(() => {});
  useEffect(() => { load(); }, []);
  async function switchTo(p) {
    setSwitching(p.name);
    try {
      await api(`/profiles/${p.id}/switch`, { method: 'POST', body: {} });
      waitForProfile(p.id, () => { setSwitching(null); toast(t('The switch takes a restart. Open Undercurrent again if it does not come back.')); });
    } catch (e) { setSwitching(null); toast(e.message); }
  }
  async function create(e) {
    e.preventDefault();
    if (!name.trim()) { toast(t('Give the profile a name.')); return; }
    try {
      const r = await api('/profiles', { method: 'POST', body: { name: name.trim() } });
      setSwitching(r.profile.name);
      waitForProfile(r.profile.id);
    } catch (err) { toast(err.message); }
  }
  return (
    <div className="card2" id="profiles">
      <h3>{t('Profiles')} <span className="count">{d?.list.length || ''}</span></h3>
      <p className="wtext">{t('Each profile has its own kinks, history, sources and settings; the local AI is shared. A new profile starts with the welcome steps. Switching restarts Undercurrent on that profile.')}</p>
      {switching ? <p className="ob-note good"><span className="spinner inline" /> {t('Opening {name}…', { name: switching })}</p> : null}
      <div className="proflist">{(d?.list || []).map((p) => <ProfileRow key={p.id} p={p} onChange={load} onSwitch={switchTo} />)}</div>
      <form className="rowline wrapline" onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('New profile name')} aria-label={t('New profile name')} style={{ flex: 2 }} />
        <button type="submit" className="ghost-btn small accent" disabled={!!switching}><Icon name="plus" />{t('Add and open')}</button>
      </form>
      <details className="uplog">
        <summary>{t('Backups')} {d?.backups?.length ? `(${d.backups.length})` : ''}</summary>
        {d?.backups?.length ? (
          <div className="proflist">
            {d.backups.map((b) => (
              <div key={b.file} className="profrow small">
                <div className="profinfo"><strong>{b.name}</strong><span className="count">{new Date(b.made).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' })} · {fmtBytes(b.size)}</span></div>
                <div className="profacts">
                  <button type="button" className="ghost-btn small" onClick={async () => { try { const r = await api(`/backups/${encodeURIComponent(b.file)}/restore`, { method: 'POST', body: {} }); toast(t('Restored as the profile {name}.', { name: r.profile.name })); load(); } catch (e) { toast(e.message); } }}>{t('Restore as a profile')}</button>
                  <button type="button" className="icon-btn" onClick={async () => { await api(`/backups/${encodeURIComponent(b.file)}`, { method: 'DELETE' }); load(); }} aria-label={t('Delete this backup')} title={t('Delete this backup')}><Icon name="trash" /></button>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="wnote">{t('No backups yet. "Back up" on a profile makes a full copy.')}</p>}
        <div className="wbtns"><button type="button" className="ghost-btn small" onClick={() => api('/profiles/reveal', { method: 'POST', body: { what: 'backups' } })}><Icon name="open" />{t('Show backups in Finder')}</button></div>
      </details>
    </div>
  );
}
