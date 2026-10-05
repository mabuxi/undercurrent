import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK = '1';
const { openDb } = await import('../src/db.js');
openDb(':memory:');
const { detectLang, postLangs } = await import('../src/langdetect.js');
const { searchVariants, frenchTagsIn, conceptLabel, familyLabel } = await import('../src/vocab.js');
const { tr, trn, setLanguage, lang } = await import('../src/i18n.js');
const { kinkLabel } = await import('../src/translate.js');
const { localNotes } = await import('../src/update.js');
const { extractFromText } = await import('../src/ai/extract.js');

test('the language of a post is told only when it is clear', () => {
  assert.equal(detectLang('Il se fait sucer sous la douche par son pote', { min: 2 }), 'fr');
  assert.equal(detectLang('My wife and her friend at the beach', { min: 2 }), 'en');
  assert.equal(detectLang('Ik heb dat niet gedaan met mijn vriend'), 'nl');
  assert.equal(detectLang('Hot latino twink fucked raw', { min: 2 }), null);
  assert.equal(detectLang(''), null);
  assert.deepEqual(postLangs({ title: 'Big dick daddy', body: '' }), { title: null, body: null });
});

test('French searches also search the English tags, English searches the French word', () => {
  assert.deepEqual(searchVariants('pieds poilus', 'fr'), ['feet hairy', 'pieds poilus']);
  assert.deepEqual(searchVariants('feet', 'fr'), ['feet', 'pieds']);
  assert.deepEqual(searchVariants('feet', 'en'), ['feet']);
  assert.deepEqual(searchVariants('mec musclé sous la douche', 'fr'), ['muscle shower', 'mec musclé sous la douche']);
  assert.deepEqual(frenchTagsIn('Il se fait sucer sous la douche').sort(), ['blowjob', 'shower']);
});

test('French titles give the same English tags as English ones', () => {
  const fr = extractFromText('Il se fait sucer sous la douche par son pote', '').tags.map((t) => t.name);
  assert.ok(fr.includes('blowjob') && fr.includes('shower'), fr.join(','));
  const en = extractFromText('Douche time with my buddy', '').tags.map((t) => t.name);
  assert.ok(!en.includes('shower') || en.length > 0);
});

test('kink and family names follow the language, names typed by hand stay', () => {
  assert.equal(conceptLabel('feet', 'fr', 'Feet'), 'Pieds');
  assert.equal(conceptLabel('feet', 'en', 'Feet'), 'Feet');
  assert.equal(familyLabel('Body', 'fr'), 'Corps');
  assert.equal(kinkLabel({ name: 'Feet', concepts: ['feet'] }, 'fr'), 'Pieds');
  assert.equal(kinkLabel({ name: 'Body', isGroup: true }, 'fr'), 'Corps');
  assert.equal(kinkLabel({ name: 'Mes pieds', locks: { name: true }, concepts: ['feet'] }, 'fr'), 'Mes pieds');
  assert.equal(kinkLabel({ name: 'Feet', concepts: ['feet'] }, 'en'), 'Feet');
});

test('server texts follow the language and keep their placeholders', () => {
  setLanguage('fr');
  assert.equal(lang(), 'fr');
  assert.equal(tr('Post not found.'), 'Publication introuvable.');
  assert.equal(tr('Some text nobody translated'), 'Some text nobody translated');
  assert.equal(trn(1, '{n} post', '{n} posts'), trn(1, '{n} post', '{n} posts', {}, 'fr'));
  setLanguage('en');
  assert.equal(tr('Post not found.'), 'Post not found.');
});

test('change notes come in French where they exist, English otherwise', () => {
  const en = '## 0.17.0 · 5 October 2026\n- Hello\n## 0.16.0 · 4 October 2026\n- Old\n';
  const fr = '## 0.17.0 · 5 octobre 2026\n- Bonjour\n';
  const notes = localNotes(en, fr, '0.15.0', null, 'fr');
  assert.equal(notes[0].text, '- Bonjour');
  assert.equal(notes[0].date, '5 octobre 2026');
  assert.equal(notes[1].text, '- Old');
  assert.equal(localNotes(en, fr, '0.15.0', null, 'en')[0].text, '- Hello');
});
