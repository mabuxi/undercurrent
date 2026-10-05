import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Every text the interface or the server shows goes through t()/tn() (web) or tr()/trn() (server), and every one of
// them has a French version with the same {placeholders}. No dashes as punctuation in either language.

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

function files(dir, skip) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (skip.some((s) => p.includes(s))) continue;
    if (e.isDirectory()) out.push(...files(p, skip)); else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

function unquote(q, s) {
  if (q === '`') return s;
  try { return JSON.parse(`"${s.replace(/\\'/g, "'").replace(/(^|[^\\])"/g, '$1\\"')}"`); } catch { return s; }
}

const STR = String.raw`(['"\x60])((?:\\.|(?!\1)[^\\])*)\1`;
function keysIn(text, fn, plural) {
  const keys = [];
  const one = new RegExp(String.raw`(?<![\w.$])${fn}\(\s*${STR}\s*[,)]`, 'g');
  for (const m of text.matchAll(one)) if (!(m[1] === '`' && m[2].includes('${'))) keys.push(unquote(m[1], m[2]));
  const many = new RegExp(String.raw`(?<![\w.$])${plural}\([^,()]+(?:\([^()]*\))?[^,()]*,\s*${STR}\s*,\s*${STR.replace('\\1', '\\3')}`, 'g');
  for (const m of text.matchAll(many)) { keys.push(unquote(m[1], m[2])); keys.push(unquote(m[3], m[4])); }
  return keys;
}

const holes = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const DASH = /[–—]/;

async function check(label, dir, skip, fn, plural, dictPath) {
  const dict = (await import(pathToFileURL(dictPath).href)).default;
  const missing = new Map();
  let count = 0;
  for (const f of files(dir, skip)) {
    const text = fs.readFileSync(f, 'utf8');
    for (const k of keysIn(text, fn, plural)) {
      count++;
      if (!(k in dict)) missing.set(k, path.relative(root, f));
    }
  }
  const wrongHoles = Object.entries(dict).filter(([k, v]) => holes(k) !== holes(v)).map(([k]) => k);
  const dashes = Object.entries(dict).filter(([k, v]) => DASH.test(k) || DASH.test(v)).map(([k]) => k);
  const empty = Object.entries(dict).filter(([, v]) => typeof v !== 'string' || !v.trim()).map(([k]) => k);
  return { label, count, missing: [...missing].map(([k, f]) => `${f}: ${JSON.stringify(k)}`), wrongHoles, dashes, empty };
}

test('every interface text has a French version', async () => {
  const r = await check('web', path.join(root, 'web', 'src'), [`${path.sep}i18n`], 't', 'tn', path.join(root, 'web', 'src', 'i18n', 'fr', 'index.js'));
  assert.deepEqual(r.missing, [], `Missing French for ${r.missing.length} interface texts`);
  assert.deepEqual(r.wrongHoles, [], 'French texts with other {placeholders} than the English');
  assert.deepEqual(r.dashes, [], 'Texts with a dash as punctuation');
  assert.deepEqual(r.empty, []);
  assert.ok(r.count > 10);
});

test('every server text has a French version', async () => {
  const r = await check('server', path.join(root, 'server', 'src'), [`${path.sep}i18n`], 'tr', 'trn', path.join(root, 'server', 'src', 'i18n', 'fr', 'index.js'));
  assert.deepEqual(r.missing, [], `Missing French for ${r.missing.length} server texts`);
  assert.deepEqual(r.wrongHoles, [], 'French texts with other {placeholders} than the English');
  assert.deepEqual(r.dashes, [], 'Texts with a dash as punctuation');
  assert.deepEqual(r.empty, []);
});
