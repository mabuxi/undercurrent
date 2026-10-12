// The colour of a kink as each look shows it: the same formulas as the --cv rules in the style sheets, for places
// that draw without CSS (the map) or set a colour inline. The original look keeps colours soft and a little glassy,
// Cutout and Signal make them vivid on black.
import { SHAPES } from './shapedata.js';

function rgbOf(c) {
  const m = String(c || '#999999').trim().replace('#', '');
  const f = m.length === 3 ? m.split('').map((x) => x + x).join('') : m.padEnd(6, '9').slice(0, 6);
  return [parseInt(f.slice(0, 2), 16) || 0, parseInt(f.slice(2, 4), 16) || 0, parseInt(f.slice(4, 6), 16) || 0];
}
function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}
function toHex([h, s, l]) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`;
}

export function lookColor(color, theme = document.documentElement.dataset.theme || 'original') {
  if (!color) return color;
  const [h, s, l] = toHsl(rgbOf(color));
  if (theme === 'cutout') return toHex([h, Math.min(100, s * 1.35 + 32), l * 0.42 + 33]);
  if (theme === 'signal') return toHex([h, Math.min(100, s * 1.4 + 34), l * 0.4 + 36]);
  return toHex([h, Math.min(s, 58), Math.max(52, Math.min(76, l))]);
}

// Mixes a colour toward another one (0 keeps it, 1 is the other one).
export function mixHex(a, b, t) {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

const INK = '#0B0B0B';
function patternSvg(kind, fill, k) {
  const tr = (rot) => [rot ? `rotate(${rot})` : '', k !== 1 ? `scale(${k})` : ''].join(' ').trim();
  const P = (w, h, inner, rot) => `<pattern id="p" width="${w}" height="${h}" patternUnits="userSpaceOnUse"${tr(rot) ? ` patternTransform="${tr(rot)}"` : ''}><rect width="${w}" height="${h}" fill="${fill}"/>${inner}</pattern>`;
  switch (kind) {
    case 'stripes': return P(10, 10, `<rect width="4" height="10" fill="${INK}"/>`, 45);
    case 'checker': return P(16, 16, `<rect width="8" height="8" fill="${INK}"/><rect x="8" y="8" width="8" height="8" fill="${INK}"/>`);
    case 'zigzag': return P(16, 10, `<path d="M0 8L4 3L8 8L12 3L16 8" stroke="${INK}" stroke-width="2.4" fill="none"/>`);
    case 'waves': return P(20, 10, `<path d="M0 7q5-6 10 0t10 0" stroke="${INK}" stroke-width="2.6" fill="none"/>`);
    case 'rings': return P(14, 14, `<circle cx="7" cy="7" r="3.6" stroke="${INK}" stroke-width="2" fill="none"/>`);
    case 'hatch': return P(10, 10, `<path d="M0 0L10 10M10 0L0 10" stroke="${INK}" stroke-width="1.8"/>`);
    case 'grid': return P(12, 12, `<path d="M0 0H12M0 0V12" stroke="${INK}" stroke-width="2.4"/>`);
    case 'bars': return P(10, 10, `<rect width="10" height="3.6" fill="${INK}"/>`);
    default: return P(9, 9, `<circle cx="4.5" cy="4.5" r="2.2" fill="${INK}"/>`);
  }
}

// One shape as an SVG document, drawn the way a look draws it (the same as <Shape> on the page).
export function shapeSvg(shape, color, theme, pattern = 'dots', size = 32) {
  const body = SHAPES[shape] || SHAPES.circle;
  const c = lookColor(color || '#9A8FA0', theme);
  if (theme === 'signal') {
    const unit = 118 / size;
    const sw = Math.min(14, Math.max(4, 1.5 * unit));
    const off = Math.min(14, Math.max(7, 1.4 * unit));
    const k = Math.max(1, Math.min(4, 36 / size));
    // A box centred on the shape, with room for its shadow on every side (so a canvas can draw it centred).
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 146 146"><defs>${patternSvg(pattern, c, k)}</defs><g transform="translate(${off} ${off})" fill="${c}">${body}</g><g fill="url(#p)" stroke="#F3F0E4" stroke-width="${sw}" stroke-linejoin="round">${body}</g></svg>`;
  }
  if (theme === 'cutout') return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="${c}">${body}</g></svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mixHex(c, '#ffffff', 0.42)}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs><g fill="url(#g)">${body}</g></svg>`;
}

// The same shape as an image for a canvas, made once and kept.
const IMAGES = new Map();
export function shapeImage(shape, color, theme, pattern, size) {
  const bucket = size < 20 ? 16 : size < 28 ? 24 : size < 40 ? 32 : size < 56 ? 48 : 64;
  const key = `${shape}|${color}|${theme}|${pattern}|${bucket}`;
  let img = IMAGES.get(key);
  if (!img) {
    if (IMAGES.size > 600) IMAGES.clear();
    img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(shapeSvg(shape, color, theme, pattern, bucket))}`;
    IMAGES.set(key, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}
