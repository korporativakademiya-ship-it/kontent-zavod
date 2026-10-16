import fs from 'node:fs';
import path from 'node:path';
import { cfg } from './config.js';
import { store } from './store.js';

// Eski qoralamalar va ularning fayllari (video, ovoz, rasm, slaydlar) — volume to'lib qolmasin.
// Faqat DATA_DIR ichidagi yo'llar o'chiriladi.
const ildiz = path.resolve(cfg.dataDir);
const ichidami = (p) => { const r = path.resolve(p); return r.startsWith(ildiz + path.sep); };

export function qoralamaFayllari(d) {
  const id = String(d.id || '');
  if (!/^[a-z0-9]+$/i.test(id)) return [];
  return [
    d.video_path, d.audio_path, ...(d.image_paths || []), ...(d.slide_paths || []),
    path.join(cfg.dataDir, 'images', id), path.join(cfg.dataDir, 'slides', id), path.join(cfg.dataDir, 'n8n', id),
    path.join(cfg.dataDir, 'videos', id), path.join(cfg.dataDir, 'videos', `${id}.mp4`), path.join(cfg.dataDir, 'videos', `${id}.silent.mp4`),
    path.join(cfg.dataDir, 'audio', `${id}.mp3`), path.join(cfg.dataDir, 'audio', `${id}.ogg`),
  ].filter(p => p && ichidami(p));
}

// Qaytaradi: { qoralama: chiqarilganlar soni, fayl: o'chirilgan yo'llar soni }
export function tozala(now = Date.now()) {
  const ketdi = store.tozala(now);
  let fayl = 0;
  for (const d of ketdi) {
    for (const p of qoralamaFayllari(d)) {
      if (!fs.existsSync(p)) continue;
      try { fs.rmSync(p, { recursive: true, force: true }); fayl++; } catch { /* keyingi safar */ }
    }
  }
  return { qoralama: ketdi.length, fayl };
}
