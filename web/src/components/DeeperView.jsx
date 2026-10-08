import { useEffect, useRef, useState } from 'react';
import { api, rgba, imgSrc, proxied, fmtNum } from '../api.js';
import { useApp } from '../context.jsx';
import { Icon } from '../icons.jsx';
import Post from './Post.jsx';
import { writeFantasy, Writing } from './FantasyEdit.jsx';
import { t, tn } from '../i18n.js';

// Go deeper into a fantasy: one quick choice at a time, the posts follow every answer, and at the end the fantasy
// is rewritten around everything you chose, to keep as a new fantasy or a kink.

function thumbOf(it) {
  const m = it.media || {};
  return m.poster || m.thumbs?.[0] || m.thumb || m.mid || (m.kind === 'image' ? m.src : null) || m.items?.[0]?.mid || m.items?.[0]?.src || null;
}

function Thumb({ it, on, onClick }) {
  const [stage, setStage] = useState(0);
  const u = thumbOf(it);
  const c = it.kinks?.[0]?.color || '#E39A83';
  return (
    <button type="button" className={`dp-tile${on ? ' on' : ''}`} style={{ '--c': rgba(c, 0.6) }} onClick={onClick} title={it.title}>
      {u && stage < 2 ? <img src={stage === 0 ? imgSrc(u) : proxied(u)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setStage((s) => s + 1)} /> : <span className="dp-txt">{it.title}</span>}
      {it.deeperHits ? <em>{tn(it.deeperHits, '{n} match', '{n} matches')}</em> : null}
    </button>
  );
}

export default function DeeperView({ spec }) {
  const { toast, refreshMeta, setFilters, openMode } = useApp();
  const f = spec.fantasy || {};
  const [answers, setAnswers] = useState(spec.answers || []);
  const [step, setStep] = useState(null);
  const [busy, setBusy] = useState(false);
  const [own, setOwn] = useState('');
  const [open, setOpen] = useState(null);
  const [final, setFinal] = useState(null);
  const [writing, setWriting] = useState(false);
  const [saved, setSaved] = useState({});
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    setBusy(true);
    api('/fantasy/deeper', { method: 'POST', body: { tags: f.tags || [], scenario: f.scenario, title: f.title, answers } })
      .then((r) => { if (my === seq.current) { setStep(r); setOpen((o) => (o && r.posts?.some((p) => p.id === o) ? o : null)); } })
      .catch((e) => toast(e.message))
      .finally(() => { if (my === seq.current) setBusy(false); });
  }, [answers]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the last question is answered (or you stop early), the fantasy is written again around all your choices.
  useEffect(() => {
    if (!step?.done || final || writing) return;
    setWriting(true);
    writeFantasy({ tags: step.tags, scenario: f.scenario, title: f.title, mode: 'refine' })
      .then((r) => setFinal(r))
      .catch(() => setFinal({ title: f.title, scenario: f.scenario, tags: step.tags, byAi: false }))
      .finally(() => setWriting(false));
  }, [step?.done]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = (o) => setAnswers((cur) => [...cur, { dim: step.dim, tag: o.tag, label: o.label, shown: step.options.map((x) => x.tag) }]);
  const skip = () => setAnswers((cur) => [...cur, { dim: step.dim, tag: null, shown: step.options.map((x) => x.tag) }]);
  const back = () => { setFinal(null); setAnswers((cur) => cur.slice(0, -1)); };
  const stop = () => setStep((s) => ({ ...s, done: true }));
  const chosen = answers.filter((a) => a.tag);
  const n = step?.of || 5;

  async function saveNew() {
    try {
      await api('/fantasies', { method: 'POST', body: { name: final.title || f.title, description: final.scenario, tags: final.tags, saved: 1, origin: 'user' } });
      setSaved((s) => ({ ...s, fantasy: true }));
      refreshMeta();
      toast(t('Saved as a new fantasy.'));
    } catch (e) { toast(e.message); }
  }
  async function updateOld() {
    try {
      await api(`/fantasies/${f.id}`, { method: 'PATCH', body: { name: final.title || f.title, description: final.scenario, tags: final.tags } });
      setSaved((s) => ({ ...s, updated: true }));
      refreshMeta();
      toast(t('Fantasy updated.'));
    } catch (e) { toast(e.message); }
  }
  async function makeKink() {
    try {
      await api('/kinks', { method: 'POST', body: { name: final.title || f.title, tags: final.tags } });
      setSaved((s) => ({ ...s, kink: true }));
      refreshMeta();
      toast(t('{name} is one of your kinks now.', { name: final.title || f.title }));
    } catch (e) { toast(e.message); }
  }

  const posts = step?.posts || [];
  const openItem = posts.find((p) => p.id === open);
  return (
    <section className="center deeper-view" style={{ paddingTop: 0 }}>
      <div className="jhead">
        <div>
          <div className="blockhead"><h3><Icon name="spark" />{t('Go deeper')}</h3></div>
          <h2>{final?.title || f.title}</h2>
          <p className="serif dp-scn">{final?.scenario || f.scenario}</p>
        </div>
        <button type="button" className="ghost-btn" onClick={() => openMode('feed')}>{t('Back to feed')}</button>
      </div>
      <div className="dp-tags">
        {(f.tags || []).map((x) => <span key={x} className="chip ghost">{x}</span>)}
        {chosen.map((a) => <span key={a.tag} className="chip dp-new">{a.label || a.tag}</span>)}
      </div>
      <div className="steps" aria-label={t('Step {i} of {n}', { i: Math.min(answers.length + 1, n), n })}>{Array.from({ length: n }, (_, k) => <i key={k} className={k < answers.length ? 'done' : k === answers.length && !step?.done ? 'now' : ''} />)}</div>

      {!step?.done ? (
        <div className={`dp-q${busy ? ' busy' : ''}`}>
          {step && !busy ? (
            <>
              <p className="count">{t('Choice {i} of {n}', { i: answers.length + 1, n })}</p>
              <h3 className="dp-question">{step.question}</h3>
              <div className="dp-opts">
                {step.options.map((o) => (
                  <button type="button" key={o.tag} className={`dp-opt${o.ai ? ' ai' : ''}`} onClick={() => answer(o)}>
                    {o.ai ? <Icon name="why" /> : null}<b>{o.label}</b>
                    <small>{o.count ? tn(o.count, '{n} post', '{n} posts', { n: fmtNum(o.count) }) : t('new here')}</small>
                  </button>
                ))}
              </div>
              <form className="dp-own" onSubmit={(e) => { e.preventDefault(); const v = own.trim().toLowerCase(); if (!v) return; answer({ tag: v, label: v }); setOwn(''); }}>
                <input value={own} onChange={(e) => setOwn(e.target.value)} placeholder={t('Something else? Type it')} aria-label={t('Your own answer')} />
                <button type="submit" className="ghost-btn small">{t('Use it')}</button>
              </form>
              <div className="wbtns">
                {answers.length ? <button type="button" className="ghost-btn small" onClick={back}><Icon name="chevL" />{t('Back')}</button> : null}
                <button type="button" className="ghost-btn small" onClick={skip}>{t('Does not matter')}</button>
                {chosen.length ? <button type="button" className="ghost-btn small accent" onClick={stop}><Icon name="check" />{t('That is it, write it')}</button> : null}
              </div>
            </>
          ) : <Writing label={answers.length ? t('Looking for what goes with that') : t('Reading your fantasy')} />}
        </div>
      ) : (
        <div className="dp-final">
          {writing ? <Writing label={t('Writing your sharper fantasy')} /> : final ? (
            <>
              <h3>{t('Your fantasy, sharper')}</h3>
              <p className="wnote">{t('Everything you chose is in it. Keep it, or make it a kink so the feed brings more of it.')}</p>
              {!final.byAi ? <p className="wnote">{t('The local AI did not answer in time, so the story is a quick version; your tags are all kept.')}</p> : null}
              <div className="dp-tags">{(final.tags || []).map((x) => <span key={x} className="chip">{x}</span>)}</div>
              <div className="wbtns">
                <button type="button" className="ghost-btn small accent" onClick={saveNew} disabled={saved.fantasy}><Icon name={saved.fantasy ? 'check' : 'save'} />{saved.fantasy ? t('Saved') : t('Save as a new fantasy')}</button>
                {f.id ? <button type="button" className="ghost-btn small" onClick={updateOld} disabled={saved.updated}><Icon name={saved.updated ? 'check' : 'nib'} />{saved.updated ? t('Updated') : t('Update this fantasy')}</button> : null}
                <button type="button" className="ghost-btn small" onClick={makeKink} disabled={saved.kink}><Icon name={saved.kink ? 'check' : 'flame'} />{saved.kink ? t('In your kinks') : t('Make it a kink')}</button>
                <button type="button" className="ghost-btn small" onClick={() => setFilters({ tags: (final.tags || []).slice(0, 8) })}><Icon name="eye" />{t('Show it in the feed')}</button>
                <button type="button" className="ghost-btn small" onClick={() => openMode('deeper', { fantasy: { ...f, title: final.title, scenario: final.scenario, tags: final.tags, id: undefined } })}><Icon name="spark" />{t('Go even deeper')}</button>
                <button type="button" className="linkbtn" onClick={back}>{t('Change the last choice')}</button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {posts.length ? (
        <div className="dp-posts">
          <div className="blockhead"><h3>{chosen.length ? t('Posts with what you chose') : t('Posts with this fantasy')}</h3></div>
          <div className="dp-grid">{posts.map((it) => <Thumb key={it.id} it={it} on={open === it.id} onClick={() => setOpen(open === it.id ? null : it.id)} />)}</div>
          {openItem ? <div className="dp-open"><Post key={openItem.id} item={openItem} /></div> : <p className="wnote">{t('Tap a post to open it here.')}</p>}
        </div>
      ) : step && !busy ? <p className="wnote">{t('No posts with all of this yet. Your choices still shape the fantasy, and new posts come in all the time.')}</p> : null}
    </section>
  );
}
