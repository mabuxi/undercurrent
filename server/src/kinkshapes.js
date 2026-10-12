import { getDb } from './db.js';
import { log } from './log.js';
import { familyOfRow } from './kinkengine.js';

// Every shape the app can draw, by family, with what it looks like (for the local model). The same names as in
// web/src/shapedata.js (a test checks they match).
export const SHAPE_LIBRARY = {
  round: { circle: 'a plain disc', half: 'a half disc', twin: 'two discs side by side', quad: 'four discs', ring: 'a ring', oval: 'an oval' },
  arch: { arch: 'an arch, like a doorway', archHole: 'an arch with an opening', twinArch: 'two arches', keyhole: 'a keyhole', dome: 'a dome', tripleArch: 'three arches' },
  pill: { pill: 'a capsule', pillStack: 'stacked capsules', capsule: 'a short capsule', pillV: 'an upright capsule', pillCross: 'two crossed capsules', pillTilt: 'a tilted capsule' },
  star: { spark: 'a four-point spark', aster: 'an eight-point star', burst: 'a starburst', plus: 'a plus sign', star5: 'a five-point star', twinkle: 'a twinkle' },
  wave: { wave: 'one wave', waves: 'stacked waves', hourglass: 'an hourglass', bowtie: 'a bow tie', ripple: 'ripples', flow: 'a flowing curve' },
  drop: { drop: 'a water drop', dropTwin: 'two drops', splash: 'a splash', bubbles: 'bubbles', dropRing: 'a drop in a ring', tear: 'a teardrop' },
  petal: { heart: 'a heart', clover: 'a clover', flower: 'a flower', lips: 'lips', bloom: 'a blooming flower', tulip: 'a tulip' },
  angle: { diamond: 'a diamond', triangle: 'a triangle', chevron: 'a chevron', hexagon: 'a hexagon', bolt: 'a lightning bolt', triTwin: 'two triangles' },
  block: { square: 'a square', squircle: 'a rounded square', stairs: 'stairs', lshape: 'an L shape', tee: 'a T shape', domino: 'a domino' },
  sky: { moon: 'a crescent moon', planet: 'a planet with a ring', eclipse: 'an eclipse', orbit: 'an orbit', sun: 'a sun', globe: 'a globe' },
  link: { link: 'two links of a chain', infinity: 'an infinity sign', chain: 'a chain', knot: 'a knot', cuffs: 'handcuffs', target: 'a target' },
  cluster: { trio: 'three dots', dice: 'a die', row: 'a row of dots', pyramid: 'a pyramid of dots', pair: 'two dots', ring6: 'six dots in a ring' },
  frame: { frame: 'a picture frame', corners: 'camera corners', lens: 'a lens', aperture: 'a camera aperture', rectRing: 'a hollow rectangle', focus: 'a focus mark' },
  leaf: { leaf: 'a leaf', twinLeaf: 'two leaves', flame: 'a flame', sprout: 'a sprout', seed: 'a seed', bud: 'a bud' }
};
export const SHAPE_NAMES = Object.values(SHAPE_LIBRARY).flatMap((f) => Object.keys(f));
const FAMILY_SHAPES = { ethnicity: 'sky', body: 'round', types: 'block', oral: 'petal', sex: 'star', positions: 'angle', solo: 'leaf', cum: 'drop', dynamic: 'link', clothing: 'pill', places: 'arch', scenarios: 'wave', group: 'cluster', camera: 'frame', fluids: 'drop', drawn: 'block' };

// The local model picks, for kinks that have no shape yet, the one shape (of all of them) that fits each kink best.
// A shape you picked yourself always wins over this one; renaming a kink lets the model pick again.
export async function pickShapes(chat, model, { limit = 24 } = {}) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM kinks WHERE is_group = 0 AND status != 'hidden' AND shape IS NULL AND ai_shape IS NULL ORDER BY id LIMIT ?").all(limit);
  if (!rows.length) return 0;
  const groups = new Map(db.prepare('SELECT * FROM kinks WHERE is_group = 1').all().map((g) => [g.id, g]));
  const lines = rows.map((k) => {
    const g = k.parent_id ? groups.get(k.parent_id) : null;
    const fam = FAMILY_SHAPES[familyOfRow(g || k)];
    return `${k.id}. ${k.name}${g ? ` (group: ${g.name}${fam ? `, its shapes: ${Object.keys(SHAPE_LIBRARY[fam]).join(', ')}` : ''})` : ''}`;
  });
  const out = await chat({
    kind: 'kink-shapes', model, temperature: 0,
    schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, shape: { type: 'string', enum: SHAPE_NAMES } }, required: ['id', 'shape'] } } }, required: ['items'] },
    system: `An adult-content browser draws every kink of its user as a small flat icon. Pick for each kink the icon that fits it best, the most fitting meaning or look first (lips for oral, a drop for wet things, handcuffs for bondage, a lens for camera angles, a moon for night). When a kink is in a group, prefer the group's shapes unless another shape clearly fits better. Icons: ${Object.values(SHAPE_LIBRARY).flatMap((f) => Object.entries(f).map(([n, d]) => `${n} (${d})`)).join(', ')}.`,
    user: lines.join('\n')
  });
  const ids = new Set(rows.map((r) => r.id));
  const set = db.prepare('UPDATE kinks SET ai_shape = ? WHERE id = ? AND shape IS NULL');
  let n = 0;
  for (const x of out?.items || []) if (ids.has(x.id) && SHAPE_NAMES.includes(x.shape)) { set.run(x.shape, x.id); n++; }
  if (n) log('info', `Shapes picked for ${n} kink${n === 1 ? '' : 's'}.`);
  return n;
}

// Soon after you make or rename a kink (a few seconds later, in the background).
let soon = null;
export function shapeSoon() {
  clearTimeout(soon);
  soon = setTimeout(async () => {
    try { const { chat, fastModel } = await import('./ai/ollama.js'); await pickShapes(chat, fastModel()); } catch {}
  }, 4000);
  soon.unref?.();
}
