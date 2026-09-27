import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openTemplate } from './page.js';

const TEMPLATE = fileURLToPath(new URL('./carousel.html', import.meta.url));

// Karusel slaydlarini 1080×1350 PNG qilib saqlaydi, fayl yo'llarini qaytaradi
export async function renderSlides(data, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const { browser, page } = await openTemplate(TEMPLATE, data, { width: 540, height: 675 });
  try {
    const n = await page.evaluate(() => window.__ready);
    if (!n) throw new Error("Karuselda slayd yo'q");
    const files = [];
    for (let i = 0; i < n; i++) {
      await page.evaluate(k => window.__show(k), i);
      const file = path.join(outDir, `${String(i + 1).padStart(2, '0')}.png`);
      await page.screenshot({ path: file, type: 'png' });
      files.push(file);
    }
    return files;
  } finally {
    await browser.close();
  }
}
