import core from './core.js';
import settings from './settings.js';
import feed from './feed.js';
import post from './post.js';
import map from './map.js';
import r18 from './r18.js';
import r19 from './r19.js';
import r20 from './r20.js';
import r201 from './r201.js';
import r203 from './r203.js';
import r220 from './r220.js';
import r230 from './r230.js';

// Every part of the interface has its own file of French texts; they are merged here.
const fr = Object.assign({}, core, settings, feed, post, map, r18, r19, r20, r201, r203, r220, r230);
export default fr;
