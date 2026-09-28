import { store } from './store.js';

// Har bir "direkt" CTA'li postga noyob kod so'z: "Direktga KPI deb yozing".
// Lid shu so'z bilan yozsa — Kotibim CRM'da qaysi postdan kelgani ko'rinadi.

const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

// Oxirgi 120 kundagi band kodlar (to'qnashsa raqam qo'shiladi: KPI → KPI2)
export function uniqueCode(wanted, fallback = 'TIZIM') {
  const since = Date.now() - 120 * 864e5;
  const taken = new Set(store.byStatus('published').concat(store.byStatus('approved'), store.byStatus('pending'))
    .filter(d => d.cta_kod && new Date(d.createdAt).getTime() > since).map(d => d.cta_kod));
  let base = norm(wanted);
  if (base.length < 3) base = norm(fallback);
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.has(base.slice(0, 10) + i)) return base.slice(0, 10) + i;
  return base.slice(0, 8) + Date.now().toString(36).slice(-4).toUpperCase();
}

export const ctaRule = (kod) => kod
  ? `\nCTA KODI: postning CTA qismi aynan shunday bo'lsin: "Direktga <b>${kod}</b> deb yozing" (+ nima olishini qisqa ayt). Kod so'zini o'zgartirma va boshqa kod ishlatma.`
  : '';

// Model kodni tushirib qoldirsa — oxiriga qo'shadi
export function ensureCode(html, kod) {
  if (!kod || !html) return html;
  // Kod so'zi mavzuda ham uchrashi mumkin (KPI haqida post) — shuning uchun aynan "Direktga KOD" iborasi qidiriladi
  const plain = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
  return new RegExp(`direkt\\S*\\s+["«'“]?${kod}\\b`, 'i').test(plain)
    ? html : `${html.trim()}\n\n👉 Direktga <b>${kod}</b> deb yozing`;
}

// Lid xabarida qaysi kod bor (katta-kichik harf farqsiz, alohida so'z sifatida)
export function findCode(text, codes) {
  const t = ` ${String(text || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ')} `;
  return codes.filter(c => t.includes(` ${c} `));
}
