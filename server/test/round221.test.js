import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK = '1';
const { openDb } = await import('../src/db.js');
openDb(':memory:');
const { directMedia } = await import('../src/direct.js');

// The pages and lists the tube sites send, shaped like the real ones.
const PH = '<script>var flashvars = {"mediaPriority":"hls","mediaDefinitions":[{"group":1,"height":480,"format":"hls","videoUrl":"https:\\/\\/ee-h.phncdn.com\\/hls\\/480P.mp4\\/master.m3u8?x=1","quality":"480","segmentFormats":{"audio":"ts_aac"}},{"group":1,"format":"mp4","videoUrl":"https:\\/\\/www.pornhub.com\\/video\\/get_media?s=abc","quality":[],"remote":true}],"isVertical":"false"};</script>';
const PH_LIST = [{ format: 'mp4', quality: '240', videoUrl: 'https://ee.phncdn.com/240P.mp4' }, { format: 'mp4', quality: '720', videoUrl: 'https://ee.phncdn.com/720P.mp4' }, { format: 'mp4', quality: '1440', videoUrl: 'https://ee.phncdn.com/1440P.mp4' }];
const RT = '<script>playervars = {"mediaDefinitions":[{"format":"hls","videoUrl":"/media/hls?s=x","remote":true},{"format":"mp4","videoUrl":"/media/mp4?s=y","remote":true}],"other":1}</script>';
const RT_HLS = [{ format: 'hls', quality: '480', videoUrl: 'https://ev-h-ph.rdtcdn.com/480P/master.m3u8' }, { format: 'hls', quality: '240', videoUrl: 'https://ev-h-ph.rdtcdn.com/240P/master.m3u8' }];
const EP = "<script>EP.video.player.vid = 'B49nk8B9KMK'; EP.video.player.hash = '8565e6bf0eba2fb781dbcbf2a7a30abc';</script>";
let asked = [];
globalThis.fetch = async (url) => {
  const u = String(url);
  asked.push(u);
  const ok = (body, json) => ({ ok: true, status: 200, text: async () => body, json: async () => (json ? body : JSON.parse(body)) });
  if (u.includes('pornhub.com/embed/')) return ok(PH);
  if (u.includes('get_media')) return ok(PH_LIST, true);
  if (u.includes('embed.redtube.com')) return ok(RT);
  if (u.includes('redtube.com/media/hls')) return ok(RT_HLS, true);
  if (u.includes('eporner.com/embed/')) return ok(EP);
  if (u.includes('eporner.com/xhr/video/')) return ok({ sources: { mp4: { '1080p HD': { labelShort: '1080p', src: 'https://vid.eporner.com/1080.mp4' }, '480p': { labelShort: '480p', src: 'https://vid.eporner.com/480.mp4' } } } }, true);
  return { ok: false, status: 404 };
};

test('a tube video plays in the phone\'s own player: the best file up to 1080p, through the Mac', async () => {
  const ph = await directMedia({ id: 1, source: 'pornhub', media: { embed: 'https://www.pornhub.com/embed/abc' } });
  assert.equal(ph.kind, 'mp4');
  assert.equal(ph.url, 'https://ee.phncdn.com/720P.mp4', 'the list inside the page is read, 1440p is too big');
  assert.ok(ph.src.startsWith('/api/proxy?url='));
  const rt = await directMedia({ id: 2, source: 'redtube', media: { embed: 'https://embed.redtube.com/?id=1' } });
  assert.equal(rt.kind, 'hls', 'RedTube files ignore byte ranges, so its stream is used');
  assert.equal(rt.url, 'https://ev-h-ph.rdtcdn.com/480P/master.m3u8');
  assert.ok(rt.src.startsWith('/api/hls?url='));
  assert.ok(asked.some((u) => u === 'https://www.redtube.com/media/hls?s=x'), 'relative list addresses are made absolute');
  const ep = await directMedia({ id: 3, source: 'eporner', media: { embed: 'https://www.eporner.com/embed/B49nk8B9KMK/' } });
  assert.equal(ep.url, 'https://vid.eporner.com/1080.mp4');
  const signed = asked.find((u) => u.includes('/xhr/video/'));
  const hash = '8565e6bf0eba2fb781dbcbf2a7a30abc';
  const h = [0, 8, 16, 24].map((i) => parseInt(hash.slice(i, i + 8), 16).toString(36)).join('');
  assert.ok(signed.includes(`hash=${h}`), 'the request is signed the way the site expects');
  const n = asked.length;
  await directMedia({ id: 1, source: 'pornhub', media: { embed: 'https://www.pornhub.com/embed/abc' } });
  assert.equal(asked.length, n, 'kept for a while, not asked again');
  assert.equal(await directMedia({ id: 4, source: 'reddit', media: { embed: 'x' } }), null);
});
