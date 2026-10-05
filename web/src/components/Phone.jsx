import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { Icon } from '../icons.jsx';

// Opening Undercurrent on an iPhone: a QR code with this Mac's address on the home network. The phone uses the
// Mac's feed, taste and local AI; nothing is stored on the phone.
export function PhoneModal({ onClose }) {
  const [lan, setLan] = useState(null);
  const [pick, setPick] = useState(0);
  const [svg, setSvg] = useState('');
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);
  const load = () => api('/lan').then(setLan).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function unpair() {
    try { await api('/lan/reset', { method: 'POST', body: {} }); setSvg(''); await load(); setErr(null); setDone(true); } catch (e) { setErr(e.message); }
  }
  const url = lan?.urls?.[pick]?.url || null;
  useEffect(() => {
    if (!url) return;
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1C0F14', light: '#FFFFFF' } }).then(setSvg).catch((e) => setErr(e.message));
  }, [url]);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="upmodal" role="dialog" aria-modal="true" aria-label={t('Open on your iPhone')} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="upcard phonecard">
        <div className="uphead">
          <div><span className="upkicker">{t('Open on your iPhone')}</span><h3>{t('Scan with the camera')}</h3></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('Close')}><Icon name="x" /></button>
        </div>
        {err ? <p className="ob-note bad">{err}</p> : null}
        {done ? <p className="ob-note good">{t('Every phone is forgotten. Scan the new code to pair one again.')}</p> : null}
        {lan?.localOnly ? <p className="ob-note bad">{t('Undercurrent only listens to this Mac right now (HOST is set to 127.0.0.1 in the .env file). Remove that line to open it from your phone.')}</p> : null}
        {lan && !lan.localOnly && !lan.urls.length ? <p className="ob-note bad">{t('This Mac is not on a home network right now, so a phone cannot reach it.')}</p> : null}
        {url ? (
          <div className="qrwrap">
            <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="qrside">
              <code className="qrurl">{lan.urls[pick].plain || url}</code>
              {lan.urls.length > 1 ? (
                <div className="qrpick">
                  {lan.urls.map((u, i) => <button key={u.url} type="button" className={`chip${i === pick ? ' on' : ''}`} onClick={() => setPick(i)}>{u.address}</button>)}
                </div>
              ) : null}
              <ol className="qrsteps">
                <li>{t('Your iPhone is on the same Wi-Fi as this Mac.')}</li>
                <li>{t('Point the camera at the code and tap the link. It opens in Safari.')}</li>
                <li>{t('To keep it as an app: tap Share, then Add to Home Screen. It opens full screen, like an app.')}</li>
              </ol>
              <p className="wnote">{t('The phone shows this Mac’s feed and uses its local AI, so the Mac and Undercurrent need to be on. Nothing about you is stored on the phone.')}</p>
              <p className="wnote">{t('The code is a key: only devices that scanned it can open Undercurrent, nobody else on the same Wi-Fi.')} <button type="button" className="linkbtn" onClick={unpair}>{t('Forget all paired phones')}</button></p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
