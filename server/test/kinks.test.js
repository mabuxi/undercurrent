import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK = '1';
const { openDb, getDb, setSetting } = await import('../src/db.js');
openDb(':memory:');
const { upsertItem, setState, tagsForItems } = await import('../src/store.js');
const { applyEvent } = await import('../src/profile.js');
const { listKinks, createKink, updateKink, deleteKink, mergeKinks, kinkIndex, kinksForTags } = await import('../src/kinks.js');
const { syncKinks, conceptEvidence, risingConcepts } = await import('../src/kinkengine.js');
const { conceptsOf, isKinkConcept } = await import('../src/concepts.js');

const DAY = 86400000;
let n = 0;
function make(tags) {
  n++;
  return upsertItem({ source: 'reddit', ext_id: `k${n}`, title: `Post ${n}`, author: `a${n % 7}`, community: 'r/test', format: 'image', tags, score: 10, created_utc: Math.round(Date.now() / 1000) - 3600, media: { kind: 'image', src: 'x' } }).id;
}
const seen = (id) => setState(id, { seen: 1 });
const like = (id, daysAgo, type = 'up', value = null) => applyEvent({ itemId: id, type, value }, Date.now() - daysAgo * DAY);

// Everything you see: big dick and gay on most of it, a little of everything else.
const filler = [];
for (let i = 0; i < 300; i++) filler.push(make(['gay', 'big dick', i % 3 ? 'amateur' : 'cumshot', ['bedroom', 'pov', 'blowjob', 'anal'][i % 4]]));
const jock = [];
for (let i = 0; i < 12; i++) jock.push(make(['gay', 'big dick', i % 2 ? 'jockstrap' : 'jock strap', 'locker room']));
const twinks = [];
for (let i = 0; i < 10; i++) twinks.push(make(['gay', 'twink', 'bareback gay']));
const daddies = [];
for (let i = 0; i < 10; i++) daddies.push(make(['gay', 'daddy', 'big dick']));
const latino = [];
for (let i = 0; i < 10; i++) latino.push(make(['gay', 'latino gay', 'big dick']));
for (const id of [...filler, ...jock, ...twinks, ...daddies, ...latino]) seen(id);

test('tags are folded into plain concepts', () => {
  assert.deepEqual(conceptsOf('jerk off'), ['masturbation']);
  assert.deepEqual(conceptsOf('Latino Gay'), ['latino']);
  assert.deepEqual(conceptsOf('arab anal'), ['arab', 'anal']);
  assert.deepEqual(conceptsOf('black shorts'), ['shorts']);
  assert.deepEqual(conceptsOf('grey briefs'), ['underwear']);
  assert.equal(isKinkConcept(conceptsOf('big dick')[0]), false, 'big cock is on everything, never a kink');
  assert.equal(isKinkConcept('gay'), false);
  assert.equal(isKinkConcept('hand on cock'), false, 'a description of a frame is not a taste');
});

test('a kink needs strong likes on several days and must stand out from everything you see', () => {
  // Liking big-dick posts all the time does not make "big dick" a kink: it is on almost everything.
  for (const [i, id] of filler.slice(0, 12).entries()) like(id, i % 3);
  // Jockstrap: liked and heated on three different days.
  for (const [i, id] of jock.slice(0, 6).entries()) { like(id, i % 3); if (i < 3) like(id, i, 'rate', 4); }
  // Latino: only watched, never liked.
  for (const id of latino) applyEvent({ itemId: id, type: 'dwell', value: 60000 });
  // Twink: liked a lot, but all within one moment.
  for (const id of twinks.slice(0, 6)) like(id, 0);
  const r = syncKinks();
  const names = listKinks().filter((k) => !k.isGroup).map((k) => k.name);
  assert.ok(names.includes('Jockstrap'), `jockstrap should be a kink, got ${names.join(', ')}`);
  assert.ok(!names.some((x) => /big|cock|dick|gay/i.test(x)), 'never a kink from a tag that is on everything');
  assert.ok(!names.includes('Latino'), 'watching alone never makes a kink');
  assert.ok(!names.includes('Twink'), 'one burst on one day is not "keeps coming back"');
  assert.ok(r.created.includes('Jockstrap'));
  const k = listKinks().find((x) => x.name === 'Jockstrap');
  assert.ok(k.tags.some((t) => t.name === 'jock strap'), 'every spelling joins the same kink');
  assert.ok(k.evidence.n >= 5 && k.evidence.lift > 2);
  assert.ok(risingConcepts().some((x) => x.concept === 'twink'), 'twink is almost a kink');
});

test('kinks of one family are grouped once there are two, with plain names and shared colours', () => {
  for (const [i, id] of twinks.slice(6).entries()) like(id, 1 + (i % 2));
  for (const [i, id] of daddies.slice(0, 6).entries()) like(id, i % 3, 'save');
  syncKinks();
  const all = listKinks();
  const group = all.find((k) => k.isGroup && k.name === 'Types');
  assert.ok(group, `a Types group, got ${all.filter((k) => k.isGroup).map((k) => k.name).join(', ')}`);
  const members = all.filter((k) => k.parentId === group.id).map((k) => k.name).sort();
  assert.deepEqual(members, ['Daddy', 'Twink']);
  assert.notEqual(all.find((k) => k.name === 'Jockstrap').parentId, group.id);
  assert.ok(all.filter((k) => k.parentId === group.id).every((k) => k.color !== group.color && k.color.startsWith('#')));
});

test('what you change by hand stays, what you remove does not come back', () => {
  const twink = listKinks().find((k) => k.name === 'Twink');
  updateKink(twink.id, { name: 'Twinks, raw' });
  syncKinks();
  assert.ok(listKinks().some((k) => k.name === 'Twinks, raw'), 'your name survives updates');
  const daddy = listKinks().find((k) => k.name === 'Daddy');
  deleteKink(daddy.id);
  syncKinks();
  assert.ok(!listKinks({ includeHidden: true }).some((k) => k.name === 'Daddy'), 'a removed kink is not recreated');
  assert.ok(!listKinks().some((k) => k.isGroup && k.name === 'Types'), 'a family of one is no group');
});

test('two kinks can be combined, and a post can be put in or out of a kink', () => {
  const a = createKink({ name: 'Locker room', tags: ['locker room'] });
  const j = listKinks().find((k) => k.name === 'Jockstrap');
  const keep = mergeKinks(a, j.id);
  assert.equal(keep, j.id);
  const k = listKinks().find((x) => x.id === j.id);
  assert.ok(k.tags.some((t) => t.name === 'locker room'));
  assert.ok(!listKinks({ includeHidden: true }).some((x) => x.id === a));
  const idx = kinkIndex(listKinks());
  const tags = tagsForItems([jock[0]]).get(jock[0]);
  assert.ok(kinksForTags(tags, idx).some((x) => x.id === j.id));
});

test('old kinks with made-up names are rebuilt or removed', () => {
  const db = getDb();
  db.prepare("INSERT INTO kinks(name, color, origin, status, is_group, created, updated) VALUES('The Size Obsession', '#fff', 'ai', 'active', 1, 1, 1)").run();
  const odd = db.prepare("INSERT INTO kinks(name, color, origin, status, created, updated) VALUES('RedGif Obsession', '#fff', 'ai', 'active', 1, 1)").run().lastInsertRowid;
  db.prepare("INSERT INTO kink_tags(kink_id, tag_id, weight) VALUES(?, (SELECT id FROM tags WHERE name = 'big dick'), 1)").run(odd);
  setSetting('kinkFamilies', {});
  syncKinks();
  const names = listKinks({ includeHidden: true }).map((k) => k.name);
  assert.ok(!names.includes('The Size Obsession'));
  assert.ok(!listKinks().some((k) => k.name === 'RedGif Obsession'));
  assert.ok(conceptEvidence().stats.size > 0);
});
