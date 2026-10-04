import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.MOCK = '1';
const { openDb } = await import('../src/db.js');
openDb(':memory:');
const { pickRelease } = await import('../src/update.js');
const { config } = await import('../src/config.js');

const rel = (tag, assets = ['Undercurrent-mac.zip'], extra = {}) => ({ tag_name: tag, draft: false, prerelease: false, body: `notes ${tag}`, assets: assets.map((name) => ({ name, state: 'uploaded', size: 10, browser_download_url: `https://example.test/${tag}/${name}` })), ...extra });

test('the downloaded app picks the newest release that has the Mac app attached', () => {
  const list = [rel('v0.17.0', []), rel('v0.16.1'), rel('v0.16.0'), rel('v0.18.0', ['Undercurrent-mac.zip'], { draft: true })];
  const r = pickRelease(list, '0.15.0');
  assert.equal(r.version, '0.16.1');
  assert.equal(r.url, 'https://example.test/v0.16.1/Undercurrent-mac.zip');
  assert.equal(pickRelease(list, '0.16.1'), null);
  assert.equal(pickRelease([rel('v0.16.0', ['Undercurrent-mac.zip'], { prerelease: true })], '0.15.0'), null);
  assert.equal(pickRelease({ message: 'Not Found' }, '0.15.0'), null);
});

test('the repository comes from package.json and the downloaded app is not the default', () => {
  assert.equal(config.repo, 'mabuxi/undercurrent');
  assert.equal(config.packaged, false);
});

test('the installer and the release workflow point at the same file', () => {
  const install = fs.readFileSync(new URL('../../install.sh', import.meta.url), 'utf8');
  const flow = fs.readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8');
  const pack = fs.readFileSync(new URL('../../mac/package.sh', import.meta.url), 'utf8');
  for (const t of [install, flow, pack]) assert.match(t, /Undercurrent-mac\.zip/);
  assert.match(install, /mabuxi\/undercurrent/);
  assert.doesNotMatch(install, /pgrep -\w*q/, 'pgrep on macOS has no -q');
});
