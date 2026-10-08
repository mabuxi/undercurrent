import { useEffect, useMemo, useRef, useState } from 'react';
import { LanguageSwitch } from './Language.jsx';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { ModelChooser } from './ModelChooser.jsx';
import { t, tn } from '../i18n.js';

const STEPS = [t('Welcome'), t('Local AI'), t('Who'), t('Kinks'), t('Fantasies'), t('Sources'), t('Limits'), t('Ready')];
const FAMILY_ICON = { ethnicity: 'globe', body: 'body', positions: 'twist', types: 'person', oral: 'lips', sex: 'flame', solo: 'hand', cum: 'drop', dynamic: 'bolt', clothing: 'shirt', places: 'pin', scenarios: 'book', group: 'people', camera: 'video', fluids: 'wave', drawn: 'edit' };

// A big icon above each step's title.
function StepIcon({ name }) {
  return <span className="ob-hicon" aria-hidden="true"><Icon name={name} /></span>;
}

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
      <LanguageSwitch compact />
      <img className="ob-appicon" src="/icon-192.png" alt="" width="84" height="84" />
      <p className="ob-kicker">{t('Welcome to')}</p>
      <h1 className="ob-title">Undercurrent</h1>
      <p className="ob-lede">{t("One feed from all your sources, tuned to exactly what you're into. It learns from what you heat, like and save, and everything (your taste, your history, the AI) stays on this Mac.")}</p>
      <div className="ob-feats">
        <div><Icon name="eye" /><b>{t('Private by design')}</b><span>{t('No account, no cloud. The only thing that leaves your Mac is fetching posts.')}</span></div>
        <div><Icon name="flame" /><b>{t('Learns your taste')}</b><span>{t('Heat, likes and saves teach it. Your kinks build themselves and stay editable.')}</span></div>
        <div><Icon name="brain" /><b>{t('Local AI')}</b><span>{t('Models running on this Mac tag every post and look at the pictures.')}</span></div>
      </div>
      <label className="ob-check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span>{t("I'm 18 or older, and adult content is legal where I am.")}</span></label>
    </div>
  );
}

function LocalAi({ status, options, choice, setChoice, aiCheck, asked }) {
  const st = status;
  if (!st) return <div className="ob-step"><p className="ob-lede">{t('Checking this Mac…')}</p></div>;
  const inst = st.ollama.install;
  return (
    <div className="ob-step">
      <StepIcon name="brain" />
      <h2 className="ob-h">{t('The local AI')}</h2>
      <p className="ob-lede">{t('Undercurrent runs AI models on this Mac with Ollama. They tag posts, look at pictures and power the assistant. Nothing is sent anywhere. The recommended models fit this Mac; choose others if you like. They download first; the next steps open once they run and answer.')}</p>
      <div className={`ob-card ${st.ollama.running ? 'good' : ''}`}>
        <span className="ob-dot" /><div className="ob-grow"><b>Ollama</b><span>{st.ollama.running ? (st.ollama.version ? t('Running, version {v}', { v: st.ollama.version }) : t('Running')) : st.ollama.installed ? t('Installed, starting it…') : inst.state === 'downloading' ? t('Downloading from ollama.com…') : inst.state === 'unpacking' ? t('Installing in Applications…') : t('Getting it ready…')}</span>
          {inst.state === 'downloading' && inst.total ? <div className="ob-bar"><i style={{ width: `${Math.round((inst.received / inst.total) * 100)}%` }} /></div> : null}
        </div>
        {st.ollama.running ? <span className="ob-pct"><Icon name="check" /></span> : <span className="spinner inline" />}
      </div>
      {inst.error ? <p className="ob-note bad">{t('Installing Ollama failed: {error}. You can get it from ollama.com and open Undercurrent again.', { error: inst.error })}</p> : null}
      <ModelChooser options={options} choice={choice} setChoice={setChoice} status={st} />
      <div className={`ob-card ob-aicheck ${aiCheck?.ok ? 'good' : aiCheck?.ok === false && !aiCheck.waiting ? 'bad' : ''}`}>
        <span className="ob-dot" />
        <div className="ob-grow"><b>{t('Ready to use')}</b><span>{aiCheck?.ok ? t('The models are downloaded, running and answering.') : aiCheck === 'checking' ? t('Asking the models a test question…') : aiCheck?.ok === false && !aiCheck.waiting ? t('A model did not answer: {error}', { error: aiCheck.models?.find((m) => !m.ok)?.error || '?' }) : st.ready ? t('Checking that they run…') : asked ? t('Downloading the models. The next step opens when they are in and answer.') : t('Download the models to go on. This can take a while the first time.')}</span></div>
        {aiCheck?.ok ? <span className="ob-pct"><Icon name="check" /></span> : aiCheck === 'checking' || (asked && !st.ready) ? <span className="spinner inline" /> : null}
      </div>
      {st.ready ? <p className="ob-note good">{t('Everything is on this Mac already.')}</p> : null}
    </div>
  );
}

function Who({ gender, setGender }) {
  const men = gender.male;
  return (
    <div className="ob-step">
      <StepIcon name="people" />
      <h2 className="ob-h">{t('Who do you want to see?')}</h2>
      <p className="ob-lede">{t("Slide toward who you're into. You can change it any time above the feed, or let it follow what you like.")}</p>
      <div className="ob-who">
        <div className="ob-face f" style={{ '--s': 0.55 + (100 - men) / 160 }}><Icon name="female" /><span>{100 - men}%</span></div>
        {men >= 45 && men <= 55 ? <div className="ob-plus" aria-hidden="true">+</div> : null}
        <div className="ob-face m" style={{ '--s': 0.55 + men / 160 }}><Icon name="male" /><span>{men}%</span></div>
      </div>
      <div className="ob-slidewrap">
        <span className="ob-band" style={{ left: '45%', width: '10%' }} aria-hidden="true" />
        <input className="uslider gender ob-slider" type="range" min="0" max="100" step="5" value={men} disabled={gender.auto} onChange={(e) => setGender({ ...gender, male: Number(e.target.value) })} aria-label={t('Balance between women and men')} />
      </div>
      <div className="ob-scale" aria-hidden="true"><span>{t('Women only')}</span><span>{t('Hetero')}</span><span>{t('Men only')}</span></div>
      <p className="ob-center"><b>{men >= 90 ? t('Men only') : men <= 10 ? t('Women only') : men >= 45 && men <= 55 ? t('Hetero only: a man and a woman together') : t('{w}% women · {m}% men', { w: 100 - men, m: men })}</b></p>
      <div className="ob-toggles">
        <button type="button" className={`ob-toggle${gender.auto ? ' on' : ''}`} onClick={() => setGender({ ...gender, auto: !gender.auto })}><Icon name="auto" />{t('Follow what I like')}</button>
        <button type="button" className={`ob-toggle${gender.trans ? ' on' : ''}`} onClick={() => setGender({ ...gender, trans: !gender.trans })}><Icon name="trans" />{gender.trans ? t('Trans content on') : t('Trans content off')}</button>
      </div>
    </div>
  );
}

function Kinks({ families, picked, setPicked, male }) {
  const [sugg, setSugg] = useState([]);
  const [own, setOwn] = useState('');
  const [open, setOpen] = useState(null);
  const [extra, setExtra] = useState({});
  const [genBusy, setGenBusy] = useState(null);
  const [genNone, setGenNone] = useState({});
  const last = useRef(null);
  // Every pick brings its own related kinks: they are added in front of the earlier ones and stay, so the list keeps
  // growing as you click. What you pick leaves the list.
  const [thinking, setThinking] = useState(null);
  const extraFam = useRef(new Map());
  const famOf = useMemo(() => { const m = new Map(); for (const f of families) for (const c of f.concepts) m.set(c.concept, f.key); return m; }, [families]);
  // What is on screen right now (not what is hidden behind "+ more"), so the AI does not repeat it but may still
  // bring up a hidden one.
  const visibleRef = useRef(new Set());
  const shownAll = () => [...visibleRef.current, ...picked];
  const reqId = useRef(0);
  // Every pick asks the local model for more (in that pick's family and in others). Answers are always kept, also
  // when you picked something else in the meantime; the family you clicked in shows that it is thinking.
  useEffect(() => {
    if (!picked.length) { setSugg([]); return undefined; }
    const focus = last.current;
    const fam = focus ? famOf.get(focus) || extraFam.current.get(focus) || null : null;
    const tm = setTimeout(() => {
      const id = ++reqId.current;
      if (fam) setThinking(fam);
      api('/setup/suggest', { method: 'POST', body: { picked, focus, male, shown: shownAll() } }).then((r) => {
        setSugg((cur) => {
          const fresh = (r.suggestions || []).filter((x) => !picked.includes(x.concept));
          const added = fresh.filter((x) => !cur.some((c) => c.concept === x.concept));
          return [...added, ...cur].slice(0, 160);
        });
      }).catch(() => {}).finally(() => { if (id === reqId.current) setThinking(null); });
    }, 200);
    return () => clearTimeout(tm);
  }, [picked.join('|'), male]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (c, meta = null) => {
    if (picked.includes(c)) { setPicked(picked.filter((x) => x !== c)); last.current = null; return; }
    // A kink the model came up with stays in its family once picked.
    if (meta?.family && !famOf.has(c)) {
      extraFam.current.set(c, meta.family);
      setExtra((cur) => ({ ...cur, [meta.family]: [...(cur[meta.family] || []).filter((x) => x.concept !== c), { concept: c, name: meta.name, custom: true }] }));
    }
    last.current = c;
    setPicked([...picked, c]);
  };
  const colorOf = useMemo(() => { const m = new Map(); for (const f of families) for (const c of [...f.concepts, ...(extra[f.key] || [])]) m.set(c.concept, f.color); return m; }, [families, extra]);
  const nameOf = useMemo(() => { const m = new Map(); for (const f of families) for (const c of [...f.concepts, ...(extra[f.key] || [])]) m.set(c.concept, c.name); for (const x of sugg) m.set(x.concept, x.name); return m; }, [families, extra, sugg]);
  async function generate(f, shown) {
    setGenBusy(f.key);
    try {
      const r = await api('/setup/more', { method: 'POST', body: { family: f.key, picked, shown: [...new Set([...shownAll(), ...sugg.filter((x) => x.family === f.key).map((x) => x.concept)])], male } });
      const more = (r.more || []).filter((x) => !visibleRef.current.has(x.concept) && !picked.includes(x.concept)).map((x) => ({ ...x, family: f.key }));
      if (more.length) setSugg((cur) => [...more.filter((x) => !cur.some((c) => c.concept === x.concept)), ...cur]);
      setGenNone((cur) => ({ ...cur, [f.key]: !more.length }));
    } catch { setGenNone((cur) => ({ ...cur, [f.key]: true })); } finally { setGenBusy(null); }
  }
  return (
    <div className="ob-step wide">
      <StepIcon name="flame" />
      <h2 className="ob-h">{t('What are you into?')}</h2>
      <p className="ob-lede">{t("Pick the specific things you keep coming back to. They become your first kinks, each in its family's colour. Undercurrent adds and fades kinks by itself later, from what you really heat, like and save.")}</p>
      {picked.length ? (
        <div className="ob-picked">
          <span className="ob-label">{tn(picked.length, '{n} picked', '{n} picked')}</span>
          {picked.map((c) => <button type="button" key={c} className="ob-chip on" style={{ '--c': colorOf.get(c) || '#E39A83' }} onClick={() => toggle(c)}>{nameOf.get(c) || c}<Icon name="x" /></button>)}
        </div>
      ) : null}
      <div className="ob-fams">
        {(visibleRef.current = new Set()) && null}
        {families.map((f, fi) => {
          const all = [...f.concepts, ...(extra[f.key] || []).filter((x) => !f.concepts.some((c) => c.concept === x.concept))];
          const n = all.filter((c) => picked.includes(c.concept)).length;
          // Countries and regions only show under a continent you picked.
          const tops = all.filter((c) => !c.parent);
          const kidsOf = (c) => all.filter((k) => k.parent === c.concept && (picked.includes(c.concept) || all.some((x) => x.parent === c.concept && picked.includes(x.concept))));
          // At least six you have not picked yet stay in view: picking from a family brings the next ones up.
          let count = Math.min(tops.length, 8);
          while (count < tops.length && tops.slice(0, count).filter((c) => !picked.includes(c.concept)).length < 6) count++;
          // What you picked always stays in view, also a kink the AI added that would be past the first ones.
          const windowed = open === f.key ? tops : tops.filter((c, i) => i < count || picked.includes(c.concept));
          const inView = new Set([...windowed.map((c) => c.concept), ...windowed.flatMap((c) => kidsOf(c).map((k) => k.concept))]);
          // Suggestions only bring up what is not on screen yet: hidden behind "more", or new to this family.
          const sug = sugg.filter((x) => x.family === f.key && !picked.includes(x.concept) && !inView.has(x.concept)).slice(0, 6);
          const sugSet = new Set(sug.map((x) => x.concept));
          for (const c of [...inView, ...sugSet]) visibleRef.current.add(c);
          const hidden = tops.filter((c) => !inView.has(c.concept) && !sugSet.has(c.concept)).length;
          return (
            <section key={f.key} className={`ob-fam${sug.length ? ' has-sugg' : ''}`} style={{ '--c': f.color, '--i': fi }}>
              <header><span className="ob-famicon"><Icon name={FAMILY_ICON[f.key] || 'spark'} /></span><b>{f.name}</b>{n ? <em>{n}</em> : null}</header>
              <div className="ob-tiles">
                {thinking === f.key ? <span className="ob-tile thinking" aria-live="polite"><span className="spinner inline" />{t('Thinking of more…')}</span> : null}
                {sug.map((x) => (
                  <button type="button" key={`s-${x.concept}`} className={`ob-tile sugg${x.ai ? ' ai' : ''}`} onClick={() => toggle(x.concept, x)} title={x.ai ? t('Suggested by the local AI from your picks') : t('Goes well with that')}>
                    <Icon name="plus" />{x.name}
                  </button>
                ))}
                {windowed.map((c) => [
                  <button type="button" key={c.concept} className={`ob-tile${picked.includes(c.concept) ? ' on' : ''}${c.custom ? ' gen' : ''}`} onClick={() => toggle(c.concept)} aria-pressed={picked.includes(c.concept)}>
                    {c.name}{picked.includes(c.concept) ? <Icon name="check" /> : null}
                  </button>,
                  ...kidsOf(c).map((k) => (
                    <button type="button" key={k.concept} className={`ob-tile kid${picked.includes(k.concept) ? ' on' : ''}`} onClick={() => toggle(k.concept)} aria-pressed={picked.includes(k.concept)}>
                      {k.name}{picked.includes(k.concept) ? <Icon name="check" /> : null}
                    </button>
                  ))
                ])}
                {hidden > 0 || open === f.key ? <button type="button" className="ob-tile more" onClick={() => setOpen(open === f.key ? null : f.key)}>{open === f.key ? t('Less') : t('+{n} more', { n: hidden })}</button> : null}
                <button type="button" className={`ob-tile genmore${genBusy === f.key ? ' busy' : ''}`} onClick={() => generate(f, [...all.map((c) => c.concept), ...sug.map((x) => x.concept)])} disabled={genBusy === f.key} title={t('More like this, from who you want to see and what you picked')}>
                  {genBusy === f.key ? <span className="spinner inline" /> : <Icon name="why" />}{genNone[f.key] ? t('Nothing more for now') : t('Generate more')}
                </button>
              </div>
            </section>
          );
        })}
      </div>
      <form className="ob-own" onSubmit={(e) => { e.preventDefault(); const v = own.trim().toLowerCase(); if (v && !picked.includes(v)) setPicked([...picked, v]); setOwn(''); }}>
        <input value={own} onChange={(e) => setOwn(e.target.value)} placeholder={t('Something else? Type it, like grey sweatpants')} aria-label={t('Add your own')} />
        <button type="submit" className="ob-btn">{t('Add')}</button>
      </form>
    </div>
  );
}

function Fantasies({ picked, chosen, setChosen, list, setList, gender }) {
  const [loading, setLoading] = useState(false);
  const [byAi, setByAi] = useState(true);
  const [own, setOwn] = useState({ name: '', description: '' });
  // The local model may need a while (a big model has to load first), so the ideas are written in the background
  // and this step checks every two seconds.
  async function write() {
    setLoading(true);
    try {
      const { job } = await api('/setup/fantasies', { method: 'POST', body: { picked, male: gender?.male } });
      for (let i = 0; i < 150; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const r = await api(`/setup/fantasies/${job}`);
        if (r.done) { setList(r.fantasies || []); setByAi(!!r.byAi); break; }
      }
    } catch { setList((cur) => cur || []); setByAi(false); } finally { setLoading(false); }
  }
  useEffect(() => {
    if (list || picked.length < 2) return;
    write();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const has = (f) => chosen.some((x) => x.name === f.name);
  return (
    <div className="ob-step">
      <StepIcon name="why" />
      <h2 className="ob-h">{t('Any fantasies?')}</h2>
      <p className="ob-lede">{t('A fantasy ties a few kinks together into a scenario. Pick any that speak to you; the feed and the map use them. This step is optional.')}</p>
      {picked.length < 2 ? <p className="ob-note">{t('Pick at least two kinks to get fantasy ideas, or write your own below.')}</p> : null}
      {loading ? (
        <div className="ob-writing" role="status" aria-live="polite">
          <p className="ob-writing-l"><span className="ob-quill"><Icon name="nib" /></span>{t('Writing a few stories from your picks')}<span className="ob-dots3"><i /><i /><i /></span></p>
          <div className="ob-fants">{[0, 1, 2].map((i) => <div key={i} className="ob-fant skel" style={{ '--i': i }}><b /><span /><span /><span className="short" /></div>)}</div>
        </div>
      ) : null}
      {!loading && list?.length && !byAi ? (
        <p className="ob-note ob-quick"><Icon name="why" />{t('The local AI did not answer in time, so these are quick ideas from your picks.')} <button type="button" className="ob-skiplink" onClick={write}>{t('Ask the AI again')}</button></p>
      ) : null}
      <div className="ob-fants">
        {(list || []).map((f) => (
          <button type="button" key={f.name} className={`ob-fant${has(f) ? ' on' : ''}`} onClick={() => setChosen(has(f) ? chosen.filter((x) => x.name !== f.name) : [...chosen, f])}>
            <b>{f.name}</b><span>{f.description}</span>
            {f.tags?.length ? <span className="ob-fanttags">{f.tags.map((x) => <em key={x}>{x}</em>)}</span> : null}
            {has(f) ? <Icon name="check" /> : null}
          </button>
        ))}
      </div>
      {picked.length >= 1 ? (
        <form className="ob-own col" onSubmit={(e) => { e.preventDefault(); if (!own.name.trim()) return; setChosen([...chosen, { name: own.name.trim(), description: own.description.trim(), concepts: picked.slice(0, 3) }]); setOwn({ name: '', description: '' }); }}>
          <input value={own.name} onChange={(e) => setOwn({ ...own, name: e.target.value })} placeholder={t('Your own fantasy, name it')} aria-label={t('Fantasy name')} />
          <input value={own.description} onChange={(e) => setOwn({ ...own, description: e.target.value })} placeholder={t('Describe it in one sentence (optional)')} aria-label={t('Fantasy description')} />
          <button type="submit" className="ob-btn">{t('Add fantasy')}</button>
        </form>
      ) : null}
    </div>
  );
}

function Sources({ sources, on, setOn }) {
  return (
    <div className="ob-step">
      <StepIcon name="globe" />
      <h2 className="ob-h">{t('Where should posts come from?')}</h2>
      <p className="ob-lede">{t('Most popular first. Turn on as many as you like; you can add searches, creators and communities to each one later in Settings.')}</p>
      <div className="ob-sources">
        {sources.map((s) => {
          const locked = !s.hasKeys;
          const enabled = !locked && (on[s.id] ?? s.enabled);
          return (
            <button type="button" key={s.id} className={`ob-src${enabled ? ' on' : ''}${locked ? ' locked' : ''}`} onClick={() => !locked && setOn({ ...on, [s.id]: !enabled })} disabled={locked} title={locked ? (s.needs === 'lustpress' ? t('Needs a scraper server (Settings)') : t('Needs a key (Settings)')) : s.about}>
              <span className="ob-srcbadge">{s.label.slice(0, 2)}</span>
              <span className="ob-grow"><b>{s.label}</b><span>{locked ? (s.needs === 'lustpress' ? t('Needs a scraper server, set it up later in Settings') : t('Needs a free key, add it later in Settings')) : s.about}</span></span>
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
  const toggle = (tag) => setLimits(limits.includes(tag) ? limits.filter((x) => x !== tag) : [...limits, tag]);
  return (
    <div className="ob-step">
      <StepIcon name="block" />
      <h2 className="ob-h">{t('Anything you never want to see?')}</h2>
      <p className="ob-lede">{t('Hard limits are hidden everywhere, always. Optional, and editable later in Settings.')}</p>
      <div className="ob-limits">
        {[...new Set([...LIMIT_IDEAS, ...limits])].map((tag) => <button type="button" key={tag} className={`ob-chip limit${limits.includes(tag) ? ' on' : ''}`} onClick={() => toggle(tag)}>{limits.includes(tag) ? <Icon name="x" /> : null}{tag}</button>)}
      </div>
      <form className="ob-own" onSubmit={(e) => { e.preventDefault(); const tag = v.trim().toLowerCase(); if (tag && !limits.includes(tag)) setLimits([...limits, tag]); setV(''); }}>
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder={t('Type a tag to never see')} aria-label={t('Add a limit')} />
        <button type="submit" className="ob-btn">{t('Add')}</button>
      </form>
    </div>
  );
}

function Ready({ picked, fantasies, sourcesOn, status }) {
  return (
    <div className="ob-step ob-welcome">
      <StepIcon name="check" />
      <p className="ob-kicker">{t('All set')}</p>
      <h1 className="ob-title">{t('Your feed is ready')}</h1>
      <div className="ob-sum">
        <div><b>{picked}</b><span>{tn(picked, 'kink to start with', 'kinks to start with')}</span></div>
        <div><b>{fantasies}</b><span>{tn(fantasies, 'fantasy', 'fantasies')}</span></div>
        <div><b>{sourcesOn}</b><span>{tn(sourcesOn, 'source', 'sources')}</span></div>
      </div>
      <p className="ob-lede">{t("Heat what turns you on, like and save what you love. Your kinks grow from that, and you'll find them on your map.")}{status && !status.ready ? ` ${t('The models are still downloading; posts get tagged as soon as they are in.')}` : ''}</p>
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
  const [modelOpts, setModelOpts] = useState(null);
  const [choice, setChoice] = useState({});
  const askedInstall = useRef(false);
  const [asked, setAsked] = useState(false);
  const [aiCheck, setAiCheck] = useState(null);

  const reload = () => api('/setup/status').then((st) => {
    setStatus(st);
    // Ollama is installed by itself the first time: no button to press.
    if (!st.ollama.installed && !askedInstall.current && !st.mock) { askedInstall.current = true; api('/setup/ollama', { method: 'POST', body: {} }).then(() => setTimeout(reload, 800)).catch(() => {}); }
  }).catch(() => {});
  useEffect(() => {
    reload();
    api('/setup/concepts').then((r) => { setFamilies(r.families); setPicked(r.picked || []); }).catch(() => {});
    api('/settings/gender').then((g) => setGender({ male: g.male ?? 50, auto: !!g.auto, trans: g.trans !== false })).catch(() => {});
    api('/setup/sources').then((r) => setSources(r.sources)).catch(() => {});
    api('/limits').then((r) => setLimits((r.limits || []).map((x) => x.tag || x))).catch(() => {});
    api('/setup/models/options').then(setModelOpts).catch(() => {});
  }, []);
  // The kinks shown fit who you chose on the step before: reloaded with that balance when you get there.
  useEffect(() => {
    if (step !== 3) return;
    api(`/setup/concepts?male=${gender.male ?? 50}`).then((r) => setFamilies(r.families)).catch(() => {});
  }, [step, gender.male]);
  // While models download, keep the progress fresh.
  useEffect(() => {
    const busy = status && (status.pulling || status.models.some((m) => m.pull && !m.pull.done) || ['downloading', 'unpacking'].includes(status.ollama.install.state) || !status.ollama.running);
    if (!busy) return undefined;
    const timer = setInterval(reload, 1500);
    return () => clearInterval(timer);
  }, [status]);

  // Skips the fantasies step when there is nothing to tie together.
  const go = (d) => {
    if (step === 1 && d > 0 && !downloadsAsked.current) startDownloads();
    setDir(d);
    setStep((s) => {
      let n = Math.max(0, Math.min(STEPS.length - 1, s + d));
      if (n === 4 && picked.length < 1) n += d;
      return n;
    });
  };
  // Leaving the local AI step saves the choice and starts the downloads; if Ollama is still being installed,
  // they start as soon as it runs.
  const downloadsAsked = useRef(false);
  function startDownloads() {
    downloadsAsked.current = true;
    setAsked(true);
    api('/setup/models/choice', { method: 'PUT', body: { ...choice, pull: true } }).then((r) => { setModelOpts(r); reload(); }).catch(() => {});
  }
  useEffect(() => {
    if (downloadsAsked.current && status?.ollama.running && !status.ready && !status.pulling && !status.models.some((m) => m.pull)) {
      api('/setup/models', { method: 'POST', body: {} }).then(reload).catch(() => {});
    }
  }, [status?.ollama.running]); // eslint-disable-line react-hooks/exhaustive-deps

  // The models are checked for real (a test question) before the kinks step: downloaded is not enough.
  const runCheck = () => {
    setAiCheck('checking');
    api('/setup/check', { method: 'POST', body: {} }).then(setAiCheck).catch((e) => setAiCheck({ ok: false, models: [{ ok: false, error: e.message }] }));
  };
  useEffect(() => {
    if (step === 1 && status?.ready && aiCheck === null) runCheck();
  }, [step, status?.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const aiReady = !!aiCheck?.ok;

  async function finish() {
    if (!downloadsAsked.current) { downloadsAsked.current = true; await api('/setup/models/choice', { method: 'PUT', body: { ...choice } }).catch(() => {}); }
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
    <div className="ob" role="dialog" aria-modal="true" aria-label={t('Welcome to Undercurrent')}>
      <Blobs colors={colors} />
      <div className="ob-frame">
        <header className="ob-top">
          <span className="ob-brand">Undercurrent</span>
          <ol className="ob-dots">{STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''} title={s}><span>{s}</span></li>)}</ol>
          {step > 0 && step < STEPS.length - 1 ? <button type="button" className="ob-skip" onClick={finish}>{t('Skip the rest')}</button> : <span />}
        </header>
        <main className={`ob-body dir${dir > 0 ? 'f' : 'b'}`} key={step}>
          {step === 0 ? <Welcome ok={ok} setOk={setOk} /> : null}
          {step === 1 ? <LocalAi status={status} options={modelOpts} choice={choice} setChoice={setChoice} aiCheck={aiCheck} asked={asked} /> : null}
          {step === 2 ? <Who gender={gender} setGender={setGender} /> : null}
          {step === 3 ? <Kinks families={families} picked={picked} setPicked={setPicked} male={gender.male} /> : null}
          {step === 4 ? <Fantasies picked={picked} chosen={chosen} setChosen={setChosen} list={fantList} setList={setFantList} gender={gender} /> : null}
          {step === 5 ? <Sources sources={sources} on={srcOn} setOn={setSrcOn} /> : null}
          {step === 6 ? <Limits limits={limits} setLimits={setLimits} /> : null}
          {step === 7 ? <Ready picked={picked.length} fantasies={chosen.length} sourcesOn={sourcesOn} status={status} /> : null}
        </main>
        {err ? <p className="ob-note bad ob-err">{err}</p> : null}
        <footer className="ob-foot">
          {step > 0 ? <button type="button" className="ob-btn ghost" onClick={() => go(-1)}><Icon name="chevL" />{t('Back')}</button> : <span />}
          {step === 1 && !aiReady ? (
            <div className="ob-gate">
              <button type="button" className="ob-skiplink" onClick={() => go(1)}>{t('Continue without the AI for now')}</button>
              {!status?.ready && !asked ? <button type="button" className="ob-btn primary" onClick={startDownloads}><Icon name="download" />{t('Download the models')}</button>
                : aiCheck?.ok === false && !aiCheck.waiting ? <button type="button" className="ob-btn primary" onClick={runCheck}><Icon name="refresh" />{t('Try again')}</button>
                : <button type="button" className="ob-btn primary" disabled><span className="spinner inline" />{status?.ready ? t('Checking…') : t('Downloading…')}</button>}
            </div>
          ) : step < STEPS.length - 1
            ? <button type="button" className="ob-btn primary" onClick={() => go(1)} disabled={step === 0 && !ok}>{step === 0 ? t('Get started') : step === 3 && !picked.length ? t('Skip for now') : t('Continue')}<Icon name="chevR" /></button>
            : <button type="button" className="ob-btn primary" onClick={finish} disabled={saving}>{saving ? t('Saving…') : t('Start exploring')}<Icon name="chevR" /></button>}
        </footer>
      </div>
    </div>
  );
}
