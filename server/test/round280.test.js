import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { createKink, listKinks, updateKink } from '../src/kinks.js';
import { assignShapes, FAMILY_SHAPES, PATTERNS, familyOfShape } from '../../web/src/shapeassign.js';
import { SHAPES, SHAPE_FAMILIES } from '../../web/src/shapedata.js';
import { FAMILIES } from '../src/concepts.js';

openDb(':memory:');
const here = path.dirname(fileURLToPath(import.meta.url));

test('every family of shapes has six shapes, every shape belongs to one family, every family has a pattern', () => {
  for (const [f, list] of Object.entries(SHAPE_FAMILIES)) {
    assert.equal(list.length, 6, f);
    assert.ok(PATTERNS[f], `pattern for ${f}`);
    for (const s of list) { assert.ok(SHAPES[s], s); assert.equal(familyOfShape(s), f); }
  }
  assert.equal(Object.keys(SHAPES).length, Object.values(SHAPE_FAMILIES).flat().length);
  for (const f of Object.keys(FAMILIES)) assert.ok(SHAPE_FAMILIES[FAMILY_SHAPES[f]], `kink family ${f} has a family of shapes`);
});

test('kinks keep the shape you pick, a bad shape name is not saved, and every kink knows its family', () => {
  const id = createKink({ name: 'Muscle', tags: ['muscle', 'biceps'], origin: 'user' });
  let k = listKinks({ includeHidden: true }).find((x) => x.id === id);
  assert.equal(k.shape, null);
  assert.ok('family' in k);
  updateKink(id, { shape: 'heart' });
  k = listKinks({ includeHidden: true }).find((x) => x.id === id);
  assert.equal(k.shape, 'heart');
  updateKink(id, { shape: '<script>' });
  assert.equal(listKinks({ includeHidden: true }).find((x) => x.id === id).shape, null);
  updateKink(id, { shape: 'ring' });
  updateKink(id, { shape: null });
  assert.equal(listKinks({ includeHidden: true }).find((x) => x.id === id).shape, null);
  updateKink(id, { name: 'Muscles' });
  assert.equal(listKinks({ includeHidden: true }).find((x) => x.id === id).shape, null, 'other changes leave the shape alone');
});

test('a group gets a family of shapes that fits it, its kinks each get their own variation, and it is the same every time', () => {
  const kinks = [
    { id: 1, isGroup: true, name: 'Body', family: 'body' },
    { id: 2, isGroup: false, name: 'Muscle', family: 'body', parentId: 1 },
    { id: 3, isGroup: false, name: 'Abs', family: 'body', parentId: 1 },
    { id: 4, isGroup: false, name: 'Hairy chest', family: 'body', parentId: 1 },
    { id: 5, isGroup: true, name: 'Places', family: 'places' },
    { id: 6, isGroup: false, name: 'Shower', family: 'places', parentId: 5 },
    { id: 7, isGroup: false, name: 'Locker room', family: 'places', parentId: 5, shape: 'heart' },
    { id: 8, isGroup: true, name: 'Fluids', family: 'fluids' },
    { id: 9, isGroup: true, name: 'Cum', family: 'cum' },
    { id: 10, isGroup: false, name: 'Kissing' },
    { id: 11, isGroup: false, name: 'Something odd' }
  ];
  const m = assignShapes(kinks);
  assert.equal(m.get(1).fam, 'round');
  assert.equal(m.get(5).fam, 'arch');
  assert.notEqual(m.get(8).fam, m.get(9).fam, 'two groups never share a family unless you chose it');
  const body = [2, 3, 4].map((id) => m.get(id));
  assert.ok(body.every((x) => x.fam === 'round'));
  assert.equal(new Set(body.map((x) => x.shape)).size, 3, 'each kink in a group has its own shape');
  assert.equal(m.get(7).shape, 'heart', 'a shape you picked stays');
  assert.equal(m.get(6).fam, 'arch');
  assert.equal(m.get(10).shape, 'heart', 'kissing gets the heart');
  assert.ok(SHAPES[m.get(11).shape]);
  assert.deepEqual([...assignShapes(kinks)], [...m], 'the same kinks always get the same shapes');
  const chosen = assignShapes(kinks.map((k) => (k.id === 1 ? { ...k, shape: 'star' } : k)));
  assert.equal(chosen.get(1).fam, 'star');
  assert.ok([2, 3, 4].every((id) => chosen.get(id).fam === 'star'), 'kinks follow the family you pick for their group');
});

test('the Cutout styles are made from their source, and the looks only load their own fonts from the app', () => {
  const web = path.join(here, '..', '..', 'web', 'src');
  const css = fs.readFileSync(path.join(web, 'theme-cutout.css'), 'utf8');
  assert.ok(!css.includes('{NOTCH_'), 'every cut-out mask is filled in');
  assert.equal((css.match(/data:image\/svg\+xml/g) || []).length, 6);
  const fonts = fs.readFileSync(path.join(web, 'fonts', 'fonts.css'), 'utf8');
  for (const m of fonts.matchAll(/url\(\.\/([^)]+)\)/g)) assert.ok(fs.existsSync(path.join(web, 'fonts', m[1])), m[1]);
  for (const f of ['theme-cutout.css', 'theme-signal.css']) assert.ok(!/fonts\.googleapis/.test(fs.readFileSync(path.join(web, f), 'utf8')));
});
