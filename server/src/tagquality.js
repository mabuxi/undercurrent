import { normalizeTag } from './db.js';

// Which tags are worth building kinks, searches and chips from. Tags in other scripts (Arabic titles from tube
// sites), site names, "nsfw" style labels and vague words (colours, "clear", "casual") describe nothing about a taste.

const LATIN_ONLY = /^(?:\P{L}|\p{Script=Latin})+$/u;

const META = new Set([
  'nsfw', 'sfw', 'porn', 'porno', 'pornography', 'xxx', 'sex', 'sexy', 'hot', 'nude', 'nudes', 'nudity', 'naked', 'adult', 'erotic', 'erotica',
  'redgif', 'redgifs', 'red gifs', 'reddit', 'pornhub', 'redtube', 'eporner', 'xvideos', 'xnxx', 'xnxxx', 'xhamster', 'youporn', 'spankbang', 'lemmy', 'bluesky', 'onlyfans', 'only fans', 'fansly', 'manyvids', 'chaturbate',
  'hd', '4k', '1080p', '720p', 'full hd', 'uhd', 'vr', 'video', 'videos', 'clip', 'clips', 'short', 'long', 'gif', 'gifs', 'image', 'images', 'photo', 'photos', 'pic', 'pics', 'picture', 'set', 'album', 'gallery', 'story', 'thread', 'discussion', 'discussion thread', 'post', 'posts', 'selfie', 'mirror selfie',
  'pornstar', 'porn star', 'professional', 'professional porn', 'verified', 'verified amateurs', 'verified models', 'verified amateur', 'model', 'models', 'creator', 'creator content', 'content', 'exclusive', 'new', 'best', 'popular', 'trending', 'top', 'favorite', 'favorites', 'fan favorite', 'fan favorites', 'loyal fans', 'premium', 'free', 'full video', 'full movie', 'scene', 'compilation', 'part 1', 'part 2', 'oc', 'original content',
  'next time', 'first time ever', 'volunteer', 'stream', 'streaming', 'live', 'webcam show', 'band', 'barely', 'casual', 'clear', 'textured', 'torso', 'handheld', 'green', 'blue', 'red', 'black and white', 'white', 'pink', 'purple', 'yellow', 'orange', 'grey', 'gray', 'brown', 'color', 'colour', 'indoor', 'indoors', 'outdoor lighting', 'daylight', 'natural light', 'bright', 'dark', 'lighting', 'camera', 'front view', 'side view', 'close', 'slow', 'fast', 'fucking', 'fuck', 'fucked', 'sexual', 'intimate', 'action', 'moment', 'body', 'person', 'people', 'man', 'woman', 'men', 'women', 'guy', 'girl', 'male', 'female', 'someone', 'you re so big', 'you-re-so-big', 'next'
]);

export function cleanName(name) {
  return normalizeTag(String(name || '').replace(/[-_]+/g, ' '));
}

export function isLatin(name) {
  return LATIN_ONLY.test(String(name || '').trim());
}

// Good enough to tag a post with (ingestion): only the script check and obvious site labels.
export function postTagOk(name) {
  const n = cleanName(name);
  if (!n || n.length < 2 || n.length > 40) return false;
  if (!isLatin(n)) return false;
  return !/^(xnxx+|xvideos|xhamster|pornhub|redtube|eporner|redgifs?|nsfw|hd|4k|1080p|720p)$/.test(n);
}

// Good enough to become (part of) a kink or a search chip.
export function kinkableTag(name) {
  const n = cleanName(name);
  if (!postTagOk(n)) return false;
  if (META.has(n)) return false;
  if (/^\d+$/.test(n) && n !== '69') return false;
  if (/\b(com|net|org|tv)\b/.test(n)) return false;
  return true;
}

const SPECIAL = { '18 25': 'Young adults (18 to 25)', bj: 'Blowjob', pov: 'POV', bbc: 'BBC', bwc: 'BWC', bbw: 'BBW', milf: 'MILF', dilf: 'DILF', joi: 'JOI', cei: 'CEI', asmr: 'ASMR', dp: 'Double penetration', '69': '69', closeup: 'Close-up', 'close up': 'Close-up' };

// How a tag reads as a name: "massive-cock" becomes "Massive Cock".
export function displayTag(name) {
  const n = cleanName(name);
  if (SPECIAL[n]) return SPECIAL[n];
  const c = n.replace(/\b(you|we|they) re\b/g, "$1're").replace(/\bi m\b/g, "i'm").replace(/\b(don|can|won|isn|doesn|didn) t\b/g, "$1't");
  return c.replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}

const SAME = { dick: 'cock', penis: 'cock', dicks: 'cock', cocks: 'cock', boobs: 'tits', breasts: 'tits', titties: 'tits', butt: 'ass', booty: 'ass', cumming: 'cum', jizz: 'cum', bj: 'blowjob', jerk: 'masturb', jerking: 'masturb', wank: 'masturb', wanking: 'masturb', stroking: 'masturb' };
const stem = (w) => {
  const x = SAME[w] || w;
  let y = x.replace(/(ating|ation|ings|ing|ions|ion|ed|es|s)$/, '');
  if (y.length > 3 && /(.)\1$/.test(y)) y = y.slice(0, -1);
  return SAME[y] || (y.length >= 3 ? y : x);
};

// For spotting duplicates: "Closeup" and "Close Up", "Masturbating" and "Masturbation", "Big Dick" and "Big Cock".
export function compactName(name) {
  return String(name || '').toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').split(/\s+/).filter((w) => w && w !== 'off').map(stem).join('');
}

const FILLER = new Set(['and', 'the', 'of', 'with', 'in', 'on', 'a', 'an', 'for', 'to', 'play', 'sex', 'lovers', 'love', 'fans', 'fan', 'focus', 'vibes', 'style', 'action', 'scenes', 'scene', 'content', 'moments', 'time', 'fun', 'worship', 'porn']);

// Does a kink name only say what its tags say? Every real word in the name must appear in one of the tags
// (a shared start of 4 letters is enough: "curvy" and "curves").
export function nameFitsTags(name, tags) {
  const words = cleanName(name).split(' ').filter((w) => w.length > 2 && !FILLER.has(w));
  if (!words.length) return false;
  const tagWords = tags.flatMap((t) => cleanName(t).split(' ')).filter(Boolean);
  const hit = (w) => tagWords.some((t) => t === w || (w.length >= 4 && t.length >= 4 && (t.startsWith(w.slice(0, 4)) || w.startsWith(t.slice(0, 4)))));
  return words.every(hit);
}
