import core from './core.js';
import app from './app.js';
import engine from './engine.js';

// Every part of the server has its own file of French texts; they are merged here.
const fr = Object.assign({}, core, app, engine);
export default fr;
