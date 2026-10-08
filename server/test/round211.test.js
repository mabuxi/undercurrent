import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK = '1';
const { openDb } = await import('../src/db.js');
openDb(':memory:');
const { aiKinks, moreFor, conceptCatalog } = await import('../src/setup.js');

test('suggestions come from the model, never repeat the examples or what is on screen, and stay in their family', async () => {
  const shown = conceptCatalog({ male: 50 }).flatMap((f) => f.concepts.map((c) => c.concept));
  const r = await aiKinks({ picked: ['riding'], focus: 'riding', male: 50, shown });
  assert.equal(r.ai, true);
  assert.ok(r.items.length >= 3);
  for (const x of r.items) {
    assert.ok(!shown.includes(x.concept), `${x.concept} was already on screen`);
    assert.ok(x.family && x.ai);
  }
  assert.equal(r.items[0].family, 'positions', 'the family you clicked in comes first');
  const more = await moreFor('positions', { picked: ['riding'], shown, male: 50 });
  assert.ok(more.length && more.every((x) => x.family === 'positions'));
});
