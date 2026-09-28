import { askJSON } from '../llm.js';

// Fakt tekshiruvchi: postdagi raqam, statistika, qonun va aniq da'volarni internetdan tekshiradi.
// Noto'g'ri yoki manbasiz raqamni tuzatish uchun aniq almashtirishlar qaytaradi.

const plain = (html = '') => String(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// Tekshirishga arziydimi: raqam, foiz yoki "tadqiqot/qonun" kabi da'vo bor bo'lsa
export const needsCheck = (text) => /\d|%|foiz|qonun|tadqiqot|statistika|million|milliard|mlrd|mln|harvard|mckinsey|gallup/i.test(text);

export async function factCheck({ title, post_html, article_html = '', source_url = '' }) {
  const text = `${plain(post_html)}\n\n${plain(article_html)}`.trim().slice(0, 7000);
  if (!needsCheck(text)) return { issues: [], replacements: [] };
  const r = await askJSON({
    search: true,
    maxTokens: 3000,
    system: `Sen qat'iy fakt tekshiruvchisan (fact-checker). Faqat tekshirsa bo'ladigan aniq da'volarni tekshirasan:
raqamlar, foizlar, statistika, tadqiqot natijalari, qonun va normativlar, kompaniya/mahsulot haqidagi faktlar, sanalar.
Fikr, maslahat va umumiy tajriba gaplarini tekshirma. Internetdan qidirib, ishonchli manba bilan solishtir.`,
    prompt: `Post: "${title}"${source_url ? `\nTadqiqotchi manbasi: ${source_url}` : ''}

Matn:
${text}

Har bir aniq da'vo uchun hukm chiqar:
- "tasdiqlandi" — ishonchli manba bor;
- "shubhali" — manba topilmadi yoki raqam taxminiy (masalan "70% rahbarlar ..." manbasiz);
- "notogri" — manba boshqacha deydi.
"shubhali" va "notogri" uchun matnni tuzatadigan ANIQ almashtirish ber: "find" — matndagi aynan shu bo'lak
(so'zma-so'z, HTML tegsiz, qisqa), "replace" — to'g'ri raqam yoki yumshatilgan ifoda ("ko'p rahbarlar", "tadqiqotlarga ko'ra ~X%" + manba nomi).
To'qima raqam qo'yma.
JSON: {"issues":[{"claim":"da'vo","verdict":"tasdiqlandi|shubhali|notogri","note":"qisqa izoh","source":"url yoki bo'sh"}],
"replacements":[{"find":"...","replace":"..."}]}`
  });
  return {
    issues: Array.isArray(r.issues) ? r.issues.filter(i => i?.claim) : [],
    replacements: Array.isArray(r.replacements) ? r.replacements.filter(x => x?.find && typeof x.replace === 'string') : []
  };
}

// Almashtirishlarni HTML'ga qo'llaydi (faqat matnda aynan topilganlari)
export function applyFixes(html, replacements) {
  let out = html || '';
  for (const { find, replace } of replacements) if (find && out.includes(find)) out = out.split(find).join(replace);
  return { html: out };
}

// Rahbarga ko'rsatish uchun qisqa xulosa. fixed — matnga qo'llangan tuzatishlar soni
export function factSummary(fc, fixed = 0) {
  if (!fc?.issues?.length) return '';
  const bad = fc.issues.filter(i => i.verdict !== 'tasdiqlandi');
  const ok = fc.issues.length - bad.length;
  const left = Math.max(0, bad.length - fixed);
  return `🔎 Fakt: ${ok} ta tasdiqlandi` + (fixed ? ` · ${fixed} ta tuzatildi` : '') +
    (left ? ` · ⚠️ ${left} ta qo'lda tekshiring: ` + bad.slice(0, 3).map(i => `«${String(i.claim).slice(0, 60)}» (${i.verdict === 'notogri' ? "noto'g'ri" : 'manbasiz'})`).join('; ') : '');
}
