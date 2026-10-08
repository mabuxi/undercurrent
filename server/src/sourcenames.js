// Names of the sources themselves. Posts from a tube site have no uploader and carry the site's name as their
// community, so these are never treated as a creator or a community you like.
const NAMES = new Set(['pornhub', 'redtube', 'eporner', 'xvideos', 'xnxx', 'xhamster', 'youporn', 'txxx', 'redgifs', 'reddit', 'bluesky', 'lemmy', 'rule34', 'gelbooru', 'spankbang', 'danbooru', 'e621', 'mock']);
export const isSourceName = (name) => NAMES.has(String(name || '').trim().toLowerCase().replace(/^r\//, '').replace(/\s+/g, ''));
