import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';

const STEPS = ['Welcome', 'Local AI', 'Who', 'Kinks', 'Fantasies', 'Sources', 'Limits', 'Ready'];
const GB = (b) => (b / 1024 ** 3).toFixed(1);
const LIMIT_IDEAS = ['piss', 'feet', 'bondage', 'hentai', 'ai generated', 'toys', 'step family', 'cheating', 'bbw', 'trans'];

function Blobs({ colors }) {
  return (
    <div className="ob-blobs" aria-hidden="true">
      {colors.slice(0, 5).map((c, i) => <span key={i} style={{ '--c': c, '--i': i }} />)}
    </div>
  );
}

function Welcome({ ok, setOk }) {
  return (
    <div className="ob-step ob-welcome">
      <p className="ob-kicker">Welcome to</p>
      <h1 className="ob-title">Undercurrent</h1>
      <p className="ob-lede">One feed from all your sources, tuned to exactly what you're into. It learns from what you heat, like and save, and everything (your taste, your history, the AI) stays on this Mac.</p>
      <div className="ob-feats">
        <div><Icon name="eye" /><b>Private by design</b><span>No account, no cloud. The only thing that leaves your Mac is fetching posts.</span></div>
        <div><Icon name="flame" /><b>Learns your taste</b><span>Heat, likes and saves teach it. Your kinks build themselves and stay editable.</span></div>
        <div><Icon name="brain" /><b>Local AI</b><span>Models running on this Mac tag every post and look at the pictures.</span></div>
      </div>
      <label className="ob-check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span>I'm 18 or older, and adult content is legal where I am.</span></label>
    </div>
  );
}

function LocalAi({ status, reload }) {
  const [busy, setBusy] = useState(false);
  const st = status;
  if (!st) return <div className="ob-step"><p className="ob-lede">Checking this Mac…</p></div>;
  const missing = st.models.filter((m) => !m.present && !m.shared);
  const pulling = st.models.some((m) => m.pull && !m.pull.done);
  const total = [...new Map(st.models.map((m) => [m.name, m])).values()].reduce((a, m) => a + (m.present ? 0 : m.size), 0);
  async function go(path) {
    setBusy(true);
    try { await api(path, { method: 'POST', body: {} }); } catch {}
    setBusy(false);
    reload();
  }
  return (
    <div className="ob-step">
      <h2 className="ob-h">The local AI</h2>
      <p className="ob-lede">Undercurrent uses Ollama to run AI models on this Mac. They tag posts, look at pictures and power the assistant. Nothing is sent anywhere.</p>
      <div className={`ob-card ${st.ollama.running ? 'good' : ''}`}>
        <span className="ob-dot" /><div className="ob-grow"><b>Ollama</b><span>{st.ollama.running ? `Running${st.ollama.version ? `, version ${st.ollama.version}` : ''}` : st.ollama.installed ? 'Installed, starting it…' : 'Not on this Mac yet'}</span></div>
        {!st.ollama.installed ? (
          st.ollama.install.state === 'downloading' ? <span className="ob-pct">{st.ollama.install.total ? `${Math.round((st.ollama.install.received / st.ollama.install.total) * 100)}%` : 'downloading'}</span>
            : st.ollama.install.state === 'unpacking' ? <span className="ob-pct">installing</span>
              : <button type="button" className="ob-btn" onClick={() => go('/setup/ollama')} disabled={busy}>Install Ollama</button>
        ) : null}
      </div>
      {st.ollama.install.error ? <p className="ob-note bad">Installing Ollama failed: {st.ollama.install.error}. You can get it from ollama.com.</p> : null}
      <div className="ob-models">
        {st.models.map((m) => {
          const p = m.pull;
          const pct = p?.total ? Math.round((p.completed / p.total) * 100) : 0;
          return (
            <div key={m.role} className={`ob-card ${m.present ? 'good' : ''}`}>
              <span className="ob-dot" />
              <div className="ob-grow">
                <b>{m.what}</b>
                <span>{m.name} · {m.size} GB{m.shared ? ' · uses the same model' : ''}</span>
                {p && !p.done ? <div className="ob-bar"><i style={{ width: `${pct}%` }} /></div> : null}
                {p?.error ? <span className="bad">{p.error}</span> : null}
              </div>
              <span className="ob-pct">{m.present ? <Icon name="check" /> : p && !p.done ? `${pct}%${p.total ? ` of ${GB(p.total)} GB` : ''}` : 'missing'}</span>
            </div>
          );
        })}
      </div>
      {missing.length && st.ollama.running ? (
        <button type="button" className="ob-btn big" onClick={() => go('/setup/models')} disabled={busy || pulling}>{pulling ? 'Downloading… you can go on meanwhile' : `Download the models (${Math.round(total)} GB)`}</button>
      ) : null}
      {st.ready ? <p className="ob-note good">Everything is ready.</p> : <p className="ob-note">This Mac has {st.memoryGb} GB of memory{st.memoryGb < 30 ? ', so the assistant uses the 9B model instead of the big one' : ''}. Downloads keep going while you set up the rest.</p>}
    </div>
  );
}

function Who({ gender, setGender }) {
  const men = gender.male;
  return (
    <div className="ob-step">
      <h2 className="ob-h">Who do you want to see?</h2>
      <p className="ob-lede">Slide toward who you're into. You can change it any time above the feed, or let it follow what you like.</p>
      <div className="ob-who">
        <div className="ob-face f" style={{ '--s': 0.55 + (100 - men) / 160 }}><Icon name="female" /><span>{100 - men}%</span></div>
        <div className="ob-face m" style={{ '--s': 0.55 + men / 160 }}><Icon name="male" /><span>{men}%</span></div>
      </div>
      <input className="uslider gender ob-slider" type="range" min="0" max="100" step="5" value={men} disabled={gender.auto} onChange={(e) => setGender({ ...gender, male: Number(e.target.value) })} aria-label="Balance between women and men" />
      <p className="ob-center">{men >= 90 ? 'Men only' : men <= 10 ? 'Women only' : `${100 - men}% women · ${men}% men`}</p>
      <div className="ob-toggles">
        <button type="button" className={`ob-toggle${gender.auto ? ' on' : ''}`} onClick={() => setGender({ ...gender, auto: !gender.auto })}><Icon name="auto" />Follow what I like</button>
        <button type="button" className={`ob-toggle${gender.trans ? ' on' : ''}`} onClick={() => setGender({ ...gender, trans: !gender.trans })}><Icon name="trans" />Trans content {gender.trans ? 'on' : 'off'}</button>
      </div>
    </div>
  );
}

function Kinks({ families, picked, setPicked }) {
  const [sugg, setSugg] = useState([]);
  const [own, setOwn] = useState('');
  const [open, setOpen] = useState(null);
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    if (!picked.length) { setSugg([]); return undefined; }
    timer.current = setTimeout(() => api('/setup/suggest', { method: 'POST', body: { picked } }).then((r) => setSugg(r.suggestions)).catch(() => {}), 250);
    return () => clearTimeout(timer.current);
  }, [picked.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (c) => setPicked(picked.includes(c) ? picked.filter((x) => x !== c) : [...picked, c]);
  const colorOf = useMemo(() => { const m = new Map(); for (const f of families) for (const c of f.concepts) m.set(c.concept, f.color); return m; }, [families]);
  const nameOf = useMemo(() => { const m = new Map(); for (const f of families) for (const c of f.concepts) m.set(c.concept, c.name); return m; }, [families]);
  return (
    <div className="ob-step wide">
      <h2 className="ob-h">What are you into?</h2>
      <p className="ob-lede">Pick the specific things you keep coming back to. They become your first kinks, each in its family's colour. Undercurrent adds and fades kinks by itself later, from what you really heat, like and save.</p>
      {picked.length ? (
        <div className="ob-picked">
          <span className="ob-label">{picked.length} picked</span>
          {picked.map((c) => <button type="button" key={c} className="ob-chip on" style={{ '--c': colorOf.get(c) || '#E39A83' }} onClick={() => toggle(c)}>{nameOf.get(c) || c}<Icon name="x" /></button>)}
        </div>
      ) : null}
      {sugg.length ? (
        <div className="ob-sugg">
          <span className="ob-label"><Icon name="spark" />Goes well with that</span>
          {sugg.map((s) => <button type="button" key={s.concept} className="ob-chip sugg" style={{ '--c': s.color || '#E39A83' }} onClick={() => toggle(s.concept)}>+ {s.name}</button>)}
        </div>
      ) : null}
      <div className="ob-fams">
        {families.map((f) => {
          const n = f.concepts.filter((c) => picked.includes(c.concept)).length;
          const shown = open === f.key ? f.concepts : f.concepts.slice(0, 8);
          return (
            <section key={f.key} className="ob-fam" style={{ '--c': f.color }}>
              <header><span className="ob-swatch" /><b>{f.name}</b>{n ? <em>{n}</em> : null}</header>
              <div className="ob-tiles">
                {shown.map((c) => (
                  <button type="button" key={c.concept} className={`ob-tile${picked.includes(c.concept) ? ' on' : ''}`} onClick={() => toggle(c.concept)} aria-pressed={picked.includes(c.concept)}>
                    {c.name}{picked.includes(c.concept) ? <Icon name="check" /> : null}
                  </button>
                ))}
                {f.concepts.length > 8 ? <button type="button" className="ob-tile more" onClick={() => setOpen(open === f.key ? null : f.key)}>{open === f.key ? 'Less' : `+${f.concepts.length - 8} more`}</button> : null}
              </div>
            </section>
          );
        })}
      </div>
      <form className="ob-own" onSubmit={(e) => { e.preventDefault(); const v = own.trim().toLowerCase(); if (v && !picked.includes(v)) setPicked([...picked, v]); setOwn(''); }}>
        <input value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Something else? Type it, like grey sweatpants" aria-label="Add your own" />
        <button type="submit" className="ob-btn">Add</button>
      </form>
    </div>
  );
}

function Fantasies({ picked, chosen, setChosen, list, setList }) {
  const [loading, setLoading] = useState(false);
  const [own, setOwn] = useState({ name: '', description: '' });
  useEffect(() => {
    if (list || picked.length < 2) return;
    setLoading(true);
    api('/setup/fantasies', { method: 'POST', body: { picked } }).then((r) => setList(r.fantasies)).catch(() => setList([])).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const has = (f) => chosen.some((x) => x.name === f.name);
  return (
    <div className="ob-step">
      <h2 className="ob-h">Any fantasies?</h2>
      <p className="ob-lede">A fantasy ties a few kinks together into a scenario. Pick any that speak to you; the feed and the map use them. This step is optional.</p>
      {picked.length < 2 ? <p className="ob-note">Pick at least two kinks to get fantasy ideas, or write your own below.</p> : null}
      {loading ? <p className="ob-note"><span className="spinner inline" /> Writing a few ideas from your picks…</p> : null}
      <div className="ob-fants">
        {(list || []).map((f) => (
          <button type="button" key={f.name} className={`ob-fant${has(f) ? ' on' : ''}`} onClick={() => setChosen(has(f) ? chosen.filter((x) => x.name !== f.name) : [...chosen, f])}>
            <b>{f.name}</b><span>{f.description}</span>{has(f) ? <Icon name="check" /> : null}
          </button>
        ))}
      </div>
      {picked.length >= 1 ? (
        <form className="ob-own col" onSubmit={(e) => { e.preventDefault(); if (!own.name.trim()) return; setChosen([...chosen, { name: own.name.trim(), description: own.description.trim(), concepts: picked.slice(0, 3) }]); setOwn({ name: '', description: '' }); }}>
          <input value={own.name} onChange={(e) => setOwn({ ...own, name: e.target.value })} placeholder="Your own fantasy, name it" aria-label="Fantasy name" />
          <input value={own.description} onChange={(e) => setOwn({ ...own, description: e.target.value })} placeholder="Describe it in one sentence (optional)" aria-label="Fantasy description" />
          <button type="submit" className="ob-btn">Add fantasy</button>
        </form>
      ) : null}
    </div>
  );
}

function Sources({ sources, on, setOn }) {
  return (
    <div className="ob-step">
      <h2 className="ob-h">Where should posts come from?</h2>
      <p className="ob-lede">Most popular first. Turn on as many as you like; you can add searches, creators and communities to each one later in Settings.</p>
      <div className="ob-sources">
        {sources.map((s) => {
          const locked = !s.hasKeys;
          const enabled = !locked && (on[s.id] ?? s.enabled);
          return (
            <button type="button" key={s.id} className={`ob-src${enabled ? ' on' : ''}${locked ? ' locked' : ''}`} onClick={() => !locked && setOn({ ...on, [s.id]: !enabled })} disabled={locked} title={locked ? (s.needs === 'lustpress' ? 'Needs a scraper server (Settings)' : 'Needs a key (Settings)') : s.about}>
              <span className="ob-srcbadge">{s.label.slice(0, 2)}</span>
              <span className="ob-grow"><b>{s.label}</b><span>{locked ? (s.needs === 'lustpress' ? 'Needs a scraper server, set it up later in Settings' : 'Needs a free key, add it later in Settings') : s.about}</span></span>
              <span className={`ob-switch${enabled ? ' on' : ''}`} aria-hidden="true"><i /></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Limits({ limits, setLimits }) {
  const [v, setV] = useState('');
  const toggle = (t) => setLimits(limits.includes(t) ? limits.filter((x) => x !== t) : [...limits, t]);
  return (
    <div className="ob-step">
      <h2 className="ob-h">Anything you never want to see?</h2>
      <p className="ob-lede">Hard limits are hidden everywhere, always. Optional, and editable later in Settings.</p>
      <div className="ob-limits">
        {[...new Set([...LIMIT_IDEAS, ...limits])].map((t) => <button type="button" key={t} className={`ob-chip limit${limits.includes(t) ? ' on' : ''}`} onClick={() => toggle(t)}>{limits.includes(t) ? <Icon name="x" /> : null}{t}</button>)}
      </div>
      <form className="ob-own" onSubmit={(e) => { e.preventDefault(); const t = v.trim().toLowerCase(); if (t && !limits.includes(t)) setLimits([...limits, t]); setV(''); }}>
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Type a tag to never see" aria-label="Add a limit" />
        <button type="submit" className="ob-btn">Add</button>
      </form>
    </div>
  );
}

function Ready({ picked, fantasies, sourcesOn, status }) {
  return (
    <div className="ob-step ob-welcome">
      <p className="ob-kicker">All set</p>
      <h1 className="ob-title">Your feed is ready</h1>
      <div className="ob-sum">
        <div><b>{picked}</b><span>kinks to start with</span></div>
        <div><b>{fantasies}</b><span>fantasies</span></div>
        <div><b>{sourcesOn}</b><span>sources</span></div>
      </div>
      <p className="ob-lede">Heat what turns you on, like and save what you love. Your kinks grow from that, and you'll find them on your map.{status && !status.ready ? ' The models are still downloading; posts get tagged as soon as they are in.' : ''}</p>
    </div>
  );
}

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const [ok, setOk] = useState(false);
  const [status, setStatus] = useState(null);
  const [families, setFamilies] = useState([]);
  const [picked, setPicked] = useState([]);
  const [fantList, setFantList] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [gender, setGender] = useState({ male: 50, auto: false, trans: true });
  const [sources, setSources] = useState([]);
  const [srcOn, setSrcOn] = useState({});
  const [limits, setLimits] = useState([]);
  const [saving, setSaving] = useState(false);
  const [dir, setDir] = useState(1);
  const [err, setErr] = useState(null);

  const reload = () => api('/setup/status').then(setStatus).catch(() => {});
  useEffect(() => {
    reload();
    api('/setup/concepts').then((r) => { setFamilies(r.families); setPicked(r.picked || []); }).catch(() => {});
    api('/settings/gender').then((g) => setGender({ male: g.male ?? 50, auto: !!g.auto, trans: g.trans !== false })).catch(() => {});
    api('/setup/sources').then((r) => setSources(r.sources)).catch(() => {});
    api('/limits').then((r) => setLimits((r.limits || []).map((x) => x.tag || x))).catch(() => {});
  }, []);
  // While models download, keep the progress fresh.
  useEffect(() => {
    const busy = status && (status.models.some((m) => m.pull && !m.pull.done) || ['downloading', 'unpacking'].includes(status.ollama.install.state) || (!status.ollama.running && status.ollama.installed));
    if (!busy) return undefined;
    const t = setInterval(reload, 1500);
    return () => clearInterval(t);
  }, [status]);

  // Skips the fantasies step when there is nothing to tie together.
  const go = (d) => {
    setDir(d);
    setStep((s) => {
      let n = Math.max(0, Math.min(STEPS.length - 1, s + d));
      if (n === 4 && picked.length < 1) n += d;
      return n;
    });
  };
  async function finish() {
    setSaving(true);
    const sourcesOut = Object.fromEntries(sources.filter((s) => s.hasKeys).map((s) => [s.id, srcOn[s.id] ?? s.enabled]));
    try {
      await api('/setup/finish', { method: 'POST', body: { picked, fantasies: chosen, gender, sources: sourcesOut, limits } });
      onDone();
    } catch (e) { setSaving(false); setErr(e.message); }
  }
  const colors = useMemo(() => {
    const byConcept = new Map(families.flatMap((f) => f.concepts.map((c) => [c.concept, f.color])));
    const mine = picked.map((c) => byConcept.get(c)).filter(Boolean);
    return [...new Set([...mine.reverse(), '#E39A83', '#A58FE0', '#66B5A6', '#E8C66B', '#7FA7D9'])];
  }, [picked, families]);
  const sourcesOn = sources.filter((s) => s.hasKeys && (srcOn[s.id] ?? s.enabled)).length;

  return (
    <div className="ob" role="dialog" aria-modal="true" aria-label="Welcome to Undercurrent">
      <Blobs colors={colors} />
      <div className="ob-frame">
        <header className="ob-top">
          <span className="ob-brand">Undercurrent</span>
          <ol className="ob-dots">{STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''} title={s}><span>{s}</span></li>)}</ol>
          {step > 0 && step < STEPS.length - 1 ? <button type="button" className="ob-skip" onClick={finish}>Skip the rest</button> : <span />}
        </header>
        <main className={`ob-body dir${dir > 0 ? 'f' : 'b'}`} key={step}>
          {step === 0 ? <Welcome ok={ok} setOk={setOk} /> : null}
          {step === 1 ? <LocalAi status={status} reload={reload} /> : null}
          {step === 2 ? <Who gender={gender} setGender={setGender} /> : null}
          {step === 3 ? <Kinks families={families} picked={picked} setPicked={setPicked} /> : null}
          {step === 4 ? <Fantasies picked={picked} chosen={chosen} setChosen={setChosen} list={fantList} setList={setFantList} /> : null}
          {step === 5 ? <Sources sources={sources} on={srcOn} setOn={setSrcOn} /> : null}
          {step === 6 ? <Limits limits={limits} setLimits={setLimits} /> : null}
          {step === 7 ? <Ready picked={picked.length} fantasies={chosen.length} sourcesOn={sourcesOn} status={status} /> : null}
        </main>
        {err ? <p className="ob-note bad ob-err">{err}</p> : null}
        <footer className="ob-foot">
          {step > 0 ? <button type="button" className="ob-btn ghost" onClick={() => go(-1)}><Icon name="chevL" />Back</button> : <span />}
          {step < STEPS.length - 1
            ? <button type="button" className="ob-btn primary" onClick={() => go(1)} disabled={step === 0 && !ok}>{step === 0 ? 'Get started' : step === 3 && !picked.length ? 'Skip for now' : 'Continue'}<Icon name="chevR" /></button>
            : <button type="button" className="ob-btn primary" onClick={finish} disabled={saving}>{saving ? 'Saving…' : 'Start exploring'}<Icon name="chevR" /></button>}
        </footer>
      </div>
    </div>
  );
}
