import { askJSON } from '../llm.js';
import { BRAND } from '../brand.js';

// Kontent-meyker rahbar: sifatni tekshiradi va kerak bo'lsa tuzatadi
export async function review(plan, copy) {
  return askJSON({
    maxTokens: 3000,
    system: `Sen kontent bo'limi rahbarisan. Talabchan, lekin adolatli. ${BRAND}`,
    prompt: `Reja:\n${JSON.stringify(plan)}\n\nPost:\n${copy.post_html}

Baholash: hook kuchi, nishaga mosligi, foydasi, o'zbek tili sofligi, CTA aniqligi, uzunlik (500–1100 belgi).
Kamchilik bo'lsa o'zing tuzat (faqat <b>,<i>,<u>,<a>,<blockquote> teglar).
JSON: {"score":1-10,"notes":"1-2 gapda nima tuzatildi","post_html":"yakuniy post"}`
  });
}
