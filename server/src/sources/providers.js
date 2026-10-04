import { getSetting, setSetting } from '../db.js';
import * as redgifs from './redgifs.js';
import * as booru from './booru.js';
import * as reddit from './reddit.js';
import { pornhub, redtube, eporner } from './tubes.js';
import * as lemmy from './lemmy.js';
import * as bluesky from './bluesky.js';
import * as rss from './redditRss.js';
import { lustSearch, lustUrl, merge, LUST_SITES } from './lustpress.js';

export const SORTS = ['hot', 'week', 'month', 'new'];

// Sources with more than one way in use all of them: the official API, and the scraper server when one is set.
async function both(site, value, page, official) {
  const [a, b] = await Promise.all([official().catch(() => []), lustUrl() ? lustSearch(site, value, page).catch(() => []) : []]);
  return merge(a, b);
}
const RG_ORDER = { hot: 'trending', week: 'top7', month: 'top28', new: 'latest' };

export const PROVIDERS = {
  redgifs: {
    label: 'RedGIFs', about: 'Short-form clips and GIFs with detailed tags and creators you can follow. Plays directly in the feed.',
    formats: ['short', 'gif'], keys: [], can: { trending: true, search: true, creator: true, community: true }, defaultOn: true,
    async fetch({ mode, value, page = 1, sort = 'hot' }) {
      if (mode === 'creator') return (await redgifs.byUser(value, 40)).map(redgifs.normalizeGif);
      if (mode === 'community') return (await redgifs.nicheGifs(value, { order: sort === 'new' ? 'latest' : sort === 'hot' ? '' : 'top', page })).map((g) => ({ ...redgifs.normalizeGif(g), community: value }));
      if (mode === 'search') return (await redgifs.search({ tag: value, order: RG_ORDER[sort] || 'trending', count: 40, page })).map(redgifs.normalizeGif);
      return (await redgifs.search({ order: RG_ORDER[sort] || 'trending', count: 60, page })).map(redgifs.normalizeGif);
    }
  },
  pornhub: {
    label: 'Pornhub', about: 'The biggest catalogue of long-form videos, with tags, categories and performers. Plays in Pornhub’s own player.',
    formats: ['long', 'short'], keys: [], can: { trending: true, search: true, creator: true, performers: true }, defaultOn: true,
    async fetch({ mode, value, page = 1, sort = 'hot' }) {
      if (mode === 'creator') return pornhub.list({ star: value, order: sort === 'new' ? 'new' : 'top', page });
      if (mode === 'search' || mode === 'name') return both('pornhub', value, page, () => pornhub.list({ query: value, order: mode === 'name' ? 'all' : sort === 'hot' ? 'week' : sort, page }));
      return pornhub.list({ order: sort, page });
    }
  },
  redtube: {
    label: 'RedTube', about: 'Long-form videos from the same network as Pornhub, often different picks. Plays in RedTube’s player.',
    formats: ['long', 'short'], keys: [], can: { trending: true, search: true, creator: true, performers: true }, defaultOn: false,
    async fetch({ mode, value, page = 1, sort = 'hot' }) {
      if (mode === 'creator') return redtube.list({ star: value, order: sort === 'new' ? 'new' : 'top', page });
      if (mode === 'search' || mode === 'name') return both('redtube', value, page, () => redtube.list({ query: value, order: mode === 'name' ? 'all' : sort, page }));
      return redtube.list({ order: sort, page });
    }
  },
  eporner: {
    label: 'Eporner', about: 'Long-form HD videos with keyword tags and a fast, open API. Plays in Eporner’s player.',
    formats: ['long'], keys: [], can: { trending: true, search: true, creator: false }, defaultOn: true,
    async fetch({ mode, value, page = 1, sort = 'hot' }) {
      if (mode === 'search' || mode === 'name') return both('eporner', value, page, () => eporner.list({ query: value, order: mode === 'name' ? 'all' : sort, page }));
      return eporner.list({ order: sort, page });
    }
  },
  lemmy: {
    label: 'Lemmy', about: 'An open, Reddit-style network: personal posts, image sets, videos, stories and real comment threads. Follow communities like gonewildstories@lemmit.online.',
    formats: ['image', 'set', 'short', 'gif', 'story', 'discussion'], keys: [], can: { trending: true, search: true, creator: true, community: true, comments: true }, defaultOn: true,
    async fetch({ mode, value, page = 1, sort = 'hot' }) {
      if (mode === 'community') return lemmy.posts({ community: value, sort, page });
      if (mode === 'creator') return lemmy.byUser(value);
      if (mode === 'search') return (await lemmy.search(value, { page, sort: sort === 'hot' ? 'month' : sort })).filter((x) => x.nsfw);
      return (await lemmy.posts({ sort: sort === 'hot' ? 'day' : sort, page })).filter((x) => x.nsfw);
    }
  },
  bluesky: {
    label: 'Bluesky', about: 'Follow creators and models who post on Bluesky and see their photos and videos here. Add them by handle, like name.bsky.social.',
    formats: ['image', 'set', 'short'], keys: [], can: { trending: false, search: false, creator: true }, defaultOn: true,
    async fetch({ mode, value }) {
      if (mode === 'creator') return bluesky.authorFeed(value);
      return [];
    }
  },
  rule34: {
    label: 'Rule34', about: 'Drawn and animated content with very detailed tags. Needs a free account for the API key.',
    formats: ['image', 'gif', 'short'], keys: ['userId', 'apiKey'], can: { trending: true, search: true, creator: false }, defaultOn: false,
    async fetch({ mode, value }) {
      const q = mode === 'search' ? value.replace(/\s+/g, '_').replace(/,_?/g, ' ') : 'sort:score';
      return (await booru.fetchPosts('rule34', q, { limit: 60 })).map((p) => booru.normalizeBooru('rule34', p));
    }
  },
  gelbooru: {
    label: 'Gelbooru', about: 'Another large tagged board, mostly drawn. Needs a free account for the API key.',
    formats: ['image', 'gif'], keys: ['userId', 'apiKey'], can: { trending: true, search: true, creator: false }, defaultOn: false,
    async fetch({ mode, value }) {
      const q = mode === 'search' ? value.replace(/\s+/g, '_').replace(/,_?/g, ' ') : 'sort:score';
      return (await booru.fetchPosts('gelbooru', q, { limit: 60 })).map((p) => booru.normalizeBooru('gelbooru', p));
    }
  },
  xvideos: {
    label: 'XVideos', about: 'A huge catalogue of long and short videos. Read through your scraper server (Settings), plays in the XVideos player.',
    formats: ['long', 'short'], keys: [], needs: 'lustpress', can: { trending: false, search: true, creator: false }, defaultOn: true,
    async fetch({ mode, value, page = 1 }) {
      if (mode === 'search' || mode === 'name') return lustSearch('xvideos', value, page);
      return [];
    }
  },
  xnxx: {
    label: 'XNXX', about: 'Large catalogue from the same network as XVideos. Read through your scraper server (Settings), plays in the XNXX player.',
    formats: ['long', 'short'], keys: [], needs: 'lustpress', can: { trending: false, search: true, creator: false }, defaultOn: true,
    async fetch({ mode, value, page = 1 }) {
      if (mode === 'search' || mode === 'name') return lustSearch('xnxx', value, page);
      return [];
    }
  },
  xhamster: {
    label: 'xHamster', about: 'Big mix of amateur and professional videos. Read through your scraper server (Settings), plays in the xHamster player.',
    formats: ['long', 'short'], keys: [], needs: 'lustpress', can: { trending: false, search: true, creator: false }, defaultOn: true,
    async fetch({ mode, value, page = 1 }) {
      if (mode === 'search' || mode === 'name') return lustSearch('xhamster', value, page);
      return [];
    }
  },
  youporn: {
    label: 'YouPorn', about: 'Pornhub network site with its own picks. Read through your scraper server (Settings), plays in the YouPorn player.',
    formats: ['long', 'short'], keys: [], needs: 'lustpress', can: { trending: false, search: true, creator: false }, defaultOn: true,
    async fetch({ mode, value, page = 1 }) {
      if (mode === 'search' || mode === 'name') return lustSearch('youporn', value, page);
      return [];
    }
  },
  txxx: {
    label: 'TXXX', about: 'Large tube site with many categories. Read through your scraper server (Settings), plays in the TXXX player.',
    formats: ['long', 'short'], keys: [], needs: 'lustpress', can: { trending: false, search: true, creator: false }, defaultOn: true,
    async fetch({ mode, value, page = 1 }) {
      if (mode === 'search' || mode === 'name') return lustSearch('txxx', value, page);
      return [];
    }
  },
  reddit: {
    label: 'Reddit', about: 'Follow subreddits and Reddit users through Reddit’s public RSS feeds, no API keys needed. Images, videos, RedGIFs links and text posts. Reddit allows about one feed request per minute; add your private feed key below to go faster and get search.',
    formats: ['image', 'set', 'short', 'gif', 'story', 'discussion'], keys: [], can: { trending: false, search: true, creator: true, community: true, comments: true }, defaultOn: true,
    async fetch({ mode, value, sort = 'hot' }) {
      if (reddit.redditConfigured()) {
        if (mode === 'creator') return (await reddit.listing(`u/${value}`, 'new', 50)).map(reddit.normalizePost).filter(Boolean);
        if (mode === 'community' || mode === 'subreddit') return (await reddit.listing(value, sort === 'new' ? 'new' : sort === 'hot' ? 'hot' : 'top', 50, sort === 'month' ? 'month' : 'week')).map(reddit.normalizePost).filter(Boolean);
      }
      if (mode === 'creator') return rss.user(value);
      if (mode === 'community' || mode === 'subreddit') return rss.subreddit(value, sort);
      if (mode === 'search') return rss.search(value, sort, { maxWaitMs: 15000 });
      return [];
    }
  }
};

export function providerState() {
  const s = getSetting('providers', {}) || {};
  const out = {};
  for (const [id, p] of Object.entries(PROVIDERS)) {
    const cur = s[id] || {};
    let enabled = cur.enabled ?? p.defaultOn;
    if ((id === 'rule34' || id === 'gelbooru') && !booru.booruCreds(id)?.apiKey) enabled = false;
    if (p.needs === 'lustpress' && !lustUrl()) enabled = false;
    out[id] = { ...cur, enabled };
  }
  return out;
}

export function setProvider(id, patch) {
  const s = getSetting('providers', {}) || {};
  s[id] = { ...(s[id] || {}), ...patch };
  setSetting('providers', s);
}

export function hasKeys(id) {
  if (id === 'rule34' || id === 'gelbooru') return !!booru.booruCreds(id)?.apiKey;
  if (PROVIDERS[id]?.needs === 'lustpress') return !!lustUrl();
  return true;
}
