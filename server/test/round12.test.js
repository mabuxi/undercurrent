import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK = '1';
const { openDb } = await import('../src/db.js');
openDb(':memory:');
const { handlesIn } = await import('../src/names.js');
const { normalizeLust, merge, parseCount } = await import('../src/sources/lustpress.js');
const { repairJson } = await import('../src/ai/ollama.js');
const { presets } = await import('../src/presets.js');
const { providerState, hasKeys } = await import('../src/sources/providers.js');

test('usernames are read from titles like "watch tobinz going crazy"', () => {
  assert.deepEqual(handlesIn('watch tobinz going crazy', { isKnown: (w) => w === 'tobinz' }), ['tobinz']);
  assert.deepEqual(handlesIn('with @hunk_22 tonight'), ['hunk_22']);
  assert.deepEqual(handlesIn('watch me take it'), []);
  assert.deepEqual(handlesIn('fucked by my daddy'), []);
});

test('scraper results become embed posts and merge with the official API without doubles', () => {
  const a = normalizeLust('xvideos', { id: 'video123/some_title', title: 'Some Title', image: 'https://x/img.jpg', duration: '12 min', views: '1.2M', video: 'https://www.xvideos.com/embedframe/123' });
  assert.equal(a.source, 'xvideos');
  assert.equal(a.format, 'long');
  assert.equal(a.media.kind, 'embed');
  assert.equal(parseCount('1.2M'), 1200000);
  assert.equal(normalizeLust('xvideos', { id: 'x', title: 'no media' }), null);
  const official = [{ source: 'pornhub', ext_id: 'ph1', title: 'Same Video' }];
  const scraped = [{ source: 'pornhub', ext_id: 'ph1', title: 'Same Video' }, { source: 'pornhub', ext_id: 'ph2', title: 'Same video' }, { source: 'pornhub', ext_id: 'ph3', title: 'Other' }];
  assert.deepEqual(merge(official, scraped).map((x) => x.ext_id), ['ph1', 'ph3']);
});

test('scraper sources stay off without a server address', () => {
  const st = providerState();
  for (const id of ['xvideos', 'xnxx', 'xhamster', 'youporn', 'txxx']) {
    assert.equal(st[id].enabled, false, id);
    assert.equal(hasKeys(id), false, id);
  }
});

test('a cut-off JSON answer from the tagger is repaired instead of failing', () => {
  const cut = '{"items":[{"id":1,"tags":["a","b"]},{"id":2,"tags":["c"]},{"id":3,"tags":["d","e';
  const r = repairJson(cut);
  assert.ok(r);
  assert.equal(r.items.length, 2);
});

test('"right now" picks say what they are and are never tied to a format', () => {
  const list = presets();
  assert.ok(list.length >= 1);
  assert.equal(list.at(-1).kind, 'new');
  for (const p of list) {
    assert.ok(p.kind, 'every pick has a kind');
    assert.ok(!('formats' in (p.filters || {})), 'no pick sets a format');
  }
});
