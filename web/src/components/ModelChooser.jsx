import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';

const GB = (b) => (b / 1024 ** 3).toFixed(1);

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
  if (!options) return <p className="ob-note">Checking this Mac…</p>;
  const prog = new Map((status?.models || []).map((m) => [m.name, m]));
  return (
    <div className="mc">
      <p className="mc-sys"><Icon name="bolt" />{options.system.chip} · {options.system.memoryGb} GB memory · {options.system.cores} cores</p>
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
              <span className="ob-pct">{st?.present || opt?.installed ? <><Icon name="check" />on this Mac</> : p && !p.done ? `${pct}%${p.total ? ` of ${GB(p.total)} GB` : ''}` : p?.error ? 'failed' : opt?.size ? `${opt.size} GB download` : 'download'}</span>
            </div>
            {p && !p.done ? <div className="ob-bar"><i style={{ width: `${pct}%` }} /></div> : null}
            {p?.error ? <p className="ob-note bad">{p.error}</p> : null}
            <div className="mc-opts" role="radiogroup" aria-label={r.label}>
              {r.options.filter((o) => !o.custom || o.name === sel).map((o) => (
                <button type="button" role="radio" aria-checked={o.name === sel} key={o.name} className={`mc-opt${o.name === sel ? ' on' : ''}${o.fits === false ? ' heavy' : ''}`} onClick={() => setChoice({ ...choice, [role]: o.name })} title={o.name}>
                  <span className="mc-name">{modelLabel(o.name)}{o.recommended ? <em className="mc-rec">Recommended</em> : null}{o.installed ? <em className="mc-have">installed</em> : null}</span>
                  <span className="mc-note">{o.note}{o.size ? ` · ${o.size} GB` : ''}{o.fits === false ? ` · needs ${o.minGb} GB memory, may be slow` : ''}</span>
                </button>
              ))}
              {isCustom ? (
                <form className="mc-custom" onSubmit={(e) => { e.preventDefault(); const v = custom[role].trim(); if (v) setChoice({ ...choice, [role]: v }); setCustom({ ...custom, [role]: undefined }); }}>
                  <input autoFocus value={custom[role]} onChange={(e) => setCustom({ ...custom, [role]: e.target.value })} placeholder="Any Ollama model, like llama3.2:3b" aria-label={`Other model for ${r.label}`} />
                  <button type="submit" className="ob-btn">Use</button>
                </form>
              ) : <button type="button" className="mc-other" onClick={() => setCustom({ ...custom, [role]: '' })}>Other model…</button>}
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
    const t = setInterval(() => api('/setup/status').then(setStatus).catch(() => {}), 1500);
    return () => clearInterval(t);
  }, [status?.pulling]);
  const changed = options && Object.entries(choice).some(([r, n]) => n && n !== options.roles[r]?.chosen);
  async function save() {
    try {
      const r = await api('/setup/models/choice', { method: 'PUT', body: { ...choice, pull: true } });
      setOptions(r);
      setChoice({});
      setMsg(r.pull?.missing?.length ? `Saved. Downloading ${r.pull.missing.length} ${r.pull.missing.length === 1 ? 'model' : 'models'}…` : r.pull?.error ? `Saved. ${r.pull.error}` : 'Saved. Everything is already on this Mac.');
      load();
    } catch (e) { setMsg(e.message); }
  }
  return (
    <div className="card2">
      <h3>Local AI models</h3>
      <p className="wtext">Which model does which job. The recommendation fits this Mac; pick a lighter one if things feel slow, or a bigger one for better results.</p>
      <ModelChooser options={options} choice={choice} setChoice={setChoice} status={status} />
      <div className="wbtns">
        <button type="button" className="ghost-btn small accent" onClick={save} disabled={!changed && !(status && !status.ready)}>{changed ? 'Save and download' : 'Download what is missing'}</button>
        {msg ? <span className="count">{msg}</span> : null}
      </div>
    </div>
  );
}
