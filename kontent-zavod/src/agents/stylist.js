import { askJSON } from '../llm.js';
import { BRAND } from '../brand.js';

// Uslubshunos: namuna postlardan muallif uslubini chiqaradi va tahrir izohlarini doimiy qoidalarga aylantiradi

export async function analyzeStyle(samples) {
  const r = await askJSON({
    maxTokens: 3000,
    system: `Sen tajribali muharrir va uslubshunossan. ${BRAND}`,
    prompt: `Quyida muallifning haqiqiy postlari (${samples.length} ta):

${samples.map((s, i) => `--- ${i + 1} ---\n${s.text.slice(0, 1500)}`).join('\n')}

Shu postlardan muallif uslubini aniq, amaliy qilib tasvirla — boshqa yozuvchi shunga qarab xuddi shunday yoza olsin.
Umumiy gaplar emas ("sodda yozadi"), balki aniq kuzatuvlar va misollar:
- ohang va murojaat (siz/sen, rahbar bilan qanday gaplashadi)
- hook (birinchi qator) qanday tuziladi — 2–3 ta haqiqiy misol
- gap va abzas uzunligi, ritm
- sevimli so'z va iboralar (ko'chirib ber), ishlatmaydigan so'zlar
- tuzilish (ro'yxat, raqamlar, misollar, savollar), emoji va formatlash
- CTA qanday yoziladi — misollar
JSON: {"guide":"8–15 qatorlik uslub tavsifi, har qator '- ' bilan"}`
  });
  if (!r.guide) throw new Error('Uslub tavsifi qaytmadi');
  return String(r.guide).trim();
}

export async function distillRules(rules, feedback) {
  const r = await askJSON({
    maxTokens: 2000,
    system: `Sen kontent bo'limi rahbarining yordamchisisan. ${BRAND}`,
    prompt: `Hozirgi doimiy qoidalar:
${rules.length ? rules.map((x, i) => `${i + 1}. ${x}`).join('\n') : "yo'q"}

Rahbarning yangi tahrir izohlari (qaysi postga):
${feedback.map(f => `- [${f.format}] "${f.title}": ${f.text}`).join('\n')}

Vazifa: izohlardan KELAJAKDAGI postlarga ham tegishli umumiy qoidalarni chiqar va hozirgilar bilan birlashtir.
- Faqat bir martalik tuzatishlarni ("3 ni 5 qil", "bu yerda X ni yoz") qoida qilma.
- Takrorlanuvchi yoki umumiy talablarni qoida qil ("hook savol bilan boshlanmasin", "raqamsiz da'vo yo'q").
- Bir xil ma'nodagilarni birlashtir, ziddiyat bo'lsa yangi izoh ustun. Ko'pi bilan 15 ta, har biri bitta aniq gap.
JSON: {"rules":["..."],"new":["shu safar qo'shilgan yoki o'zgargan qoidalar"]}`
  });
  if (!Array.isArray(r.rules)) throw new Error('Qoidalar qaytmadi');
  return { rules: r.rules.map(String).filter(Boolean).slice(0, 15), added: Array.isArray(r.new) ? r.new.map(String) : [] };
}
