import { cleanName, kinkableTag, displayTag } from './tagquality.js';

// Tags are messy: "masturbating", "jerk off" and "male masturbation" are one thing, "arab anal" is two things,
// and "big dick" is on half of everything. A concept is the one plain thing behind a group of tags. Kinks are
// built from concepts, so they get plain names, never repeat each other, and only ever hold tags that mean the same.

const SYN = {
  'big cock': ['big dick', 'big cock', 'huge cock', 'huge dick', 'massive cock', 'monster cock', 'thick cock', 'fat cock', 'big penis', 'huge penis', 'long penis', 'large penis', 'thick penis', 'real cock', 'cock too big', 'you re so big', 'hung', 'big dicks', 'hard cocks', 'mouth watering cocks', 'hard cock', 'girthy', 'girth', 'monster', 'big dick gay', 'thick dick', 'long dick', 'big cocks', 'monster dick'],
  bwc: ['bwc', 'big white cock'],
  bbc: ['bbc', 'big black cock'],
  veiny: ['veiny', 'veiny penis', 'veiny cock', 'veins'],
  'huge load': ['huge load', 'big load', 'huge cumshot', 'huge cumshots', 'massive cumshot', 'big cumshot', 'massive load', 'huge cum', 'cum explosion'],
  cumshot: ['cumshot', 'cum shot', 'cumshots', 'cumming', 'ejaculation', 'gay cumming', 'cock cumshot', 'cumshot gay', 'cum', 'orgasm', 'male orgasm', 'real orgasm', 'cum on body'],
  precum: ['precum', 'pre cum', 'precum lovers', 'leaking precum', 'leaking'],
  dripping: ['dripping', 'drip', 'dripping cum', 'cum drip'],
  creampie: ['creampie', 'cum inside', 'cum in pussy', 'cum in ass', 'internal cumshot'],
  facial: ['facial', 'facials', 'cum on face'],
  swallow: ['swallow', 'swallowing', 'cum swallow', 'cum in mouth', 'cum eating'],
  bukkake: ['bukkake'],
  masturbation: ['masturbation', 'masturbating', 'masturbate', 'male masturbation', 'jerk off', 'jerking off', 'jerking', 'stroking', 'wank', 'wanking', 'masturbation gay', 'solo masturbation', 'jack off', 'jacking off'],
  gooning: ['goon', 'gooning', 'gooner'],
  edging: ['edging', 'edge'],
  'ruined orgasm': ['ruined orgasm'],
  solo: ['solo', 'solo male', 'solo males', 'male solo', 'solo male gay', 'solo guy', 'solo man'],
  blowjob: ['blowjob', 'blowjobs', 'bj', 'blowing', 'oral', 'oral sex', 'sucking', 'cock sucking', 'cocksucking', 'fellatio', 'blowjob gay', 'gay blowjob', 'amateur blowjob', 'suck', 'sucking cock'],
  sloppy: ['sloppy blowjob', 'sloppy', 'sloppy head'],
  deepthroat: ['deepthroat', 'deep throat', 'throated', 'gagging', 'throat fuck'],
  'face fucking': ['face fuck', 'face fucking', 'facefuck'],
  'cock worship': ['cock worship', 'worship'],
  anal: ['anal', 'anal sex', 'anal gay', 'gay anal', 'ass fuck', 'anal penetration', 'amateur anal', 'butt fuck'],
  rimming: ['rimming', 'rimjob', 'rim job', 'ass licking', 'eating ass', 'ass eating'],
  fingering: ['fingering', 'anal fingering'],
  toys: ['toys', 'toy', 'dildo', 'sex toy', 'anal insertion', 'fleshlight', 'vibrator', 'butt plug'],
  handjob: ['handjob', 'hand job', 'handjob gay'],
  kissing: ['kissing', 'making out', 'kiss'],
  bareback: ['bareback', 'raw', 'barebacking', 'bareback gay', 'gay bareback', 'no condom'],
  breeding: ['breeding', 'breed', 'bred'],
  doggystyle: ['doggystyle', 'doggy style', 'doggy'],
  missionary: ['missionary'],
  riding: ['riding', 'cowgirl', 'reverse cowgirl', 'cowboy', 'riding cock'],
  muscle: ['muscle', 'muscles', 'muscular', 'muscular men', 'muscular male', 'muscle gay', 'gay muscle', 'muscle hunk', 'hunk', 'hunks', 'hunks gay', 'bodybuilder', 'athletic', 'flexing', 'biceps', 'pecs', 'manly', 'muscle men', 'muscle man'],
  abs: ['abs', 'six pack', 'sixpack', 'defined abs'],
  hairy: ['hairy', 'body hair', 'hairy body', 'hairy man', 'hairy men', 'hairy guy', 'pubic hair', 'hairy gay'],
  'hairy chest': ['hairy chest', 'chest hair'],
  beard: ['beard', 'bearded', 'stubble'],
  smooth: ['smooth', 'shaved', 'hairless'],
  chubby: ['chubby', 'chub', 'chubs', 'dad bod'],
  thighs: ['thighs', 'thick thighs', 'huge thighs', 'thigh', 'muscular thighs', 'hairy thighs'],
  feet: ['feet', 'foot', 'foot fetish', 'toes', 'barefoot', 'soles'],
  armpits: ['armpits', 'armpit', 'pits'],
  tattoo: ['tattoo', 'tattoos', 'tattooed', 'tattooed arm', 'tattooed man', 'inked'],
  piercing: ['piercing', 'piercings', 'pierced'],
  'bubble butt': ['bubble butt'],
  'big balls': ['big balls', 'huge balls', 'hairy balls', 'big nuts'],
  uncut: ['uncut', 'uncut gay', 'foreskin', 'uncircumcised', 'phimosis'],
  cut: ['cut cock', 'circumcised', 'cut dick'],
  twink: ['twink', 'twinks', 'twink 18', 'twink boy', 'twinky'],
  daddy: ['daddy', 'daddies', 'dilf', 'daddy gay', 'dad', 'gay daddy'],
  jock: ['jock', 'jocks', 'jock gay', 'athlete'],
  bear: ['bear', 'bears', 'gay bear', 'cub'],
  femboy: ['femboy', 'femboys'],
  '18 25': ['18 25', 'college 18', 'college 18 1', '18 year cute girl', 'young adult', 'young adults'],
  mature: ['mature', 'older'],
  milf: ['milf', 'hot milf', 'mom', 'mother', 'housewives', 'housewife'],
  trans: ['trans', 'transgender', 'shemale', 'ts'],
  latino: ['latino', 'latina', 'latin', 'latino gay', 'gay latino', 'brazilian', 'mexican', 'colombian', 'hispanic', 'puerto rican', 'latinos'],
  asian: ['asian', 'asian gay', 'japanese', 'chinese', 'korean', 'thai', 'filipino', 'pinay', 'indonesia', 'indonesian', 'vietnamese', 'asians'],
  black: ['black', 'ebony', 'african', 'black men', 'black man', 'black gay'],
  arab: ['arab', 'arabic', 'moroccan', 'middle eastern', 'turkish', 'egyptian', 'arab gay', 'nik arab', 'sex motarjam'],
  indian: ['indian', 'desi'],
  interracial: ['interracial', 'interracial gay'],
  jockstrap: ['jockstrap', 'jock strap', 'jockstraps'],
  underwear: ['underwear', 'briefs', 'grey briefs', 'boxer briefs', 'boxers', 'hanes', 'calvin klein', 'tighty whities', 'speedo'],
  socks: ['socks', 'white socks', 'sock'],
  lingerie: ['lingerie', 'stockings', 'panties'],
  jeans: ['jeans', 'denim'],
  shorts: ['shorts', 'short shorts', 'gym shorts'],
  uniform: ['uniform', 'police uniform', 'military', 'soldier', 'cop'],
  bulge: ['bulge', 'bulges', 'cock bulge'],
  shower: ['shower', 'showering', 'shower sex'],
  public: ['public', 'public sex', 'public gay', 'in public', 'caught in public'],
  outdoor: ['outdoor', 'outdoors', 'outside', 'nature', 'beach', 'forest'],
  office: ['office', 'desk', 'office sex', 'boss'],
  gym: ['gym', 'locker room', 'workout'],
  car: ['car', 'car sex'],
  hotel: ['hotel', 'hotel room'],
  massage: ['massage', 'massage room', 'happy ending'],
  'step family': ['step fantasy', 'stepdad', 'stepmom', 'step mom', 'stepsister', 'step sister', 'stepbro', 'stepbrother', 'stepson', 'step dad', 'taboo', 'step brother'],
  cheating: ['cheating', 'cheat', 'cheater'],
  cuckold: ['cuckold', 'hotwife', 'cuck'],
  roleplay: ['role play', 'roleplay', 'cosplay'],
  caught: ['caught', 'getting caught'],
  'straight guy': ['straight guy', 'straight guys', 'str8', 'first gay'],
  'gay for pay': ['gay for pay', 'gay for fans', 'gay4pay', 'gay 4 pay', 'g4p', 'gfp', 'straight for pay', 'gay for the camera', 'straight guys for pay'],
  lesbian: ['lesbian', 'lesbians', 'lesbian sex', 'girl on girl', 'girls only', 'sapphic', 'wlw', 'lesbo'],
  college: ['college', 'student', 'coed', 'university', 'dorm', 'college girl', 'college guy'],
  'natural tits': ['natural tits', 'natural boobs', 'natural breasts', 'real tits'],
  heels: ['heels', 'high heels', 'stilettos'],
  'yoga pants': ['yoga pants', 'leggings', 'yoga'],
  titfuck: ['titfuck', 'titty fuck', 'tit fuck', 'titjob', 'tit job', 'boobjob', 'boob job', 'paizuri'],
  scissoring: ['scissoring', 'tribbing', 'tribadism'],
  'strap on': ['strap on', 'strapon', 'pegging'],
  facesitting: ['facesitting', 'face sitting', 'queening', 'sit on face'],
  casting: ['casting', 'audition', 'casting couch'],
  'first time': ['first time', 'first time on camera', 'first porn'],
  dominant: ['dominant', 'domination', 'dominant male', 'gay domination', 'dom', 'dominating'],
  submissive: ['submissive', 'sub', 'obedient'],
  rough: ['rough', 'rough sex', 'hard rough sex', 'rough sex gay', 'pounding', 'hard fuck'],
  sensual: ['sensual', 'romantic', 'passionate', 'slow sex', 'lovemaking'],
  'dirty talk': ['dirty talk', 'talking dirty'],
  moaning: ['moaning', 'moans', 'loud moaning'],
  bondage: ['bondage', 'bdsm', 'tied up', 'restraints'],
  'size difference': ['size difference', 'size comparison'],
  teasing: ['teasing', 'tease'],
  piss: ['peeing', 'pissing', 'piss', 'pee', 'urine', 'public pee', 'golden shower'],
  oiled: ['oiled', 'oil', 'oily', 'lube'],
  sweaty: ['sweaty', 'sweat'],
  pov: ['pov', 'pov porn', 'point of view', 'pov blowjob'],
  'close up': ['close up', 'closeup', 'close-up'],
  threesome: ['threesome', '3some', 'mmm', 'mmf', 'ffm', 'mfm'],
  'group sex': ['orgy', 'group sex', 'gangbang', 'group'],
  'double penetration': ['double penetration', 'dp'],
  prostate: ['prostate massage', 'prostate orgasm', 'prostate milking', 'prostate play', 'prostate'],
  hentai: ['hentai'],
  yaoi: ['yaoi', 'gay hentai'],
  bara: ['bara'],
  animated: ['3d', '3d animation', 'animated', 'animation', '2d', 'cartoon'],
  'ai generated': ['ai generated', 'ai art', 'ai generated art'],
  audio: ['gone wild audio', 'gonewildaudio', 'f4m', 'audio', 'asmr'],
  'big ass': ['big ass', 'big butt', 'huge ass', 'big booty', 'pawg', 'thick ass'],
  'big tits': ['big tits', 'big boobs', 'big breasts', 'huge tits', 'huge breasts', 'large breasts', 'big natural tits', 'busty'],
  'small tits': ['small tits', 'small boobs', 'tiny tits'],
  blonde: ['blonde', 'blond', 'blonde hair'],
  redhead: ['redhead', 'red hair', 'ginger'],
  brunette: ['brunette', 'brown hair'],
  petite: ['petite', 'skinny', 'slim', 'tiny'],
  curvy: ['curvy', 'thick'],
  bbw: ['bbw'],
  squirting: ['squirting', 'squirt'],
  'pussy licking': ['pussy licking', 'cunnilingus', 'eating pussy'],
  'cum in mouth': [],
  webcam: ['webcam', 'cam'],
  'size queen': ['size queen'],
  futanari: ['futanari', 'futa'],
  furry: ['furry', 'anthro'],
  femdom: ['femdom']
};

// On almost every post of this kind, or not a thing you can be into: never a kink, whatever the numbers say.
const NOT_KINK = new Set(['big cock', 'cumshot', 'gay', 'straight', 'bisexual', 'gay sex', 'gay porn', 'gayporn', 'male male', 'male only', 'male focus', 'men', 'man', 'male', 'female', '1boy', '2boys', '1girl', '1girls', 'boy', 'girl', 'human', 'human only',
  'cock', 'dick', 'penis', 'erect', 'erect penis', 'erection', 'hard', 'balls', 'ballsack', 'ass', 'butt', 'booty', 'asshole', 'anus', 'chest', 'nipples', 'back', 'legs', 'belly', 'navel', 'waist', 'hands', 'hand', 'face', 'mouth', 'tongue', 'fingers', 'lips', 'hair', 'black hair', 'dark hair', 'short hair', 'long hair', 'pussy', 'tits', 'boobs', 'breasts', 'buttocks', 'shaft', 'head',
  'sex', 'porn', 'video', 'nsfw', 'nude', 'naked', 'nude male', 'naked male', 'completely nude', 'nude female', 'sexy', 'hot', 'horny', 'cute', 'pretty', 'beautiful', 'fun', 'kinky', 'kink', 'fetish', 'fetish gay', 'fantasy', 'erotic', 'pleasure', 'intense', 'hot sex', 'fucking', 'penetration', 'deep penetration', 'vaginal sex', 'hardcore', 'slut', 'cumslut', 'looking pleasured',
  'amateur', 'amateur gay', 'homemade', 'verified amateurs', 'verified amateurs gay', 'verified models', 'original', 'exclusive', 'onlyfans', 'onlyfans creators', 'pornstar', 'pornstar gay', 'reality', 'reality gay', 'real', 'studio', 'compilation', 'uncensored', 'highres', 'hi res', 'tagme', 'set', 'story', 'me', 'what', 'cross', 'sound', 'light', 'room', 'inside', 'indoor', 'bed', 'bedroom', 'sitting', 'standing', 'kneeling', 'holding', 'looking at viewer', 'smile', 'blush', 'blushing', 'casual', 'intimate', 'couple', 'amateur couple', 'real couple', 'friends', 'boyfriend', 'wife', 'celebrity', 'big', 'tight', 'wet', 'fit', 'light skin', 'pale skin', 'dark skin', 'tanned', 'tanned skin', 'light skinned male', 'european', 'british', 'french', 'australian', 'american', 'white', 'stud', 'top', 'bottom', 'vers', 'messy', 'girls finishing the job', 'amateur girls', 'babe', 'young', 'teen', 'teens', 'half undressed', 'clothed', 'shirtless', 'mirror', 'phone', 'bathroom',
  'only', 'bare chest', 'floor', 'couch', 'sofa', 'sheets', 'bed sheets', 'pillow', 'pillows', 'wall', 'beige wall', 'white wall', 'dim lighting', 'lighting', 'window', 'curtain', 'curtains', 'carpet', 'chair', 'table', 'door', 'shirt', 't shirt', 'tshirt', 'hoodie', 'glistening', 'vocal', 'sensitive', 'masked', 'edged', 'milked', 'clean up', 'fleshy', 'puffy', 'wet skin', 'skin', 'milk', 'naked body', 'body', 'skin', 'muscles', 'fabric', 'sleeves', 'towel', 'build', 'pose', 'posing', 'close', 'hairy arms', 'legs spread', 'spread', 'arms', 'arm', 'veins']);

// Words for where things are or what a hand is doing ("hand on cock", "pulled down") describe a frame, not a taste.
const DESCRIPTIVE = /\b(on|in|with|of|at|from|holding|pulled|looking|wearing|showing|lying|sitting|standing|kneeling|visible)\b/;
const COLORS = new Set(['black', 'white', 'grey', 'gray', 'red', 'blue', 'pink', 'green', 'yellow', 'purple', 'brown', 'orange', 'navy', 'dark', 'light']);
const PERSON = new Set(['man', 'men', 'guy', 'guys', 'gay', 'male', 'boy', 'boys', 'stud', 'daddy', 'twink', 'jock', 'hunk', 'muscle', 'cock', 'dick', 'woman', 'women', 'girl', 'girls', 'teen', 'couple']);

const FAMILY_OF = {
  latino: 'ethnicity', asian: 'ethnicity', black: 'ethnicity', arab: 'ethnicity', indian: 'ethnicity', interracial: 'ethnicity',
  muscle: 'body', abs: 'body', hairy: 'body', 'hairy chest': 'body', beard: 'body', smooth: 'body', chubby: 'body', thighs: 'body', feet: 'body', armpits: 'body', tattoo: 'body', piercing: 'body', 'bubble butt': 'body', 'big ass': 'body', 'big tits': 'body', 'small tits': 'body', blonde: 'body', redhead: 'body', brunette: 'body', petite: 'body', curvy: 'body', bbw: 'body',
  uncut: 'cock', cut: 'cock', veiny: 'cock', bwc: 'cock', bbc: 'cock', 'big balls': 'cock',
  twink: 'types', daddy: 'types', jock: 'types', bear: 'types', femboy: 'types', '18 25': 'types', mature: 'types', milf: 'types', trans: 'types', 'straight guy': 'types',
  lesbian: 'types', 'gay for pay': 'types', college: 'types', 'natural tits': 'body', heels: 'clothing', 'yoga pants': 'clothing', titfuck: 'sex', scissoring: 'sex', 'strap on': 'sex', facesitting: 'oral', casting: 'scenarios', 'first time': 'scenarios',
  blowjob: 'oral', sloppy: 'oral', deepthroat: 'oral', 'face fucking': 'oral', 'cock worship': 'oral', rimming: 'oral', 'pussy licking': 'oral', kissing: 'oral',
  anal: 'sex', handjob: 'sex', fingering: 'sex', toys: 'sex', bareback: 'sex', breeding: 'sex', doggystyle: 'sex', missionary: 'sex', riding: 'sex', squirting: 'sex',
  solo: 'solo', masturbation: 'solo', gooning: 'solo', edging: 'solo', 'ruined orgasm': 'solo', prostate: 'solo',
  'huge load': 'cum', precum: 'cum', dripping: 'cum', creampie: 'cum', facial: 'cum', swallow: 'cum', bukkake: 'cum',
  rough: 'dynamic', dominant: 'dynamic', submissive: 'dynamic', sensual: 'dynamic', 'dirty talk': 'dynamic', moaning: 'dynamic', bondage: 'dynamic', femdom: 'dynamic', 'size difference': 'dynamic', teasing: 'dynamic', 'size queen': 'dynamic',
  jockstrap: 'clothing', underwear: 'clothing', socks: 'clothing', lingerie: 'clothing', jeans: 'clothing', shorts: 'clothing', uniform: 'clothing', bulge: 'clothing',
  shower: 'places', public: 'places', outdoor: 'places', office: 'places', gym: 'places', car: 'places', hotel: 'places', massage: 'places',
  'step family': 'scenarios', cheating: 'scenarios', cuckold: 'scenarios', roleplay: 'scenarios', caught: 'scenarios',
  threesome: 'group', 'group sex': 'group', 'double penetration': 'group',
  pov: 'camera', 'close up': 'camera', webcam: 'camera', audio: 'camera',
  piss: 'fluids', oiled: 'fluids', sweaty: 'fluids',
  hentai: 'drawn', yaoi: 'drawn', bara: 'drawn', animated: 'drawn', 'ai generated': 'drawn', futanari: 'drawn', furry: 'drawn'
};

// Plain family names and one colour each: kinks in the same family share its colour, in lighter and darker shades.
export const FAMILIES = {
  ethnicity: { name: 'Ethnicity', color: '#D2A15E' },
  body: { name: 'Body', color: '#7FA7D9' },
  cock: { name: 'Cock', color: '#E07A7A' },
  types: { name: 'Types', color: '#A58FE0' },
  oral: { name: 'Oral', color: '#D98A99' },
  sex: { name: 'Sex', color: '#C98BC4' },
  solo: { name: 'Solo play', color: '#66B5A6' },
  cum: { name: 'Cum', color: '#E8C66B' },
  dynamic: { name: 'Dynamic', color: '#E3A58F' },
  clothing: { name: 'Clothing', color: '#93C47D' },
  places: { name: 'Places', color: '#7FD0C2' },
  scenarios: { name: 'Scenarios', color: '#B7A4E8' },
  group: { name: 'Groups', color: '#F0A060' },
  camera: { name: 'Camera', color: '#9AB0C8' },
  fluids: { name: 'Fluids', color: '#C6B36A' },
  drawn: { name: 'Drawn and animated', color: '#B6A8B0' }
};

const DISPLAY = { '18 25': 'Young adults 18+', bwc: 'BWC', bbc: 'BBC', bbw: 'BBW', milf: 'MILF', pov: 'POV', 'close up': 'Close-up', 'step family': 'Step family', 'ai generated': 'AI generated', 'huge load': 'Huge load', 'big balls': 'Big balls', 'hairy chest': 'Hairy chest', 'dirty talk': 'Dirty talk', 'size difference': 'Size difference', 'group sex': 'Group sex', 'double penetration': 'Double penetration', 'face fucking': 'Face fucking', 'cock worship': 'Cock worship', 'ruined orgasm': 'Ruined orgasm', 'bubble butt': 'Bubble butt', 'straight guy': 'Straight guys', 'gay for pay': 'Gay for pay', 'natural tits': 'Natural tits', 'yoga pants': 'Yoga pants', 'strap on': 'Strap-on', 'first time': 'First time', 'pussy licking': 'Pussy licking', 'big ass': 'Big ass', 'big tits': 'Big tits', 'small tits': 'Small tits', 'size queen': 'Size queen', sloppy: 'Sloppy blowjob', uncut: 'Uncut', cut: 'Cut' };

const VARIANT = new Map();
for (const [concept, list] of Object.entries(SYN)) {
  VARIANT.set(concept, concept);
  for (const v of list) if (!VARIANT.has(v)) VARIANT.set(v, concept);
}

// Prefixes and suffixes that add nothing ("gay", "male", "amateur", "sex") on top of what a tag really says.
const FILLER = /^(?:gay|male|amateur|hot|sexy|real|hd|homemade|verified)\s+|\s+(?:gay|porn|lovers|lover|sex|fetish|guy|guys|man|men|male|boys?)$/;
const FILLER_FIRST = new Set(['big', 'huge', 'hot', 'sexy', 'hard', 'thick', 'tight', 'young', 'hairy', 'muscular', 'massive', 'monster', 'real', 'amateur', 'gay', 'male', 'homemade', 'intense', 'passionate', 'sloppy', 'slow', 'rough', 'public', 'outdoor', 'perfect', 'beautiful', 'cute', 'wet', 'dripping']);
const PREFIXES = ['arab', 'latino', 'latina', 'asian', 'japanese', 'black', 'ebony', 'indian', 'twink', 'daddy', 'jock', 'hairy', 'muscle', 'muscular', 'pov', 'public', 'outdoor', 'shower', 'office', 'gym', 'bareback', 'rough', 'sloppy', 'uncut', 'interracial', 'solo', 'amateur'];

function clean(name) {
  return cleanName(name).replace(/[^a-z0-9' ]+/g, ' ').replace(/'/g, ' ').replace(/\s+/g, ' ').trim();
}

function single(n) {
  if (VARIANT.has(n)) return VARIANT.get(n);
  const noPlural = n.replace(/(?<![su])s$/, '');
  if (noPlural !== n && VARIANT.has(noPlural)) return VARIANT.get(noPlural);
  return null;
}

// The concepts one tag stands for. "Arab anal" is arab and anal, "jerk off" is masturbation, "big dick" is the
// generic big cock concept (which is never a kink), an unknown tag is its own concept.
export function conceptsOf(tag) {
  let n = clean(tag);
  if (!n) return [];
  if (NOT_KINK.has(n)) return [n];
  const hit = single(n);
  if (hit) return [hit];
  const first = n.split(' ')[0];
  // "black shorts" is a colour, not an ethnicity.
  if (COLORS.has(first) && n.includes(' ') && !PERSON.has(n.split(' ').slice(1).join(' '))) {
    const rest = n.split(' ').slice(1).join(' ');
    return [single(rest) || rest];
  }
  let stripped = n;
  for (let i = 0; i < 2; i++) stripped = stripped.replace(FILLER, '').trim();
  if (stripped && stripped !== n) {
    const h = single(stripped);
    if (h) return [h];
    n = stripped;
  }
  const words = n.split(' ');
  if (words.length >= 2) {
    // Two known things glued together: "arab anal", "twink bareback", "pov blowjob".
    for (let cut = 1; cut < words.length; cut++) {
      const a = single(words.slice(0, cut).join(' '));
      const b = single(words.slice(cut).join(' '));
      if (a && b) return a === b ? [a] : [a, b];
      if (a && !b && cut === 1 && PREFIXES.includes(words[0])) return [a];
      if (b && !a && cut === words.length - 1 && FILLER_FIRST.has(words.slice(0, cut).join(' '))) return [b];
    }
  }
  return [n];
}

export function isKinkConcept(c) {
  if (!c || NOT_KINK.has(c)) return false;
  if (!knownConcept(c) && DESCRIPTIVE.test(c)) return false;
  if (c.startsWith('family:')) return false;
  return kinkableTag(c);
}

export function familyOf(c) {
  return FAMILY_OF[c] || null;
}

export function conceptName(c) {
  if (DISPLAY[c]) return DISPLAY[c];
  const d = displayTag(c);
  return d.charAt(0) + d.slice(1).toLowerCase();
}

// Every spelling we know for a concept, for matching posts that use a word nobody here has liked yet.
export function knownVariants(c) {
  return [c, ...(SYN[c] || [])];
}

export function knownConcept(c) {
  return Object.prototype.hasOwnProperty.call(SYN, c);
}
