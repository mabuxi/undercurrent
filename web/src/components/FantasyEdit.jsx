import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { t } from '../i18n.js';

// Refining and regenerating a fantasy from its tags, and the tags of a fantasy you write yourself. Used in the
// welcome steps, in Memory and in the fantasy windows of the feed.

const norm = (s) => String(s || '').toLowerCase().replace(/^#/, '').replace(/\s+/g, ' ').trim();

// Writes a fantasy from tags on the Mac. The bigger model may need a while to load, so it is a job checked every
// two seconds (for up to five minutes).
export async function writeFantasy(body) {
  const { job } = await api('/fantasy/write', { method: 'POST', body });
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, i < 3 ? 900 : 2000));
    const r = await api(`/fantasy/write/${job}`);
    if (r.done) return r;
  }
  throw new Error(t('The local AI did not answer in time.'));
}

export function Writing({ label }) {
  return <p className="fx-writing" role="status" aria-live="polite"><span className="ob-quill"><Icon name="nib" /></span>{label || t('Writing…')}<span className="ob-dots3"><i /><i /><i /></span></p>;
}

// Chips you can take off, a field to type more (Enter or a comma adds one), and suggestions to tap.
export function TagPicker({ tags, onChange, suggestions = [], aiSuggestions = [], placeholder, thinking }) {
  const [v, setV] = useState('');
  const add = (raw) => {
    const parts = String(raw).split(',').map(norm).filter(Boolean);
    if (!parts.length) return;
    onChange([...new Set([...tags, ...parts])].slice(0, 16));
  };
  const free = suggestions.filter((x) => !tags.includes(x));
  const freeAi = aiSuggestions.filter((x) => !tags.includes(x) && !free.includes(x));
  return (
    <div className="tagpick">
      <div className="tp-row">
        {tags.map((x) => <span key={x} className="tp-chip on">{x}<button type="button" onClick={() => onChange(tags.filter((y) => y !== x))} aria-label={t('Remove {tag}', { tag: x })}><Icon name="x" /></button></span>)}
        <input
          value={v}
          onChange={(e) => { const s = e.target.value; if (s.includes(',')) { add(s); setV(''); } else setV(s); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(v); setV(''); } else if (e.key === 'Backspace' && !v && tags.length) onChange(tags.slice(0, -1)); }}
          onBlur={() => { if (v.trim()) { add(v); setV(''); } }}
          placeholder={tags.length ? t('Add a tag') : placeholder || t('Type tags, or pick below')}
          aria-label={t('Add a tag')}
        />
      </div>
      {free.length || freeAi.length || thinking ? (
        <div className="tp-sugg">
          <span className="tp-l">{t('Fits what you wrote:')}</span>
          {free.map((x) => <button type="button" key={x} className="tp-chip" onClick={() => add(x)}><Icon name="plus" />{x}</button>)}
          {freeAi.map((x) => <button type="button" key={x} className="tp-chip ai" onClick={() => add(x)} title={t('Suggested by the AI')}><Icon name="why" />{x}</button>)}
          {thinking ? <span className="tp-think"><span className="spin" />{t('The AI is reading it…')}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

// Tags for a text as you type it: words it clearly says at once, what the AI reads in it once you pause.
export function useTextTags(text, { ai = true } = {}) {
  const [quick, setQuick] = useState([]);
  const [smart, setSmart] = useState([]);
  const [thinking, setThinking] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current;
    if (String(text || '').trim().length < 8) { setQuick([]); setSmart([]); setThinking(false); return undefined; }
    const a = setTimeout(() => api('/fantasy/tags', { method: 'POST', body: { text } }).then((r) => { if (my === seq.current) setQuick(r.tags || []); }).catch(() => {}), 350);
    const b = ai ? setTimeout(() => {
      setThinking(true);
      api('/fantasy/tags', { method: 'POST', body: { text, ai: true } }).then((r) => { if (my === seq.current) { setQuick(r.tags || []); setSmart(r.ai || []); } }).catch(() => {}).finally(() => { if (my === seq.current) setThinking(false); });
    }, 1600) : null;
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [text, ai]);
  return { quick, smart, thinking };
}

// The two buttons under a suggested fantasy. Refine opens its tags: change them, type new ones, then the story is
// rewritten around them. Regenerate writes a new story from the same tags.
export function FantasyTools({ f, onUpdate, avoid = [], male, small = true }) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState(() => (f.tags || []).map(norm).filter(Boolean));
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const sugg = useTextTags(open ? f.scenario : '', { ai: false });
  useEffect(() => { if (!open) setTags((f.tags || []).map(norm).filter(Boolean)); }, [f.tags, open]);
  async function run(mode) {
    const use = mode === 'refine' ? tags : (f.tags || []).map(norm).filter(Boolean);
    if (!use.length) { setErr(t('Add at least one tag first.')); return; }
    setBusy(mode);
    setErr(null);
    try {
      const r = await writeFantasy({ tags: use, scenario: f.scenario, title: f.title, mode, male, avoid: [f.scenario, ...avoid] });
      await onUpdate({ title: r.title || f.title, scenario: r.scenario || f.scenario, tags: r.tags || use, byAi: r.byAi });
      setErr(r.byAi ? null : t('The local AI did not answer in time, so this one is a quick version from the tags it knows.'));
      if (mode === 'refine') setOpen(false);
    } catch (e) { setErr(e.message); } finally { setBusy(null); }
  }
  const cls = `ghost-btn${small ? ' small' : ''}`;
  return (
    <div className="ftools" onClick={(e) => e.stopPropagation()}>
      {busy ? <Writing label={busy === 'refine' ? t('Rewriting it around your tags') : t('Writing a new one from these tags')} /> : (
        <div className="ft-btns">
          <button type="button" className={`${cls}${open ? ' accent' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}><Icon name="sliders" />{t('Refine')}</button>
          <button type="button" className={cls} onClick={() => run('new')}><Icon name="refresh" />{t('Regenerate')}</button>
        </div>
      )}
      {open && !busy ? (
        <div className="ft-panel">
          <TagPicker tags={tags} onChange={setTags} suggestions={sugg.quick} placeholder={t('Type tags, or pick below')} />
          <div className="ft-btns">
            <button type="button" className={`${cls} accent`} onClick={() => run('refine')} disabled={!tags.length}><Icon name="nib" />{t('Update the story')}</button>
            <button type="button" className="linkbtn" onClick={() => setOpen(false)}>{t('Cancel')}</button>
          </div>
        </div>
      ) : null}
      {err ? <p className="wnote warn">{err}</p> : null}
    </div>
  );
}

// Writing your own fantasy: a name, the story in your words, and tags. Tags are suggested while you type; pick the
// ones that fit, or type your own.
export function OwnFantasy({ onAdd, submitLabel, compact = false, children }) {
  const [name, setName] = useState('');
  const [story, setStory] = useState('');
  const [tags, setTags] = useState([]);
  const sugg = useTextTags(story);
  const [err, setErr] = useState(null);
  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setErr(t('Give the fantasy a name.')); return; }
    setErr(null);
    const ok = await onAdd({ name: name.trim(), description: story.trim(), tags });
    if (ok !== false) { setName(''); setStory(''); setTags([]); }
  }
  return (
    <form className={`ownfant${compact ? ' compact' : ''}`} onSubmit={submit}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Your own fantasy, name it')} aria-label={t('Fantasy name')} />
      <textarea value={story} onChange={(e) => setStory(e.target.value)} rows={compact ? 2 : 3} placeholder={t('Describe the scenario in your own words')} aria-label={t('Fantasy description')} />
      <TagPicker tags={tags} onChange={setTags} suggestions={sugg.quick} aiSuggestions={sugg.smart} thinking={sugg.thinking} placeholder={t('Tags: typed here, or picked from what you wrote')} />
      {children}
      {err ? <p className="wnote warn">{err}</p> : null}
      <div className="ft-btns"><button type="submit" className="ghost-btn small accent"><Icon name="plus" />{submitLabel || t('Add fantasy')}</button><span className="wnote">{t('Your own fantasies always count as at least a 90% match.')}</span></div>
    </form>
  );
}
