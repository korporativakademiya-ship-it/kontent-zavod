import path from 'node:path';
import { cfg } from './config.js';
import { muallif, vizual } from './brand.js';
import { joriy } from './mahsulot.js';
import { renderSlides } from './video/slides.js';
import { muqovaMatni } from './agents/kontent.js';

// Kalitsiz rassom: Claude dizayner post mazmunidan bitta kartochka tanlaydi (muqova / raqam / iqtibos),
// karusel shabloni (brend ranglari, 1080×1350) uni PNG qiladi. Gemini kaliti kerak emas.
// Testlar uchun almashtiriladi: ichki.render, ichki.matn
export const ichki = { render: renderSlides, matn: muqovaMatni };

const qisqa = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const KICKER = { maqola: 'Maqola', karusel: 'Karusel', reels: 'Video' };

// Claude javobini shablonga xavfsiz slaydga aylantiradi; yaroqsiz bo'lsa — sarlavhali oddiy muqova
export function muqovaSlayd(j, d) {
  const oddiy = { type: 'cover', kicker: KICKER[d.format] || 'Rahbar uchun', title: qisqa(d.title, 90) };
  if (!j || typeof j !== 'object') return oddiy;
  if (j.type === 'stat') {
    const num = qisqa(j.num, 8);
    const raqam = num.match(/\d+(?:[.,]\d+)?/)?.[0];
    const postda = String(d.post_html || '').replace(/<[^>]+>/g, ' ').includes(raqam);
    // Katta raqam bir qatorga sig'sin (≤ 5 belgi); postda yo'q raqam — o'ylab topilgan statistika, rasmga chiqmaydi
    if (raqam && postda && num.length <= 5 && qisqa(j.label, 30)) return { type: 'stat', num, label: qisqa(j.label, 30), text: qisqa(j.text, 110) };
  }
  if (j.type === 'quote' && qisqa(j.text, 100)) return { type: 'quote', text: qisqa(j.text, 100), by: qisqa(j.by, 40) || muallif() };
  if (qisqa(j.title, 70)) return { type: 'cover', kicker: qisqa(j.kicker, 24) || oddiy.kicker, title: qisqa(j.title, 70), accent: qisqa(j.accent, 40) };
  return oddiy;
}

// Qaytaradi: { file, slayd }. Claude javob bermasa ham sarlavhali muqova chiqadi.
export async function muqovaYasa(d) {
  let j = null;
  try { j = await ichki.matn(d); } catch { /* sarlavhali muqova */ }
  const slayd = muqovaSlayd(j, d);
  const [file] = await ichki.render({ ...vizual(d.mahsulot || joriy()), slides: [slayd] }, path.join(cfg.dataDir, 'images', d.id, `muqova-${Date.now()}`));
  return { file, slayd };
}
