import { useEffect, useState } from 'react';
import { api, ago, proxied, imgSrc } from '../api.js';
import { useApp } from '../context.jsx';
import { t } from '../i18n.js';

// "Everything you did": every post you interacted with and what each one taught your taste. It lives in Memory.
export const EVENT_LABEL = {
  impression: t('seen'), dwell: t('watched'), open: t('opened'), play: t('played'), progress: t('watched part'), complete: t('watched to the end'), rewatch: t('rewatched'), up: t('liked'), down: t('disliked'), unvote: t('removed vote'),
  save: t('saved'), unsave: t('unsaved'), rate: t('heat'), less: t('less like this'), more: t('more like this'), reason: t('said why'), ask: t('asked'), comments: t('read comments'), profile: t('looked at profile'), follow: t('followed')
};

export function secs(ms) {
  const s = Math.round((ms || 0) / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

export function Thumb({ media }) {
  const u = media?.poster || media?.thumbs?.[0] || media?.mid || media?.items?.[0]?.mid || (media?.kind === 'image' ? media.src : null);
  if (!u) return <span className="histph" />;
  return <img src={imgSrc(u)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { if (!e.currentTarget.dataset.p) { e.currentTarget.dataset.p = 1; e.currentTarget.src = proxied(u); } else e.currentTarget.style.visibility = 'hidden'; }} />;
}

export default function HistoryDb() {
  const { toast, setFilters } = useApp();
  const [items, setItems] = useState(null);
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const load = () => api(`/history?limit=200${type ? `&type=${type}` : ''}`).then((r) => setItems(r.items)).catch(() => setItems([]));
  useEffect(() => { load(); }, [type]); // eslint-disable-line react-hooks/exhaustive-deps
  async function forget(it, less) {
    setItems((cur) => cur.filter((x) => x.id !== it.id));
    try { await api(`/history/${it.id}${less ? '?less=1' : ''}`, { method: 'DELETE' }); toast(less ? t('Removed, and it counts against similar posts now.') : t('Forgotten. It no longer counts for your taste.')); } catch (e) { toast(e.message); }
  }
  const shown = (items || []).filter((it) => !q || `${it.title} ${it.author || ''} ${it.community || ''}`.toLowerCase().includes(q.toLowerCase()));
  // Only what matters: watch time for videos, watched to the end and rewatches up front, then the strong signals.
  // Seen, short stays and partial plays are left out.
  const chips = (it) => {
    const out = [];
    const video = ['long', 'short', 'gif'].includes(it.format);
    if (it.rewatches) out.push(<span key="rw" className="evtype big t-rewatch">{t('rewatched')}{it.rewatches > 1 ? ` ${it.rewatches}×` : ''}</span>);
    if (it.completed) out.push(<span key="cp" className="evtype big t-complete">{t('watched to the end')}</span>);
    if (video && it.watchMs >= 3000) out.push(<span key="wt" className="evtype t-dwell" title={t('Time watched')}>⏱ {secs(it.watchMs)}{it.watched && !it.completed ? ` · ${Math.round(it.watched * 100)}%` : ''}</span>);
    else if (!video && it.dwellMs >= 6000) out.push(<span key="st" className="evtype t-dwell">{it.format === 'story' || it.format === 'discussion' ? t('read') : t('looked')} {secs(it.dwellMs)}</span>);
    for (const ev of ['rate', 'save', 'up', 'follow', 'reason', 'more', 'down', 'less', 'comments', 'profile', 'ask', 'open']) {
      const c = it.counts[ev];
      if (!c) continue;
      const label = ev === 'rate' ? t('heat {n}', { n: it.rating || c.max }) : `${EVENT_LABEL[ev] || ev}${c.n > 1 ? ` ${c.n}×` : ''}`;
      out.push(<span key={ev} className={`evtype t-${ev}`} title={t('last {when}', { when: ago(Math.round(c.t / 1000)) })}>{label}</span>);
    }
    return out;
  };
  return (
    <div className="card2 wide">
      <h3>{t('Everything you did')} <span className="count">{t('the data your taste profile learns from')}</span></h3>
      <div className="rowline wrapline">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search titles, creators, communities')} aria-label={t('Search history')} style={{ flex: 2 }} />
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label={t('Filter by interaction')}>
          <option value="">{t('All interactions')}</option>
          {['rewatch', 'complete', 'rate', 'save', 'up', 'follow', 'reason', 'more', 'down', 'less', 'comments', 'profile', 'ask', 'open'].map((t) => <option key={t} value={t}>{EVENT_LABEL[t]}</option>)}
        </select>
      </div>
      {items === null ? <p className="wnote">{t('Loading…')}</p> : !shown.length ? <p className="wnote">{t('Nothing here yet.')}</p> : (
        <div className="histlist">
          {shown.map((it) => (
            <div key={it.id} className="histrow clickable" role="button" tabIndex={0} onClick={(e) => { if (!e.target.closest('button')) setFilters({}, { focus: it.id }); }} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) setFilters({}, { focus: it.id }); }}>
              <Thumb media={it.media} />
              <span className={`scorebadge${it.score >= 3 ? ' hi' : it.score < 0 ? ' neg' : ''}`} title={t('How much this counted for your taste (likes, heat and saves weigh the most)')}>{it.score > 0 ? '+' : ''}{it.score}</span>
              <div className="histtext">
                <span className="mini-title">{it.title}</span>
                <span className="mini-meta">{it.author || it.community || it.source} · {it.source} · {ago(Math.round(it.last / 1000))}</span>
                <div className="evchips">{chips(it)}</div>
              </div>
              <button type="button" className="ghost-btn small" onClick={(e) => { e.stopPropagation(); forget(it, false); }} title={t('Remove from what your profile learned')}>{t('Forget')}</button>
              <button type="button" className="ghost-btn small" onClick={(e) => { e.stopPropagation(); forget(it, true); }} title={t('Forget it and show less like it')}>{t('Not for me')}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
