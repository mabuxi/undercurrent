import fs from 'node:fs';
import { config } from '../server/src/config.js';
import { openDb } from '../server/src/db.js';
import { rebuildProfile } from '../server/src/profile.js';

const drop = (process.argv.find((a) => a.startsWith('--drop-session=')) || '').split('=')[1] || null;
const backup = `${config.dbPath}.backup-${Date.now()}`;
const db = openDb();
db.pragma('wal_checkpoint(TRUNCATE)');
fs.copyFileSync(config.dbPath, backup);
console.log(`Backup: ${backup}`);
console.log(rebuildProfile({ dropSession: drop }));
