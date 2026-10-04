const { chromium } = require('playwright');
const out = process.env.OUT || '/tmp/uc8';
const base = process.env.BASE || 'http://127.0.0.1:4317/';
require('fs').mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); };
const api = async (p, path, body, method) => p.evaluate(async ([u, b, m]) => (await fetch(`/api${u}`, b ? { method: m || 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) } : undefined)).json(), [path, body, method]);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  await p.goto(base);
  await p.waitForSelector('.post', { timeout: 20000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}/01-top.png` });
  check('greeting shows a summary', !!(await p.$('.hello-sum')), await p.$eval('.hello-sum', (e) => e.textContent).catch(() => ''));
  const labels = (await p.$$eval('.tuner .tlabel', (x) => x.map((y) => y.textContent))).join('|');
  check('tuning panel has feed, mood, formats, gender and new-to-you rows, no length', /Feed.*Mood.*Formats.*Gender.*New to you/.test(labels) && !/Length/.test(labels), labels);
  check('mood is shown as cards with icons', (await p.$$('.moodcard .mc-ic')).length >= 6);
  check('gender slider matches the new-to-you slider', !!(await p.$('.uslider.gender')) && !!(await p.$('#mix.uslider')) && !!(await p.$('.gsym.f')) && !!(await p.$('.gsym.m')));
  await p.selectOption('.feedwin select', 'popular');
  await p.waitForTimeout(1500);
  const crumbsW = await p.$$eval('.crumb', (c) => c.map((x) => x.textContent));
  check('feed dropdown filters to popular posts of a period', crumbsW.some((c) => /Popular/.test(c)), crumbsW.join('|'));
  await p.click('.crumb.root');
  await p.waitForTimeout(1200);
  check('windows have no close buttons', (await p.$$('.win button[aria-label="Close window"]')).length === 0);
  const gi = await p.$$('.post .gicons');
  check('posts show small gender icons first in their tags', gi.length > 0, `${gi.length}`);

  await p.evaluate(() => window.scrollTo(0, 700));
  await p.waitForTimeout(400);
  const y0 = await p.evaluate(() => window.scrollY);
  const ab = await (await p.$('#askIn')).boundingBox();
  await p.mouse.click(ab.x + 30, ab.y + ab.height / 2);
  await p.keyboard.type('slow teasing and eye contact', { delay: 30 });
  const y1 = await p.evaluate(() => window.scrollY);
  check('typing in the ask bar does not move the page', Math.abs(y1 - y0) < 3, `${y0} -> ${y1}`);
  await p.keyboard.press('Enter');
  await p.waitForSelector('.hello-sum.answer', { timeout: 30000 }).catch(() => {});
  const ans = await p.$eval('.hello-sum', (e) => ({ t: e.textContent, cls: e.className, st: getComputedStyle(e).fontStyle }));
  check('the answer shows under the greeting in italic', /answer/.test(ans.cls) && ans.st === 'italic', ans.t);

  await api(p, '/settings/gender', { male: 100 }, 'PUT');
  const f = await api(p, '/feed', { limit: 30, mix: 0 });
  const women = f.items.filter((x) => (x.gender?.women || 0) > 0);
  check('at 100% men no post with a woman gets through', women.length === 0, `${women.length} of ${f.items.length}`);
  await api(p, '/settings/gender', { male: 0 }, 'PUT');
  const f2 = await api(p, '/feed', { limit: 30, mix: 0 });
  const menOnly = f2.items.filter((x) => (x.gender?.men || 0) > 0 && !(x.gender?.women || 0));
  check('at 100% women no men-only posts get through', menOnly.length === 0, `${menOnly.length} of ${f2.items.length}`);
  await api(p, '/settings/gender', { male: 50, trans: false }, 'PUT');
  const f3 = await api(p, '/feed', { limit: 30, mix: 0 });
  check('trans content hidden when not allowed', !f3.items.some((x) => x.gender?.trans));
  const auto = await api(p, '/settings/gender', { auto: true }, 'PUT');
  check('auto balance follows interactions', auto.auto === true && Number.isFinite(auto.male), `${auto.male}`);
  await api(p, '/settings/gender', { auto: false, trans: true, male: 50 }, 'PUT');

  const formats = new Set(f3.items.slice(0, 20).map((x) => ({ long: 'video', short: 'clips', gif: 'clips', image: 'images', set: 'images', story: 'text', discussion: 'text' }[x.format])));
  check('every content type keeps a place in the feed', formats.size >= 3, [...formats].join(','));

  await p.fill('#askIn', 'I want to see more cosplay');
  await p.press('#askIn', 'Enter');
  await p.waitForFunction(() => !document.querySelector('.sbar .spin'), null, { timeout: 30000 }).catch(() => {});
  const o = await p.textContent('.hello-sum');
  const fol = await api(p, '/follows');
  check('a search only becomes a source once you like one of its results (round 10)', !fol.follows.some((x) => x.active && x.synced_from === 'auto' && /cosplay/i.test(`${x.topic} ${x.value}`) && x.created > Date.now() - 60000), o);

  const n0 = await p.$$eval('.side .win', (x) => x.map((w) => w.querySelector('.win-title strong')?.textContent).join('|'));
  await p.evaluate(() => window.dispatchEvent(new Event('uc-refresh-windows')));
  await p.waitForTimeout(3000);
  const n1 = await p.$$eval('.side .win', (x) => x.map((w) => w.querySelector('.win-title strong')?.textContent).join('|'));
  check('side windows can be rebuilt without going empty', n1.length > 0 && n1 !== n0);
  await p.click('.brand');
  await p.waitForTimeout(1500);
  let thread = await p.$('.post .thread .morereplies button');
  for (let k = 0; k < 16 && !thread; k++) { await p.mouse.wheel(0, 1400); await p.waitForTimeout(600); thread = await p.$('.post .thread .morereplies button'); }
  if (thread) {
    await thread.scrollIntoViewIfNeeded();
    const before = await thread.evaluate((btn) => btn.closest('.topreplies').querySelectorAll(':scope > .topreply').length);
    await thread.click();
    await p.waitForTimeout(1500);
    const after = await p.$$eval('.post .thread .topreplies', (x) => Math.max(...x.map((y) => y.querySelectorAll(':scope > .topreply').length)));
    check('threads load more replies', after > before, `${before} -> ${after}`);
    await p.screenshot({ path: `${out}/02-thread.png` });
  } else check('thread more-replies button exists', false);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/03-tuner.png` });
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' || '));
  console.log(results.join('\n'));
  await b.close();
})().catch((e) => { console.log(results.join('\n')); console.error('E2E crashed:', e.message); process.exit(1); });
