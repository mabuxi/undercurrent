import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK = '1';
const { openDb } = await import('../src/db.js');
openDb(':memory:');
const { qualityRanks, qualityBoost, popRaw } = await import('../src/rank.js');

const T = Date.parse('2026-10-05T12:00:00Z');
const H = 3600;
const mk = (source, score, ageH, views = 0, tagPart = 0.5) => ({ it: { source, score, created: T / 1000 - ageH * H, media: { views } }, s: { tagPart } });

test('quality is ranked within each source, so a small source is not pushed down by a big one', () => {
  const list = [
    mk('reddit', 5000, 10), mk('reddit', 800, 10), mk('reddit', 50, 10), mk('reddit', 2, 10),
    mk('lemmy', 40, 10), mk('lemmy', 12, 10), mk('lemmy', 3, 10), mk('lemmy', 0, 10)
  ];
  qualityRanks(list, T);
  assert.equal(list[0].q, 1);
  assert.equal(list[4].q, 1, 'the best Lemmy post is the top of Lemmy');
  assert.equal(list[3].q, 0);
  assert.ok(list.every((x) => x.qKnown));
});

test('velocity favours what is rising now over what was big long ago', () => {
  const fresh = mk('redgifs', 300, 2);
  const old = mk('redgifs', 400, 24 * 60);
  const list = [fresh, old, mk('redgifs', 5, 30), mk('redgifs', 1, 40)];
  qualityRanks(list, T);
  assert.ok(old.q > fresh.q, 'the old post has more in total');
  assert.ok(fresh.vel > old.vel, 'but the fresh one rises faster');
});

test('a source without score or view data stays neutral', () => {
  const list = [mk('bluesky', 0, 1), mk('bluesky', 0, 5), mk('bluesky', 0, 9), mk('bluesky', 0, 20)];
  qualityRanks(list, T);
  assert.ok(list.every((x) => x.q === 0.5 && x.vel === 0.5 && !x.qKnown));
  assert.equal(qualityBoost(list[0]), 0);
});

test('badly received posts lose ground unless they fit your taste well', () => {
  const list = [mk('xvideos', 1, 50, 10, 0.1), mk('xvideos', 1, 50, 10, 0.6), mk('xvideos', 500, 3, 90000), mk('xvideos', 300, 5, 40000), mk('xvideos', 200, 8, 20000)];
  qualityRanks(list, T);
  const [poorOff, poorFits, top] = list;
  assert.ok(qualityBoost(top) > 0);
  assert.ok(qualityBoost(poorOff) < qualityBoost(poorFits), 'the extra drop only hits posts that also miss your taste');
  // Quality never outweighs taste: the whole range stays small next to the 0.62 taste weight.
  assert.ok(qualityBoost(top) - qualityBoost(poorOff) < 0.45);
  assert.ok(popRaw({ score: 99, media: { views: 999 } }) > popRaw({ score: 9, media: { views: 99 } }));
});
