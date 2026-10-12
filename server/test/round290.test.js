import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, getDb } from '../src/db.js';
import { upsertItem } from '../src/store.js';
import { createKink, listKinks, updateKink } from '../src/kinks.js';
import { SHAPE_NAMES, SHAPE_LIBRARY, pickShapes } from '../src/kinkshapes.js';
import { kinkWeeks } from '../src/kinkstats.js';
import { SHAPES, SHAPE_FAMILIES } from '../../web/src/shapedata.js';
import { assignShapes } from '../../web/src/shapeassign.js';
import { lookColor } from '../../web/src/lookcolor.js';
import { LOGO } from '../../web/src/logo.js';

openDb(':memory:');
const here = path.dirname(fileURLToPath(import.meta.url));

test('the model can pick from exactly the shapes the app draws, family by family', () => {
  assert.deepEqual([...SHAPE_NAMES].sort(), Object.keys(SHAPES).sort());
  for (const [fam, list] of Object.entries(SHAPE_FAMILIES)) assert.deepEqual(Object.keys(SHAPE_LIBRARY[fam]), list, fam);
});

test('the model picks a shape for kinks without one; your own pick wins, a bad answer is ignored, a new name asks again', async () => {
  const a = createKink({ name: 'Shower', tags: ['shower'], origin: 'user' });
  const b = createKink({ name: 'Lingerie', tags: ['lingerie'], origin: 'user' });
  const c = createKink({ name: 'Rope', tags: ['rope'], origin: 'user' });
  updateKink(c, { shape: 'chain' });
  let asked = '';
  const chat = async ({ user }) => { asked = user; return { items: [{ id: a, shape: 'drop' }, { id: b, shape: 'notashape' }, { id: c, shape: 'heart' }] }; };
  assert.equal(await pickShapes(chat, 'm'), 1);
  assert.ok(asked.includes('Shower') && asked.includes('Lingerie') && !asked.includes('Rope'), 'only kinks without a shape are asked about');
  const byId = (id) => listKinks({ includeHidden: true }).find((k) => k.id === id);
  assert.equal(byId(a).aiShape, 'drop');
  assert.equal(byId(b).aiShape, null);
  assert.equal(byId(c).aiShape, null);
  assert.equal(byId(c).shape, 'chain');
  updateKink(a, { name: 'Showers' });
  assert.equal(byId(a).aiShape, null, 'renaming lets the model pick again');
  updateKink(a, { shape: 'archHole' });
  assert.equal(byId(a).shape, 'archHole', 'shape names with capitals are kept');
});

test('a shape the model picked is used across families, but never over the one you picked', () => {
  const kinks = [
    { id: 1, isGroup: true, name: 'Places', family: 'places' },
    { id: 2, isGroup: false, name: 'Shower', family: 'places', parentId: 1, aiShape: 'drop' },
    { id: 3, isGroup: false, name: 'Locker room', family: 'places', parentId: 1, aiShape: 'drop' },
    { id: 4, isGroup: false, name: 'Kissing', aiShape: 'lips', shape: 'heart' },
    { id: 5, isGroup: false, name: 'Rope', aiShape: 'cuffs' }
  ];
  const m = assignShapes(kinks);
  assert.equal(m.get(2).shape, 'drop');
  assert.equal(m.get(2).fam, 'drop');
  assert.notEqual(m.get(3).shape, 'drop', 'two kinks in a group never share a shape');
  assert.equal(m.get(4).shape, 'heart');
  assert.equal(m.get(5).shape, 'cuffs');
});

test('the trend of a kink is its share of your points week by week, oldest first, with weeks off filled in', () => {
  const db = getDb();
  const k = createKink({ name: 'Velvet', tags: ['velvet'], origin: 'user' });
  const W = 7 * 86400000;
  const ins = db.prepare('INSERT INTO events(item_id, type, value, ts) VALUES(?, ?, ?, ?)');
  let n = 0;
  const post = (tags) => upsertItem({ source: 'reddit', ext_id: `w${n++}`, title: `Post ${n}`, author: 'a', community: 'r/x', format: 'image', tags, score: 10, created_utc: 1, media: { kind: 'image', src: 'x' } }).id;
  // Eight weeks back: velvet takes more and more of your likes; week 4 you did nothing.
  for (let w = 8; w >= 0; w--) {
    if (w === 4) continue;
    const velvet = 8 - w;
    for (let i = 0; i < velvet; i++) ins.run(post(['velvet']), 'up', 1, Date.now() - w * W - 3600000);
    for (let i = 0; i < 8 - velvet + 1; i++) ins.run(post(['neon']), 'up', 1, Date.now() - w * W - 3600000);
  }
  const s = kinkWeeks(listKinks().filter((x) => !x.isGroup)).get(k);
  assert.equal(s.length, 9);
  assert.ok(s[s.length - 1] > s[0] + 30, `it rises: ${s.join(', ')}`);
  assert.ok(s.every((v) => v >= 0 && v <= 100));
  assert.ok(s[4] > 0, 'the week off keeps the week before');
});

test('every look has its colours, its mark and its icons', () => {
  assert.equal(lookColor('#E39A83', 'original').length, 7);
  assert.notEqual(lookColor('#7FA7D9', 'cutout'), lookColor('#7FA7D9', 'original'));
  for (const l of ['original', 'cutout', 'signal']) assert.ok(LOGO[l].startsWith('<svg'));
  const pub = path.join(here, '..', '..', 'web', 'public', 'icons');
  for (const f of ['cutout-180.png', 'cutout-192.png', 'mac-cutout.png', 'signal-180.png', 'signal-192.png', 'mac-signal.png']) assert.ok(fs.existsSync(path.join(pub, f)), f);
  const swift = fs.readFileSync(path.join(here, '..', '..', 'mac', 'Undercurrent', 'main.swift'), 'utf8');
  for (const l of ['cutout', 'signal']) assert.ok(swift.includes(LOGO[l]), `the Mac loading screen has the same ${l} mark`);
});
