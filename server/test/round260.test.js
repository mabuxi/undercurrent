import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, getDb } from '../src/db.js';
import { createKink, listKinks, updateKink } from '../src/kinks.js';
import { matchPct, RULES, syncKinks, modeOf } from '../src/kinkengine.js';

openDb(':memory:');

test('match is 50% exactly where something becomes a kink, under it before, over it after', () => {
  const at = { concept: 'feet', n: RULES.create.n, s: RULES.create.s, dayCount: RULES.create.days, lift: RULES.create.lift, prevalence: RULES.create.prevalence, textShare: 1 };
  assert.ok(matchPct(at) >= 50);
  assert.ok(matchPct({ ...at, n: 2 }) < 50);
  assert.ok(matchPct({ ...at, n: 20, s: 20, dayCount: 9, lift: 4, prevalence: 0.02 }) > 65);
  assert.equal(matchPct(null), 0);
});

test('a kink you make grows: the app may add tags, but what you took off stays off and it never fades', () => {
  const id = createKink({ name: 'Grey briefs', tags: ['grey briefs', 'underwear bulge'], origin: 'user' });
  let k = listKinks({ includeHidden: true }).find((x) => x.id === id);
  assert.equal(k.mode, 'grow');
  assert.ok(k.tags.filter((t) => t.origin === 'user').length >= 2);
  updateKink(id, { tags: k.tags.filter((t) => t.name !== 'underwear bulge') });
  syncKinks();
  k = listKinks({ includeHidden: true }).find((x) => x.id === id);
  assert.ok(!k.tags.some((t) => t.name === 'underwear bulge'), 'a tag you removed is not added back');
  assert.equal(k.status, 'active', 'no evidence, still not faded');
  updateKink(id, { mode: 'lock' });
  assert.equal(modeOf(getDb().prepare('SELECT * FROM kinks WHERE id = ?').get(id)), 'lock');
});

test('fading by hand keeps it faded until new likes, and a hand edit of a managed kink makes it grow', () => {
  const id = createKink({ name: 'Rope work', tags: ['rope'], origin: 'ai', status: 'active' });
  updateKink(id, { status: 'hidden' });
  syncKinks();
  const row = getDb().prepare('SELECT * FROM kinks WHERE id = ?').get(id);
  assert.ok(!row || row.status === 'hidden');
  if (row) {
    updateKink(id, { name: 'Ropes' });
    assert.equal(modeOf(getDb().prepare('SELECT * FROM kinks WHERE id = ?').get(id)), 'grow');
  }
});

test('tag ideas are other ways of writing the kink, never things that only come with it', async () => {
  const { upsertItem } = await import('../src/store.js');
  const { tagIdeas } = await import('../src/kinktags.js');
  for (let i = 0; i < 4; i++) upsertItem({ source: 'reddit', ext_id: `bd${i}`, title: `Post ${i}`, format: 'image', tags: ['gay bondage', 'gay-bondage', 'male bondage', 'bondage gear', 'handcuffs', 'shower'], media: { kind: 'image', src: 'x' } });
  const id = createKink({ name: 'Bondage', tags: ['bondage'], origin: 'user' });
  const ideas = (await tagIdeas(id, { count: 20 })).map((x) => x.name);
  for (const n of ['gay bondage', 'gay-bondage', 'male bondage']) assert.ok(ideas.includes(n) || listKinks({ includeHidden: true }).find((k) => k.id === id).tags.some((t) => t.name === n), n);
  assert.ok(!ideas.includes('handcuffs') && !ideas.includes('shower'));
});
