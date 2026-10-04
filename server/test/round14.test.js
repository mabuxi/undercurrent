import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.MOCK = '1';
const { openDb } = await import('../src/db.js');
openDb(':memory:');
const { newer, changelogSince, parseVersion } = await import('../src/update.js');
const { suggestFor, conceptCatalog, recommendedModels } = await import('../src/setup.js');
const { config } = await import('../src/config.js');

test('versions compare as numbers, not text', () => {
  assert.equal(newer('0.15.0', '0.14.0'), true);
  assert.equal(newer('0.10.0', '0.9.9'), true);
  assert.equal(newer('v1.0.0', '0.99.0'), true);
  assert.equal(newer('0.14.0', '0.14.0'), false);
  assert.equal(parseVersion('banana'), null);
});

test('the change notes since your version are read from the changelog', () => {
  const text = fs.readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');
  const all = changelogSince(text, null);
  assert.equal(all[0].version, config.version, 'the newest changelog entry is the current version');
  const since = changelogSince('## 0.16.0 · a\n- c\n## 0.15.0 · b\n- d\n## 0.14.0\n- e', '0.14.0');
  assert.deepEqual(since.map((x) => x.version), ['0.16.0', '0.15.0']);
  assert.equal(since[1].date, 'b');
});

test('the welcome steps suggest related things live and group concepts by family', () => {
  const s = suggestFor(['jockstrap']).map((x) => x.concept);
  assert.ok(s.includes('jock') || s.includes('gym'));
  assert.ok(!s.includes('jockstrap'));
  const fams = conceptCatalog();
  assert.ok(fams.find((f) => f.name === 'Body').concepts.slice(0, 3).some((c) => c.concept === 'muscle'));
  assert.ok(recommendedModels().fast.name.includes('4b'));
});
