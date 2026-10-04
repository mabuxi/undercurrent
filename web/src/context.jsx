import { createContext, useContext } from 'react';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export const MOODS = [
  { id: 'slow', label: 'Slow burn', hint: 'long and story-driven', icon: 'moon', color: '#B79BF0', filters: { formats: ['long', 'story'], length: 'long' } },
  { id: 'intense', label: 'Intense', hint: 'only your top matches', icon: 'bolt', color: '#F2894E', filters: { minMatch: 90 } },
  { id: 'curious', label: 'Curious', hint: 'more new to you', icon: 'spark', color: '#E8C66B', filters: {}, mix: 35 },
  { id: 'story', label: 'Story mood', hint: 'reading only', icon: 'book', color: '#E39A83', filters: { formats: ['story', 'discussion'] } },
  { id: 'visual', label: 'Just visuals', hint: 'no text', icon: 'eye', color: '#7FA7D9', filters: { formats: ['long', 'short', 'gif', 'image', 'set'] } },
  { id: 'quick', label: 'Quick one', hint: 'short and done', icon: 'timer', color: '#7FD0C2', filters: { length: 'quick' } }
];

export function crumbList(filters, { kinks = [], fantasies = [] } = {}) {
  const c = [];
  const kname = (id) => kinks.find((k) => k.id === Number(id))?.name || `Kink ${id}`;
  if (filters.search) c.push(['search', `Search: ${filters.searchLabel || 'your search'}`]);
  if (filters.profile) c.push(['profile', `Only ${filters.profileLabel || 'this profile'}`]);
  else if (filters.q) c.push(['q', `Search: ${filters.q}`]);
  if (filters.window) { const [m, p] = String(filters.window).split(':'); c.push(['window', `${m === 'new' ? 'New' : 'Popular'} ${{ day: 'today', week: 'this week', month: 'this month', year: 'this year' }[p] || ''}`]); }
  if (filters.onlyNew) c.push(['onlyNew', 'New to you']);
  if (filters.following) c.push(['following', 'Following']);
  if (filters.saved) c.push(['saved', 'Saved']);
  if (filters.author) c.push(['author', filters.author]);
  if (filters.community) c.push(['community', filters.community]);
  if (filters.fantasy) c.push(['fantasy', fantasies.find((f) => f.id === Number(filters.fantasy))?.name || 'Fantasy']);
  if (filters.pair?.length === 2) c.push(['pair', `${kname(filters.pair[0])} × ${kname(filters.pair[1])}`]);
  if (filters.anyKinks?.length) c.push(['anyKinks', filters.anyKinks.map(kname).join(' or ')]);
  if (filters.kink) c.push(['kink', kname(filters.kink)]);
  for (const t of filters.tags || []) c.push([`tag:${t}`, t]);
  if (filters.minMatch) c.push(['minMatch', `Your top matches (${filters.minMatch}%+)`]);
  if (filters.formats?.length) c.push(['formats', filters.formats.map((f) => ({ long: 'Long form', short: 'Short form', gif: 'GIFs', image: 'Images', set: 'Image sets', story: 'Stories', discussion: 'Threads' }[f] || f)).join(', ')]);
  return c;
}
