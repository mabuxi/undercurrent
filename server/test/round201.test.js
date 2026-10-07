import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK = '1';
const { openDb, tagId } = await import('../src/db.js');
openDb(':memory:');
const { upsertItem } = await import('../src/store.js');
const { queueDislike, dislikeOf, confirmDislike, skipDislike, dropGuess, guessesToVerify, verifyGuess, dislikedTags } = await import('../src/dislike.js');
const { affinityMap, boostTags } = await import('../src/profile.js');
const { rot, presets } = await import('../src/presets.js');
const { hashtagsIn, extractFromText } = await import('../src/ai/extract.js');

let n = 0;
const post = (tags) => upsertItem({ source: 'reddit', ext_id: `r201_${n++}`, title: `Post ${n}`, author: 'someone', community: 'r/test', format: 'image', tags, score: 10, created_utc: Math.round(Date.now() / 1000) - 3600, media: { kind: 'image', src: 'x' } }).id;
const aff = (name) => affinityMap().get(`t:${tagId(name)}`)?.long || 0;
const settle = async (id) => { for (let i = 0; i < 40 && !['done', 'failed'].includes(dislikeOf(id).status); i++) await new Promise((r) => setTimeout(r, 50)); };

test('a thumbs down asks what you did not like, never guesses, and leaves out what you like', () => {
  boostTags(['beard'], 1.5);
  const id = post(['beard', 'tan lines', 'shower']);
  const before = aff('tan lines');
  queueDislike(id, 'down');
  const d = dislikeOf(id);
  assert.equal(d.status, 'ask');
  assert.deepEqual(d.guesses, []);
  assert.ok(d.candidates.includes('tan lines') && d.candidates.includes('shower'));
  assert.ok(!d.candidates.includes('beard'), 'a tag you like is not offered');
  assert.equal(aff('tan lines'), before, 'nothing counts before you answer');
  const c = confirmDislike(id, ['tan lines', 'beard']);
  assert.deepEqual(c.reasons, ['tan lines'], 'a liked tag cannot be picked against');
  assert.ok(aff('tan lines') < before);
  assert.ok(dislikedTags().some((x) => x.tag === 'tan lines'), 'a confirmed thumbs down shows under Did not like');
});

test('"Not sure" on a hide keeps the guesses to verify, and they only count once confirmed', async () => {
  const id = post(['office', 'suit']);
  queueDislike(id, 'less');
  await settle(id);
  assert.ok(dislikeOf(id).guesses.length >= 1);
  skipDislike(id);
  const d = dislikeOf(id);
  assert.equal(d.answered, true);
  assert.deepEqual(d.reasons, []);
  const g = d.guesses[0];
  assert.ok(guessesToVerify().some((x) => x.tag === g), 'unanswered guesses wait in Memory');
  assert.ok(Math.abs(aff(g)) < 1e-6, 'a guess does not count');
  verifyGuess(g, true);
  assert.ok(dislikeOf(id).reasons.includes(g));
  assert.ok(aff(g) < 0, 'confirmed in Memory, it counts');
  assert.ok(!guessesToVerify().some((x) => x.tag === g));
  const other = dislikeOf(id).guesses[0];
  if (other) { dropGuess(id, other); assert.ok(!dislikeOf(id).guesses.includes(other)); assert.ok(Math.abs(aff(other)) < 1e-6); }
});

test('"Right now" picks rotate through more of what fits each time the windows refresh', () => {
  const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  assert.deepEqual(rot(list, 3, 0), ['a', 'b', 'c']);
  assert.deepEqual(rot(list, 3, 1), ['d', 'e', 'f']);
  assert.deepEqual(rot(list, 3, 2), ['g', 'a', 'b']);
  assert.deepEqual(rot(['a', 'b'], 3, 5), ['a', 'b'], 'a short list stays as it is');
  assert.ok(Array.isArray(presets({ turn: 3 })));
});

test('hashtags become tags, split into words, without the noise ones', () => {
  assert.deepEqual(hashtagsIn('Gym day #BigBalls #hairy_chest #fyp #OnlyFans #2024 #gayForPay'), ['big balls', 'hairy chest', 'gay for pay']);
  assert.deepEqual(hashtagsIn('price 50#off and a url x.com/#top'), []);
  const tags = extractFromText('After the gym #HairyChest #sweaty').tags.map((t) => t.name);
  assert.ok(tags.includes('hairy chest') && tags.includes('sweaty'), tags.join(', '));
});
