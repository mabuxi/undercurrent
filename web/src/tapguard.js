// Telling a real tap from the end of a scroll. On a phone a finger that lands on a tag to stop a scroll (or starts a
// scroll on it) sometimes still counts as a tap on it, which jumps the feed to that tag. A tap only counts when the
// page was not still gliding from your last swipe when the finger came down, and the finger stayed put.
// The page moving by itself (pictures above loading) does not count, only scrolling that follows a touch.

let lastTouch = 0;
let touching = false;
let lastUserScroll = 0;
let down = null;

if (typeof window !== 'undefined') {
  window.addEventListener('scroll', () => {
    const now = Date.now();
    if (touching || now - lastTouch < 1500) lastUserScroll = now;
  }, { capture: true, passive: true });
  window.addEventListener('pointerdown', (e) => {
    const now = Date.now();
    const touch = e.pointerType !== 'mouse';
    down = { x: e.clientX, y: e.clientY, touch, moving: touch && now - lastUserScroll < 180, moved: false };
    if (touch) touching = true;
  }, { capture: true, passive: true });
  window.addEventListener('pointermove', (e) => {
    if (down && !down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) down.moved = true;
  }, { capture: true, passive: true });
  const up = (e) => { if (e.pointerType !== 'mouse') { touching = false; lastTouch = Date.now(); } };
  window.addEventListener('pointerup', up, { capture: true, passive: true });
  window.addEventListener('pointercancel', (e) => { if (down) down.moved = true; up(e); }, { capture: true, passive: true });
}

export function realTap() {
  const d = down;
  if (!d) return true;
  return !d.moved && !d.moving;
}

// A click handler that ignores taps that were really scrolls (keyboard clicks always go through).
export const tapOnly = (fn) => (e) => {
  if (e?.detail !== 0 && !realTap()) { e.preventDefault(); e.stopPropagation(); return; }
  fn(e);
};
