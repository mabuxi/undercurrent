import React from 'react';
import { createRoot } from 'react-dom/client';
import './fonts/fonts.css';
import './styles.css';
import './theme-cutout.css';
import './theme-signal.css';
import './theme-specimen.css';
import { setLang, guessLang } from './i18n.js';
import { applyTheme } from './theme.js';
import { logoUrl } from './logo.js';

// The look you picked last time is there from the first frame; the Mac's own setting follows right after.
try { applyTheme(localStorage.getItem('uc-theme') || 'original', { save: false }); } catch {}

// While the app loads: the mark of the look, breathing.
function bootScreen() {
  const root = document.getElementById('root');
  if (root && !root.firstChild) root.innerHTML = `<div class="bootload" aria-hidden="true"><img class="bootmark" src="${logoUrl(document.documentElement.dataset.theme)}" alt=""><i class="bootbar"></i></div>`;
}
bootScreen();
window.addEventListener('uc-theme', () => { const img = document.querySelector('.bootmark'); if (img) img.src = logoUrl(document.documentElement.dataset.theme); });

// The language is known before anything else loads, so every text (also the fixed lists) comes out in it.
async function boot() {
  let lang = null;
  const look = fetch('/api/settings/theme').then((r) => (r.ok ? r.json() : null)).then((v) => { if (v?.theme) applyTheme(v.theme, { save: false, remember: true }); }).catch(() => {});
  try {
    const r = await fetch('/api/settings/language');
    if (r.ok) lang = (await r.json()).language;
  } catch {}
  await Promise.race([look, new Promise((ok) => setTimeout(ok, 600))]);
  if (!lang) {
    lang = guessLang();
    fetch('/api/settings/language', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: lang, guessed: true }) }).catch(() => {});
  }
  setLang(lang);
  const [{ default: App }, { default: ErrorBoundary, reportError }] = await Promise.all([import('./App.jsx'), import('./components/ErrorBoundary.jsx')]);
  window.addEventListener('error', (e) => reportError(e.message, e.error?.stack));
  window.addEventListener('unhandledrejection', (e) => reportError(`Unhandled promise: ${e.reason?.message || e.reason}`, e.reason?.stack));
  document.getElementById('root').innerHTML = '';
  createRoot(document.getElementById('root')).render(
    <ErrorBoundary name="App" big>
      <App />
    </ErrorBoundary>
  );
}

boot();
