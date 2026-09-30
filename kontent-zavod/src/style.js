import { store } from './store.js';
import { BRAND } from './brand.js';
import { mahsulotQatlami } from './mahsulot.js';

// Uslub xotirasi: rahbarning namuna postlari, ulardan chiqarilgan uslub tavsifi
// va tahrir izohlaridan yig'ilgan doimiy qoidalar. Hamma agentlar brand() orqali oladi.

const MAX_SAMPLES = 60;

export function addSample(text) {
  const t = String(text || '').trim();
  if (t.length < 80) return null; // juda qisqa — uslub ko'rinmaydi
  const st = store.style();
  if (st.samples.some(s => s.text === t || s.text === t.slice(0, 2500))) return st.samples.length;
  const samples = [...st.samples, { text: t.slice(0, 2500), at: new Date().toISOString() }].slice(-MAX_SAMPLES);
  store.saveStyle({ samples });
  return samples.length;
}

export function addFeedback(fb, draft) {
  const st = store.style();
  const feedback = [...st.feedback, { text: String(fb).slice(0, 500), title: draft.title, format: draft.format, at: new Date().toISOString(), used: false }].slice(-200);
  store.saveStyle({ feedback });
  return feedback.filter(f => !f.used).length;
}

// Agentlar uchun: brend profili + uslub tavsifi + doimiy qoidalar
export function brand() {
  const st = store.style();
  let out = BRAND;
  if (st.guide) out += `\nMUALLIF USLUBI (namuna postlardan o'rganilgan — shunga qat'iy amal qil):\n${st.guide}\n`;
  if (st.rules.length) out += `\nRAHBARNING DOIMIY QOIDALARI (tahrirlardan yig'ilgan — buzma):\n${st.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n`;
  return out + mahsulotQatlami() + tanlovlar();
}

// Rahbar nimani tasdiqlaydi va nimani rad etadi — reja va matn shunga moslashadi
export function tanlovlar(n = 10) {
  const c = store.choices();
  const ok = c.filter(x => x.ok).slice(-n), rad = c.filter(x => !x.ok).slice(-n);
  if (!ok.length && !rad.length) return '';
  return `\nRAHBAR TANLOVLARIDAN O'RGAN:` +
    (ok.length ? `\n- Tasdiqlagan postlari (shu ruhdagi mavzu va formatlarni ko'proq): ${ok.map(x => `"${x.title}" (${x.format})`).join('; ')}` : '') +
    (rad.length ? `\n- Rad etganlari (bunaqasini takrorlama${rad.some(x => x.sabab) ? ', sababiga e\'tibor ber' : ''}): ${rad.map(x => `"${x.title}"${x.sabab ? ` — ${x.sabab}` : ''}`).join('; ')}` : '') + '\n';
}

// Mavzuga eng yaqin namuna postlar (so'z mosligi bo'yicha) — kopirayterga "shunday yoz" misoli
export function examples(topic = '', n = 3) {
  const words = new Set(String(topic).toLowerCase().match(/[\p{L}']{4,}/gu) || []);
  const scored = store.style().samples.map((s, i) => {
    const w = String(s.text).toLowerCase().match(/[\p{L}']{4,}/gu) || [];
    return { s, score: w.filter(x => words.has(x)).length + i / 1000 }; // teng bo'lsa — yangirog'i
  });
  const picked = scored.sort((a, b) => b.score - a.score).slice(0, n).map(x => x.s.text.slice(0, 1200));
  if (!picked.length) return '';
  return `\nMUALLIFNING HAQIQIY POSTLARIDAN NAMUNALAR (mazmunini ko'chirma, ohang/ritm/tuzilishni o'rgan):\n` +
    picked.map((t, i) => `--- namuna ${i + 1} ---\n${t}`).join('\n') + '\n';
}
