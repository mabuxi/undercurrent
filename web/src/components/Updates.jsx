import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';

// Change notes are short markdown: "### Heading" and "- item" lines.
export function Notes({ notes }) {
  return (
    <div className="upnotes">
      {notes.map((n) => (
        <section key={n.version}>
          <h4>Version {n.version}{n.date ? <span>{n.date}</span> : null}</h4>
          {n.text.split('\n').reduce((out, line) => {
            const t = line.trim();
            if (!t) return out;
            if (t.startsWith('### ')) out.push({ h: t.slice(4) });
            else if (/^[-*] /.test(t)) { const last = out[out.length - 1]; if (last?.li) last.li.push(t.slice(2)); else out.push({ li: [t.slice(2)] }); }
            else out.push({ p: t });
            return out;
          }, []).map((b, i) => (b.h ? <h5 key={i}>{b.h}</h5> : b.li ? <ul key={i}>{b.li.map((x, j) => <li key={j}>{x.replace(/\*\*/g, '')}</li>)}</ul> : <p key={i}>{b.p}</p>))}
        </section>
      ))}
    </div>
  );
}

// Waits for the server to come back on the new version, then reloads the page.
function waitForRestart(from) {
  let tries = 0;
  const t = setInterval(async () => {
    tries++;
    try {
      const s = await api('/status');
      if (s.version && s.version !== from) { clearInterval(t); window.location.reload(); }
    } catch {}
    if (tries > 240) clearInterval(t);
  }, 1500);
}

export function UpdateModal({ info, onClose }) {
  const [job, setJob] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!job || job.state !== 'running') return undefined;
    const t = setInterval(() => api('/update/job').then((j) => { setJob(j); if (j.state === 'done') waitForRestart(info.current); }).catch(() => {}), 1200);
    return () => clearInterval(t);
  }, [job?.state]); // eslint-disable-line react-hooks/exhaustive-deps
  async function start() {
    setErr(null);
    try {
      const j = await api('/update/apply', { method: 'POST', body: {} });
      if (j.error && j.state !== 'running') setErr(j.error);
      setJob(j);
      if (j.state === 'done') waitForRestart(info.current);
    } catch (e) { setErr(e.message); }
  }
  return (
    <div className="upmodal" role="dialog" aria-modal="true" aria-label="Update Undercurrent">
      <div className="upcard">
        <div className="uphead">
          <div><span className="upkicker">Update available</span><h3>Undercurrent {info.latest}</h3><span className="upsub">You have {info.current}</span></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <Notes notes={info.notes || []} />
        {job?.steps?.length ? <ul className="upsteps">{job.steps.map((s) => <li key={s.label} className={s.state}>{s.state === 'done' ? <Icon name="check" /> : <span className="spin" />}{s.label}</li>)}</ul> : null}
        {job?.state === 'running' && job.progress != null ? <div className="upbar"><span style={{ width: `${job.progress}%` }} /></div> : null}
        {job?.state === 'done' ? <p className="ob-note good">{job.relaunch ? 'Installed. Undercurrent closes and opens again on the new version in a moment…' : `Updated. Restarting${job.appRebuilt ? '. The Mac app itself was updated too: quit and open it again when this window is back' : ''}…`}</p> : null}
        {err || job?.error ? <p className="ob-note bad">{err || job.error}</p> : null}
        <div className="wbtns">
          <button type="button" className="ghost-btn accent" onClick={start} disabled={job?.state === 'running' || job?.state === 'done'}>{job?.state === 'running' ? 'Updating…' : 'Update now'}</button>
          <button type="button" className="ghost-btn" onClick={onClose}>Later</button>
        </div>
        <p className="wnote">Your kinks, history and settings are not touched by an update.</p>
      </div>
    </div>
  );
}

export function WhatsNew({ info, onClose }) {
  return (
    <div className="upmodal" role="dialog" aria-modal="true" aria-label="What's new">
      <div className="upcard">
        <div className="uphead">
          <div><span className="upkicker">What's new</span><h3>Undercurrent {info.version}</h3>{info.from ? <span className="upsub">Updated from {info.from}</span> : null}</div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <Notes notes={info.notes || []} />
        <div className="wbtns"><button type="button" className="ghost-btn accent" onClick={onClose}>Nice</button></div>
      </div>
    </div>
  );
}

// Checks GitHub now and then; the top bar shows a small button when there is a newer version.
export function useUpdates() {
  const [info, setInfo] = useState(null);
  const [news, setNews] = useState(null);
  useEffect(() => {
    const check = (fresh) => api(`/update/status${fresh ? '?fresh=1' : ''}`).then(setInfo).catch(() => {});
    check(false);
    const t = setInterval(() => check(true), 6 * 3600000);
    api('/update/whatsnew').then((w) => { if (w.show) setNews(w); }).catch(() => {});
    return () => clearInterval(t);
  }, []);
  return { info, setInfo, news, closeNews: () => { setNews(null); api('/update/seen', { method: 'POST', body: {} }).catch(() => {}); } };
}

export function VersionCard() {
  const [info, setInfo] = useState(null);
  const [log, setLog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const check = async (fresh) => { setBusy(true); try { setInfo(await api(`/update/status${fresh ? '?fresh=1' : ''}`)); } catch {} setBusy(false); };
  useEffect(() => { check(false); api('/update/changelog').then(setLog).catch(() => {}); }, []);
  return (
    <div className="card2">
      <h3>Version and updates <span className="count">{info?.current || log?.version || ''}</span></h3>
      {info?.available ? <p className="wtext">Version {info.latest} is available.</p> : info?.connected ? <p className="wtext">You have the newest version.</p> : null}
      {info?.error ? <p className="diag">{info.error}</p> : null}
      <div className="wbtns">
        <button type="button" className="ghost-btn small" onClick={() => check(true)} disabled={busy}><Icon name="refresh" />{busy ? 'Checking…' : 'Check for updates'}</button>
        {info?.available ? <button type="button" className="ghost-btn small accent" onClick={() => setOpen(true)}>See what's new and update</button> : null}
        <button type="button" className="ghost-btn small" onClick={async () => { await api('/setup/reset', { method: 'POST', body: {} }); window.location.reload(); }}>Show the welcome steps again</button>
      </div>
      {log?.notes?.length ? <details className="uplog"><summary>Change history</summary><Notes notes={log.notes} /></details> : null}
      {open && info ? <UpdateModal info={info} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
