// Names of people in a post, and matching names with typos.

export function lev(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// Does a text mention this name, allowing a typo or two ("tobrinz" finds "Tobinz")?
export function mentions(text, name) {
  const t = String(text || '').toLowerCase();
  const nm = String(name || '').toLowerCase().trim();
  if (!nm) return false;
  const flat = nm.replace(/\s+/g, '');
  if (t.includes(nm) || t.replace(/[\s_.-]+/g, '').includes(flat)) return true;
  if (flat.length < 5) return false;
  const max = flat.length >= 8 ? 2 : 1;
  return t.split(/[^a-z0-9]+/).some((w) => Math.abs(w.length - flat.length) <= max && lev(w, flat) <= max);
}

// A clean personal name: two to four words of plain letters ("drew sebastian"), nothing garbled.
export const NAME_RE = /^[a-z][a-z'.-]*(?: [a-z][a-z'.-]*){1,3}$/;
export function cleanPersonName(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const FIRST = new Set(`aaron adam adrian aiden aj alan alex alexa alexis alice alina allie amber amy andre andrea andrew andy angel angela angelo anna anissa ashley aubrey audrey austin ava avery bailey bella ben benjamin blake bo bobby brad brandi brandon brent brett brian brittany brittney brody brooke bruce bryan bryce caleb cameron carlos carmen carter casey chad chanel charlie chase chloe chris christian christy cindy cody cole colby collin connor cory craig cristian dakota dale dallas damian damon dan dani daniel danny darren dave david dean derek devin diego dillon dominic donnie drew dustin dylan eddie elena eli elijah elisa ella emily emma eric erik ethan eva evan evelyn felix finn francesco frank gabriel gavin george gia gina grace grant greg hailey haley hannah harley harper harry hayden heather hector henry holly hunter ian isaac isabella ivan jack jackson jacob jade jake james jamie jared jason jasper jay jayden jen jenna jennifer jeremy jesse jessica jessie jett jimmy joe joel john johnny jon jonah jordan jose joseph josh joshua julia julian justin kai kaden kara karlee kate katie kayla keiran keith kelly ken kendra kenny kevin kian kiara kimber kyle lana lance landon lara laura lauren layla leah lena leo leon levi lexi liam lily logan lola lorenzo luca lucas lucy luis luke luna mac madison maia malik manuel marco marcus maria mark marko martin mason matt matthew max maya megan melissa mia michael michelle mick miguel mike mila miles mira misty mitch molly nadia nate nathan nicholas nick nico nicole nikki noah noel nolan oliver olivia omar oscar owen paige parker patrick paul peter peyton pierce preston quinn rachel rafael randy raven reagan reed reese rhett ricky riley river rob robert rocco roman rory ross ruby rudy ryan sadie sam samantha sammy sara sarah sasha scott sean sebastian seth shane shawn sienna simon skye sofia sophia sophie spencer stella stephen steve summer sydney tanner tara taylor ted theo thomas tim timothy toby todd tom tommy tony travis trent trenton trevor troy ty tyler valentina vanessa vic victor vince violet wade wes will william wyatt xander zac zach zack zak zane zoe`.split(/\s+/));

const NOT_NAME = new Set(`and with in on of the a an to for by from at his her their my your big huge thick hard hot sexy wild rough deep fucks fucked fucking takes gets got gives riding rides bareback raw breeds breeding pounds pounded eats sucks sucking strokes stroking jerks cums cumming loves meets finds teaching teaches first time part compilation best new full scene video hd official gay straight bi trans men man guys boys girls women daddy daddies stepdad stepson stepbro stepsister stepmom bro bros twink twinks jock jocks bear bears hunk hunks muscle stud studs cock dick ass butt hole anal oral blowjob blowjobs facial cum load creampie threesome orgy`.split(/\s+/));

// Names written in a title or description, like "Drew Sebastian" or "PIERCE PARIS". A name needs a common first name
// followed by a word that is not a porn word, so "Huge Cock" or "Bondage Bros" are never taken for people.
export function namesIn(text, { isTag = () => false } = {}) {
  const src = String(text || '').replace(/[’]/g, "'");
  const words = src.split(/[^A-Za-z'.-]+/).map((w) => w.replace(/^'+|'+$/g, '').replace(/'s$/i, '')).filter(Boolean);
  const out = new Set();
  const cap = (w) => /^[A-Z][a-z'.-]+$/.test(w) || /^[A-Z][A-Z'.-]+$/.test(w);
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i];
    const b = words[i + 1];
    if (!cap(a) || !cap(b)) continue;
    const fa = a.toLowerCase();
    const fb = b.toLowerCase().replace(/\.$/, '');
    if (!FIRST.has(fa) || NOT_NAME.has(fb) || FIRST.has(fb) && NOT_NAME.has(fa) || fb.length < 2 || isTag(fb)) continue;
    out.add(`${fa} ${fb}`);
    i++;
  }
  return [...out].filter((n) => NAME_RE.test(n));
}

// One-word names and usernames in phrases like "watch tobinz going crazy", "with @someone", "ft. Name":
// taken only when the word is no tag, no porn word and no ordinary first name on its own.
const CUE = /\b(?:watch(?:ing)?|with|featuring|feat\.?|ft\.?|starring|by|meet|and|&|x)\s+(@?)([A-Za-z][A-Za-z0-9_.-]{2,24})\b/gi;
const COMMON = new Set('me you him her them us it this that my his your our their some more a the an his all every one two three four five his hot sexy big huge young old new my friend friends bf gf bro bros daddy dad buddy mom step roommate neighbor boss teacher coach doctor stranger guy guys girl girls man men woman women boy boys couple wife husband boyfriend girlfriend partner cum cock dick ass me myself sound music audio headphones'.split(' '));
export function handlesIn(text, { isWord = () => false, isKnown = () => false } = {}) {
  const out = new Set();
  const words = String(text || '').split(/\s+/).filter((x) => /^[A-Za-z]/.test(x));
  const titleCase = words.length >= 4 && words.filter((x) => /^[A-Z]/.test(x)).length / words.length >= 0.7;
  for (const m of String(text || '').matchAll(CUE)) {
    const w = m[2].replace(/[.-]+$/, '');
    const low = w.toLowerCase();
    if (low.length < 3 || COMMON.has(low) || NOT_NAME.has(low) || isWord(low)) continue;
    if (FIRST.has(low) && !isKnown(low)) continue;
    // A username look (digits, underscores, camelCase, an @), a capitalised word, or a name already known here.
    const looks = m[1] === '@' || /\d|_/.test(w) || /[a-z][A-Z]/.test(w) || (!titleCase && /^[A-Z][a-z]+$/.test(w)) || isKnown(low);
    if (looks) out.add(w);
  }
  return [...out];
}
