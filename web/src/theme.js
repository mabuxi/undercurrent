// The look of the app: the original one, Cutout or Signal. It is an attribute on the page (the styles follow it), it is
// remembered on this device so the next start shows it straight away, and it is kept on the Mac so the iPhone matches.
export const THEMES = ['original', 'cutout', 'signal'];
const BG = { original: '#110D12', cutout: '#050505', signal: '#0B0B0B' };

export function applyTheme(theme, { save = true, remember = true } = {}) {
  const v = THEMES.includes(theme) ? theme : 'original';
  const el = document.documentElement;
  el.dataset.theme = v;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BG[v]);
  if (remember) { try { localStorage.setItem('uc-theme', v); } catch {} }
  // The icon on the home screen and in the browser tab follows the look (the original look keeps the first icon).
  const icon = (sel, size, first) => document.querySelector(sel)?.setAttribute('href', v === 'original' ? first : `/icons/${v}-${size}.png`);
  icon('link[rel="apple-touch-icon"]', 180, '/apple-touch-icon.png');
  icon('link[rel="icon"]', 192, '/icon-192.png');
  // The Mac app's window shows the same background behind the page, and its icon and loading screen follow the look.
  try { window.webkit?.messageHandlers?.uc?.postMessage(`bg:${BG[v]}`); window.webkit?.messageHandlers?.uc?.postMessage(`look:${v}`); } catch {}
  if (save) fetch('/api/settings/theme', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: v }) }).catch(() => {});
  window.dispatchEvent(new CustomEvent('uc-theme', { detail: v }));
  return v;
}
