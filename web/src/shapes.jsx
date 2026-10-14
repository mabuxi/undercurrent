import { useId } from 'react';
import { SHAPES, SHAPE_FAMILIES } from './shapedata.js';
import { useApp } from './context.jsx';
import { specimenParts } from './lookcolor.js';

export { SHAPES, SHAPE_FAMILIES };

// Every kink has a shape. A group has a family of shapes that fits what it is about (round shapes for the body, arches
// for places, capsules for clothing, stars for sex…) and each kink in it gets its own variation of that family. Kinks
// on their own get a family that fits them too. The look decides how a shape is drawn: soft in the original look, flat
// with a glow in its own colour in Cutout, filled with the family's pattern, outlined, with a hard shadow in Signal, and
// as a wireframe extruded into depth in Specimen.

export { FAMILY_SHAPES, PATTERNS, familyOfShape, assignShapes } from './shapeassign.js';

// The shape of one kink (or group) from what the app worked out, with a plain circle when it is not known yet.
export function useKinkShape(id) {
  const ctx = useApp();
  return ctx?.shapes?.get(Number(id)) || { shape: 'circle', fam: 'round', pattern: 'dots' };
}

export const currentTheme = () => document.documentElement.dataset.theme || 'original';

const INK = '#0B0B0B';
function Pattern({ id, kind, k }) {
  const fill = { fill: 'var(--kf)' };
  const tr = k !== 1 ? `scale(${k})` : undefined;
  const P = (w, h, children, rot) => <pattern id={id} width={w} height={h} patternUnits="userSpaceOnUse" patternTransform={[rot ? `rotate(${rot})` : '', tr || ''].join(' ').trim() || undefined}><rect width={w} height={h} style={fill} />{children}</pattern>;
  switch (kind) {
    case 'stripes': return P(10, 10, <rect width="4" height="10" fill={INK} />, 45);
    case 'checker': return P(16, 16, <><rect width="8" height="8" fill={INK} /><rect x="8" y="8" width="8" height="8" fill={INK} /></>);
    case 'zigzag': return P(16, 10, <path d="M0 8L4 3L8 8L12 3L16 8" stroke={INK} strokeWidth="2.4" fill="none" />);
    case 'waves': return P(20, 10, <path d="M0 7q5-6 10 0t10 0" stroke={INK} strokeWidth="2.6" fill="none" />);
    case 'rings': return P(14, 14, <circle cx="7" cy="7" r="3.6" stroke={INK} strokeWidth="2" fill="none" />);
    case 'hatch': return P(10, 10, <path d="M0 0L10 10M10 0L0 10" stroke={INK} strokeWidth="1.8" />);
    case 'grid': return P(12, 12, <path d="M0 0H12M0 0V12" stroke={INK} strokeWidth="2.4" />);
    case 'bars': return P(10, 10, <rect width="10" height="3.6" fill={INK} />);
    default: return P(9, 9, <circle cx="4.5" cy="4.5" r="2.2" fill={INK} />);
  }
}

// One shape, drawn the way the current look draws them. color is the kink's own colour; the looks make it more vivid
// where they need to. hollow draws only a dashed outline (for things that are almost a kink).
export function Shape({ shape = 'circle', color, pattern = 'dots', size = 24, className = '', hollow = false, title, look }) {
  const ctx = useApp();
  const theme = look || ctx?.theme || currentTheme();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const body = { __html: SHAPES[shape] || SHAPES.circle };
  const style = { '--c': color || undefined, width: size, height: size };
  const cls = `kshape t-${theme}${size >= 40 ? ' big' : ''}${hollow ? ' hollow' : ''} ${className}`;
  const label = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true };
  if (hollow) {
    const sw = Math.max(5, (1.6 * 112) / size);
    return <svg className={cls} viewBox="-6 -6 112 112" style={style} {...label}><g className="ks-main" fill="none" stroke="var(--kf)" strokeWidth={sw} strokeDasharray={`${sw * 1.6} ${sw * 1.1}`} strokeLinejoin="round" dangerouslySetInnerHTML={body} /></svg>;
  }
  if (theme === 'signal') {
    const unit = 118 / size;
    const sw = Math.min(14, Math.max(4, 1.5 * unit));
    const off = Math.min(14, Math.max(7, 1.4 * unit));
    const k = Math.max(1, Math.min(4, 36 / size));
    return (
      <svg className={cls} viewBox="-6 -6 118 118" style={style} {...label}>
        <defs><Pattern id={`${uid}p`} kind={pattern} k={k} /></defs>
        <g className="ks-back" transform={`translate(${off} ${off})`} dangerouslySetInnerHTML={body} />
        <g className="ks-main" fill={`url(#${uid}p)`} stroke="var(--kst)" strokeWidth={sw} strokeLinejoin="round" dangerouslySetInnerHTML={body} />
      </svg>
    );
  }
  if (theme === 'specimen') {
    const { inner, viewBox } = specimenParts(SHAPES[shape] || SHAPES.circle, size);
    return <svg className={cls} viewBox={viewBox} style={style} fill="none" stroke="var(--kf)" strokeLinejoin="round" {...label} dangerouslySetInnerHTML={{ __html: inner }} />;
  }
  if (theme === 'cutout') {
    return <svg className={cls} viewBox="0 0 100 100" style={style} {...label}><g className="ks-main" dangerouslySetInnerHTML={body} /></svg>;
  }
  return (
    <svg className={cls} viewBox="0 0 100 100" style={style} {...label}>
      <defs><linearGradient id={`${uid}g`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" className="ks-hi" /><stop offset="1" className="ks-lo" /></linearGradient></defs>
      <g className="ks-main" fill={`url(#${uid}g)`} dangerouslySetInnerHTML={body} />
    </svg>
  );
}

// The shape of a kink or group by its id.
export function KShape({ id, color, size = 24, className = '', hollow = false, title, shape: forced }) {
  const s = useKinkShape(id);
  return <Shape shape={forced || s.shape} pattern={s.pattern} color={color} size={size} className={className} hollow={hollow} title={title} />;
}
