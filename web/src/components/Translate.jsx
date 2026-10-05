import { useState } from 'react';
import { api } from '../api.js';
import { t, getLang } from '../i18n.js';
import { Icon } from '../icons.jsx';

// A post's title or text in your language, by the local AI. The button only shows when the text is clearly in
// another language than the interface.

const FROM = {
  en: () => t('Translated from English'),
  fr: () => t('Translated from French'),
  nl: () => t('Translated from Dutch'),
  de: () => t('Translated from German'),
  es: () => t('Translated from Spanish'),
  it: () => t('Translated from Italian'),
  pt: () => t('Translated from Portuguese')
};

export function useTranslate(item, field) {
  const [st, setSt] = useState({ on: false, text: null, busy: false, error: null });
  const from = item?.langs?.[field] || null;
  const show = !!from && from !== getLang() && !!String(item?.[field === 'title' ? 'title' : 'body'] || '').trim();
  async function toggle(e) {
    e?.stopPropagation?.();
    if (st.busy) return;
    if (st.on) { setSt((s) => ({ ...s, on: false })); return; }
    if (st.text) { setSt((s) => ({ ...s, on: true })); return; }
    setSt((s) => ({ ...s, busy: true, error: null }));
    try {
      const r = await api('/translate', { method: 'POST', body: { id: item.id, field } });
      setSt({ on: true, text: r.text, busy: false, error: null });
    } catch (err) {
      setSt((s) => ({ ...s, busy: false, error: err.message }));
    }
  }
  return { show, on: st.on && !!st.text, text: st.on ? st.text : null, busy: st.busy, error: st.error, toggle, note: from && FROM[from] ? FROM[from]() : null };
}

// The small button next to a title (icon only) or under a text (with its label).
export function TranslateButton({ tr, small = false }) {
  if (!tr.show) return null;
  const label = tr.busy ? t('Translating…') : tr.on ? t('Show original') : small ? t('Translate the title') : t('Translate');
  return (
    <>
      <button type="button" className={`trbtn${small ? ' small' : ''}${tr.on ? ' on' : ''}${tr.busy ? ' busy' : ''}`} onClick={tr.toggle} disabled={tr.busy} title={tr.on && tr.note ? `${tr.note}. ${t('Show original')}` : label} aria-label={label}>
        <Icon name="translate" />{small ? null : <span>{label}</span>}
      </button>
      {tr.error ? <span className="trerr">{t('Could not translate: {error}', { error: tr.error })}</span> : null}
    </>
  );
}

export function TranslatedNote({ tr }) {
  return tr.on && tr.note ? <span className="trnote">{tr.note}</span> : null;
}
