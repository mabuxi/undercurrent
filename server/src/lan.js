import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Which addresses may open Undercurrent: this Mac and devices on a private network (home Wi-Fi, 192.168.x.x,
// 10.x.x.x, 172.16 to 31.x.x), never a public address.
const PRIVATE = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^::1$/, /^f[cd][0-9a-f]{2}:/i, /^fe80:/i];

export function isPrivateAddress(addr) {
  const a = String(addr || '').replace(/^::ffff:/i, '');
  return PRIVATE.some((re) => re.test(a));
}

// The addresses an iPhone on the same Wi-Fi can open Undercurrent at (shown as a QR code). Home networks first.
export function lanUrls(port, networkInterfaces) {
  const out = [];
  for (const [name, list] of Object.entries(networkInterfaces || {})) {
    for (const n of list || []) {
      if (!n || n.internal || n.family !== 'IPv4' && n.family !== 4) continue;
      if (!isPrivateAddress(n.address) || /^169\.254\./.test(n.address)) continue;
      out.push({ url: `http://${n.address}:${port}`, address: n.address, iface: name, rank: /^192\.168\./.test(n.address) ? 0 : /^10\./.test(n.address) ? 1 : 2 });
    }
  }
  return out.sort((a, b) => a.rank - b.rank || a.iface.localeCompare(b.iface)).map(({ rank, ...x }) => x);
}

// Pairing: this Mac always gets in. Another device (your iPhone) only gets in with the code from the QR code shown on
// the Mac, kept in a cookie, so nobody else on the same Wi-Fi (a dorm, a café, a shared flat) can open your feed.
export function isLoopback(addr) {
  const a = String(addr || '').replace(/^::ffff:/i, '');
  return /^127\./.test(a) || a === '::1';
}

let token = null;
export function pairToken(dataDir) {
  if (token) return token;
  const file = path.join(dataDir, 'pair-token');
  try { token = fs.readFileSync(file, 'utf8').trim(); } catch {}
  if (!token || token.length < 16) {
    token = crypto.randomBytes(18).toString('base64url');
    try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file, token, { mode: 0o600 }); } catch {}
  }
  return token;
}

export function resetPairToken(dataDir) {
  token = null;
  try { fs.unlinkSync(path.join(dataDir, 'pair-token')); } catch {}
  return pairToken(dataDir);
}

function cookieOf(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function isPaired(req, dataDir) {
  if (isLoopback(req.socket.remoteAddress)) return true;
  return same(cookieOf(req, 'uc_pair'), pairToken(dataDir));
}

const LOCKED = (lang) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Undercurrent</title>
<style>html,body{margin:0;height:100%;background:#110D12;color:#EFE6EA;font:16px -apple-system,system-ui,sans-serif}div{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:0 28px}
h1{font:italic 52px Georgia,serif;margin:0;background:linear-gradient(100deg,#F6D5C9,#E39A83 40%,#C98BC4 75%,#A58FE0);-webkit-background-clip:text;color:transparent}p{color:#B6A8B0;max-width:420px;line-height:1.5;margin:0}</style></head>
<body><div><h1>Undercurrent</h1>${lang === 'fr' ? '<p><b>Cet appareil n’est pas encore associé.</b></p><p>Ouvrez Undercurrent sur votre Mac, touchez le bouton du téléphone en haut et scannez le code QR avec l’appareil photo.</p>' : '<p><b>This device is not paired yet.</b></p><p>Open Undercurrent on your Mac, click the phone button at the top and scan the QR code with the camera.</p>'}</div></body></html>`;

export function pairGate(dataDir, langOf = () => 'en') {
  return (req, res, next) => {
    if (isLoopback(req.socket.remoteAddress)) return next();
    const tok = pairToken(dataDir);
    if (same(cookieOf(req, 'uc_pair'), tok)) return next();
    const q = new URL(req.originalUrl || req.url, 'http://x').searchParams.get('pair');
    if (same(q, tok)) {
      res.setHeader('Set-Cookie', `uc_pair=${encodeURIComponent(tok)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`);
      return next();
    }
    if (String(req.path).startsWith('/api/')) return res.status(401).json({ error: langOf() === 'fr' ? 'Cet appareil n’est pas associé. Scannez le code QR sur le Mac.' : 'This device is not paired. Scan the QR code on the Mac.' });
    res.status(401).type('html').send(LOCKED(langOf()));
  };
}
