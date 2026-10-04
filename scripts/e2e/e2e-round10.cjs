const { chromium } = require('playwright');
const out = process.env.OUT || '/tmp/uc10';
const base = process.env.BASE || 'http://127.0.0.1:4317/';
require('fs').mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); };

async function search(p, text) {
  const ab = await (await p.$('#askIn')).boundingBox();
  await p.mouse.click(ab.x + 30, ab.y + ab.height / 2);
  await p.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await p.keyboard.type(text, { delay: 15 });
  await p.keyboard.press('Enter');
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  await p.goto(base);
  await p.waitForSelector('.post', { timeout: 20000 });
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `${out}/01-top.png` });

  const sumStyle = await p.$eval('.hello-sum', (e) => { const c = getComputedStyle(e); return { style: c.fontStyle, size: parseFloat(c.fontSize) }; });
  check('the summary is in the italic serif at answer size', sumStyle.style === 'italic' && sumStyle.size >= 18, JSON.stringify(sumStyle));
  const moodPos = await p.$eval('.moodcards', (e) => getComputedStyle(e.closest('.tline')).position);
  check('the mood row is not sticky over the posts anymore', moodPos !== 'sticky', moodPos);
  check('the brain button for deep thinking is in the search bar', !!(await p.$('.sbar .deepbtn')));

  await search(p, 'woman with big tits');
  await p.waitForSelector('.sb-now', { timeout: 5000 }).catch(() => {});
  const nowTxt = await p.$eval('.sb-now', (e) => e.textContent).catch(() => '');
  check('a running step shows inside the search bar', !!nowTxt, nowTxt);
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/02-searching.png` });
  await p.waitForFunction(() => !document.querySelector('.sbar .spin'), null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const steps = await p.$$eval('.sb-steps .act', (x) => x.map((y) => y.textContent));
  check('every step is listed: reading, similar tags, each source', steps.some((s) => /Reading/.test(s)) && steps.some((s) => /similar tags/i.test(s)) && steps.some((s) => /Searching Pornhub/.test(s)), steps.join(' | '));
  const chips = await p.$$eval('.sb-chips .schip', (x) => x.map((y) => `${y.className}:${y.textContent}`));
  check('gender, tag and lighter synonym chips appear', chips.some((c) => /schip-gender/.test(c)) && chips.some((c) => /schip-tag.*big tits/i.test(c)) && chips.some((c) => /schip-syn/.test(c)), chips.join(' | '));
  const crumbs = await p.$$eval('.crumb', (c) => c.map((x) => x.textContent));
  check('the feed shows the search, not a tag filter on the whole sentence', crumbs.some((c) => /Search: woman with big tits/.test(c)) && !crumbs.some((c) => c === 'woman with big tits'), crumbs.join('|'));
  const n = (await p.$$('.feed .post')).length;
  check('search results are in the feed', n > 0, `${n}`);
  const ans = await p.$eval('.hello-sum', (e) => e.textContent);
  check('the answer replaces the summary', /Showing|posts/.test(ans), ans.slice(0, 120));
  await p.screenshot({ path: `${out}/03-results.png` });

  const synBefore = chips.filter((c) => /schip-syn/.test(c)).length;
  const x = await p.$('.sb-chips .schip-syn button');
  if (x) { await x.click(); await p.waitForTimeout(800); }
  const synAfter = (await p.$$('.sb-chips .schip-syn')).length;
  check('a chip can be taken away', synAfter === synBefore - 1, `${synBefore} -> ${synAfter}`);

  await search(p, 'i want to see videos about the profile example');
  await p.waitForFunction(() => !document.querySelector('.sbar .spin'), null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const steps2 = await p.$$eval('.sb-steps .act', (x) => x.map((y) => y.textContent));
  check('a sentence goes to the assistant (thinking step)', steps2.some((s) => /Thinking/.test(s)), steps2.join(' | '));
  const crumbs2 = await p.$$eval('.crumb', (c) => c.map((x) => x.textContent));
  check('the sentence became a search for what it asks, not a tag of the whole sentence', crumbs2.some((c) => /Search:/.test(c)) && !crumbs2.some((c) => /videos about the profile example/.test(c) && !/Search/.test(c)), crumbs2.join('|'));
  const chips2 = await p.$$eval('.sb-chips .schip', (x) => x.map((y) => y.textContent));
  check('only the subject is a tag', chips2.some((c) => /profile example/i.test(c)) && !chips2.some((c) => /i want/i.test(c)), chips2.join(' | '));
  const end = await p.$eval('.sentinel', (e) => e.textContent);
  check('it ends instead of looping forever', !/Checking your sources again/.test(end), end);
  await p.screenshot({ path: `${out}/04-assistant.png` });

  await search(p, 'im looking for content from Mock Performer');
  await p.waitForFunction(() => !document.querySelector('.sbar .spin'), null, { timeout: 40000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const steps3 = await p.$$eval('.sb-steps .act', (x) => x.map((y) => y.textContent));
  check('looking for a person searches their profiles and the name everywhere', steps3.some((s) => /Looking up Mock Performer/.test(s)) && steps3.some((s) => /on the video sites/.test(s)), steps3.join(' | '));
  check('a person card shows who was found', !!(await p.$('.personcard')));
  await p.screenshot({ path: `${out}/05-person.png` });

  const cards = await p.$$('.pcard');
  check('the search shows profiles with follower counts', cards.length >= 2 && /followers|members/.test(await p.$eval('.pgrid', (e) => e.textContent)), `${cards.length}`);
  if (cards.length) {
    await p.click('.pcard .pcard-main');
    await p.waitForTimeout(2500);
    const cr = await p.$$eval('.crumb', (c) => c.map((x) => x.textContent));
    check('clicking a profile shows only their posts', cr.some((c) => /^Only /.test(c)) && (await p.$$('.feed .post')).length > 0, cr.join('|'));
  }
  const clear = await p.$('.btn-clear');
  check('after a search the Search button becomes an X', !!clear);
  if (clear) {
    await clear.click();
    await p.waitForTimeout(1500);
    const v = await p.$eval('#askIn', (e) => e.value);
    const cr2 = await p.$$eval('.crumb', (c) => c.map((x) => x.textContent));
    check('the X clears the field and the tags and goes back to the feed', v === '' && !(await p.$('.sb-chips')) && !cr2.some((c) => /Search:/.test(c)), `${v}|${cr2.join('|')}`);
  }
  const tagBtn = await p.$('.post .chiprow .chip.ghost.link');
  if (tagBtn) {
    const t = (await tagBtn.textContent()).trim();
    await tagBtn.click();
    await p.waitForTimeout(1200);
    const v2 = await p.$eval('#askIn', (e) => e.value);
    check('clicking a tag runs a general search for it', v2 === t, `${t} -> ${v2}`);
    await p.waitForFunction(() => !document.querySelector('.sbar .spin'), null, { timeout: 30000 }).catch(() => {});
  }
  check('names on posts are labelled In this video', (await p.$$eval('.performers .fb-label', (x) => x.map((y) => y.textContent))).every((x) => x === 'In this video'));

  await p.click('.crumb.root');
  await p.waitForTimeout(1500);
  const mb = await p.$('.mutebtn');
  if (mb) {
    const box = await mb.boundingBox();
    check('the sound button is a circle', Math.abs(box.width - box.height) < 2, `${box.width}x${box.height}`);
  } else results.push('SKIP sound button (no playable video in view)');
  const cv = await p.$$eval('.feed > article.post', (x) => x.slice(3, 4).map((y) => getComputedStyle(y).contentVisibility));
  check('posts far below skip rendering until they come close', cv[0] === 'auto' || cv.length === 0, cv.join(','));

  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n'));
  await b.close();
})();
