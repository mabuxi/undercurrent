import core from './core.js';
import settings from './settings.js';
import feed from './feed.js';
import post from './post.js';
import map from './map.js';

// Every part of the interface has its own file of French texts; they are merged here.
const fr = Object.assign({}, core, settings, feed, post, map);
export default fr;
