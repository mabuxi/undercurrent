const { chromium } = require('playwright');
const out = process.env.OUT || '/tmp/uc6';
const base = process.env.BASE || 'http://127.0.0.1:4317/';
require('fs').mkdirSync(out, { recursive: true });

const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); };
const api = async (p, path, body) => p.evaluate(async ([u, b]) => (await fetch(`/api${u}`, b ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) } : undefined)).json(), [path, body]);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_TUNNEL|net::ERR|Failed to load resource/.test(m.text())) errs.push(`console: ${m.text()}`); });
  await p.goto(base);
  await p.waitForSelector('.post', { timeout: 20000 });
  await p.waitForTimeout(2000);

  // Scoring order
  const hist = await api(p, '/history?limit=50');
  const scored = hist.items.filter((x) => x.counts.save || x.counts.rate);
  const watchedOnly = hist.items.filter((x) => (x.counts.complete || x.counts.progress) && !x.counts.up && !x.counts.save && !x.counts.rate);
  check('history hides trivial items (every row has a real interaction)', hist.items.every((x) => Object.keys(x.counts).some((k) => !['impression', 'dwell', 'progress', 'play'].includes(k)) || x.dwellMs >= 6000), `${hist.items.length} rows`);
  check('history rows carry a score', hist.items.every((x) => typeof x.score === 'number'));
  check('saves and heat outscore plain watching', !watchedOnly.length || Math.min(...scored.map((x) => x.score)) > Math.max(...watchedOnly.map((x) => x.score)), `${scored.map((x) => x.score).join(',')} vs ${watchedOnly.map((x) => x.score).join(',')}`);

  // Feed: collections, threads with replies
  let coll = await p.$('.post .collnote');
  let thread = await p.$('.post .thread .topreplies');
  for (let k = 0; k < 14 && (!coll || !thread); k++) { await p.mouse.wheel(0, 1400); await p.waitForTimeout(700); coll = coll || await p.$('.post .collnote'); thread = thread || await p.$('.post .thread .topreplies'); }
  check('image collections show one big image and smaller ones', !!coll && !!(await p.$('.gallery .gtile.big')));
  if (coll) { await coll.scrollIntoViewIfNeeded().catch(() => {}); await p.waitForTimeout(500); await p.screenshot({ path: `${out}/01-collection.png` }); }
  check('threads show their top replies in the feed', !!thread);
  if (thread) { await thread.scrollIntoViewIfNeeded().catch(() => {}); await p.waitForTimeout(400); await p.screenshot({ path: `${out}/02-thread.png` }); }
  const vids = await p.$$eval('.media.natural', (x) => x.length);
  check('playing videos use their real aspect ratio', vids > 0, `${vids}`);

  // Side windows
  const seen = new Map();
  for (let i = 0; i < 16; i++) {
    await p.mouse.wheel(0, 1300);
    await p.waitForTimeout(500);
  }
  const titles = await p.$$eval('.side .win', (ws) => ws.map((w) => ({ t: w.querySelector('.win-title strong')?.textContent, m: w.querySelector('.win-title span')?.textContent, cls: ['hotthread', 'combo', 'scenario', 'scoreboard', 'riserow', 'readbadge', 'mapgroup', 'linkrow', 'newestline', 'wmatch', 'ratebig', 'pts'].filter((c) => w.querySelector(`.${c}`)) })));
  for (const w of titles) for (const c of w.cls) seen.set(c, (seen.get(c) || 0) + 1);
  check('no window title is missing or undefined', titles.every((w) => w.t && !/undefined/i.test(w.t)), titles.filter((w) => !w.t || /undefined/i.test(w.t)).map((w) => w.m).join('|'));
  check('hot thread window shows statement and replies', seen.has('hotthread'), [...seen.keys()].join(','));
  check('stories window shows read time', seen.has('readbadge') || !titles.some((w) => w.t === 'Keep reading'));
  check('match bars in windows', seen.has('wmatch'));
  const lately = titles.filter((w) => w.t === 'Lately vs all time').length;
  check('lately vs all time no longer dominates', lately <= 2, `${lately} of ${titles.length}`);
  await p.screenshot({ path: `${out}/03-side.png` });

  const sugg = await api(p, '/suggestions?kind=fantasy');
  check('fantasy suggestions are specific and confident', sugg.suggestions.length > 0 && sugg.suggestions.every((s) => s.confidence >= 75 && s.body.split(' ').length >= 6), sugg.suggestions.map((s) => `${s.confidence}: ${s.body}`).join(' | '));
  const combos = await api(p, '/suggestions?kind=combo');
  check('kink combos have a match score', combos.suggestions.length > 0 && combos.suggestions.every((s) => s.confidence >= 50 && s.confidence < 98), combos.suggestions.map((s) => `${s.title} ${s.confidence}`).join(' | '));
  const map = await api(p, '/map');
  const scores = map.pairs.map((x) => x.score);
  check('pairs are strict, not all 98%', scores.length && new Set(scores).size > 1 && Math.max(...scores) < 98, scores.join(','));

  // Memory
  await p.fill('#askIn', 'stop showing me anime');
  await p.press('#askIn', 'Enter');
  await p.waitForSelector('.hello-sum.answer', { timeout: 30000 }).catch(() => {});
  await p.waitForFunction(() => !document.querySelector('.sbar .spin'), null, { timeout: 30000 }).catch(() => {});
  const o = await p.textContent('.hello-sum');
  check('"stop showing" becomes a hard limit and a memory', /hard limit/i.test(o) && /memory/i.test(o), o);
  const lim = await api(p, '/limits');
  check('the limit is stored', lim.limits.includes('anime'), lim.limits.join(','));
  await p.fill('#askIn', 'search latex boots');
  await p.press('#askIn', 'Enter');
  await p.waitForTimeout(1500);
  const mem = await api(p, '/memory');
  const all = mem.groups.flatMap((g) => g.items.map((m) => m.content));
  check('searches do not become memory', !all.some((m) => /latex boots/i.test(m)), all.slice(0, 6).join(' | '));
  check('"stop showing" memory saved', all.some((m) => /never show anime/i.test(m)));
  await p.click('button[aria-label="Memory"]').catch(() => {});
  await p.waitForTimeout(1200);
  const log = await p.$$eval('.promptlog .prow', (x) => x.map((y) => y.textContent));
  check('prompt log lists searches separately', log.some((l) => /latex boots/.test(l) && /search/.test(l)), `${log.length} rows`);
  await p.screenshot({ path: `${out}/04-memory.png`, fullPage: false });

  // Map
  await p.click('button[aria-label="Your map"]');
  await p.waitForTimeout(3500);
  await p.screenshot({ path: `${out}/05-map.png` });
  const row = await p.$('.map-grid .bars .barrow[role=button]');
  if (row) {
    await row.click();
    await p.waitForTimeout(2000);
    const btns = await p.$$eval('.braindetail button', (x) => x.map((y) => y.textContent));
    check('map node offers deeper, branch out and surprise journeys', ['Dive deeper', 'Branch out', 'Surprise me, same family'].every((t) => btns.some((b) => b.includes(t))), btns.join('|'));
  }
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(800);
  const chips = await p.$$eval('.histrow .evtype', (x) => x.map((y) => y.textContent));
  check('history has no "seen" chips', !chips.some((c) => /^seen/.test(c)), chips.slice(0, 8).join(','));
  check('history shows watched to the end and rewatches', chips.some((c) => /watched to the end/.test(c)) && chips.some((c) => /rewatched/.test(c)));
  check('score badges in history', (await p.$$('.histrow .scorebadge')).length > 0);
  await p.screenshot({ path: `${out}/06-history.png` });
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' || '));
  console.log(results.join('\n'));
  await b.close();
})().catch((e) => { console.log(results.join('\n')); console.error('E2E crashed:', e.message); process.exit(1); });
