import { createContext, useContext } from 'react';
import { t } from './i18n.js';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export const MOODS = [
  { id: 'slow', label: t('Slow burn'), hint: t('long and story-driven'), icon: 'moon', color: '#B79BF0', filters: { formats: ['long', 'story'], length: 'long' } },
  { id: 'intense', label: t('Intense'), hint: t('only your top matches'), icon: 'bolt', color: '#F2894E', filters: { minMatch: 90 } },
  { id: 'curious', label: t('Curious'), hint: t('more new to you'), icon: 'spark', color: '#E8C66B', filters: {}, mix: 35 },
  { id: 'story', label: t('Story mood'), hint: t('reading only'), icon: 'book', color: '#E39A83', filters: { formats: ['story', 'discussion'] } },
  { id: 'visual', label: t('Just visuals'), hint: t('no text'), icon: 'eye', color: '#7FA7D9', filters: { formats: ['long', 'short', 'gif', 'image', 'set'] } },
  { id: 'quick', label: t('Quick one'), hint: t('short and done'), icon: 'timer', color: '#7FD0C2', filters: { length: 'quick' } }
];

export function crumbList(filters, { kinks = [], fantasies = [] } = {}) {
  const c = [];
  const kname = (id) => kinks.find((k) => k.id === Number(id))?.name || t('Kink {id}', { id });
  if (filters.search) c.push(['search', t('Search: {q}', { q: filters.searchLabel || t('your search') })]);
  if (filters.sources?.length) c.push(['sources', t('Only {list}', { list: filters.sourcesLabel || filters.sources.join(', ') })]);
  if (filters.profile) c.push(['profile', t('Only {name}', { name: filters.profileLabel || t('this profile') })]);
  else if (filters.q) c.push(['q', t('Search: {q}', { q: filters.q })]);
  if (filters.window) { const [m, p] = String(filters.window).split(':'); const when = { day: t('today'), week: t('this week'), month: t('this month'), year: t('this year') }[p] || ''; c.push(['window', m === 'new' ? t('New {when}', { when }) : t('Popular {when}', { when })]); }
  if (filters.onlyNew) c.push(['onlyNew', t('New to you')]);
  if (filters.following) c.push(['following', t('Following')]);
  if (filters.saved) c.push(['saved', t('Saved')]);
  if (filters.author) c.push(['author', filters.author]);
  if (filters.community) c.push(['community', filters.community]);
  if (filters.fantasy) c.push(['fantasy', fantasies.find((f) => f.id === Number(filters.fantasy))?.name || t('Fantasy')]);
  if (filters.pair?.length === 2) c.push(['pair', `${kname(filters.pair[0])} × ${kname(filters.pair[1])}`]);
  if (filters.anyKinks?.length) c.push(['anyKinks', filters.anyKinks.map(kname).join(t(' or '))]);
  if (filters.kink) c.push(['kink', kname(filters.kink)]);
  for (const tag of filters.tags || []) c.push([`tag:${tag}`, tag]);
  if (filters.minMatch) c.push(['minMatch', t('Your top matches ({n}%+)', { n: filters.minMatch })]);
  if (filters.formats?.length) c.push(['formats', filters.formats.map((f) => ({ long: t('Long form'), short: t('Short form'), gif: t('GIFs'), image: t('Images'), set: t('Image sets'), story: t('Stories'), discussion: t('Threads') }[f] || f)).join(', ')]);
  return c;
}
