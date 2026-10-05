import fr from './i18n/fr/index.js';

// The interface speaks English or French. Every text is written in English in the code and looked up in the French
// dictionary when French is on; {name} parts are filled in after. Tags are never translated, kink names come
// translated from the server. Changing the language reloads the app, so plain constants are translated too.

export const LANGS = [
  { id: 'en', name: 'English', short: 'EN' },
  { id: 'fr', name: 'Français', short: 'FR' }
];
const DICTS = { fr };
const LOCALES = { en: 'en-GB', fr: 'fr-BE' };

let lang = 'en';

export function guessLang() {
  try { return String(navigator.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en'; } catch { return 'en'; }
}

export function setLang(l) {
  lang = DICTS[l] || l === 'en' ? l : 'en';
  try { document.documentElement.lang = lang; } catch {}
}

export const getLang = () => lang;
export const locale = () => LOCALES[lang] || 'en-GB';

function fill(s, vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

// t('Saved') or t('{n} new posts', { n: 4 }). A key can carry its context in brackets ('Saved [button state]') when one
// English word needs two French ones; the bracket part is never shown.
export function t(s, vars) {
  const d = DICTS[lang];
  return fill(((d && d[s]) || s).replace(/ \[[^\]]+\]$/, ''), vars);
}

// Singular or plural: tn(n, '{n} post', '{n} posts')
export function tn(n, one, many, vars) {
  return t(Math.abs(Number(n)) === 1 || (lang === 'fr' && Math.abs(Number(n)) < 2) ? one : many, { n, ...vars });
}

export function fmtDate(unixOrMs, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!unixOrMs) return '';
  const ms = unixOrMs < 1e12 ? unixOrMs * 1000 : unixOrMs;
  try { return new Intl.DateTimeFormat(locale(), opts).format(new Date(ms)); } catch { return new Date(ms).toISOString().slice(0, 10); }
}

export function fmtDateTime(unixOrMs) {
  return fmtDate(unixOrMs, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtInt(n) {
  try { return new Intl.NumberFormat(locale()).format(Number(n) || 0); } catch { return String(n); }
}
