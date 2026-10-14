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

const FAMS = Object.keys(SHAPE_LIBRARY);
const famOfShape = (shape) => FAMS.find((f) => shape in SHAPE_LIBRARY[f]) || null;
function hash(s) {
  let h = 2166136261;
  for (const ch of String(s || '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Every group keeps a family of shapes once it has one: the family of what it is about, else the family most of its
// kinks have, else one no other group has. Kept, so it never changes by itself.
export function pickGroupFamilies() {
  const db = getDb();
  const groups = db.prepare('SELECT * FROM kinks WHERE is_group = 1 ORDER BY id').all();
  const used = new Set(groups.map((g) => (SHAPE_LIBRARY[g.shape] ? g.shape : SHAPE_LIBRARY[g.ai_shape] ? g.ai_shape : null)).filter(Boolean));
  let n = 0;
  for (const g of groups) {
    if (SHAPE_LIBRARY[g.shape] || SHAPE_LIBRARY[g.ai_shape]) continue;
    const counts = new Map();
    for (const k of db.prepare('SELECT shape, ai_shape FROM kinks WHERE parent_id = ? AND is_group = 0').all(g.id)) {
      const f = famOfShape(k.shape || k.ai_shape || '');
      if (f) counts.set(f, (counts.get(f) || 0) + 1);
    }
    let fam = FAMILY_SHAPES[familyOfRow(g)] || [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    if (!fam || used.has(fam)) {
      const start = hash(g.name) % FAMS.length;
      fam = FAMS.map((_, i) => FAMS[(start + i) % FAMS.length]).find((f) => !used.has(f)) || fam || FAMS[start];
    }
    used.add(fam);
    db.prepare('UPDATE kinks SET ai_shape = ? WHERE id = ?').run(fam, g.id);
    n++;
  }
  return n;
}

// The local model picks, for kinks that have no shape yet, the one shape (of all of them) that fits each kink best.
// Once picked it is kept: it only changes when you pick another one, rename the kink or move it to another group.
// Two kinks of one group never get the same shape.
export async function pickShapes(chat, model, { limit = 24 } = {}) {
  const db = getDb();
  pickGroupFamilies();
  const rows = db.prepare("SELECT * FROM kinks WHERE is_group = 0 AND status != 'hidden' AND shape IS NULL AND ai_shape IS NULL ORDER BY id LIMIT ?").all(limit);
  if (!rows.length) return 0;
  const groups = new Map(db.prepare('SELECT * FROM kinks WHERE is_group = 1').all().map((g) => [g.id, g]));
  const famOfGroup = (g) => (SHAPE_LIBRARY[g?.shape] ? g.shape : SHAPE_LIBRARY[g?.ai_shape] ? g.ai_shape : FAMILY_SHAPES[familyOfRow(g)] || null);
  const takenIn = (gid) => new Set(db.prepare('SELECT shape, ai_shape FROM kinks WHERE parent_id = ? AND is_group = 0').all(gid).map((k) => k.shape || k.ai_shape).filter(Boolean));
  const lines = rows.map((k) => {
    const g = k.parent_id ? groups.get(k.parent_id) : null;
    const fam = g ? famOfGroup(g) : FAMILY_SHAPES[familyOfRow(k)];
    const taken = g ? [...takenIn(g.id)] : [];
    return `${k.id}. ${k.name}${g ? ` (group: ${g.name}${fam ? `, its shapes: ${Object.keys(SHAPE_LIBRARY[fam]).join(', ')}` : ''}${taken.length ? `; already used in the group: ${taken.join(', ')}` : ''})` : ''}`;
  });
  let out = null;
  try {
    out = await chat({
      kind: 'kink-shapes', model, temperature: 0,
      schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, shape: { type: 'string', enum: SHAPE_NAMES } }, required: ['id', 'shape'] } } }, required: ['items'] },
      system: `An adult-content browser draws every kink of its user as a small flat icon. Pick for each kink the icon that fits it best, the most fitting meaning or look first (lips for oral, a drop for wet things, handcuffs for bondage, a lens for camera angles, a moon for night). When a kink is in a group, prefer the group's shapes unless another shape clearly fits better, and never one already used in the group. Icons: ${Object.values(SHAPE_LIBRARY).flatMap((f) => Object.entries(f).map(([n, d]) => `${n} (${d})`)).join(', ')}.`,
      user: lines.join('\n')
    });
  } catch {
    return 0;
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const set = db.prepare('UPDATE kinks SET ai_shape = ? WHERE id = ? AND shape IS NULL');
  let n = 0;
  for (const x of out?.items || []) {
    const k = byId.get(x.id);
    if (!k || !SHAPE_NAMES.includes(x.shape)) continue;
    let shape = x.shape;
    if (k.parent_id) {
      // Never twice in one group: the next free shape of the group's family, else of the picked shape's family.
      const taken = takenIn(k.parent_id);
      if (taken.has(shape)) {
        const g = groups.get(k.parent_id);
        const options = [...Object.keys(SHAPE_LIBRARY[famOfGroup(g)] || {}), ...Object.keys(SHAPE_LIBRARY[famOfShape(shape)] || {}), ...SHAPE_NAMES];
        shape = options.find((o) => !taken.has(o)) || shape;
      }
    }
    set.run(shape, k.id);
    byId.delete(k.id);
    n++;
  }
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
