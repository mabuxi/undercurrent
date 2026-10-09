import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, getDb } from '../src/db.js';
import { upsertItem } from '../src/store.js';
import { applyEvent, points, replayPoints, timePoints, watchWeight, engagement, rebuildProfile, affinityMap } from '../src/profile.js';

openDb(':memory:');

const vid = { format: 'long' };

test('watch time counts more the longer it is, slower and slower', () => {
  const at = (s) => timePoints(s * 1000, vid);
  assert.ok(at(9) < 0.8 && at(9) > 0.3, `9 s: ${at(9)}`);
  assert.ok(at(120) >= 3 && at(120) <= 4, `2 min: ${at(120)}`);
  assert.ok(at(600) > at(300) && at(300) > at(120) && at(120) > at(60) && at(60) > at(30));
  assert.ok(at(120) - at(60) < at(60) - at(0), 'the second minute adds less than the first');
  assert.ok(at(36000) <= 6.5, 'there is a ceiling');
});

test('several visits add up to the total, not to more than the total', () => {
  const twice = points('dwell', 60000, vid, 0) + points('dwell', 60000, vid, 60000);
  assert.ok(Math.abs(twice - timePoints(120000, vid)) < 1e-9);
  assert.equal(points('dwell', 600, vid, 60000), 0, 'a short look again is not a skip');
  assert.ok(points('dwell', 600, vid, 0) < 0, 'a first look under a second and a half is');
});

test('a like after a glance counts much less than a like after two minutes, whatever the order', () => {
  assert.ok(watchWeight(3000) < 0.6 && watchWeight(120000) === 1);
  const glance = replayPoints([{ type: 'dwell', value: 3000 }, { type: 'up' }], vid);
  const watchedThenLiked = replayPoints([{ type: 'dwell', value: 120000 }, { type: 'up' }], vid);
  const likedThenWatched = replayPoints([{ type: 'up' }, { type: 'dwell', value: 120000 }], vid);
  const watchedOnly = replayPoints([{ type: 'dwell', value: 120000 }], vid);
  assert.ok(watchedThenLiked > glance * 3, `${watchedThenLiked} vs ${glance}`);
  assert.ok(Math.abs(watchedThenLiked - likedThenWatched) < 1e-9, 'the order does not matter');
  assert.ok(watchedThenLiked > watchedOnly + 2.9, 'liking still adds a full like after watching');
  // Taking the like back takes back exactly what it is worth then.
  const undone = replayPoints([{ type: 'up' }, { type: 'dwell', value: 120000 }, { type: 'unvote' }], vid);
  assert.ok(Math.abs(undone - watchedOnly) < 1e-9);
});

test('the feed learns the same thing live and when rebuilt, and history agrees', () => {
  const id = upsertItem({ source: 'reddit', ext_id: 'w1', title: 'Long one', format: 'long', tags: ['velvet', 'slow build'], score: 10, created_utc: Math.round(Date.now() / 1000), media: { kind: 'video', src: 'x' } }).id;
  applyEvent({ itemId: id, type: 'up' });
  applyEvent({ itemId: id, type: 'dwell', value: 90000 });
  applyEvent({ itemId: id, type: 'rate', value: 3 });
  applyEvent({ itemId: id, type: 'dwell', value: 40000 });
  const live = [...affinityMap()].filter(([k]) => k.startsWith('t:')).map(([, v]) => v.long).sort();
  rebuildProfile();
  const again = [...affinityMap()].filter(([k]) => k.startsWith('t:')).map(([, v]) => v.long).sort();
  live.forEach((v, i) => assert.ok(Math.abs(v - again[i]) < 1e-6));
  const evs = getDb().prepare("SELECT type, value FROM events WHERE item_id = ? ORDER BY ts, id").all(id);
  const e = engagement(0).find((x) => x.item_id === id);
  assert.ok(Math.abs(e.p - replayPoints(evs, { format: 'long' })) < 1e-9);
  assert.ok(e.p > 3 + 4.8 + timePoints(130000, vid) - 0.01, 'like and heat count fully after two minutes');
});
