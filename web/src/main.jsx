import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { setLang, guessLang } from './i18n.js';

// The language is known before anything else loads, so every text (also the fixed lists) comes out in it.
async function boot() {
  let lang = null;
  try {
    const r = await fetch('/api/settings/language');
    if (r.ok) lang = (await r.json()).language;
  } catch {}
  if (!lang) {
    lang = guessLang();
    fetch('/api/settings/language', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: lang, guessed: true }) }).catch(() => {});
  }
  setLang(lang);
  const [{ default: App }, { default: ErrorBoundary, reportError }] = await Promise.all([import('./App.jsx'), import('./components/ErrorBoundary.jsx')]);
  window.addEventListener('error', (e) => reportError(e.message, e.error?.stack));
  window.addEventListener('unhandledrejection', (e) => reportError(`Unhandled promise: ${e.reason?.message || e.reason}`, e.reason?.stack));
  createRoot(document.getElementById('root')).render(
    <ErrorBoundary name="App" big>
      <App />
    </ErrorBoundary>
  );
}

boot();
