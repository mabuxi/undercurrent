import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, getDb } from '../src/db.js';
import { createKink, listKinks } from '../src/kinks.js';
import { upsertItem } from '../src/store.js';
import { SHAPE_LIBRARY, pickShapes, pickGroupFamilies } from '../src/kinkshapes.js';
import { kinkSeries, RANGES } from '../src/kinkstats.js';
import { windows } from '../src/views.js';
import { lookColor, shapeSvg } from '../../web/src/lookcolor.js';
import { LOGO } from '../../web/src/logo.js';

openDb(':memory:');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');

test('Specimen is a look everywhere: the server accepts it, it has its mark, icons, fonts and Mac loading screen', () => {
  assert.match(fs.readFileSync(path.join(root, 'server', 'src', 'routes.js'), 'utf8'), /THEMES = \[[^\]]*'specimen'/);
  assert.match(fs.readFileSync(path.join(root, 'web', 'src', 'theme.js'), 'utf8'), /THEMES = \[[^\]]*'specimen'/);
  assert.ok(LOGO.specimen.startsWith('<svg'));
  for (const f of ['specimen-180.png', 'specimen-192.png', 'mac-specimen.png']) assert.ok(fs.existsSync(path.join(root, 'web', 'public', 'icons', f)), f);
  const fonts = fs.readFileSync(path.join(root, 'web', 'src', 'fonts', 'fonts.css'), 'utf8');
  for (const f of ['Anybody', 'Archivo', 'Martian Mono']) assert.ok(fonts.includes(`'${f}'`), f);
  const swift = fs.readFileSync(path.join(root, 'mac', 'Undercurrent', 'main.swift'), 'utf8');
  assert.ok(swift.includes(LOGO.specimen), 'the Mac loading screen has the same Specimen mark');
  assert.match(swift, /LOOKS = \[[^\]]*"specimen"/);
});

test('Specimen keeps kinks as ink with a faint tint, and draws shapes as wireframes in depth', () => {
  const pink = lookColor('#E07A9A', 'specimen');
  const blue = lookColor('#7FA7D9', 'specimen');
  assert.notEqual(pink, blue, 'two kinks still differ a little');
  for (const c of [pink, blue]) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    assert.ok(Math.min(r, g, b) > 170 && Math.max(r, g, b) - Math.min(r, g, b) < 60, `${c} is a pale ink`);
  }
  const small = shapeSvg('circle', '#E07A9A', 'specimen', 'dots', 20);
  const big = shapeSvg('circle', '#E07A9A', 'specimen', 'dots', 120);
  assert.ok(small.includes('fill="none"'));
  assert.equal((small.match(/<g transform/g) || []).length, 3, 'a small shape has few layers');
  assert.equal((big.match(/<g transform/g) || []).length, 10, 'a big one has more');
  assert.ok(big.includes('stroke-dasharray'), 'a big one shows its construction guides');
});

test('a group keeps one family; the model never gives two kinks of a group the same shape', async () => {
  const g = createKink({ name: 'Water things', isGroup: true, origin: 'user' });
  const a = createKink({ name: 'Rain', tags: ['rain'], origin: 'user', parentId: g });
  const b = createKink({ name: 'Pool', tags: ['pool'], origin: 'user', parentId: g });
  pickGroupFamilies();
  const fam = getDb().prepare('SELECT ai_shape FROM kinks WHERE id = ?').get(g).ai_shape;
  assert.ok(SHAPE_LIBRARY[fam], `the group got a family: ${fam}`);
  assert.equal(pickGroupFamilies(), 0, 'and keeps it');
  await pickShapes(async () => ({ items: [{ id: a, shape: 'drop' }, { id: b, shape: 'drop' }] }), 'm');
  const byId = (id) => listKinks({ includeHidden: true }).find((k) => k.id === id);
  assert.equal(byId(a).aiShape, 'drop');
  assert.ok(byId(b).aiShape && byId(b).aiShape !== 'drop', `the second one got another shape: ${byId(b).aiShape}`);
  await pickShapes(async () => ({ items: [{ id: a, shape: 'heart' }] }), 'm');
  assert.equal(byId(a).aiShape, 'drop', 'a picked shape is not changed again');
});

test('a kink graph covers the last 7 days, 30 days or all weeks', () => {
  const kinks = listKinks().filter((k) => !k.isGroup);
  const k = kinks[0];
  const ins = getDb().prepare('INSERT INTO events(item_id, type, value, ts) VALUES(?, ?, ?, ?)');
  const item = upsertItem({ source: 'reddit', ext_id: 'g1', title: 'Rain post', author: 'a', community: 'r/x', format: 'image', tags: [k.tags[0]], score: 10, created_utc: 1, media: { kind: 'image', src: 'x' } }).id;
  ins.run(item, 'up', 1, Date.now() - 3600000);
  for (const r of ['week', 'month']) {
    const s = kinkSeries(kinks, r).get(k.id);
    assert.equal(s?.length, RANGES[r].n, r);
  }
});

test('while you filter, the windows never take you deeper', () => {
  for (let i = 0; i < 6; i++) {
    const w = windows({ count: 12, seed: i, filtered: true });
    assert.ok(!(w.windows || w).some((x) => ['journey', 'fantasyDeep', 'kinkDeep'].includes(x.type)));
  }
});
