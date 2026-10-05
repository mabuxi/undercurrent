import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { getSetting, setSetting } from './db.js';
import fr from './i18n/fr/index.js';

// What the server says to you (errors, steps, explanations) is written in English and looked up in the French
// dictionary when the profile's language is French. Tags are never translated; kink names are (see vocab.js).
// The language does not change how anything is ranked or learned.

export const LANGS = ['en', 'fr'];
const DICTS = { fr };
const NAMES = {
  en: { en: 'English', fr: 'French', nl: 'Dutch', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese' },
  fr: { en: 'anglais', fr: 'français', nl: 'néerlandais', de: 'allemand', es: 'espagnol', it: 'italien', pt: 'portugais' }
};

let cached = null;
export function lang() {
  if (cached) return cached;
  let l;
  try { l = getSetting('language', null) || 'en'; } catch { return 'en'; }
  cached = LANGS.includes(l) ? l : 'en';
  return cached;
}

export function languageSet() {
  try { return !!getSetting('language', null); } catch { return false; }
}

// The Mac app reads this file before the server is up, for its own few words (starting, stopping, menus).
function writeAppFile(l) {
  try { fs.writeFileSync(path.join(config.dataDir, 'language'), l); } catch {}
}

export function setLanguage(l) {
  const v = LANGS.includes(l) ? l : 'en';
  setSetting('language', v);
  cached = v;
  writeAppFile(v);
  return v;
}

export function resetLanguageCache() {
  cached = null;
  if (!config.mock) writeAppFile(lang());
}

export function langName(code, inLang = lang()) {
  return (NAMES[inLang] || NAMES.en)[code] || code;
}

function fill(s, vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

// tr('Saved') or tr('{n} new posts', { n: 4 })
export function tr(s, vars, l = lang()) {
  const d = DICTS[l];
  return fill((d && d[s]) || s, vars);
}

export function trn(n, one, many, vars, l = lang()) {
  const a = Math.abs(Number(n));
  return tr(a === 1 || (l === 'fr' && a < 2) ? one : many, { n, ...vars }, l);
}

// For the local AI: what to answer in.
export function replyIn(l = lang()) {
  return l === 'fr' ? 'Always answer in French (the user reads French). Keep tags and site names as they are.' : 'Always answer in English.';
}
