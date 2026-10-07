import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK = '1';
const { openDb, getDb, setSetting, getSetting, tagId } = await import('../src/db.js');
openDb(':memory:');
const { upsertItem } = await import('../src/store.js');
const { cleanTune } = await import('../src/routes.js');
const { blockCreator, unblockCreator, isBlockedCreator, listBlocked } = await import('../src/blocks.js');
const { dislikedTags, forgiveTag } = await import('../src/dislike.js');
const { boostTags, affinityMap } = await import('../src/profile.js');
const { addMemory, memoryUpkeep, listMemory } = await import('../src/memory.js');
const { touchSession, sessionCount } = await import('../src/sessions.js');
const { suggestFor } = await import('../src/setup.js');
const { conceptsOf, isKinkConcept } = await import('../src/concepts.js');

let n = 0;
const blocked = (id) => getDb().prepare('SELECT blocked FROM items WHERE id = ?').get(id).blocked === 1;
const post = (author, tags = ['feet']) => upsertItem({ source: 'reddit', ext_id: `r20_${n++}`, title: `Post ${n}`, author, community: 'r/test', format: 'image', tags, score: 10, created_utc: Math.round(Date.now() / 1000) - 3600, media: { kind: 'image', src: 'x' } }).id;

test('the filters you set are cleaned and kept as they are', () => {
  assert.deepEqual(cleanTune({ formats: ['short', 'bogus', 'short'], window: 'popular:week', mix: 22, mood: 'slow' }), { formats: ['short'], window: 'popular:week', mix: 20, mood: 'slow' });
  assert.deepEqual(cleanTune({ window: 'drop table', mix: 'x', mood: '<b>' }), {});
  assert.equal(cleanTune({ mix: 99 }).mix, 40);
});

test('blocking a creator hides what is here and what comes later, unblocking brings it back', () => {
  const a = post('grumpy_guy');
  const b = post('grumpy_guy');
  const other = post('someone_else');
  const { ids } = blockCreator({ kind: 'author', source: 'reddit', name: 'Grumpy_Guy' });
  assert.equal(ids.length, 2);
  assert.equal(blocked(a), true);
  assert.equal(blocked(other), false);
  const later = post('grumpy_guy');
  assert.equal(blocked(later), true, 'new posts from them are blocked as they come in');
  assert.ok(isBlockedCreator({ source: 'reddit', author: 'u/grumpy_guy' }));
  assert.ok(!isBlockedCreator({ source: 'redgifs', author: 'grumpy_guy' }), 'a poster is blocked on their own source');
  unblockCreator(listBlocked()[0].id);
  assert.equal(blocked(b), false);
  assert.equal(listBlocked().length, 0);
});

test('"did not like" only lists tags that still count against posts', () => {
  const db = getDb();
  db.exec('CREATE TABLE IF NOT EXISTS dislikes (item_id INTEGER PRIMARY KEY, status TEXT, reasons TEXT, note TEXT, kind TEXT, ts INTEGER)');
  const i1 = post('x1', ['bad lighting', 'socks']);
  const i2 = post('x2', ['bad lighting']);
  db.prepare("INSERT INTO dislikes VALUES(?, 'done', ?, NULL, 'less', ?)").run(i1, JSON.stringify(['bad lighting', 'socks']), Date.now());
  db.prepare("INSERT INTO dislikes VALUES(?, 'done', ?, NULL, 'block', ?)").run(i2, JSON.stringify(['bad lighting']), Date.now());
  boostTags(['bad lighting'], -1.2);
  boostTags(['socks'], -0.6);
  boostTags(['socks'], 0.6);
  const list = dislikedTags();
  const bad = list.find((x) => x.tag === 'bad lighting');
  assert.ok(bad, 'a tag that still counts against posts is listed');
  assert.equal(bad.n, 2);
  assert.deepEqual(bad.kinds, { less: 1, block: 1 });
  assert.ok(!list.some((x) => x.tag === 'socks'), 'a tag back to neutral is left out');
  const before = affinityMap().get(`t:${tagId('bad lighting')}`).long;
  assert.equal(forgiveTag('bad lighting'), 2);
  assert.ok(affinityMap().get(`t:${tagId('bad lighting')}`).long > before, 'forgiving takes the penalties back');
  assert.ok(!dislikedTags().some((x) => x.tag === 'bad lighting'));
});

test('old memories are asked about again, pinned ones and limits never', () => {
  const old = Date.now() - 200 * 86400000;
  const a = addMemory({ category: 'Formats and moods', content: 'Likes long videos at night' });
  const b = addMemory({ category: 'Turn-offs and limits', content: 'Never show feet' });
  const c = addMemory({ category: 'Kinks and interests', content: 'Into socks', pinned: true });
  const d = addMemory({ category: 'Kinks and interests', content: 'Into beards' });
  getDb().prepare('UPDATE memory SET updated = ?, created = ? WHERE id IN (?, ?, ?)').run(old, old, a, b, c);
  getDb().prepare('UPDATE memory SET updated = ? WHERE id = ?').run(Date.now() - 30 * 86400000, d);
  const asked = memoryUpkeep({ cooling: ['beards'] });
  const st = Object.fromEntries(listMemory().map((m) => [m.id, m.status]));
  assert.equal(st[a], 'recheck');
  assert.equal(st[b], 'active');
  assert.equal(st[c], 'active');
  assert.equal(st[d], 'recheck', 'a taste note whose tags cooled down is asked about too');
  assert.equal(asked, 2);
  assert.ok(listMemory({ status: 'active' }).some((m) => m.id === a), '"still true?" memories keep counting until answered');
});

test('a session starts after half an hour away', () => {
  setSetting('lastActive', 0);
  const n0 = sessionCount();
  assert.equal(touchSession(), true);
  assert.equal(touchSession(), false);
  assert.equal(sessionCount(), n0 + 1);
  setSetting('lastActive', Date.now() - 31 * 60000);
  assert.equal(touchSession(), true);
  assert.equal(getSetting('sessionCount'), n0 + 2);
});

test('the welcome steps: each pick brings its own related kinks; gay for pay is a kink of its own', () => {
  const s = suggestFor(['milf', 'lesbian'], 'lesbian').map((x) => x.concept);
  assert.ok(['scissoring', 'strap on', 'pussy licking', 'facesitting'].includes(s[0]), `first suggestion follows the last pick: ${s.slice(0, 4)}`);
  assert.deepEqual(conceptsOf('gay for fans'), ['gay for pay']);
  assert.ok(isKinkConcept('gay for pay'));
});
