import { useApp } from '../context.jsx';

// Makes @handles, u/names and r/communities inside post text clickable.
const RE = /(^|[\s(>"'])(\/?u\/[A-Za-z0-9_-]{3,20}\b|\/?r\/[A-Za-z0-9_]{2,21}\b)|(^|[^\w@.])(@[A-Za-z0-9_](?:[A-Za-z0-9_.-]{0,60}[A-Za-z0-9_])?(?:@[a-z0-9.-]+\.[a-z]{2,})?)/g;

export function platformFor(handle, source) {
  if (source === 'lemmy' || /@/.test(handle)) return 'lemmy';
  if (source === 'bluesky' || /\.[a-z]{2,}$/i.test(handle)) return 'bluesky';
  if (source === 'redgifs') return 'redgifs';
  return 'any';
}

export default function Linkify({ text, source, onPerson }) {
  const { setFilters } = useApp();
  const s = String(text || '');
  const out = [];
  let last = 0;
  let k = 0;
  for (const m of s.matchAll(RE)) {
    const pre = m[1] ?? m[3] ?? '';
    const token = m[2] || m[4];
    const start = m.index + pre.length;
    if (start > last) out.push(s.slice(last, start));
    if (/^\/?u\//.test(token)) {
      const h = token.replace(/^\/?u\//, '');
      out.push(<button type="button" key={k++} className="mention" onClick={(e) => { e.stopPropagation(); onPerson?.({ handle: h, platform: 'reddit' }); }}>{token}</button>);
    } else if (/^\/?r\//.test(token)) {
      const c = token.replace(/^\//, '');
      out.push(<button type="button" key={k++} className="mention comm" onClick={(e) => { e.stopPropagation(); setFilters({ community: c }); }}>{token}</button>);
    } else {
      const h = token.slice(1).replace(/[.]+$/, '');
      out.push(<button type="button" key={k++} className="mention" onClick={(e) => { e.stopPropagation(); onPerson?.({ handle: h, platform: platformFor(h, source) }); }}>{token}</button>);
    }
    last = start + token.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return <>{out}</>;
}
