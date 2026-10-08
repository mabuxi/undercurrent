import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK = '1';
const { openDb, getDb, getSetting, tagId } = await import('../src/db.js');
openDb(':memory:');
const { upsertItem, stripOc, removeItemTag, addTags, itemTags, getItem } = await import('../src/store.js');
const { buildFeed } = await import('../src/rank.js');
const { setGenderPrefs } = await import('../src/gender.js');
const { isSourceName } = await import('../src/sourcenames.js');
const { keysForItem, affinityMap, boostTags } = await import('../src/profile.js');
const { conceptCatalog, suggestFor, genderModeOf } = await import('../src/setup.js');
const { knownVariants, conceptsOf, CHILDREN } = await import('../src/concepts.js');
const { fantasyIdeas } = await import('../src/fantasyideas.js');

setGenderPrefs({ everyone: true });
let n = 0;
const now = Math.round(Date.now() / 1000);
const post = (o = {}) => upsertItem({ source: 'reddit', ext_id: `r210_${n++}`, title: `Post ${n}`, author: `a${n}`, community: 'r/test', format: 'image', tags: ['shower'], score: 10, created_utc: now - 3600, media: { kind: 'image', src: 'x' }, ...o }).id;

test('[OC], [OG] and similar become the Original content badge, and leave the title and tags', () => {
  for (const [t, want] of [['[OC] my new video', 'my new video'], ['[OG] my new video', 'my new video'], ['OG: shower time', 'shower time'], ['[F OC] lazy sunday', '[F] lazy sunday'], ['(og, 23) gym', '(23) gym']]) {
    const r = stripOc(t);
    assert.equal(r.oc, true, t);
    assert.equal(r.title, want);
  }
  assert.equal(stripOc('OG Kush session').oc, false);
  assert.equal(stripOc('Ocean view').oc, false);
  const id = post({ title: 'Lazy sunday', tags: ['shower', 'OC'] });
  assert.equal(getItem(id).oc, true);
  assert.ok(!itemTags(id).some((x) => x.name === 'oc'), 'the OC tag is not kept as a tag');
});

test('a source is never a creator or a community you like', () => {
  assert.ok(isSourceName('Pornhub') && isSourceName('RedTube') && !isSourceName('r/gonewild'));
  const keys = keysForItem({ community: 'Pornhub', source: 'pornhub', format: 'long' }, []).map(([k]) => k);
  assert.ok(!keys.some((k) => k.startsWith('c:')));
});

test('a tag taken off a post stays off and is passed on to the tagger', () => {
  const id = post({ tags: ['shower', 'socks'] });
  assert.equal(removeItemTag(id, 'socks'), 'socks');
  assert.ok(!itemTags(id).some((x) => x.name === 'socks'));
  addTags(id, ['socks'], 'ai', 0.8);
  assert.ok(!itemTags(id).some((x) => x.name === 'socks'), 'a later tagging pass does not put it back');
  addTags(id, ['socks'], 'user', 1);
  assert.ok(itemTags(id).some((x) => x.name === 'socks'), 'you can still put it back yourself');
  assert.equal((getSetting('wrongTags', {}) || {}).socks, 1);
});

test('someone you follow shows up once per session, twice when you like their posts', () => {
  const db = getDb();
  db.prepare("INSERT INTO follows(kind, value, active, created) VALUES('creator', 'reddit|spammer', 1, ?)").run(Date.now() - 86400000);
  db.prepare("INSERT INTO follows(kind, value, active, created) VALUES('creator', 'reddit|favourite', 1, ?)").run(Date.now() - 86400000);
  for (let i = 0; i < 6; i++) post({ author: 'spammer', score: 10 + i, tags: ['shower'] });
  for (let i = 0; i < 6; i++) post({ author: 'favourite', score: 10 + i, tags: ['shower'] });
  for (let i = 0; i < 20; i++) post({ tags: ['shower'] });
  boostTags(['shower'], 0.5);
  getDb().prepare("INSERT OR REPLACE INTO affinity(key, long, short, lately, n, long_ts, short_ts, lately_ts) VALUES('a:reddit:favourite', 1, 1, 1, 5, ?, ?, ?)").run(Date.now(), Date.now(), Date.now());
  const items = [];
  for (let page = 0; page < 3; page++) items.push(...buildFeed({}, { limit: 12, mix: 0, capFollows: true, exclude: items.map((x) => x.id) }).items);
  const by = (a) => items.filter((x) => String(x.author || '').toLowerCase() === a);
  assert.equal(by('spammer').length, 1, 'one from a creator you follow');
  assert.equal(by('favourite').length, 2, 'two when you like their posts');
  assert.equal(by('spammer')[0].score, 15, 'their most popular one');
});

test('the welcome steps follow who you want to see', () => {
  const types = (male) => conceptCatalog({ male }).find((f) => f.key === 'types').concepts.map((x) => x.concept);
  const het = types(50);
  assert.ok(het.slice(0, 8).some((c) => ['milf', 'cougar', 'girl next door'].includes(c)), 'women among the first types for hetero');
  assert.ok(het.slice(0, 8).some((c) => ['couple', 'hotwife', 'swingers'].includes(c)), 'couples too');
  assert.ok(!types(95).includes('milf') && !types(95).includes('couple'), 'men only: no women or couples');
  assert.ok(!types(5).includes('twink'), 'women only: no men');
  assert.equal(genderModeOf(50), 'hetero');
  assert.ok(!suggestFor(['twink'], 'twink', { male: 95 }).some((x) => x.concept === 'milf'));
});

test('ethnicities start with continents, a continent matches all of its countries', () => {
  const eth = conceptCatalog({ male: 50 }).find((f) => f.key === 'ethnicity').concepts;
  assert.ok(eth.some((c) => c.concept === 'european' && !c.parent), 'European / White is there');
  assert.ok(eth.some((c) => c.concept === 'japanese' && c.parent === 'asian'));
  assert.ok(knownVariants('asian').includes('japanese') && knownVariants('asian').includes('pinay'));
  assert.deepEqual(conceptsOf('japanese'), ['japanese']);
  assert.ok(!suggestFor(['muscle'], 'muscle', {}).some((x) => CHILDREN.asian.includes(x.concept)), 'no country before its continent is picked');
});

test('a fantasy story gets its risky twist only where someone could walk in', () => {
  const list = fantasyIdeas(['big tits', 'riding', 'public'], { gender: 'both' });
  for (const f of list) if (/Storm cabin|Chalet/.test(f.name)) assert.ok(!/see you/.test(f.description), f.description);
  assert.ok(list.some((f) => /see you/.test(f.description)));
});
