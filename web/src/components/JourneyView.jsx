import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../context.jsx';
import Post from './Post.jsx';

export default function JourneyView({ spec }) {
  const { openMode, toast, refreshMeta } = useApp();
  const [j, setJ] = useState(null);
  const [i, setI] = useState(0);
  const [end, setEnd] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = new URLSearchParams();
    if (spec.kink) q.set('kink', spec.kink);
    if (spec.fantasy) q.set('fantasy', spec.fantasy);
    q.set('mode', spec.mode || (spec.fantasy || spec.kink ? 'close' : 'surprise'));
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
      toast('Saved to your fantasies.');
      refreshMeta();
    } catch (e) { toast(e.message); }
  }

  if (error) return <div className="empty">{error}</div>;
  if (!j) return <div className="empty">The assistant is picking the steps…</div>;
  if (!j.steps.length) return <div className="empty">Not enough posts for a journey yet. Fetch more posts or rate a few first.</div>;
  const n = j.steps.length;
  return (
    <section className="center" style={{ paddingTop: 0 }}>
      <div className="jhead">
        <div><div className="blockhead"><h3>Journey</h3></div><h2>{j.title}</h2><p>{j.description}</p></div>
        <button type="button" className="ghost-btn" onClick={finish}>End journey</button>
      </div>
      <div className="steps" aria-label={`Step ${Math.min(i + 1, n)} of ${n}`}>{j.steps.map((s, k) => <i key={s.id} className={k < i ? 'done' : k === i ? 'now' : ''} />)}</div>
      {i < n ? (
        <>
          <p className="count">Step {i + 1} of {n}</p>
          <Post key={j.steps[i].id} item={j.steps[i]} />
          <div className="jnav">
            <button type="button" className="ghost-btn" disabled={i === 0} onClick={() => setI(i - 1)}>Previous</button>
            <button type="button" className="ghost-btn accent" onClick={() => (i === n - 1 ? finish() : setI(i + 1))}>{i === n - 1 ? 'Finish' : 'Next step'}</button>
          </div>
        </>
      ) : (
        <div className="jend">
          <h3>Journey complete</h3>
          <p className="wtext">{n} steps · {end?.rated || 0} rated{end?.avg ? ` · average ${end.avg} flames` : ''}. Everything you did is already on your map.</p>
          <div className="wbtns">
            <button type="button" className="ghost-btn small accent" onClick={saveAsFantasy}>Save as a fantasy</button>
            <button type="button" className="ghost-btn small" onClick={() => openMode('journey', spec)}>Another one like this</button>
            <button type="button" className="ghost-btn small" onClick={() => openMode('feed')}>Back to feed</button>
          </div>
        </div>
      )}
    </section>
  );
}
