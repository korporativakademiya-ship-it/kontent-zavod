import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openTemplate } from './page.js';
import { cfg } from '../config.js';

const TEMPLATE = fileURLToPath(new URL('./template.html', import.meta.url));

async function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try { return (await import('ffmpeg-static')).default || 'ffmpeg'; } catch { return 'ffmpeg'; }
}

// Shablonni sahna ma'lumoti bilan ochib, kadrma-kadr suratga oladi va MP4 ga yig'adi
export async function renderVideo(data, outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const { browser, page } = await openTemplate(TEMPLATE, data, { width: 540, height: 960 });
  let ff;
  try {
    const duration = await page.evaluate(() => window.__ready);
    if (!duration) throw new Error("Shablonda sahna yo'q");

    const fps = cfg.videoFps;
    ff = spawn(await ffmpegPath(), [
      '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '20',
      '-movflags', '+faststart', outFile
    ], { stdio: ['pipe', 'ignore', 'pipe'] });
    let ffErr = '';
    ff.stderr.on('data', c => { ffErr += c; });
    const done = new Promise((res, rej) => {
      ff.on('error', rej);
      ff.on('close', code => code === 0 ? res() : rej(new Error(`ffmpeg: ${ffErr.trim() || code}`)));
    });

    done.catch(() => {}); // boshqa xatoda ffmpeg o'ldirilsa, "unhandled rejection" bo'lmasin
    ff.stdin.on('error', () => {}); // ffmpeg yiqilsa, xato "done" orqali keladi

    const frames = Math.ceil(duration * fps);
    for (let f = 0; f < frames; f++) {
      await page.evaluate(s => window.__seek(s), f / fps);
      const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
      if (!ff.stdin.write(buf)) await Promise.race([new Promise(r => ff.stdin.once('drain', r)), done]);
    }
    ff.stdin.end();
    await done;
    return { file: outFile, duration };
  } catch (e) {
    ff?.kill('SIGKILL');
    throw e;
  } finally {
    await browser.close();
  }
}
