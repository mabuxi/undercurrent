import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { log } from '../log.js';

// Grabs real frames from a video with ffmpeg (when it is installed), so the vision model sees what actually
// happens across the clip instead of a single poster image.

const CANDIDATES = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'];
let ffmpegPath;

export function ffmpeg() {
  if (ffmpegPath !== undefined) return ffmpegPath;
  ffmpegPath = CANDIDATES.find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } }) || null;
  if (!ffmpegPath) log('info', 'ffmpeg not found: video tagging uses thumbnails only');
  return ffmpegPath;
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

function grab(url, at, { referer, timeoutMs = 25000 } = {}) {
  return new Promise((resolve) => {
    const bin = ffmpeg();
    if (!bin) return resolve(null);
    const headers = `User-Agent: ${UA}\r\n${referer ? `Referer: ${referer}\r\n` : ''}`;
    const args = ['-hide_banner', '-loglevel', 'error', '-headers', headers, '-ss', String(Math.max(0, at)), '-i', url, '-frames:v', '1', '-vf', 'scale=512:-2', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '5', 'pipe:1'];
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks = [];
    let size = 0;
    const timer = setTimeout(() => { p.kill('SIGKILL'); }, timeoutMs);
    p.stdout.on('data', (c) => { size += c.length; if (size < 4 * 1024 * 1024) chunks.push(c); });
    p.on('close', () => {
      clearTimeout(timer);
      const buf = Buffer.concat(chunks);
      resolve(buf.length > 2000 ? buf.toString('base64') : null);
    });
    p.on('error', () => { clearTimeout(timer); resolve(null); });
  });
}

export async function videoFrames(url, duration, { count = 4, referer } = {}) {
  if (!url || !ffmpeg()) return [];
  const d = Number(duration) > 1 ? Number(duration) : 20;
  const points = count >= 4 ? [0.12, 0.38, 0.62, 0.86] : count === 3 ? [0.2, 0.5, 0.8] : [0.3, 0.7];
  const out = [];
  for (const p of points.slice(0, count)) {
    const f = await grab(url, d * p, { referer });
    if (f) out.push(f);
    else if (!out.length) break;
  }
  return out;
}

// Makes an image small enough for the vision model (about 512 pixels wide), which keeps each picture to a few hundred tokens.
export function shrinkImage(base64, width = 512) {
  return new Promise((resolve) => {
    const bin = ffmpeg();
    if (!bin || !base64) return resolve(base64);
    const p = spawn(bin, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-frames:v', '1', '-vf', `scale='min(${width},iw)':-2`, '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '5', 'pipe:1'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks = [];
    const timer = setTimeout(() => p.kill('SIGKILL'), 15000);
    p.stdout.on('data', (c) => chunks.push(c));
    p.on('close', () => { clearTimeout(timer); const buf = Buffer.concat(chunks); resolve(buf.length > 1000 ? buf.toString('base64') : base64); });
    p.on('error', () => { clearTimeout(timer); resolve(base64); });
    p.stdin.on('error', () => {});
    p.stdin.end(Buffer.from(base64, 'base64'));
  });
}
