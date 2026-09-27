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
