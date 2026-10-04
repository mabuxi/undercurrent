import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, getDb } from '../src/db.js';
import { upsertItem } from '../src/store.js';
import { applyEvent, applyEvents, affinityMap, decayed, TAU, topTags } from '../src/profile.js';
import { buildFeed } from '../src/rank.js';
import { isBlocked } from '../src/safety.js';
import { addMemory, listMemory, updateMemory } from '../src/memory.js';
import { fallbackParse } from '../src/ai/assistant.js';

openDb(':memory:');
// These ranking tests are about taste, not the men and women balance: show everyone.
const { setGenderPrefs: setGP } = await import('../src/gender.js');
setGP({ everyone: true });

function make(i, tags, format = 'image') {
  return upsertItem({ source: 'reddit', ext_id: `t${i}`, title: `Post ${i}`, author: `a${i % 5}`, community: `r/c${i % 3}`, format, tags, score: 50, created_utc: Math.round(Date.now() / 1000) - 3600, media: { kind: 'image', src: 'x' } }).id;
}

const A = ['velvet', 'slow build', 'eye contact'];
const B = ['loud', 'fast cuts', 'neon'];
const ids = { a: [], b: [] };
for (let i = 0; i < 40; i++) ids.a.push(make(i, A));
for (let i = 40; i < 80; i++) ids.b.push(make(i, B));

test('safety blocks minors-related tags and stated ages, and respects user limits', () => {
  assert.equal(isBlocked({ title: 'ok', tags: ['loli'] }).blocked, true);
  assert.equal(isBlocked({ title: 'ok', tags: ['school uniform', 'young'] }).blocked, true);
  assert.equal(isBlocked({ title: 'Me (17f) posting', tags: [] }).blocked, true);
  assert.equal(isBlocked({ title: 'Evening set', tags: ['lingerie'] }).blocked, false);
  assert.equal(isBlocked({ title: 'Evening set', tags: ['feet'] }, ['feet']).blocked, true);
  const r = upsertItem({ source: 'reddit', ext_id: 'bad1', title: 'x', format: 'image', tags: ['shota'], media: {} });
  assert.equal(r.blocked, true);
  const feed = buildFeed({}, { limit: 200, mix: 0 }).items;
  assert.ok(!feed.some((x) => x.id === r.id));
});

test('the feed learns in real time from saves, ratings and skips', () => {
  const before = buildFeed({}, { limit: 80, mix: 0 }).items;
  const avg = (list, set) => { const m = list.filter((x) => set.includes(x.id)).map((x) => x.match); return m.reduce((a, b) => a + b, 0) / m.length; };
  const events = [];
  for (const id of ids.a.slice(0, 6)) events.push({ itemId: id, type: 'save' }, { itemId: id, type: 'rate', value: 5 }, { itemId: id, type: 'dwell', value: 9000 });
  for (const id of ids.b.slice(0, 6)) events.push({ itemId: id, type: 'dwell', value: 300 }, { itemId: id, type: 'less' });
  applyEvents(events);
  const after = buildFeed({}, { limit: 80, mix: 0 }).items;
  assert.ok(avg(after, ids.a) > avg(before, ids.a) + 10, 'liked cluster should rise');
  assert.ok(avg(after, ids.b) < avg(before, ids.b), 'skipped cluster should fall');
  const top10 = after.slice(0, 10).map((x) => x.id);
  assert.ok(top10.filter((id) => ids.a.includes(id)).length >= 8, 'top of feed should be the liked cluster');
  assert.ok(!after.some((x) => ids.a.slice(0, 6).includes(x.id)), 'seen items stay out of the feed');
});

test('short-term interest fades within hours while long-term stays', () => {
  const key = [...affinityMap().keys()].find((k) => k.startsWith('t:'));
  const row = getDb().prepare('SELECT * FROM affinity WHERE key = ?').get(key);
  const later = decayed(row, row.short_ts + 3 * 3600 * 1000);
  assert.ok(Math.abs(later.short) < Math.abs(row.short) * 0.05);
  assert.ok(Math.abs(later.long) > Math.abs(row.long) * 0.99);
  assert.ok(TAU.lately < TAU.long);
});

test('tags you keep liking rise to the top of your profile', () => {
  for (const id of ids.a.slice(6, 12)) applyEvent({ itemId: id, type: 'save' });
  const top = topTags({ limit: 3 }).map((t) => t.name);
  assert.ok(top.includes('velvet') || top.includes('slow build') || top.includes('eye contact'));
});

test('memory is categorised, editable and deduplicated', () => {
  const id = addMemory({ category: 'Fantasies', content: 'Likes slow evenings' });
  const again = addMemory({ category: 'Notes', content: 'likes slow evenings' });
  assert.equal(id, again);
  updateMemory(id, { content: 'Likes slow, quiet evenings', pinned: true });
  const m = listMemory().find((x) => x.id === id);
  assert.equal(m.content, 'Likes slow, quiet evenings');
  assert.equal(m.pinned, true);
});

test('the rule-based ask parser understands formats, lengths, kinks and journeys', () => {
  const kinks = [{ id: 1, name: 'Slow tease' }];
  const a = fallbackParse('long form videos from slow tease', kinks, []);
  assert.deepEqual(a.filters.formats, ['long']);
  assert.equal(a.filters.kink, 'Slow tease');
  const b = fallbackParse('take me on a journey, something new', kinks, []);
  assert.equal(b.action, 'journey');
  assert.equal(b.journey.mode, 'branch');
  const c = fallbackParse('quick gifs', kinks, []);
  assert.deepEqual(c.filters.formats, ['gif']);
  assert.equal(c.filters.length, 'quick');
});

import { rulesParse } from '../src/ai/agent.js';

test('the command agent turns requests into actions', () => {
  assert.equal(rulesParse('remember I never want feet').actions[0].type, 'remember');
  assert.equal(rulesParse('remember I never want feet').actions[0].category, 'Turn-offs and limits');
  assert.deepEqual(rulesParse('block feet').actions[0], { type: 'block', name: 'feet' });
  assert.equal(rulesParse('create a kink called Latex with latex, shiny').actions[0].type, 'create_kink');
  assert.equal(rulesParse('follow Angela White').actions[0].name, 'Angela White');
  const item = { id: 1 };
  assert.equal(rulesParse('save this', item).actions[0].type, 'save_item');
  assert.equal(rulesParse('rate this 4', item).actions[0].rating, 4);
  assert.equal(rulesParse('more like this', item).actions[0].type, 'more_like_item');
  const s = rulesParse('search latex outfits');
  assert.equal(s.actions[0].type, 'filter');
});

import { createKink } from '../src/kinks.js';
import { brain, strengthen } from '../src/brain.js';
import { followed } from '../src/store.js';

test('the brain links kinks that you enjoy together and strengthens them with use', () => {
  const k1 = createKink({ name: 'Velvet mood', tags: ['velvet'], status: 'active' });
  const k2 = createKink({ name: 'Slow gaze', tags: ['eye contact', 'slow build'], status: 'active' });
  const b1 = brain();
  const e1 = b1.edges.find((e) => [e.a, e.b].includes(`k${k1}`) && [e.a, e.b].includes(`k${k2}`));
  assert.ok(e1, 'kinks liked together are linked');
  strengthen(ids.a.slice(0, 5), 2);
  const e2 = brain().edges.find((e) => [e.a, e.b].includes(`k${k1}`) && [e.a, e.b].includes(`k${k2}`));
  assert.ok(e2.raw > e1.raw && e2.w >= e1.w, 'links get stronger with interactions');
  assert.ok(b1.nodes.some((n) => n.type === 'kink' && n.name === 'Velvet mood'));
});

test('following is for people: subreddits and communities are sources, auto-added ones never count', () => {
  const db = getDb();
  db.prepare("INSERT INTO follows(kind, value, label, active, created) VALUES('community', 'reddit|RealGirls', 'r/RealGirls', 1, 1)").run();
  db.prepare("INSERT INTO follows(kind, value, label, active, created) VALUES('creator', 'redgifs|someone', 'someone', 1, 1)").run();
  db.prepare("INSERT INTO follows(kind, value, label, synced_from, active, created) VALUES('community', 'reddit|auto_sub', 'auto', 'auto', 1, 1)").run();
  const f = followed();
  assert.ok(!f.communities.has('r/realgirls'), 'a subreddit is a source, not following');
  assert.ok(f.authors.has('someone'));
  assert.ok(!f.communities.has('r/auto_sub'));
});

import { points } from '../src/profile.js';

test('scoring puts save and heat above like, and likes far above watching', () => {
  const vid = { format: 'short' };
  const watchAll = points('progress', 1, vid) + points('complete', null, vid) + points('rewatch', 1, vid) + points('rewatch', 2, vid) + points('dwell', 60000, vid);
  assert.ok(points('rewatch', 1, vid) > points('complete', null, vid));
  assert.ok(points('complete', null, vid) > points('progress', 1, vid));
  assert.ok(points('progress', 0.5, vid) > points('progress', 0.25, vid));
  assert.ok(points('up') > watchAll, 'a like beats everything passive');
  assert.ok(points('rate', 0.5) > points('up'), 'the lowest heat is still above a like');
  assert.ok(points('save') > points('up'));
  assert.ok(points('dwell', 500, vid) < 0, 'a fast skip is a small negative');
  const story = { format: 'story', body: 'word '.repeat(460) };
  assert.ok(points('dwell', 120000, story) > points('dwell', 20000, story), 'reading a story longer counts more');
});

import { pruneAutoSources } from '../src/discover.js';
import { stripOc, isModPost } from '../src/store.js';

test('weak auto sources are pruned, your own follows never are', () => {
  const db = getDb();
  const old = Date.now() - 5 * 86400000;
  const auto = Number(db.prepare("INSERT INTO follows(kind, value, label, synced_from, active, created) VALUES('community', 'reddit|weak_sub', 'r/weak_sub', 'auto', 1, ?)").run(old).lastInsertRowid);
  const mine = Number(db.prepare("INSERT INTO follows(kind, value, label, active, created) VALUES('community', 'reddit|my_sub', 'r/my_sub', 1, ?)").run(old).lastInsertRowid);
  for (let i = 0; i < 14; i++) {
    for (const [f, tag] of [[auto, 'w'], [mine, 'm']]) {
      const id = upsertItem({ source: 'reddit', ext_id: `${tag}${i}`, title: `Weak ${tag} ${i}`, format: 'image', tags: [], via: `f:${f}`, media: { kind: 'image', src: 'x' } }).id;
      applyEvent({ itemId: id, type: 'impression' });
      applyEvent({ itemId: id, type: 'dwell', value: 700 });
    }
  }
  const pruned = pruneAutoSources();
  assert.equal(pruned.length, 1);
  const rested = db.prepare('SELECT active, dormant_since FROM follows WHERE id = ?').get(auto);
  assert.ok(rested && rested.active === 0 && rested.dormant_since, 'weak auto source rests, it is not forgotten');
  assert.equal(db.prepare('SELECT active FROM follows WHERE id = ?').get(mine).active, 1);
});

test('original content markers become a badge and moderator posts are caught', () => {
  assert.deepEqual(stripOc('[OC] Morning light'), { title: 'Morning light', oc: true });
  assert.equal(stripOc('Oceans (OC)').title, 'Oceans');
  assert.equal(isModPost({ title: 'Weekly discussion thread' }), true);
  assert.equal(isModPost({ title: 'What turns you on the most?', author: 'someone' }), false);
  assert.equal(isModPost({ title: 'Anything', author: 'AutoModerator' }), true);
  const r = upsertItem({ source: 'reddit', ext_id: 'modpost1', title: '[Mod] New rules for posting', format: 'discussion', tags: [], media: { kind: 'text' } });
  assert.equal(r.blocked, true);
});

import { allowance, guessGender } from '../src/gender.js';

test('the balance: 45 to 65% is hetero only, Everyone lets all through, and it narrows toward one side', () => {
  assert.equal(allowance(50, 'mixed', false, true, 1), 1);
  assert.equal(allowance(50, 'men', false, true, 1), 0, 'hetero only: no men-only posts');
  assert.equal(allowance(60, 'women', false, true, 1), 0, 'hetero only: no women-only posts');
  for (const k of ['men', 'women', 'mixed', 'unknown']) assert.equal(allowance(50, k, false, true, 1, true), 1, 'Everyone lets everything through');
  assert.ok(allowance(40, 'women', false, true) === 1 && allowance(40, 'men', false, true) < 1);
  assert.equal(allowance(100, 'women', false, true), 0);
  assert.equal(allowance(100, 'mixed', false, true), 0, 'at 100% men only men');
  assert.ok(allowance(90, 'mixed', false, true) > 0.05, 'at 90% men something else very rarely');
  assert.equal(allowance(95, 'men', false, true, 1), 1);
  assert.ok(allowance(95, 'men', false, true, 0.5) < 1, 'guessed men-only posts are not fully trusted in men-only mode');
  assert.equal(allowance(95, 'women?', false, true), 0);
  assert.ok(allowance(95, 'men?', false, true) > 0.2, 'a man is there, the rest not known yet: allowed until the image says otherwise');
  assert.ok(allowance(80, 'men', false, true) === 1 && allowance(80, 'women', false, true) < 0.15 && allowance(80, 'mixed', false, true) > 0.4);
  assert.ok(allowance(20, 'men', false, true) < 0.15 && allowance(20, 'mixed', false, true) > 0.4);
  assert.equal(allowance(30, 'women', true, false), 0, 'trans content hidden when not allowed');
  assert.deepEqual(guessGender('Twinks kissing in the shower'), { men: 2, women: 0, trans: false });
  assert.deepEqual(guessGender('[F] my new lingerie selfie'), { men: 0, women: 1, trans: false });
  assert.deepEqual(guessGender('busty milf takes a big cock'), { men: 1, women: 1, trans: false });
  assert.deepEqual(guessGender('Couple morning fun'), { men: 1, women: 1, trans: false });
});
