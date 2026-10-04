const CLUSTERS = [
  ['lingerie', 'teasing', 'slow build', 'eye contact', 'soft lighting'],
  ['outdoor', 'amateur', 'couple', 'romantic', 'sunset'],
  ['roleplay', 'dominant', 'praise', 'story driven', 'power exchange'],
  ['cosplay', 'solo', 'costume', 'playful', 'fantasy setting'],
  ['massage', 'shower', 'sensual', 'couple', 'oil'],
  ['confession', 'first time', 'story driven', 'romantic', 'nervous']
];
const COMMUNITIES = ['r/mock_velvet', 'r/mock_outdoors', 'r/mock_stories', 'r/mock_cosplay', 'r/mock_sensual', 'r/mock_confessions'];
const AUTHORS = ['velvet_orbit21', 'quiet_harbor55', 'amber_tide12', 'lunar_moth77', 'north_atlas30', 'copper_lark48', 'silk_echo19', 'ember_reed64'];
const TITLES = {
  long: ['The full version', 'Long one today', 'Collab with a friend, full cut', 'Finally finished this one'],
  short: ['Quick one before bed', 'Short and sweet', 'Trying something different', 'Loop of the week'],
  gif: ['Made this into a loop', 'One more loop', 'Loop from the new set'],
  image: ['First time posting here', 'Throwback to an older post', 'Felt good about this one'],
  set: ['New set, feedback welcome', 'Full set from the weekend', 'Your requests, round two'],
  story: ['Part 3 is finally up', 'A long one, grab a drink', 'How it actually happened', 'New series, chapter one'],
  discussion: ['What got you into this?', 'Weekly thread: share your favorites', 'What should I try next?']
};

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const LOREM = 'The evening started slower than either of them expected. There was a long pause at the door, a laugh that broke the tension, and then the kind of conversation that goes on longer than it should. ';

export function mockItems(key, count = 30, offset = 0, provider = 'reddit') {
  const out = [];
  const tube = ['pornhub', 'redtube', 'eporner'].includes(provider);
  const label = { pornhub: 'Pornhub', redtube: 'RedTube', eporner: 'Eporner', redgifs: 'RedGIFs' }[provider];
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  for (let i = 0; i < count; i++) {
    const n = offset + i;
    const r = rng(h + n * 7919);
    const ci = Math.floor(r() * CLUSTERS.length);
    const cl = CLUSTERS[ci];
    const fmt = tube ? 'long' : provider === 'redgifs' ? (r() < 0.6 ? 'short' : 'gif') : ['long', 'short', 'gif', 'image', 'set', 'story', 'discussion'][Math.floor(r() * 7)];
    const tags = cl.filter(() => r() < 0.7);
    if (r() < 0.35) tags.push(CLUSTERS[Math.floor(r() * CLUSTERS.length)][Math.floor(r() * 5)]);
    const author = AUTHORS[Math.floor(r() * AUTHORS.length)];
    const seed = `${h % 9973}-${n}`;
    const base = {
      source: 'reddit', ext_id: `mock${h % 99991}_${n}`, url: `https://www.reddit.com/r/mock/comments/mock${n}`,
      title: TITLES[fmt][Math.floor(r() * TITLES[fmt].length)], body: '', author, community: COMMUNITIES[ci],
      flair: r() < 0.3 ? 'OC' : null, format: fmt, score: Math.round(10 ** (1.2 + r() * 3)), comments: Math.round(r() * 300),
      created_utc: Math.round(Date.now() / 1000 - r() * 86400 * 5), nsfw: 1, tags
    };
    if (tube) {
      base.source = provider;
      base.community = label;
      base.author = r() < 0.5 ? 'Mock Performer' : null;
      base.ext_id = `${provider}${h % 99991}_${n}`;
      const performers = r() < 0.5 ? ['Mock Performer'] : [];
      const duration = r() < 0.2 ? 60 + r() * 100 : 600 + r() * 2400;
      out.push({ ...base, author: null, format: duration > 180 ? 'long' : 'short', duration, performers, media: { kind: 'embed', embed: `/api/mock/embed?seed=${seed}`, poster: `/api/mock/img/${seed}.svg?w=640&h=360`, thumbs: [0, 1, 2, 3, 4].map((j) => `/api/mock/img/${seed}-t${j}.svg?w=640&h=360`), provider: label, rating: Math.round(60 + r() * 38), votes: Math.round(r() * 5000), views: Math.round(r() * 900000), performers } });
      continue;
    }
    if (provider === 'redgifs') { base.source = 'redgifs'; base.community = 'RedGIFs'; base.ext_id = `rg${h % 99991}_${n}`; }
    if (provider === 'lemmy') { base.source = 'lemmy'; base.community = ['gonewildstories@lemmit.online', 'nsfw@lemmynsfw.com'][n % 2]; base.ext_id = `lm${h % 99991}_${n}`; base.url = `https://lemmynsfw.com/post/${n}`; }
    if (fmt === 'long') out.push({ ...base, width: 640, height: 360, duration: 900 + r() * 1800, media: { kind: 'video', src: '/api/mock/video/landscape.webm', poster: `/api/mock/img/${seed}.svg?w=640&h=360`, hasAudio: true } });
    else if (fmt === 'short') {
      const redg = r() < 0.5;
      out.push({ ...base, width: 360, height: 640, duration: 8 + r() * 50, media: redg ? { kind: 'redgifs', redgifsId: `mock${seed}`, poster: `/api/mock/img/${seed}.svg?w=360&h=640`, hasAudio: false } : { kind: 'video', src: '/api/mock/video/vertical.webm', poster: `/api/mock/img/${seed}.svg?w=360&h=640`, hasAudio: false } });
    } else if (fmt === 'gif') out.push({ ...base, width: 480, height: 360, duration: 4, media: { kind: 'video', src: '/api/mock/video/vertical.webm', poster: `/api/mock/img/${seed}.svg?w=480&h=360`, hasAudio: false, loop: true } });
    else if (fmt === 'image') out.push({ ...base, width: 800, height: 1000, media: { kind: 'image', src: `/api/mock/img/${seed}.svg?w=800&h=1000`, mid: `/api/mock/img/${seed}.svg?w=800&h=1000` } });
    else if (fmt === 'set') {
      const k = 3 + Math.floor(r() * 6);
      out.push({ ...base, width: 800, height: 1000, media: { kind: 'gallery', items: Array.from({ length: k }, (_, j) => ({ type: 'image', src: `/api/mock/img/${seed}-${j}.svg?w=800&h=1000`, mid: `/api/mock/img/${seed}-${j}.svg?w=800&h=1000`, w: 800, h: 1000 })) } });
    } else {
      const words = fmt === 'story' ? 500 + Math.floor(r() * 4000) : 60 + Math.floor(r() * 200);
      const body = LOREM.repeat(Math.max(1, Math.round(words / 45)));
      out.push({ ...base, body, media: { kind: 'text', words, readMin: Math.max(1, Math.round(words / 230)) } });
    }
  }
  return out;
}

export function mockSvg(seed, w = 640, h = 400) {
  let x = 0;
  for (const c of seed) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  const hues = [350, 265, 165, 35, 215, 305];
  const a = hues[x % hues.length];
  const b = hues[(x >> 4) % hues.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><radialGradient id="g1" cx="25%" cy="20%" r="80%"><stop offset="0" stop-color="hsl(${a},55%,62%)"/><stop offset="1" stop-color="hsl(${a},30%,14%)" stop-opacity="0"/></radialGradient><radialGradient id="g2" cx="85%" cy="90%" r="70%"><stop offset="0" stop-color="hsl(${b},45%,50%)"/><stop offset="1" stop-color="hsl(${b},30%,12%)" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="#1d1622"/><rect width="100%" height="100%" fill="url(#g1)"/><rect width="100%" height="100%" fill="url(#g2)"/></svg>`;
}
