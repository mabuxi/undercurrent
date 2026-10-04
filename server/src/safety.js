import { getDb, getSetting, normalizeTag } from './db.js';

const HARD_BLOCK = [
  'loli', 'lolicon', 'shota', 'shotacon', 'toddlercon', 'cub', 'child', 'children', 'kid', 'kids',
  'toddler', 'infant', 'baby', 'preteen', 'prepubescent', 'underage', 'minor', 'young', 'younger',
  'teen', 'teens', 'teenager', 'jailbait', 'ageplay', 'age play', 'age regression', 'aged down',
  'middle school', 'elementary school', 'grade school', 'kindergarten', 'schoolgirl', 'schoolboy',
  'rape', 'raped', 'bestiality', 'zoophilia', 'zoo', 'snuff', 'necrophilia', 'hidden cam', 'hidden camera',
  'spycam', 'spy cam', 'upskirt', 'revenge porn', 'unconscious', 'passed out'
];

export const DEFAULT_EXTREME = ['extreme', 'brutal', 'gore', 'blood', 'scat', 'vomit', 'puke', 'forced', 'abuse', 'incest', 'torture', 'choking', 'crying'];

const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HARD_SET = new Set(HARD_BLOCK.map(normalizeTag));
const TITLE_BLOCK = HARD_BLOCK.filter((t) => t !== 'baby' && t !== 'zoo');
const TITLE_RE = new RegExp(`\\b(${TITLE_BLOCK.map((t) => esc(t).replace(/\s+/g, '[\\s_-]+')).join('|')})\\b`, 'i');
const AGE_RE = /\b(1[0-7])\s*(yo|y\/o|years?\s*old|f|m)\b/i;

export function hardBlockList() {
  return [...HARD_SET];
}

export function userLimits() {
  return getDb().prepare('SELECT tag FROM limits').all().map((r) => r.tag);
}

export function extremeFilter() {
  const s = getSetting('extremeFilter', null);
  return { on: s ? s.on !== false : true, terms: s?.terms || DEFAULT_EXTREME };
}

function matchesAny(normTags, text, list) {
  const set = new Set(list.map(normalizeTag).filter(Boolean));
  if (!set.size) return false;
  for (const t of normTags) {
    if (set.has(t)) return true;
    for (const part of t.split(' ')) if (part.length > 3 && set.has(part)) return true;
  }
  for (const l of set) if (l.length > 2 && new RegExp(`\\b${esc(l).replace(/\s+/g, '[\\s_-]+')}\\b`, 'i').test(text)) return true;
  return false;
}

export function isBlocked({ title = '', body = '', tags = [] }, limits = userLimits()) {
  const norm = tags.map(normalizeTag);
  for (const t of norm) {
    if (HARD_SET.has(t)) return { blocked: true, reason: 'safety' };
    for (const part of t.split(' ')) if (HARD_SET.has(part) && part.length > 3) return { blocked: true, reason: 'safety' };
  }
  const text = `${title} ${String(body).slice(0, 4000)}`;
  if (TITLE_RE.test(text) || AGE_RE.test(text)) return { blocked: true, reason: 'safety' };
  const ex = extremeFilter();
  if (ex.on && matchesAny(norm, text, ex.terms)) return { blocked: true, reason: 'extreme' };
  if (matchesAny(norm, text, limits)) return { blocked: true, reason: 'limit' };
  return { blocked: false };
}

export function booruExclusions() {
  return ['loli', 'shota', 'lolicon', 'shotacon', 'toddlercon', 'cub', 'child', 'young', 'underage', 'rape', 'bestiality', 'gore', 'scat'].map((t) => `-${t}`);
}
