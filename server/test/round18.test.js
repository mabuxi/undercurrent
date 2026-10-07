import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK = '1';
const { openDb, getDb, tagId } = await import('../src/db.js');
openDb(':memory:');
const { upsertItem } = await import('../src/store.js');
const { applyEvent, affinityMap, bump, changeParts } = await import('../src/profile.js');
const { sourcesIn } = await import('../src/search.js');
const { lanUrls } = await import('../src/lan.js');
const { queueDislike, dislikeOf, dropReason, confirmDislike } = await import('../src/dislike.js');

let n = 0;
const post = (tags) => upsertItem({ source: 'reddit', ext_id: `r18_${n++}`, title: `Post ${n}`, author: 'someone', community: 'r/test', format: 'image', tags, score: 10, created_utc: Math.round(Date.now() / 1000) - 3600, media: { kind: 'image', src: 'x' } }).id;
const aff = (name) => affinityMap().get(`t:${tagId(name)}`)?.long || 0;
const close = (a, b) => Math.abs(a - b) < 1e-6;

test('taking a like, a save or heat back undoes exactly what it added', () => {
  const id = post(['feet', 'socks']);
  const before = aff('socks');
  applyEvent({ itemId: id, type: 'up' });
  assert.ok(aff('socks') > before);
  applyEvent({ itemId: id, type: 'unvote' });
  assert.ok(close(aff('socks'), before), `after unvote ${aff('socks')} vs ${before}`);
  applyEvent({ itemId: id, type: 'save' });
  applyEvent({ itemId: id, type: 'unsave' });
  assert.ok(close(aff('socks'), before));
  applyEvent({ itemId: id, type: 'rate', value: 4 });
  applyEvent({ itemId: id, type: 'rate', value: 2 });
  applyEvent({ itemId: id, type: 'rate', value: 0 });
  assert.ok(close(aff('socks'), before));
  // Saving twice or liking twice does not count twice.
  applyEvent({ itemId: id, type: 'up' });
  const once = aff('socks');
  applyEvent({ itemId: id, type: 'up' });
  assert.ok(close(aff('socks'), once));
});

test('switching a like to a dislike takes the like back first', () => {
  const parts = changeParts('down', null, null, { vote: 1 });
  assert.equal(parts.length, 2);
  assert.ok(parts[0].undo && parts[0].s < 0);
  assert.ok(!parts[1].undo && parts[1].s < 0);
});

test('hiding a post leaves what you already like alone', () => {
  bump(`t:${tagId('hairy chest')}`, 1.5);
  const id = post(['hairy chest', 'clown makeup']);
  const liked = aff('hairy chest');
  applyEvent({ itemId: id, type: 'less' });
  assert.ok(close(aff('hairy chest'), liked), 'a liked tag is not punished');
  assert.ok(aff('clown makeup') < 0, 'what stays takes the blame');
});

test('the bigger model looks at a hidden post, but only what you confirm counts against it', async () => {
  const id = post(['hairy chest', 'office']);
  queueDislike(id, 'less');
  for (let i = 0; i < 40 && dislikeOf(id).status !== 'done'; i++) await new Promise((r) => setTimeout(r, 50));
  const d = dislikeOf(id);
  assert.equal(d.status, 'done');
  assert.deepEqual(d.reasons, [], 'a guess never counts on its own');
  assert.deepEqual(d.guesses, ['soft lighting', 'fake moaning']);
  assert.ok(Math.abs(aff('soft lighting')) < 1e-6);
  const c = confirmDislike(id, ['soft lighting']);
  assert.deepEqual(c.reasons, ['soft lighting']);
  assert.deepEqual(c.guesses, ['fake moaning']);
  assert.ok(aff('soft lighting') < 0);
  const after = dropReason(id, 'soft lighting');
  assert.deepEqual(after.reasons, []);
  assert.ok(Math.abs(aff('soft lighting')) < 1e-6);
});

test('a search can name the sources it is about', () => {
  assert.deepEqual(sourcesIn('show me only content from bluesky'), { ids: ['bluesky'], rest: '' });
  assert.deepEqual(sourcesIn('bluesky, reddit'), { ids: ['bluesky', 'reddit'], rest: '' });
  assert.deepEqual(sourcesIn('montre-moi seulement du contenu de bluesky'), { ids: ['bluesky'], rest: '' });
  assert.deepEqual(sourcesIn('hairy feet on reddit'), { ids: ['reddit'], rest: 'hairy feet' });
  assert.equal(sourcesIn('hairy feet'), null);
});

test('the phone gets the Mac’s home network address', () => {
  const urls = lanUrls(4317, { lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }], en0: [{ address: '192.168.0.105', family: 'IPv4', internal: false }], utun3: [{ address: '100.64.1.2', family: 'IPv4', internal: false }], en5: [{ address: '10.0.0.4', family: 'IPv4', internal: false }] });
  assert.deepEqual(urls.map((u) => u.url), ['http://192.168.0.105:4317', 'http://10.0.0.4:4317']);
});

test('another device needs the pairing code, this Mac never does', async () => {
  const os = await import('node:os');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { pairGate, pairToken, resetPairToken } = await import('../src/lan.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ucpair-'));
  const gate = pairGate(dir);
  const run = (addr, { cookie = '', url = '/' } = {}) => new Promise((resolve) => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, type() { return this; }, json(b) { resolve({ code: this.statusCode, body: b }); }, send(b) { resolve({ code: this.statusCode, body: b }); } };
    gate({ socket: { remoteAddress: addr }, headers: { cookie }, originalUrl: url, url, path: url.split('?')[0] }, res, () => resolve({ code: 'next', cookie: res.headers['Set-Cookie'] }));
  });
  assert.equal((await run('127.0.0.1')).code, 'next');
  assert.equal((await run('::ffff:127.0.0.1')).code, 'next');
  assert.equal((await run('192.168.0.20')).code, 401);
  assert.equal((await run('192.168.0.20', { url: '/api/feed' })).code, 401);
  const tok = pairToken(dir);
  const ok = await run('192.168.0.20', { url: `/?pair=${tok}` });
  assert.equal(ok.code, 'next');
  assert.match(ok.cookie, /uc_pair=/);
  assert.equal((await run('192.168.0.20', { cookie: `uc_pair=${encodeURIComponent(tok)}` })).code, 'next');
  resetPairToken(dir);
  assert.equal((await run('192.168.0.20', { cookie: `uc_pair=${encodeURIComponent(tok)}` })).code, 401);
});
