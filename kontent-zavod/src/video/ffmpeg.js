import fs from 'node:fs';
import { spawn } from 'node:child_process';

export async function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try { return (await import('ffmpeg-static')).default || 'ffmpeg'; } catch { return 'ffmpeg'; }
}

// ffmpeg'ni ishga tushiradi; stderr matnini qaytaradi (xato bo'lsa — throw)
export async function ffmpeg(args, { allowFail = false } = {}) {
  const bin = await ffmpegPath();
  return new Promise((resolve, reject) => {
    const p = spawn(bin, ['-hide_banner', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', c => { err += c; });
    p.on('error', reject);
    p.on('close', code => (code === 0 || allowFail) ? resolve(err) : reject(new Error(`ffmpeg: ${err.trim().split('\n').slice(-3).join(' ')}`)));
  });
}

// Audio/video davomiyligi (soniya)
export async function mediaDuration(file) {
  const out = await ffmpeg(['-i', file], { allowFail: true });
  const m = out.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) throw new Error('Davomiylik aniqlanmadi');
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

// Telegram bot 50 MB dan katta faylni yubora olmaydi: katta video 720p ga siqiladi (fayl o'rnida almashtiriladi)
export const TG_MAX_MB = 48;
export async function telegramgaSigdir(file, { maxMB = TG_MAX_MB } = {}) {
  if (fs.statSync(file).size <= maxMB * 1024 * 1024) return file;
  const tmp = file.replace(/\.mp4$/i, '') + '.kichik.mp4';
  for (const crf of [26, 30, 34]) {
    await ffmpeg(['-y', '-i', file, '-vf', 'scale=720:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf),
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', tmp]);
    if (fs.statSync(tmp).size <= maxMB * 1024 * 1024) { fs.renameSync(tmp, file); return file; }
  }
  fs.rmSync(tmp, { force: true });
  throw new Error(`video ${maxMB} MB dan katta — Telegram qabul qilmaydi, qisqaroq video so'rang`);
}
