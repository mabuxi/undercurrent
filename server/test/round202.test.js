import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK = '1';
const { openDb } = await import('../src/db.js');
openDb(':memory:');
const { upsertItem } = await import('../src/store.js');
const { buildFeed } = await import('../src/rank.js');
const { createKink } = await import('../src/kinks.js');
const { setGenderPrefs, isHetero, HETERO } = await import('../src/gender.js');
const { fantasyIdeas } = await import('../src/fantasyideas.js');
const { conceptCatalog } = await import('../src/setup.js');
const { familyOf, conceptsOf } = await import('../src/concepts.js');

setGenderPrefs({ everyone: true });
let n = 0;
const post = (title, tags) => upsertItem({ source: 'reddit', ext_id: `r202_${n++}`, title, author: `a${n}`, community: 'r/test', format: 'image', tags, score: 10, created_utc: Math.round(Date.now() / 1000) - 3600, media: { kind: 'image', src: 'x' } }).id;

test('a pair or mix of two kinks only shows posts that have both, also when only the title says one', () => {
  const abs = createKink({ name: 'Abs', tags: ['abs'], origin: 'user', status: 'active' });
  const shower = createKink({ name: 'Shower', tags: ['shower'], origin: 'user', status: 'active' });
  const both = post('Post one', ['abs', 'shower']);
  const titleOnly = post('Quick rinse in the shower', ['abs']);
  const onlyAbs = post('Gym day', ['abs', 'gym']);
  const onlyShower = post('Morning', ['shower', 'soap']);
  const ids = buildFeed({ pair: [abs, shower] }, { limit: 50, mix: 0 }).items.map((x) => x.id);
  assert.ok(ids.includes(both));
  assert.ok(ids.includes(titleOnly), 'the title saying shower is enough without the tag');
  assert.ok(!ids.includes(onlyAbs) && !ids.includes(onlyShower), 'one of the two is not enough');
});

test('the hetero zone is centred on the middle of the slider', () => {
  assert.deepEqual(HETERO, [45, 55]);
  assert.equal(50 - HETERO[0], HETERO[1] - 50);
  assert.ok(isHetero(45) && isHetero(55) && !isHetero(60) && !isHetero(40));
});

test('the welcome steps have a Positions family instead of Cock, and those kinks moved to Body', () => {
  const fams = conceptCatalog().map((f) => f.key);
  assert.ok(fams.includes('positions') && !fams.includes('cock'));
  assert.equal(familyOf('bbc'), 'body');
  assert.equal(familyOf('riding'), 'positions');
  assert.deepEqual(conceptsOf('69'), ['sixty nine']);
  assert.deepEqual(conceptsOf('reverse cowgirl'), ['reverse cowgirl']);
});

test('fantasy ideas are one short explicit scene with a place and an act, never the picks in a row', () => {
  const list = fantasyIdeas(['muscle', 'shower', 'blowjob', 'riding'], { gender: 'men' });
  assert.ok(list.length >= 4);
  assert.equal(new Set(list.map((f) => f.name)).size, list.length, 'every idea has its own name');
  for (const f of list) {
    assert.ok(!/come together|scenes where/i.test(f.description), f.description);
    assert.ok(f.description.split(' ').length >= 8, f.description);
    assert.ok(f.concepts.length >= 1);
  }
  assert.ok(list.some((f) => f.concepts.includes('shower') && /spa|shower/i.test(f.description)), 'the picked place shows up, as a setting that is not everyday');
  assert.ok(list.every((f) => f.description.split(' ').length <= 32 && f.description.split(/[.!?]\s/).length === 1), 'one short, direct sentence each');
  assert.equal(fantasyIdeas(['latino'], {}).length, 0, 'nothing to build a scene from: no idea');
});
