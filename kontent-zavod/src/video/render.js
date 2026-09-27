import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { cfg } from '../config.js';

const TEMPLATE = fileURLToPath(new URL('./template.html', import.meta.url));
const require = createRequire(import.meta.url);
const FONTS = { '@fontsource/unbounded': [500, 800], '@fontsource/onest': [400, 600, 700] };
const FONT_HOST = 'https://local.fonts/';

// Shablon GSAP va Google Fonts'ni CDN'dan oladi. Renderda ularni npm paketlardan beramiz —
// server tashqi CDN'ga bog'liq bo'lmaydi va natija har safar bir xil chiqadi.
function fontCss() {
  let css = '';
  for (const [pkg, weights] of Object.entries(FONTS)) {
    for (const w of weights) {
      css += fs.readFileSync(require.resolve(`${pkg}/${w}.css`), 'utf8')
        .replaceAll('url(./files/', `url(${FONT_HOST}${pkg}/files/`);
    }
  }
  return css;
}

async function routeLocalAssets(page) {
  await page.route('**/gsap.min.js', r => r.fulfill({ path: require.resolve('gsap/dist/gsap.min.js'), contentType: 'text/javascript' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: fontCss(), contentType: 'text/css' }));
  await page.route(FONT_HOST + '**', r => {
    const rel = decodeURIComponent(r.request().url().slice(FONT_HOST.length));
    const [scope, name, , file] = rel.split('/');
    r.fulfill({
      path: path.join(path.dirname(require.resolve(`${scope}/${name}/package.json`)), 'files', path.basename(file)),
      contentType: file.endsWith('.woff2') ? 'font/woff2' : 'font/woff',
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  });
  await page.route('https://fonts.gstatic.com/**', r => r.abort());
}

async function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try { return (await import('ffmpeg-static')).default || 'ffmpeg'; } catch { return 'ffmpeg'; }
}

// Shablonni sahna ma'lumoti bilan ochib, kadrma-kadr suratga oladi va MP4 ga yig'adi
export async function renderVideo(data, outFile) {
  const { chromium } = await import('playwright');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let ff;
  try {
    const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
    await routeLocalAssets(page);
    await page.addInitScript(d => { window.__DATA__ = d; }, data);
    await page.goto('file://' + TEMPLATE, { waitUntil: 'networkidle', timeout: 60e3 });
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
