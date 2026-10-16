import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, getDb } from '../src/db.js';
import { upsertItem } from '../src/store.js';
import { applyEvents } from '../src/profile.js';
import { createKink, listKinks } from '../src/kinks.js';
import { likeScore } from '../src/kinkstats.js';
import { buildFeed } from '../src/rank.js';
import { beginUser, userWaiting, yieldToUser, memo, setWaiting } from '../src/priority.js';

openDb(':memory:');

let n = 0;
const post = (tags, extra = {}) => upsertItem({ source: 'reddit', ext_id: `p${n++}`, title: `Post ${n}`, author: `a${n % 7}`, community: `r/c${n % 4}`, format: 'image', tags, score: 40, created_utc: Math.round(Date.now() / 1000) - 3600, media: { kind: 'image', src: 'x' }, ...extra }).id;
const liked = (id) => [{ itemId: id, type: 'impression' }, { itemId: id, type: 'dwell', value: 40000 }, { itemId: id, type: 'up' }];
const skipped = (id) => [{ itemId: id, type: 'impression' }, { itemId: id, type: 'skip', value: 600 }];

test('a kink\'s match is how much you like its posts against your average post', () => {
  assert.equal(likeScore(0, 0, 0.1, 0.3), null, 'no posts yet: no match');
  assert.equal(likeScore(0.1, 1, 0.1, 0.3), 50, 'exactly your average post is 50%');
  assert.ok(likeScore(4, 5, 0.1, 0.3) > 85, 'posts you clearly like are well above');
  assert.ok(likeScore(-1, 5, 0.1, 0.3) < 25, 'posts you skip are well below');
  assert.ok(likeScore(0.8, 1, 0.1, 0.3) < likeScore(4, 5, 0.1, 0.3), 'one lucky post counts less than five');

  const a = createKink({ name: 'Velvet ropes', tags: ['velvet rope'], origin: 'user' });
  const b = createKink({ name: 'Neon signs', tags: ['neon sign'], origin: 'user' });
  const ev = [];
  for (let i = 0; i < 5; i++) ev.push(...liked(post(['velvet rope', 'filler'])));
  for (let i = 0; i < 5; i++) ev.push(...skipped(post(['neon sign', 'filler'])));
  for (let i = 0; i < 6; i++) ev.push({ itemId: post(['filler']), type: 'dwell', value: 6000 });
  applyEvents(ev);
  const ks = listKinks();
  const A = ks.find((k) => k.id === a);
  const B = ks.find((k) => k.id === b);
  assert.ok(A.match > 50 && B.match < 50, `liked ${A.match}, skipped ${B.match}`);
  assert.equal(A.points.posts, 5);
  assert.ok('ruleMatch' in A, 'the rules that make or fade a kink keep their own measure');
});

test('the plain feed follows what you are into right now, and moves on after a few', () => {
  const k = createKink({ name: 'Brass buttons', tags: ['brass button'], origin: 'user' });
  createKink({ name: 'Silk scarves', tags: ['silk scarf'], origin: 'user' });
  const brass = [];
  for (let i = 0; i < 30; i++) brass.push(post(['brass button', `b${i % 5}`]));
  for (let i = 0; i < 30; i++) post(['silk scarf', `s${i % 5}`]);
  for (let i = 0; i < 30; i++) post([`other${i % 6}`]);
  const share = (items) => items.filter((x) => x.kinks.some((kk) => kk.id === k)).length / items.length;
  const before = share(buildFeed({}, { limit: 10, mix: 0 }).items);
  // Into three brass posts in a row, just now.
  applyEvents([...liked(brass[0]), ...liked(brass[1]), ...liked(brass[2])]);
  const now = buildFeed({}, { limit: 10, mix: 0, exclude: brass.slice(0, 3) }).items;
  assert.ok(share(now) > before, `more brass right after liking it: ${before} then ${share(now)}`);
  assert.ok(now.slice(0, 3).some((x) => x.kinks.some((kk) => kk.id === k)), 'within the next posts');
  assert.ok(now.some((x) => x.why.some((w) => /right now/.test(w))), 'and it says why');
  assert.ok(share(now) < 1, 'but never only that');
  // A kink filter is what you asked for: no mood, no rotation.
  const filtered = buildFeed({ kink: k }, { limit: 10, mix: 0 }).items;
  assert.ok(filtered.every((x) => x.label !== 'kink'));
});

test('new things are popular, next to what you like and never what you clearly dislike', () => {
  const bad = [];
  for (let i = 0; i < 6; i++) bad.push(post(['mud wrestling', 'z1']));
  applyEvents(bad.flatMap((id) => [{ itemId: id, type: 'impression' }, { itemId: id, type: 'down' }, { itemId: id, type: 'less' }]));
  for (let i = 0; i < 20; i++) post(['mud wrestling', 'fresh', `q${i}`], { score: 5000 });
  const items = buildFeed({}, { limit: 40, mix: 40 }).items;
  assert.ok(!items.some((x) => x.label === 'discovery' && x.tags.includes('mud wrestling')), 'nothing new from what you disliked');
});

test('you come first: background work waits while you wait, and slow values are kept', async () => {
  assert.equal(userWaiting(), false);
  const done = beginUser();
  assert.equal(userWaiting(), true);
  let waited = false;
  const p = yieldToUser(5000).then(() => { waited = true; });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(waited, false, 'background work holds while a request of yours is on its way');
  done();
  await p;
  assert.equal(waited, true);
  setWaiting(true);
  assert.equal(userWaiting(), true, 'a spinner on screen counts too');
  setWaiting(false);
  assert.equal(userWaiting(), false);
  let calls = 0;
  const v1 = memo('t310', 60000, () => ++calls);
  const v2 = memo('t310', 60000, () => ++calls);
  assert.equal(v1, 1);
  assert.equal(v2, 1, 'worked out once');
  assert.ok(getDb());
});
