import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK = '1';
const { openDb, getDb } = await import('../src/db.js');
openDb(':memory:');
const { upsertItem } = await import('../src/store.js');
const { localParse, isNatural, personIn, startSearch, jobView, editChip } = await import('../src/search.js');
const { buildFeed } = await import('../src/rank.js');
const { kinkableTag, displayTag, nameFitsTags, isLatin } = await import('../src/tagquality.js');
const { isPrivateAddress } = await import('../src/lan.js');

let n = 0;
function make(tags, extra = {}) {
  n++;
  return upsertItem({ source: 'reddit', ext_id: `s${n}`, title: extra.title || `Post ${n}`, author: extra.author || `a${n % 4}`, community: 'r/test', format: extra.format || 'image', tags, score: extra.score ?? 40, created_utc: Math.round(Date.now() / 1000) - (extra.age || 3600), media: { kind: 'image', src: 'x' } }).id;
}
const setG = (id, men, women) => getDb().prepare("UPDATE items SET g_men = ?, g_women = ?, g_src = 'vision' WHERE id = ?").run(men, women, id);

for (let i = 0; i < 6; i++) make(['big tits', 'brunette']);
for (let i = 0; i < 6; i++) make(['big cock', 'hairy']);

const wait = async (id) => { for (let i = 0; i < 200; i++) { const v = jobView(id); if (v.done) return v; await new Promise((r) => setTimeout(r, 20)); } return jobView(id); };

test('terms are split into tags, gender words set gender instead of tags', () => {
  const p = localParse('woman with big tits');
  assert.deepEqual(p.concepts.map((c) => c.name), ['big tits']);
  assert.equal(p.gender, 'women');
  const h = localParse('hetero sex');
  assert.equal(h.gender, 'both');
  assert.ok(h.concepts.some((c) => c.name === 'sex'));
  assert.equal(localParse('gay big cock').gender, 'men-only');
  assert.equal(localParse('lesbian scissoring').gender, 'women-only');
});

test('anything suggesting minors becomes young adults 18+, never a search for it', () => {
  const p = localParse('naked teens');
  assert.equal(p.concepts.length, 1);
  assert.equal(p.concepts[0].label, 'Young adults 18+');
  assert.ok(!JSON.stringify(p.concepts).match(/teen|young adult\b/i) || p.concepts[0].name === '18 25');
  assert.ok(p.notes.some((x) => /18/.test(x)));
  assert.ok(!localParse('schoolgirl').concepts.some((c) => /school/.test(c.name)));
});

test('sentences go to the assistant, terms are searched right away, people are recognised', () => {
  assert.equal(isNatural('i want to see videos about the profile example'), true);
  assert.equal(isNatural('woman with big tits'), false);
  assert.equal(isNatural('what am i into lately?'), true);
  assert.equal(personIn('im looking for content from tobrinz'), 'tobrinz');
  assert.equal(personIn('@tobrinz'), 'tobrinz');
  assert.equal(personIn('videos with big tits'), null);
});

test('a search filters what is here, fetches from the sources and matches synonyms', async () => {
  const women = make(['huge tits'], { title: 'Evening' });
  setG(women, 0, 1);
  const man = make(['big tits'], { title: 'Wrong one' });
  setG(man, 1, 0);
  const v = await wait(startSearch({ q: 'woman with big tits' }));
  assert.equal(v.done, true);
  assert.ok(v.chips.some((c) => c.kind === 'tag' && c.value === 'big tits'));
  assert.ok(v.chips.some((c) => c.kind === 'gender'));
  assert.ok(v.chips.some((c) => c.kind === 'syn'), 'synonyms shown as lighter chips');
  assert.ok(v.steps.some((s) => /Searching Pornhub/.test(s.label)), 'the sources are searched, not just filtered');
  assert.ok(v.found > 0);
  const feed = buildFeed(v.filter, { limit: 60, mix: 0 }).items;
  assert.ok(feed.length > 0);
  assert.ok(!feed.some((x) => x.id === man), 'a man-only post never matches "woman"');
  const edited = editChip(v.id, { kind: 'gender', value: v.chips.find((c) => c.kind === 'gender').value });
  assert.ok(!edited.chips.some((c) => c.kind === 'gender'));
});

test('an unknown phrase never loops: it ends with results from the sources or an answer', async () => {
  const v = await wait(startSearch({ q: 'i want to see videos about the profile example' }));
  assert.equal(v.done, true);
  assert.equal(v.mode, 'assistant');
  assert.ok(v.answer);
});

test('tag quality: foreign scripts, site names and vague words never become kinks', () => {
  assert.equal(isLatin('سكس جديد'), false);
  assert.equal(kinkableTag('Xnxxx مترجم'), false);
  assert.equal(kinkableTag('nsfw'), false);
  assert.equal(kinkableTag('redgif'), false);
  assert.equal(kinkableTag('big cock'), true);
  assert.equal(displayTag('massive-cock'), 'Massive Cock');
  assert.equal(nameFitsTags('Slow-Grind Seduction', ['slow', 'slow-grinding']), false);
  assert.equal(nameFitsTags('Hairy Chest', ['hairy chest']), true);
});

test('only this Mac and the local network may connect', () => {
  for (const a of ['127.0.0.1', '::1', '::ffff:192.168.1.23', '10.0.0.5', '172.20.1.1']) assert.equal(isPrivateAddress(a), true, a);
  for (const a of ['8.8.8.8', '::ffff:81.82.1.1', '172.40.0.1']) assert.equal(isPrivateAddress(a), false, a);
});

test('threads only show when popular and from the last month', () => {
  const old = make(['story'], { format: 'discussion', score: 5000, age: 60 * 86400 });
  for (let i = 0; i < 5; i++) make(['talk'], { format: 'discussion', score: 3000 });
  const low = make(['talk'], { format: 'discussion', score: 1 });
  const feed = buildFeed({}, { limit: 200, mix: 0 }).items.map((x) => x.id);
  assert.ok(!feed.includes(old));
  assert.ok(!feed.includes(low));
});

test('a bare unknown name goes to the person lookup, a known tag does not', async () => {
  const a = await wait(startSearch({ q: 'tobinz' }));
  assert.equal(a.mode, 'person');
  const b = await wait(startSearch({ q: 'brunette' }));
  assert.equal(b.mode, 'terms');
});

test('typos in names still match', async () => {
  const { mentions } = await import('../src/names.js');
  assert.equal(mentions('Tobinz Stroking In The Shower', 'tobrinz'), true);
  assert.equal(mentions('Something else entirely', 'tobrinz'), false);
});

test('names are read from titles, never porn words', async () => {
  const { namesIn } = await import('../src/names.js');
  assert.deepEqual(namesIn('HETEROFLEXIBLE - PIERCE PARIS, DREW SEBASTIAN, BRUCE JONES'), ['pierce paris', 'drew sebastian', 'bruce jones']);
  assert.deepEqual(namesIn('Huge Cock Santa Stokes His Pole'), []);
});
