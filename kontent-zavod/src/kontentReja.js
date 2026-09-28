import { readFileSync } from 'node:fs';

// Tayyor kontent reja: Kotib AI (ka), Qadam AI (qa), Kontent Fabrika (kf) — har biriga 50 ta post.
// Har band: sarlavha (hook), asosiy g'oya, trigger, CTA va noyob havola (t.me/<bot>?start=qa07).
// Mijoz shu havola orqali Kotibim botiga kirsa, CRM'da "manba" = kod bo'ladi — qaysi post
// mijoz olib kelgani ko'rinadi.

const REJA = JSON.parse(readFileSync(new URL('./reja/kontent-reja.json', import.meta.url), 'utf8'));

export const MAHSULOTLAR = { ka: 'Kotib AI', qa: 'Qadam AI', kf: 'Kontent Fabrika' };
const BELGI = { '1': '🔵', '2': '🟢', '3': '🟠', '4': '🟣' };

export const reja = () => REJA;
export const topish = (kod) => REJA.find(r => r.kod === String(kod || '').trim().toLowerCase()) || null;

export function royxat(prefiks = '') {
  const p = String(prefiks || '').trim().toLowerCase();
  return p ? REJA.filter(r => r.kod.startsWith(p)) : REJA;
}

// Telegram xabari uchun qisqa ro'yxat (sahifalab)
export function royxatMatni(prefiks = '', sahifa = 1, hajm = 15) {
  const r = royxat(prefiks);
  if (!r.length) return "Bunday reja yo'q. Prefiks: ka (Kotib AI), qa (Qadam AI), kf (Kontent Fabrika).";
  const jami = Math.ceil(r.length / hajm);
  const s = Math.min(Math.max(1, Number(sahifa) || 1), jami);
  const qator = r.slice((s - 1) * hajm, s * hajm)
    .map(x => `${BELGI[x.bosqich[0]] || '▫️'} <b>${x.kod}</b> · ${x.asl_format} · ${x.sarlavha}`);
  const nom = MAHSULOTLAR[String(prefiks).toLowerCase()] || 'Hammasi';
  return `🗂 Kontent reja — ${nom} (${s}/${jami})\n🔵 qiziqtirish · 🟢 ishontirish · 🟠 sotuv · 🟣 ushlab qolish\n\n${qator.join('\n')}\n\n` +
    `Post yozdirish: /reja_post ${r[0].kod}` + (s < jami ? `\nKeyingi sahifa: /rejalar ${prefiks || ''} ${s + 1}`.replace(/\s+/g, ' ') : '');
}

// Reja bandidan kopirayter uchun reja (produceDraft shu shaklni kutadi)
export function rejaPlan(r, format = null) {
  return {
    title: r.sarlavha,
    angle: r.goya,
    pain: `${r.mahsulot} — ${r.rubrika}`,
    format: format || r.format,
    key_points: [r.goya, `Psixologik trigger: ${r.trigger}`, `Voronka bosqichi: ${r.bosqich}`],
    mahsulot: r.mahsulot,
    cta_goal: 'havola',
    cta_matn: r.cta,
    cta_havola: r.havola,
    reja_kod: r.kod,
  };
}

// G'oyalar bankiga qo'yiladigan matn (haftalik reja shu bankdan birinchi navbatda oladi)
export const goyaMatni = (r) =>
  `[${r.kod}] ${r.mahsulot} · ${r.rubrika} · ${r.asl_format}: ${r.sarlavha} — ${r.goya} Trigger: ${r.trigger}. CTA: ${r.cta} (havola: ${r.havola})`;
