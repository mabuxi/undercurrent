import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, getDb, now } from '../src/db.js';
import { upsertItem } from '../src/store.js';
import { applyEvent, bump } from '../src/profile.js';
import { createKink, listKinks, mergeKinks } from '../src/kinks.js';
import { brain, nodeDetail } from '../src/brain.js';
import { quickTune, recentSeen } from '../src/tune.js';
import { tagId } from '../src/db.js';

openDb(':memory:');

test('combining two kinks keeps every tag of both, and the map shows them all', () => {
  const a = createKink({ name: 'Velvet things', tags: ['velvet', 'satin sheets', 'silk robe', 'candle light', 'slow build'], origin: 'user', status: 'active' });
  const b = createKink({ name: 'Soft touch', tags: ['soft touch', 'massage oil', 'feather', 'whisper', 'eye contact', 'back rub'], origin: 'user', status: 'active' });
  const into = mergeKinks(a, b);
  assert.equal(into, b);
  const k = listKinks({ includeHidden: true }).find((x) => x.id === b);
  const names = k.tags.map((x) => x.name).sort();
  assert.equal(names.length, 11);
  for (const n of ['velvet', 'satin sheets', 'silk robe', 'candle light', 'slow build', 'soft touch', 'back rub']) assert.ok(names.includes(n), n);
  assert.ok(!listKinks({ includeHidden: true }).some((x) => x.id === a));
  const node = brain().nodes.find((n) => n.key === `k${b}`);
  assert.equal(node.tags.length, 11, 'the map is not cut at 8 tags any more');
  assert.equal(nodeDetail(`k${b}`).kinkTags.length, 11);
});

function autoSearch(value, topic) {
  return Number(getDb().prepare("INSERT INTO follows(kind, value, label, synced_from, active, created, topic) VALUES('search', ?, ?, 'auto', 1, ?, ?)").run(value, value, now() - 86400000, topic).lastInsertRowid);
}

test('a source whose last posts you all skipped rests right away; one you liked stays', async () => {
  const dull = autoSearch('pornhub|neon cuts', 'neon cuts');
  const good = autoSearch('pornhub|velvet', 'velvet');
  for (let i = 0; i < 6; i++) {
    const d = upsertItem({ source: 'pornhub', ext_id: `dull${i}`, title: `Neon ${i}`, format: 'long', tags: ['neon cuts'], via: `f:${dull}`, media: { kind: 'embed', embed: 'x' } }).id;
    applyEvent({ itemId: d, type: 'impression' });
    applyEvent({ itemId: d, type: 'dwell', value: 900 });
    const g = upsertItem({ source: 'pornhub', ext_id: `good${i}`, title: `Velvet ${i}`, format: 'long', tags: ['velvet'], via: `f:${good}`, media: { kind: 'embed', embed: 'x' } }).id;
    applyEvent({ itemId: g, type: 'impression' });
    applyEvent({ itemId: g, type: 'dwell', value: 90000 });
    if (i % 2) applyEvent({ itemId: g, type: 'up' });
  }
  assert.ok(recentSeen(12).length >= 5);
  const r = await quickTune({ st: {}, fetch: false });
  const row = (id) => getDb().prepare('SELECT active, why FROM follows WHERE id = ?').get(id);
  assert.equal(row(dull).active, 0, 'the dull source rests');
  assert.match(row(dull).why, /skipped/);
  assert.equal(row(good).active, 1, 'the liked one stays');
  assert.ok(r.rested.length === 1);
});

test('what you are into right now gets a search at once, a resting source for it wakes up', async () => {
  const sleeping = Number(getDb().prepare("INSERT INTO follows(kind, value, label, synced_from, active, created, topic, dormant_since) VALUES('search', 'redgifs|lace gloves', 'lace', 'auto', 0, ?, 'lace gloves', ?)").run(now() - 9 * 86400000, now() - 5 * 86400000).lastInsertRowid);
  bump(`t:${tagId('lace gloves')}`, 2.5);
  bump(`t:${tagId('rope harness')}`, 2.5);
  const r = await quickTune({ st: { pornhub: { enabled: true }, eporner: { enabled: true } }, fetch: false });
  assert.equal(getDb().prepare('SELECT active FROM follows WHERE id = ?').get(sleeping).active, 1, 'woke up');
  assert.ok(r.added.some((x) => /rope harness/.test(x)), `added: ${r.added.join(', ')}`);
  const f = getDb().prepare("SELECT * FROM follows WHERE kind = 'search' AND value LIKE '%rope harness%'").get();
  assert.equal(f.synced_from, 'auto');
});

test('your own follows are never rested by the quick tuning', async () => {
  const mine = Number(getDb().prepare("INSERT INTO follows(kind, value, label, active, created) VALUES('search', 'pornhub|mine', 'mine', 1, ?)").run(now() - 86400000).lastInsertRowid);
  for (let i = 0; i < 6; i++) {
    const d = upsertItem({ source: 'pornhub', ext_id: `mine${i}`, title: `Mine ${i}`, format: 'long', tags: ['mine'], via: `f:${mine}`, media: { kind: 'embed', embed: 'x' } }).id;
    applyEvent({ itemId: d, type: 'impression' });
    applyEvent({ itemId: d, type: 'dwell', value: 600 });
  }
  await quickTune({ st: {}, fetch: false });
  assert.equal(getDb().prepare('SELECT active FROM follows WHERE id = ?').get(mine).active, 1);
});
