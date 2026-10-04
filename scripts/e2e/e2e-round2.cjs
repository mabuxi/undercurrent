const { chromium } = require('playwright');
const out = process.env.OUT || '/tmp/uc2';
const base = process.env.BASE || 'http://127.0.0.1:4317/';
require('fs').mkdirSync(out, { recursive: true });

const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_TUNNEL|net::ERR|Failed to load resource/.test(m.text())) errs.push(`console: ${m.text()}`); });
  const popups = [];
  p.context().on('page', (pg) => popups.push(pg.url()));
  await p.goto(base);
  await p.waitForSelector('.post', { timeout: 20000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}/01-top.png` });

  const broken = await p.$$eval('.side img', (imgs) => imgs.filter((i) => i.complete && i.naturalWidth === 0).length);
  check('no broken images in side windows', broken === 0, `${broken} broken`);

  await p.fill('#askIn', 'long form videos');
  await p.press('#askIn', 'Enter');
  await p.waitForFunction(() => !/Working on it/.test(document.querySelector('#askOut').textContent), null, { timeout: 15000 });
  await p.waitForTimeout(1500);
  const askOut = await p.textContent('#askOut');
  const crumbs = await p.$$eval('.crumb', (c) => c.map((x) => x.textContent));
  check('ask bar filters the feed', /long/i.test(askOut), askOut);

  let embedPost = await p.$('.post:has(.provider)');
  for (let k = 0; k < 12 && !embedPost; k++) { await p.mouse.wheel(0, 1200); await p.waitForTimeout(700); embedPost = await p.$('.post:has(.provider)'); }
  check('an embed post exists', !!embedPost);
  if (embedPost) {
    await embedPost.scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
    const media = await embedPost.$('.media');
    const srcA = await embedPost.$eval('.media img', (i) => i.getAttribute('src'));
    await media.hover();
    await p.waitForTimeout(2600);
    const srcB = await embedPost.$eval('.media img', (i) => i.getAttribute('src'));
    check('embed preview cycles', srcA !== srcB, `${srcA} -> ${srcB}`);
    await p.screenshot({ path: `${out}/02-preview.png` });
    await (await embedPost.$('button.play')).click();
    await p.waitForTimeout(800);
    const sb = await embedPost.$eval('iframe', (f) => f.getAttribute('sandbox'));
    check('embed plays sandboxed without popups', sb && !/allow-popups/.test(sb) && /allow-scripts/.test(sb), sb);
    const note = await embedPost.$('.embednote');
    check('fallback note shown', !!note);
    await p.screenshot({ path: `${out}/03-playing.png` });
  }

  await p.click('.brand');
  await p.waitForTimeout(1500);
  const posts = await p.$$('.post');
  const post = posts[1];
  await post.scrollIntoViewIfNeeded();
  const slider = await post.$('.heat input[type=range]');
  await slider.evaluate((el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '3.5'); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(900);
  const heatOn = await post.$eval('.heat', (e) => e.className);
  const size = await post.$eval('.heatflame svg', (e) => e.getBoundingClientRect().width);
  check('heat slider sets heat and grows the flame', /on/.test(heatOn) && size > 25, `${heatOn} ${Math.round(size)}px`);
  const up = await post.$('button[aria-label="I like this"]');
  await up.click();
  await p.waitForTimeout(1800);
  const deeper = await p.$$eval('.deeper', (d) => d.map((x) => x.textContent));
  check('liking inserts a deeper block', deeper.length > 0, deeper[0] || '');
  await p.screenshot({ path: `${out}/04-deeper.png` });

  const tag = await p.$('.post .chip.ghost.link');
  if (tag) {
    const t = (await tag.textContent()).trim();
    await tag.click();
    await p.waitForTimeout(1500);
    const cr = await p.$$eval('.crumb', (c) => c.map((x) => x.textContent));
    check('tag chip filters', cr.some((c) => c.includes(t)), `${t} in ${cr.join('|')}`);
  } else check('tag chip exists', false);

  await p.click('.brand');
  await p.fill('#askIn', 'long form videos');
  await p.press('#askIn', 'Enter');
  await p.waitForTimeout(2500);
  const perf = await p.$('.post .perf');
  if (perf) {
    await perf.scrollIntoViewIfNeeded();
    await perf.click();
    await p.waitForSelector('.post .prof', { timeout: 8000 }).catch(() => {});
    const prof = await p.$('.post .prof');
    check('performer panel opens', !!prof);
    await p.screenshot({ path: `${out}/05-performer.png` });
  } else check('performer button exists', false);

  for (const [cmd, re] of [['block feet', /blocked/i], ['remember I like slow builds', /memory/i], ['create a kink called Velvet with lingerie, teasing', /kink/i], ['follow Mock Performer', /following/i], ['search teasing', /teasing/i]]) {
    await p.fill('#askIn', cmd);
    await p.press('#askIn', 'Enter');
    await p.waitForFunction(() => !/Working on it/.test(document.querySelector('#askOut').textContent), null, { timeout: 15000 });
    const o = await p.textContent('#askOut');
    check(`command: ${cmd}`, re.test(o), o);
  }

  await p.fill('#askIn', 'search romantic sunset');
  await p.press('#askIn', 'Enter');
  await p.waitForTimeout(2500);
  const cr2 = await p.$$eval('.crumb', (c) => c.map((x) => x.textContent));
  check('search shows a removable search chip', cr2.some((c) => /Search: /.test(c)), cr2.join('|'));
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 1500); await p.waitForTimeout(900); }
  const nSearch = await p.$$eval('.post', (x) => x.length);
  check('search keeps loading more (endless)', nSearch > 8, `${nSearch} posts`);

  await p.click('.brand');
  await p.waitForTimeout(1500);
  const post3 = (await p.$$('.post'))[3];
  await post3.scrollIntoViewIfNeeded();
  await (await post3.$('button[aria-label="Ask or tell the assistant about this post"]')).click();
  await (await post3.$('.askrow input')).fill('I liked the eye contact and her freckles');
  await (await post3.$('.askrow button')).click();
  await p.waitForTimeout(1500);
  const ans = await post3.$eval('.answer', (e) => e.textContent).catch(() => '');
  const mine = await post3.$$eval('.chip.mine', (x) => x.map((y) => y.textContent));
  check('liked-because turns into tags', mine.length > 0, `${ans} :: ${mine.join(', ')}`);

  await p.fill('#askIn', 'I like slow teasing');
  await p.press('#askIn', 'Enter');
  await p.waitForTimeout(2000);
  check('"I like X" is saved and acted on', /memory|like/i.test(await p.textContent('#askOut')), await p.textContent('#askOut'));

  await p.click('.brand');
  await p.waitForTimeout(1500);
  const post2 = (await p.$$('.post'))[2];
  await post2.scrollIntoViewIfNeeded();
  await (await post2.$('button[aria-label="Ask or tell the assistant about this post"]')).click();
  await (await post2.$('.askrow input')).fill('save this');
  await (await post2.$('.askrow button')).click();
  await p.waitForTimeout(1500);
  const saved = await post2.$('button[aria-label="Unsave"]');
  check('post ask acts (save this)', !!saved, await post2.$eval('.answer', (e) => e.textContent).catch(() => ''));
  await p.screenshot({ path: `${out}/06-ask.png` });

  for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, 900); await p.waitForTimeout(500); }
  const titles = await p.$$eval('.side .win-title strong', (t) => t.map((x) => x.textContent));
  check('side windows vary', new Set(titles).size >= Math.min(titles.length, 6), titles.join(' | '));
  const broken2 = await p.$$eval('.side img', (imgs) => imgs.filter((i) => i.complete && i.naturalWidth === 0).length);
  check('still no broken images after scroll', broken2 === 0, `${broken2}`);
  await p.screenshot({ path: `${out}/07-scrolled.png` });

  const layouts = await p.$$eval('.side .carousel, .side .hero, .side .mosaic', (x) => x.length);
  check('side windows use carousels, heroes or mosaics', layouts > 0, `${layouts}`);
  const vids = await p.$$eval('video[controls]', (v) => v.length);
  check('playing videos have controls', vids > 0, `${vids}`);
  const top = await p.$eval('header.top', (h) => getComputedStyle(h).position);
  check('header stays on top', top === 'sticky', top);
  await p.click('button[aria-label="Your map"]');
  await p.waitForTimeout(2500);
  check('brain map renders', !!(await p.$('.brainbox canvas')));
  const widgets = await p.$$eval('.map-grid .card2 h3', (x) => x.map((y) => y.textContent));
  check('map keeps lately vs all time, pairs, formats and tag cloud', ['Lately vs all time', 'Pairs that work for you', 'Formats', 'Strongest tags'].every((w) => widgets.includes(w)), widgets.join('|'));
  const hist = await p.$$eval('.histrow', (x) => x.length);
  check('interaction database lists posts', hist > 0, `${hist}`);
  const chips = await p.$$eval('.histrow .evtype', (x) => x.length);
  check('each post shows its interaction types', chips > 0, `${chips}`);
  const row = await p.$('.map-grid .bars .barrow[role=button]');
  if (row) {
    await row.click();
    await p.waitForTimeout(2500);
    check('clicking a kink opens detail widgets', !!(await p.$('.braindetail .bw.ai')));
  }
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(800);
  const box = await p.$eval('.brainbox canvas', (c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  let hovered = false;
  for (let gx = 0.2; gx <= 0.8 && !hovered; gx += 0.06) for (let gy = 0.2; gy <= 0.8 && !hovered; gy += 0.06) {
    await p.mouse.move(box.x + box.w * gx, box.y + box.h * gy);
    hovered = !!(await p.$('.hovercard'));
  }
  check('hovering a node shows its info', hovered);
  await p.screenshot({ path: `${out}/09-map.png`, fullPage: false });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/10-history.png`, fullPage: false });
  check('no popups opened', popups.length === 0, popups.join(','));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' || '));
  console.log(results.join('\n'));
  await b.close();
})().catch((e) => { console.log(results.join('\n')); console.error('E2E crashed:', e.message); process.exit(1); });
