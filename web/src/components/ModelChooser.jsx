import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { t, tn, locale } from '../i18n.js';

const GB = (b) => (b / 1024 ** 3).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num = (x) => (typeof x === 'number' ? x.toLocaleString(locale()) : x);

export function modelLabel(name) {
  const [repo, tag = ''] = String(name).split(':');
  const base = repo.split('/').pop();
  if (/Qwen3\.8-27B/i.test(base)) return `Qwen 3.8 27B ${tag}`;
  if (/qwen3\.5-abliterated/i.test(base)) return `Qwen 3.5 ${tag.toUpperCase()}`;
  return `${base}${tag ? ` ${tag}` : ''}`;
}

// One card per job (tagging, closer look, assistant): the model this Mac should use, marked Recommended, and every
// other option with what it needs. Any Ollama model name can be typed in too.
export function ModelChooser({ options, choice, setChoice, status }) {
  const [custom, setCustom] = useState({});
  if (!options) return <p className="ob-note">{t('Checking this Mac…')}</p>;
  const prog = new Map((status?.models || []).map((m) => [m.name, m]));
  return (
    <div className="mc">
      <p className="mc-sys"><Icon name="bolt" />{options.system.chip} · {t('{gb} GB memory', { gb: num(options.system.memoryGb) })} · {tn(options.system.cores, '{n} core', '{n} cores')}</p>
      {Object.entries(options.roles).map(([role, r]) => {
        const sel = choice[role] || r.chosen;
        const opt = r.options.find((o) => o.name === sel);
        const st = prog.get(sel);
        const p = st?.pull;
        const pct = p?.total ? Math.round((p.completed / p.total) * 100) : 0;
        const isCustom = custom[role] !== undefined;
        return (
          <div key={role} className={`mc-card${st?.present || opt?.installed ? ' good' : ''}`}>
            <div className="mc-head">
              <span className="ob-dot" />
              <div className="ob-grow"><b>{r.label}</b><span>{r.what}</span></div>
              <span className="ob-pct">{st?.present || opt?.installed ? <><Icon name="check" />{t('on this Mac')}</> : p && !p.done ? (p.total ? t('{pct}% of {gb} GB', { pct, gb: GB(p.total) }) : `${pct}%`) : p?.error ? t('failed') : opt?.size ? t('{gb} GB download', { gb: num(opt.size) }) : t('download')}</span>
            </div>
            {p && !p.done ? <div className="ob-bar"><i style={{ width: `${pct}%` }} /></div> : null}
            {p?.error ? <p className="ob-note bad">{p.error}</p> : null}
            <div className="mc-opts" role="radiogroup" aria-label={r.label}>
              {r.options.filter((o) => !o.custom || o.name === sel).map((o) => (
                <button type="button" role="radio" aria-checked={o.name === sel} key={o.name} className={`mc-opt${o.name === sel ? ' on' : ''}${o.fits === false ? ' heavy' : ''}`} onClick={() => setChoice({ ...choice, [role]: o.name })} title={o.name}>
                  <span className="mc-name">{modelLabel(o.name)}{o.recommended ? <em className="mc-rec">{t('Recommended')}</em> : null}{o.installed ? <em className="mc-have">{t('installed')}</em> : null}</span>
                  <span className="mc-note">{o.note}{o.size ? ` · ${t('{gb} GB', { gb: num(o.size) })}` : ''}{o.fits === false ? ` · ${t('needs {gb} GB memory, may be slow', { gb: num(o.minGb) })}` : ''}</span>
                </button>
              ))}
              {isCustom ? (
                <form className="mc-custom" onSubmit={(e) => { e.preventDefault(); const v = custom[role].trim(); if (v) setChoice({ ...choice, [role]: v }); setCustom({ ...custom, [role]: undefined }); }}>
                  <input autoFocus value={custom[role]} onChange={(e) => setCustom({ ...custom, [role]: e.target.value })} placeholder={t('Any Ollama model, like llama3.2:3b')} aria-label={t('Other model for {role}', { role: r.label })} />
                  <button type="submit" className="ob-btn">{t('Use')}</button>
                </form>
              ) : <button type="button" className="mc-other" onClick={() => setCustom({ ...custom, [role]: '' })}>{t('Other model…')}</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Settings: the same choice, saved with one button, and the downloads it starts.
export function ModelsCard() {
  const [options, setOptions] = useState(null);
  const [choice, setChoice] = useState({});
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = () => Promise.all([api('/setup/models/options'), api('/setup/status')]).then(([o, s]) => { setOptions(o); setStatus(s); }).catch(() => {});
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!status?.pulling) return undefined;
    const timer = setInterval(() => api('/setup/status').then(setStatus).catch(() => {}), 1500);
    return () => clearInterval(timer);
  }, [status?.pulling]);
  const changed = options && Object.entries(choice).some(([r, n]) => n && n !== options.roles[r]?.chosen);
  async function save() {
    try {
      const r = await api('/setup/models/choice', { method: 'PUT', body: { ...choice, pull: true } });
      setOptions(r);
      setChoice({});
      setMsg(r.pull?.missing?.length ? tn(r.pull.missing.length, 'Saved. Downloading {n} model…', 'Saved. Downloading {n} models…') : r.pull?.error ? `${t('Saved.')} ${r.pull.error}` : t('Saved. Everything is already on this Mac.'));
      load();
    } catch (e) { setMsg(e.message); }
  }
  return (
    <div className="card2">
      <h3>{t('Local AI models')}</h3>
      <p className="wtext">{t('Which model does which job. The recommendation fits this Mac; pick a lighter one if things feel slow, or a bigger one for better results.')}</p>
      <ModelChooser options={options} choice={choice} setChoice={setChoice} status={status} />
      <div className="wbtns">
        <button type="button" className="ghost-btn small accent" onClick={save} disabled={!changed && !(status && !status.ready)}>{changed ? t('Save and download') : t('Download what is missing')}</button>
        {msg ? <span className="count">{msg}</span> : null}
      </div>
    </div>
  );
}
