import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const file = path.join(config.dbPath === ':memory:' || !process.env.DB_PATH ? config.dataDir : path.dirname(config.dbPath), 'server.log');
let checked = 0;

function rotate() {
  if (Date.now() - checked < 60000) return;
  checked = Date.now();
  try {
    if (fs.statSync(file).size > 5 * 1024 * 1024) fs.renameSync(file, `${file}.old`);
  } catch {}
}

export function log(level, msg, extra) {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${msg}${extra ? ` ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}\n`;
  if (level === 'error') process.stderr.write(line); else process.stdout.write(line);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    rotate();
    fs.appendFileSync(file, line);
  } catch {}
}

export const logFile = file;
