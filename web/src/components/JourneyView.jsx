import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../context.jsx';
import { Icon } from '../icons.jsx';
import Post from './Post.jsx';
import { t, tn, getLang } from '../i18n.js';

// "Surprise me" journeys go somewhere new: the bigger model reads everything you did and picks a kind of post you
// have never opened that sits right next to what you love, then leads you there in a few steps. The destination
// stays a surprise until the last stage. Deeper and branch-out journeys stay inside what you know.
const DISCOVERY = new Set(['surprise', 'genre']);

const THINKING = [
  t('Reading what you liked, heated and saved'),
  t('Looking at what those posts have in common'),
  t('Finding what sits right next to it that you never opened'),
  t('Choosing the one you would not have thought of'),
  t('Checking there are posts all the way there')
];

function Planning({ waited }) {
  const [i, setI] = useState(0);
  useEffect(() => { const tm = setInterval(() => setI((x) => Math.min(THINKING.length - 1, x + 1)), 4500); return () => clearInterval(tm); }, []);
  return (
    <div className="jplan" role="status" aria-live="polite">
      <div className="jplan-orb"><Icon name="route" /></div>
      <h2>{t('Planning a journey for you')}</h2>
      <ol className="jplan-steps">{THINKING.map((x, k) => <li key={k} className={k < i ? 'done' : k === i ? 'now' : ''}>{k < i ? <Icon name="check" /> : <span className="dot" />}{x}</li>)}</ol>
      {waited > 25 ? <p className="wnote">{t('The bigger model is loading, the first time can take a minute. It is worth it.')}</p> : null}
    </div>
  );
}

function Discovery({ spec }) {
  const { openMode, toast, refreshMeta, setFilters } = useApp();
  const [j, setJ] = useState(null);
  const [waited, setWaited] = useState(0);
  const [error, setError] = useState(null);
  const [i, setI] = useState(-1);
  const [end, setEnd] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    (async () => {
      try {
        const { job } = await api('/journey/discover', { method: 'POST', body: { kink: spec.kink, fantasy: spec.fantasy } });
        for (let k = 0; k < 150 && alive.current; k++) {
          await new Promise((r) => setTimeout(r, k < 2 ? 1000 : 2000));
          const r = await api(`/journey/discover/${job}`);
          if (r.done) { if (alive.current) setJ(r); return; }
          if (alive.current) setWaited(r.waited || 0);
        }
        if (alive.current) setError(t('The local AI did not answer in time.'));
      } catch (e) { if (alive.current) setError(e.message); }
    })();
    return () => { alive.current = false; };
  }, [spec]);

  async function finish() {
    const fresh = await Promise.all(j.steps.map((s) => api(`/items/${s.id}`).then((x) => ({ ...x, stage: s.stage })).catch(() => s)));
    const last = j.stages.length - 1;
    const atDest = fresh.filter((s) => s.stage === last);
    const loved = atDest.filter((s) => s.vote > 0 || s.rating >= 2 || s.saved).length;
    const disliked = atDest.filter((s) => s.vote < 0).length;
    setEnd({ loved, disliked, n: atDest.length, guess: loved >= Math.max(1, Math.ceil(atDest.length / 2)) ? 'love' : disliked > loved ? 'no' : 'maybe' });
    setI(j.steps.length);
  }
  async function decide(v) {
    setVerdict(v);
    try {
      await api('/journey/outcome', { method: 'POST', body: { dest: j.destination.tag, verdict: v } });
      if (v === 'love') {
        await api('/kinks', { method: 'POST', body: { name: j.destination.name, tags: j.destination.tags } });
        refreshMeta();
        toast(t('{name} is one of your kinks now.', { name: j.destination.name }));
      } else if (v === 'no') toast(t('Noted. Your journeys will not go there again.'));
    } catch (e) { toast(e.message); }
  }

  if (error) return <div className="empty">{error}</div>;
  if (!j) return <Planning waited={waited} />;
  if (!j.steps?.length) return <div className="empty">{j.description || t('Not enough posts for a journey yet. Fetch more posts or rate a few first.')}</div>;
  const n = j.steps.length;
  const last = j.stages.length - 1;
  const cur = i >= 0 && i < n ? j.steps[i] : null;
  const stage = cur ? j.stages[cur.stage] : null;
  const firstOfStage = cur && (i === 0 || j.steps[i - 1].stage !== cur.stage);
  const revealed = (cur && cur.stage === last) || i >= n;
  return (
    <section className="center jdisc" style={{ paddingTop: 0 }}>
      <div className="jhead">
        <div><div className="blockhead"><h3><Icon name="route" />{t('Discovery journey')}</h3></div><h2>{j.title}</h2><p>{j.description}</p></div>
        {i >= 0 && i < n ? <button type="button" className="ghost-btn" onClick={finish}>{t('End journey')}</button> : null}
      </div>
      <div className="jpath" aria-label={t('The way there')}>
        {j.stages.map((s, k) => (
          <span key={k} className={`jstop${s.destination ? ' dest' : ''}${cur && cur.stage === k ? ' now' : ''}${(cur && cur.stage > k) || i >= n ? ' done' : ''}`}>
            {s.destination && !revealed ? <><Icon name="spark" />{t('Somewhere new')}</> : <>{s.destination ? <Icon name="spark" /> : null}{s.destination ? j.destination.name : s.label}</>}
          </span>
        ))}
      </div>
      {i < 0 ? (
        <div className="jintro">
          <p className="wtext">{tn(j.stages.length - 1, 'One step from what you already love, then the surprise.', '{n} steps from what you already love, then the surprise.')}</p>
          <ul className="jwhy">{j.stages.filter((s) => !s.destination).map((s, k) => <li key={k}><b>{s.title || s.label}</b>{s.why ? <span>{s.why}</span> : null}</li>)}</ul>
          {!j.byAi ? <p className="wnote">{t('The bigger model did not answer in time, so this journey was planned from your posts alone. The destination is just as real.')}</p> : null}
          <div className="wbtns"><button type="button" className="ghost-btn accent" onClick={() => setI(0)}><Icon name="route" />{t('Start the journey')}</button></div>
        </div>
      ) : null}
      {cur ? (
        <>
          <div className="steps" aria-label={t('Step {i} of {n}', { i: i + 1, n })}>{j.steps.map((s, k) => <i key={s.id} className={`${k < i ? 'done' : k === i ? 'now' : ''}${s.stage === last ? ' dest' : ''}`} />)}</div>
          {firstOfStage && stage?.destination ? (
            <div className="jreveal">
              <span className="jr-k"><Icon name="spark" />{t('Your destination')}</span>
              <h3>{j.destination.name}</h3>
              <p>{j.reveal}</p>
            </div>
          ) : firstOfStage ? (
            <div className="jstage"><b>{t('Stage {i} of {n}', { i: cur.stage + 1, n: j.stages.length })} · {stage.title || stage.label}</b>{stage.why ? <span>{stage.why}</span> : null}</div>
          ) : null}
          <Post key={cur.id} item={cur} />
          <div className="jnav">
            <button type="button" className="ghost-btn" disabled={i === 0} onClick={() => setI(i - 1)}>{t('Previous')}</button>
            <button type="button" className="ghost-btn accent" onClick={() => (i === n - 1 ? finish() : setI(i + 1))}>{i === n - 1 ? t('Finish') : t('Next step')}</button>
          </div>
        </>
      ) : null}
      {i >= n ? (
        <div className="jend">
          <span className="jr-k"><Icon name="spark" />{t('You discovered')}</span>
          <h3>{j.destination.name}</h3>
          {end ? <p className="wtext">{end.n ? t('You liked {a} of the {n} posts there.', { a: end.loved, n: end.n }) : ''}</p> : null}
          <p className="wq">{t('Was it for you?')}</p>
          <div className="wbtns jverdict">
            <button type="button" className={`ghost-btn small${verdict === 'love' || (!verdict && end?.guess === 'love') ? ' accent' : ''}`} disabled={!!verdict} onClick={() => decide('love')}><Icon name="flame" />{verdict === 'love' ? t('In your kinks') : t('Love it, add it as a kink')}</button>
            <button type="button" className={`ghost-btn small${!verdict && end?.guess === 'maybe' ? ' accent' : ''}`} disabled={!!verdict} onClick={() => decide('maybe')}><Icon name="eye" />{t('Maybe, I want to see more')}</button>
            <button type="button" className="ghost-btn small" disabled={!!verdict} onClick={() => decide('no')}><Icon name="less" />{t('Not for me')}</button>
          </div>
          {verdict && verdict !== 'no' ? (
            <div className="wbtns">
              <button type="button" className="ghost-btn small accent" onClick={() => setFilters({ tags: j.destination.tags.slice(0, 6) })}><Icon name="eye" />{t('More of {name} in the feed', { name: j.destination.name })}</button>
              <button type="button" className="ghost-btn small" onClick={() => openMode('deeper', { fantasy: { title: j.destination.name, scenario: j.reveal, tags: [j.destination.tag, ...j.destination.bridges.slice(0, 2)] } })}><Icon name="spark" />{t('Go deeper into it')}</button>
            </div>
          ) : null}
          <div className="wbtns">
            <button type="button" className="ghost-btn small" onClick={() => openMode('journey', { ...spec })}><Icon name="route" />{t('Another journey')}</button>
            <button type="button" className="ghost-btn small" onClick={() => openMode('feed')}><Icon name="home" />{t('Back to feed')}</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Classic({ spec }) {
  const { openMode, toast, refreshMeta } = useApp();
  const [j, setJ] = useState(null);
  const [i, setI] = useState(0);
  const [end, setEnd] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = new URLSearchParams();
    if (spec.kink) q.set('kink', spec.kink);
    if (spec.fantasy) q.set('fantasy', spec.fantasy);
    q.set('mode', spec.mode || 'close');
    api(`/journey?${q}`).then(setJ).catch((e) => setError(e.message));
  }, [spec]);

  async function finish() {
    const fresh = await Promise.all(j.steps.map((s) => api(`/items/${s.id}`).catch(() => s)));
    const rated = fresh.filter((s) => s.rating);
    setEnd({ rated: rated.length, avg: rated.length ? (rated.reduce((a, b) => a + b.rating, 0) / rated.length).toFixed(1) : null });
    setI(j.steps.length);
  }

  async function saveAsFantasy() {
    const kinks = [...new Set(j.steps.flatMap((s) => (s.kinks || []).map((k) => k.id)))].slice(0, 4);
    try {
      await api('/fantasies', { method: 'POST', body: { name: j.title, description: j.description, kinks, saved: 1 } });
      toast(t('Saved to your fantasies.'));
      refreshMeta();
    } catch (e) { toast(e.message); }
  }

  if (error) return <div className="empty">{error}</div>;
  if (!j) return <div className="empty">{t('The assistant is picking the steps…')}</div>;
  if (!j.steps.length) return <div className="empty">{t('Not enough posts for a journey yet. Fetch more posts or rate a few first.')}</div>;
  const n = j.steps.length;
  return (
    <section className="center" style={{ paddingTop: 0 }}>
      <div className="jhead">
        <div><div className="blockhead"><h3>{t('Journey')}</h3></div><h2>{j.title}</h2><p>{j.description}</p></div>
        <button type="button" className="ghost-btn" onClick={finish}>{t('End journey')}</button>
      </div>
      <div className="steps" aria-label={t('Step {i} of {n}', { i: Math.min(i + 1, n), n })}>{j.steps.map((s, k) => <i key={s.id} className={k < i ? 'done' : k === i ? 'now' : ''} />)}</div>
      {i < n ? (
        <>
          <p className="count">{t('Step {i} of {n}', { i: i + 1, n })}</p>
          <Post key={j.steps[i].id} item={j.steps[i]} />
          <div className="jnav">
            <button type="button" className="ghost-btn" disabled={i === 0} onClick={() => setI(i - 1)}>{t('Previous')}</button>
            <button type="button" className="ghost-btn accent" onClick={() => (i === n - 1 ? finish() : setI(i + 1))}>{i === n - 1 ? t('Finish') : t('Next step')}</button>
          </div>
        </>
      ) : (
        <div className="jend">
          <h3>{t('Journey complete')}</h3>
          <p className="wtext">{tn(n, '{n} step', '{n} steps')} · {t('{n} rated', { n: end?.rated || 0 })}{end?.avg ? ` · ${t('average {avg} flames', { avg: getLang() === 'fr' ? end.avg.replace('.', ',') : end.avg })}` : ''}. {t('Everything you did is already on your map.')}</p>
          <div className="wbtns">
            <button type="button" className="ghost-btn small accent" onClick={saveAsFantasy}><Icon name="save" />{t('Save as a fantasy')}</button>
            <button type="button" className="ghost-btn small" onClick={() => openMode('journey', spec)}><Icon name="route" />{t('Another one like this')}</button>
            <button type="button" className="ghost-btn small" onClick={() => openMode('feed')}><Icon name="home" />{t('Back to feed')}</button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function JourneyView({ spec }) {
  const mode = spec.mode || (spec.fantasy || spec.kink ? 'close' : 'surprise');
  return DISCOVERY.has(mode) ? <Discovery spec={{ ...spec, mode }} /> : <Classic spec={{ ...spec, mode }} />;
}
