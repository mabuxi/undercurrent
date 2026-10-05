import { useState } from 'react';
import { api } from '../api.js';
import { t, getLang, LANGS } from '../i18n.js';

// Switching the language saves it for this profile and reloads, so everything (also the fixed lists) follows.
export function LanguageSwitch({ compact = false }) {
  const [busy, setBusy] = useState(null);
  async function pick(id) {
    if (id === getLang() || busy) return;
    setBusy(id);
    try { await api('/settings/language', { method: 'PUT', body: { language: id } }); } catch {}
    window.location.reload();
  }
  return (
    <div className={`langswitch${compact ? ' compact' : ''}`} role="radiogroup" aria-label={t('Language')}>
      {LANGS.map((l) => (
        <button key={l.id} type="button" role="radio" aria-checked={getLang() === l.id} className={getLang() === l.id ? 'on' : ''} onClick={() => pick(l.id)} disabled={!!busy}>
          {compact ? l.short : l.name}
        </button>
      ))}
    </div>
  );
}

export function LanguageCard() {
  return (
    <div className="card2" id="language">
      <h3>{t('Language')}</h3>
      <p className="wtext">{t('The language of the interface, the assistant and the kink names. Tags stay in English, so what you like counts the same in both languages.')}</p>
      <LanguageSwitch />
      <p className="wnote">{t('Posts in another language get a Translate button, done by the local AI on this Mac.')}</p>
    </div>
  );
}
