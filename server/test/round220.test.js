import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK = '1';
const { openDb } = await import('../src/db.js');
openDb(':memory:');
const { upsertItem } = await import('../src/store.js');
const { applyEvent } = await import('../src/profile.js');
const { createKink, saveFantasy, listFantasies } = await import('../src/kinks.js');
const { setGenderPrefs } = await import('../src/gender.js');
const { writeFantasy, tagsForText } = await import('../src/fantasywrite.js');
const { deeperQuick, postsFor, DEEPER_STEPS } = await import('../src/deeper.js');
const { discoveryCandidates, planDiscovery, journeyOutcome } = await import('../src/discovery.js');

setGenderPrefs({ everyone: true });
let n = 0;
const post = (title, tags) => upsertItem({ source: 'reddit', ext_id: `r220_${n++}`, title, author: `a${n}`, community: 'r/test', format: 'image', tags, score: 10, created_utc: Math.round(Date.now() / 1000) - 3600, media: { kind: 'image', src: 'x' } }).id;

// A small world: someone who loves gym and sweaty posts. Jockstraps show up with those all the time, feet show up
// everywhere evenly, and there is a lot of plain kissing.
const liked = [];
for (let i = 0; i < 12; i++) liked.push(post(`Gym session ${i}`, ['gym', 'sweaty', 'muscle', i % 3 === 0 ? 'feet' : 'kissing']));
const jock = [];
for (let i = 0; i < 8; i++) jock.push(post(`Locker room ${i}`, ['gym', 'jockstrap', i % 2 ? 'sweaty' : 'muscle']));
for (let i = 0; i < 6; i++) post(`Jock only ${i}`, ['jockstrap', 'underwear']);
for (let i = 0; i < 20; i++) post(`Other ${i}`, ['kissing', i % 2 ? 'feet' : 'sensual', 'couple']);
for (const id of liked) { applyEvent({ itemId: id, type: 'save' }); applyEvent({ itemId: id, type: 'rate', value: 4 }); }

test('a fantasy is written from the tags you chose, and refining keeps your tags', async () => {
  const a = await writeFantasy({ tags: ['muscle', 'shower', 'blowjob'], mode: 'new' });
  assert.ok(a.scenario.split(' ').length >= 6, a.scenario);
  assert.deepEqual(a.tags, ['muscle', 'shower', 'blowjob']);
  const b = await writeFantasy({ tags: ['muscle', 'shower', 'blowjob'], mode: 'new', avoid: [a.scenario] });
  assert.notEqual(b.scenario, a.scenario, 'regenerate gives a different story');
  const c = await writeFantasy({ tags: ['riding', 'hotel'], scenario: a.scenario, title: a.title, mode: 'refine' });
  assert.deepEqual(c.tags, ['riding', 'hotel']);
  assert.ok(/hotel|rides|riding/i.test(c.scenario), c.scenario);
});

test('the tags of a story you type are found in its words, in English and in French', async () => {
  const en = await tagsForText('After hours in the office my muscular boss bends me over the desk for rough doggystyle');
  for (const x of ['muscle', 'office', 'rough', 'doggystyle']) assert.ok(en.tags.includes(x), `${x} in ${en.tags}`);
  const fr = await tagsForText('Dans la douche, un inconnu musclé me fait une fellation');
  assert.ok(fr.tags.includes('shower') && fr.tags.includes('blowjob'), fr.tags.join(','));
  const ai = await tagsForText('A stranger in the sauna teases me for an hour', { ai: true });
  assert.ok(Array.isArray(ai.ai));
});

test('a fantasy you write yourself is at least a 90% match, and its tags link your kinks', () => {
  const gymKink = createKink({ name: 'Gym', tags: ['gym'], origin: 'user', status: 'active' });
  const id = saveFantasy({ name: 'After the workout', description: 'In the gym showers', tags: ['gym', 'shower'], origin: 'user' });
  const f = listFantasies().find((x) => x.id === id);
  assert.ok(f.match >= 90, `${f.match}`);
  assert.deepEqual(f.tags, ['gym', 'shower']);
  assert.ok(f.kinks.some((k) => k.id === gymKink), 'the gym tag links the Gym kink');
  const ai = saveFantasy({ name: 'An idea', description: 'x', kinks: [gymKink], origin: 'ai' });
  assert.ok(listFantasies().find((x) => x.id === ai).origin === 'ai');
  saveFantasy({ id: ai, name: 'An idea', description: 'x', kinks: [gymKink], saved: 0 });
  assert.equal(listFantasies().find((x) => x.id === ai).origin, 'ai', 'saving or unsaving keeps who wrote it');
});

test('going deeper asks one choice at a time, about what the fantasy does not say yet, and the posts follow', () => {
  const s1 = deeperQuick({ tags: ['gym', 'sweaty'] });
  assert.equal(s1.done, false);
  assert.notEqual(s1.dim, 'setting', 'gym is already a place, so it asks something else first');
  assert.ok(s1.options.length >= 2 && s1.options.length <= 6);
  assert.ok(s1.posts.length && s1.posts[0].deeperHits === 2, 'posts with both tags first');
  let answers = [];
  let step = s1;
  for (let i = 0; i < DEEPER_STEPS && !step.done; i++) {
    answers = [...answers, { dim: step.dim, tag: step.options[0].tag, shown: step.options.map((o) => o.tag) }];
    step = deeperQuick({ tags: ['gym', 'sweaty'], answers });
    if (!step.done) assert.ok(!answers.some((a) => a.dim === step.dim), 'never the same question twice');
  }
  assert.equal(step.done, true);
  assert.ok(step.tags.length >= 2 + Math.min(answers.length, DEEPER_STEPS) - 1);
  const top = postsFor(['gym', 'jockstrap'], 'jockstrap', 4);
  assert.ok(top.length && top.every((p) => p.deeperHits === 2), 'the newest answer and the fantasy together');
});

test('a discovery journey leads to a real kind of post you never opened that sits right next to what you love', async () => {
  const { candidates } = discoveryCandidates({});
  assert.ok(candidates.length, 'there is somewhere to go');
  assert.equal(candidates[0].tag, 'jockstrap', candidates.map((c) => c.tag).join(','));
  assert.ok(!candidates.some((c) => ['gym', 'sweaty', 'muscle'].includes(c.tag)), 'never what you already love');
  assert.ok(candidates[0].bridges.some((b) => b.name === 'gym'));
  const plan = await planDiscovery({});
  assert.equal(plan.destination.tag, 'jockstrap');
  assert.ok(plan.stages.length >= 2 && plan.stages[plan.stages.length - 1].destination);
  assert.ok(plan.steps.length >= 4);
  const ids = plan.steps.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'no post twice');
  for (const s of plan.steps.filter((x) => x.stage < plan.stages.length - 1)) assert.ok(s.tags.includes('jockstrap') && s.tags.includes(plan.stages[s.stage].from), 'every stepping stone has both');
  assert.ok(plan.steps.filter((x) => x.stage === plan.stages.length - 1).every((s) => s.tags.includes('jockstrap')), 'the end is the destination itself');
  assert.ok(plan.reveal && plan.description);
  journeyOutcome('jockstrap', 'no');
  const next = discoveryCandidates({});
  assert.ok(!next.candidates.some((c) => c.tag === 'jockstrap'), 'the next journey goes somewhere else');
});
