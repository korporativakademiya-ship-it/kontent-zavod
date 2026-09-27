import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

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

export async function routeLocalAssets(page) {
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

// Shablon sahifani ma'lumot bilan ochadi (video va karusel uchun umumiy)
export async function openTemplate(template, data, viewport) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
    await routeLocalAssets(page);
    await page.addInitScript(d => { window.__DATA__ = d; }, data);
    await page.goto('file://' + template, { waitUntil: 'networkidle', timeout: 60e3 });
    return { browser, page };
  } catch (e) {
    await browser.close();
    throw e;
  }
}
