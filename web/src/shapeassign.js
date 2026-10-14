// Which shape each kink gets: plain JavaScript (no React), so the tests can check it too.
import { SHAPES, SHAPE_FAMILIES } from './shapedata.js';

// Which family of shapes fits each family of kinks.
export const FAMILY_SHAPES = {
  ethnicity: 'sky', body: 'round', types: 'block', oral: 'petal', sex: 'star', positions: 'angle', solo: 'leaf', cum: 'drop',
  dynamic: 'link', clothing: 'pill', places: 'arch', scenarios: 'wave', group: 'cluster', camera: 'frame', fluids: 'drop', drawn: 'block'
};
// The pattern inside the shapes of each family (in the Signal look).
export const PATTERNS = {
  round: 'dots', arch: 'stripes', pill: 'checker', star: 'zigzag', wave: 'waves', drop: 'rings', petal: 'hatch', angle: 'grid',
  block: 'bars', sky: 'rings', link: 'hatch', cluster: 'dots', frame: 'grid', leaf: 'stripes'
};
export const FAMS = Object.keys(SHAPE_FAMILIES);
const FAMILY_OF_SHAPE = Object.fromEntries(FAMS.flatMap((f) => SHAPE_FAMILIES[f].map((s) => [s, f])));
export const familyOfShape = (s) => FAMILY_OF_SHAPE[s] || null;

// Words in a name that call for one shape in particular (English and French).
const KEYWORDS = [
  [/kiss|love|romant|passion|heart|cuddl|intima|bisou|baiser|amour|tendre/i, 'heart'],
  [/\blips?\b|mouth|oral|blow|suck|lick|deepthroat|lèvre|bouche|pipe|suce/i, 'lips'],
  [/rough|hard\b|intens|wild|power|aggress|brutal|fort\b|sauvage/i, 'bolt'],
  [/cum|load|creampie|facial|splash|squirt|sperm|jouis/i, 'splash'],
  [/water|shower|wet|pool|lake|swim|rain|bath|sweat|oil|douche|mouill|piscine|sueur|huile/i, 'drop'],
  [/sun|beach|summer|tan\b|tan lines|soleil|plage|été|bronz/i, 'sun'],
  [/night|dark|moon|nuit|lune/i, 'moon'],
  [/fire|hot\b|heat|burn|feu|chaud/i, 'flame'],
  [/outdoor|nature|forest|park|garden|trail|hike|dehors|forêt|jardin/i, 'leaf'],
  [/massage|touch|flower|fleur|caress/i, 'flower'],
  [/muscle|gym|jock|athlet|sport|fit\b/i, 'circle'],
  [/tattoo|ink|pierc|tatou/i, 'diamond'],
  [/bondage|tied|rope|cuff|leash|chain|attach|corde|menott/i, 'link'],
  [/group|orgy|threesome|gangbang|trio|plan à|partouze/i, 'trio'],
  [/pov|camera|cam\b|film|close.?up|selfie|mirror|miroir|caméra/i, 'frame'],
  [/door|room|locker|office|house|home|bed|car|chambre|bureau|maison|vestiaire|voiture/i, 'arch'],
  [/underwear|brief|jockstrap|lingerie|sock|boxer|thong|slip|chaussette|string/i, 'pill'],
  [/slow|sensual|tease|build|story|confess|lent|sensuel|histoire/i, 'wave'],
  [/solo|alone|jerk|mastur|toy|seul|branl/i, 'flame'],
  [/daddy|twink|bear|otter|mature|milf|older|younger adult|papa|ours/i, 'square']
];
const keywordShape = (name) => KEYWORDS.find(([re]) => re.test(name || ''))?.[1] || null;

function hash(s) {
  let h = 2166136261;
  for (const ch of String(s || '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// The shape of every kink and group, worked out from the kinks you have: a Map of id → { shape, fam, pattern }.
// A shape you picked yourself always stays, then the one the model picked; the rest is the same every time for the same kinks.
export function assignShapes(kinks = []) {
  const out = new Map();
  const groups = kinks.filter((k) => k.isGroup).sort((a, b) => a.id - b.id);
  const plain = kinks.filter((k) => !k.isGroup).sort((a, b) => a.id - b.id);
  const usedFams = new Set(groups.map((g) => (SHAPE_FAMILIES[g.shape] ? g.shape : SHAPE_FAMILIES[g.aiShape] ? g.aiShape : null)).filter(Boolean));
  const famFor = (k) => FAMILY_SHAPES[k.family] || familyOfShape(keywordShape(k.name)) || null;
  for (const g of groups) {
    const kids = plain.filter((k) => k.parentId === g.id);
    // Your pick first, then the family the app keeps for the group (picked once, so it never changes by itself).
    let fam = SHAPE_FAMILIES[g.shape] ? g.shape : SHAPE_FAMILIES[g.aiShape] ? g.aiShape : null;
    if (!fam) {
      const counts = new Map();
      for (const k of kids) { const f = famFor(k); if (f) counts.set(f, (counts.get(f) || 0) + 1); }
      const most = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
      fam = FAMILY_SHAPES[g.family] || most || familyOfShape(keywordShape(g.name)) || null;
      // Two groups never share a family of shapes unless you chose it.
      if (!fam || usedFams.has(fam)) {
        const start = hash(g.name) % FAMS.length;
        fam = FAMS.map((_, i) => FAMS[(start + i) % FAMS.length]).find((f) => !usedFams.has(f)) || FAMS[start];
      }
    }
    usedFams.add(fam);
    out.set(g.id, { shape: SHAPE_FAMILIES[fam][0], fam, pattern: PATTERNS[fam], group: true });
    // Each kink in the group gets its own variation: the one its name calls for, else the next one free.
    const taken = new Set(kids.map((k) => (SHAPES[k.shape] ? k.shape : SHAPES[k.aiShape] ? k.aiShape : null)).filter(Boolean));
    for (const k of kids) {
      if (SHAPES[k.shape]) { out.set(k.id, { shape: k.shape, fam: familyOfShape(k.shape), pattern: PATTERNS[familyOfShape(k.shape)] }); continue; }
      // The shape the model picked for this kink, from any family, when no other kink in the group has it.
      if (SHAPES[k.aiShape]) { const f = familyOfShape(k.aiShape); out.set(k.id, { shape: k.aiShape, fam: f, pattern: PATTERNS[f] }); continue; }
      const list = SHAPE_FAMILIES[fam];
      const kw = keywordShape(k.name);
      let s = kw && list.includes(kw) && !taken.has(kw) ? kw : list.find((x) => !taken.has(x));
      if (!s) s = list[hash(k.name) % list.length];
      taken.add(s);
      out.set(k.id, { shape: s, fam, pattern: PATTERNS[fam] });
    }
  }
  for (const k of plain) {
    if (out.has(k.id)) continue;
    if (SHAPES[k.shape]) { const f = familyOfShape(k.shape); out.set(k.id, { shape: k.shape, fam: f, pattern: PATTERNS[f] }); continue; }
    if (SHAPES[k.aiShape]) { const f = familyOfShape(k.aiShape); out.set(k.id, { shape: k.aiShape, fam: f, pattern: PATTERNS[f] }); continue; }
    const kw = keywordShape(k.name);
    const fam = FAMILY_SHAPES[k.family] || familyOfShape(kw) || FAMS[hash(k.name) % FAMS.length];
    const list = SHAPE_FAMILIES[fam];
    const s = kw && list.includes(kw) ? kw : list[hash(k.name) % list.length];
    out.set(k.id, { shape: s, fam, pattern: PATTERNS[fam] });
  }
  return out;
}
