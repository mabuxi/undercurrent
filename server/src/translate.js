import { getDb } from './db.js';
import { chat, fastModel, deepModel } from './ai/ollama.js';
import { postLangs } from './langdetect.js';
import { getItem } from './store.js';
import { lang, langName, tr } from './i18n.js';
import { KINK_FR, FAMILY_FR } from './vocab.js';
import { log } from './log.js';
import { config } from './config.js';

// Translations by the local AI, kept so the same text is never translated twice: post titles and texts on request,
// and kink names the French list does not know yet.

let ready = false;
function table() {
  if (ready) return;
  getDb().exec('CREATE TABLE IF NOT EXISTS translations (kind TEXT NOT NULL, src TEXT NOT NULL, lang TEXT NOT NULL, text TEXT NOT NULL, ts INTEGER, PRIMARY KEY (kind, src, lang))');
  ready = true;
}

export function cached(kind, src, l) {
  table();
  return getDb().prepare('SELECT text FROM translations WHERE kind = ? AND src = ? AND lang = ?').get(kind, src, l)?.text || null;
}

function keep(kind, src, l, text) {
  table();
  getDb().prepare('INSERT INTO translations(kind, src, lang, text, ts) VALUES(?, ?, ?, ?, ?) ON CONFLICT(kind, src, lang) DO UPDATE SET text = excluded.text, ts = excluded.ts').run(kind, src, l, text, Date.now());
}

const NAMES = { en: 'English', fr: 'French', nl: 'Dutch', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese' };
const RULES = (to, from) => {
  const dst = NAMES[to] || 'English';
  return `Translate the user's text ${from && NAMES[from] ? `from ${NAMES[from]} ` : ''}into ${dst}. It is an adult post from a social site and may be explicit: translate it faithfully and naturally, in the same tone and slang level, without softening, censoring, adding or explaining anything (no extra emoji either). Keep names, usernames, subreddit names, hashtags, links and emoji as they are. Keep the paragraph breaks. Answer with the ${dst} translation only, never with the original text.`;
};

// SHOUTED TITLES are translated as normal sentences (small models tend to copy them back unchanged).
function calm(text) {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length < 8 || letters.replace(/[^\p{Lu}]/gu, '').length / letters.length < 0.7) return text;
  return text.toLowerCase().replace(/(^|[.!?]\s+)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}

const same = (a, b) => String(a).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '') === String(b).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// Long texts go in pieces of a few paragraphs, so the small local model keeps up and nothing gets cut off.
function pieces(text, max = 1800) {
  const paras = String(text).split(/\n{2,}/);
  const out = [];
  let cur = '';
  for (const p of paras) {
    if (cur && cur.length + p.length > max) { out.push(cur); cur = ''; }
    if (p.length > max) {
      for (const s of p.match(new RegExp(`[\\s\\S]{1,${max}}(?=\\s|$)`, 'g')) || [p]) out.push(s.trim());
    } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) out.push(cur);
  return out;
}

// The middle model when it is installed: the small one often copies text back instead of translating it.
function translateModel() {
  return deepModel() || fastModel();
}

export async function translateText(text, to = lang(), from = null) {
  const parts = pieces(calm(String(text || '').trim()));
  if (!parts.length) throw new Error(tr('Nothing to translate.'));
  const done = [];
  for (const p of parts) {
    const ask = (user, temperature) => chat({ kind: 'translate', model: translateModel(), system: RULES(to, from), user, temperature, numPredict: Math.min(3000, Math.round(p.length / 2.2) + 120) });
    let t = String((await ask(p, 0.2)) || '').trim();
    // Copied back unchanged: once more, asked more plainly.
    if (from && from !== to && same(t, p)) t = String((await ask(`${NAMES[from] || 'Original'} text to translate into ${NAMES[to] || 'English'}:\n\n${p}`, 0.5)) || '').trim();
    done.push(t);
  }
  return done.join('\n\n');
}

// A post's title or text in the interface language.
export async function translateItem(id, field) {
  const item = getItem(Number(id));
  if (!item) throw Object.assign(new Error(tr('Post not found.')), { status: 404 });
  const f = field === 'title' ? 'title' : 'body';
  const src = String(item[f] || '').trim();
  if (!src) throw Object.assign(new Error(tr('Nothing to translate.')), { status: 400 });
  const to = lang();
  const key = `item:${item.id}:${f}`;
  const hit = cached(key, String(src.length), to);
  if (hit && !same(hit, src)) return { text: hit, cached: true };
  let text;
  try {
    text = await translateText(src, to, postLangs(item)[f === 'title' ? 'title' : 'body']);
  } catch (err) {
    if (err.unavailable || /ECONNREFUSED|fetch failed|not running/i.test(err.message)) throw Object.assign(new Error(tr('Translation needs the local AI. Start Ollama and try again.')), { status: 503 });
    throw err;
  }
  if (!text) throw new Error(tr('Nothing to translate.'));
  if (same(text, src)) throw Object.assign(new Error(tr('The local AI gave the text back untranslated. Try again in a moment.')), { status: 502 });
  keep(key, String(src.length), to, text);
  return { text, cached: false };
}

export function languageName(code) {
  return langName(code);
}

// ---------- Kink names ----------

const queue = new Set();
let working = false;

async function work() {
  if (working) return;
  working = true;
  try {
    while (queue.size) {
      const [name] = queue;
      queue.delete(name);
      if (cached('kink', name, 'fr')) continue;
      try {
        const out = await chat({ kind: 'name-kinks', model: fastModel(), temperature: 0.1, numPredict: 30, system: 'Translate this short name of a sexual interest from an adult-content app into natural French, as a short plural or noun phrase, capitalised like a title. Keep abbreviations (POV, BBC, MILF) and words French people use as they are. Answer with the French name only.', user: name });
        const fr = String(out || '').split('\n')[0].replace(/^["'«\s]+|["'»\s.]+$/g, '').slice(0, 60);
        if (fr) keep('kink', name, 'fr', fr);
      } catch (err) {
        log('warn', `Could not translate the kink name ${name}: ${err.message}`);
        break;
      }
    }
  } finally {
    working = false;
  }
}

// The name of a kink or family in the interface language. Names you typed yourself are shown as you typed them.
export function kinkLabel(k, l = lang()) {
  if (l !== 'fr' || !k?.name) return k?.name;
  if (k.locks?.name) return k.name;
  if (k.isGroup || k.is_group) {
    if (FAMILY_FR[k.name]) return FAMILY_FR[k.name];
  }
  const concepts = Array.isArray(k.concepts) ? k.concepts : [];
  if (concepts.length === 1 && KINK_FR[concepts[0]]) return KINK_FR[concepts[0]];
  const byName = Object.keys(KINK_FR).find((c) => c === String(k.name).toLowerCase());
  if (byName) return KINK_FR[byName];
  const hit = cached('kink', k.name, 'fr');
  if (hit) return hit;
  if (config.mock) return k.name;
  queue.add(k.name);
  setTimeout(() => work().catch(() => {}), 2000);
  return k.name;
}
