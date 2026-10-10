// On a computer the full screen viewer also puts the window in full screen, and leaving the viewer puts the window
// back the way it was. In the Mac app the app itself does it (a real full screen window); in a browser the page asks
// for full screen. Leaving full screen yourself (Escape, the green button) leaves the viewer too.

const desktop = () => {
  if (window.ucMac) return true;
  try { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch { return false; }
};
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
const post = (m) => { try { window.webkit?.messageHandlers?.uc?.postMessage(m); } catch {} };

let entered = false;
let onLeft = null;
let last = null;
let waitT = null;

const changed = () => {
  const cur = fsEl();
  const was = last;
  last = cur;
  if (!entered || cur) return;
  entered = false;
  if (was === document.documentElement && onLeft) onLeft();
};

const request = () => {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  try {
    entered = true;
    const p = req.call(el);
    if (p?.catch) p.catch(() => { entered = false; });
  } catch { entered = false; }
};

export function enterWindowFull(leave) {
  onLeft = leave;
  if (!desktop()) return;
  if (window.ucMac) { post('winfull-on'); return; }
  document.addEventListener('fullscreenchange', changed);
  document.addEventListener('webkitfullscreenchange', changed);
  const cur = fsEl();
  last = cur;
  if (cur === document.documentElement) return;
  if (!cur) { request(); return; }
  // A video or another site's player is full screen on its own: let it go first, then the whole page goes full screen.
  const then = () => {
    clearTimeout(waitT);
    document.removeEventListener('fullscreenchange', after);
    document.removeEventListener('webkitfullscreenchange', after);
    if (onLeft === leave && !fsEl()) request();
  };
  const after = () => { if (!fsEl()) then(); };
  document.addEventListener('fullscreenchange', after);
  document.addEventListener('webkitfullscreenchange', after);
  waitT = setTimeout(then, 700);
  try { const ex = document.exitFullscreen || document.webkitExitFullscreen; const p = ex?.call(document); if (p?.catch) p.catch(() => {}); } catch {}
}

export function leaveWindowFull() {
  onLeft = null;
  clearTimeout(waitT);
  if (window.ucMac) { post('winfull-off'); return; }
  document.removeEventListener('fullscreenchange', changed);
  document.removeEventListener('webkitfullscreenchange', changed);
  if (!entered) return;
  entered = false;
  if (fsEl()) {
    try { const ex = document.exitFullscreen || document.webkitExitFullscreen; const p = ex?.call(document); if (p?.catch) p.catch(() => {}); } catch {}
  }
}

// The Mac app tells the page when you left full screen yourself.
window.ucWinFullLeft = () => { if (onLeft) onLeft(); };
