import { askJSON } from '../llm.js';
import { brand, examples } from '../style.js';
import { ctaRule } from '../cta.js';

// Maqola muallifi: Telegram "Статья" (rich message) formatida ko'p formatli matn va karusel slaydlarini yozadi
const TAGS = `
Ruxsat etilgan HTML teglar (boshqasi yo'q, markdown yo'q):
<h1> (faqat bitta, eng boshida), <h2>, <h3>, <p>, <b>, <i>, <u>, <s>, <mark>, <code>, <a href="https://...">,
<ul>/<ol> + <li>, checkbox: <li><input type="checkbox">matn</li>,
<blockquote>...<cite>muallif</cite></blockquote>, <blockquote expandable>, <aside> (markazdagi zarbali iqtibos),
<table bordered striped><tr><th>..</th></tr><tr><td>..</td></tr></table> (katakda faqat oddiy matn/inline teg),
<details><summary>sarlavha</summary><p>...</p></details> (yig'iladigan blok), <hr/>, <footer>.
<slides/> — karusel slaydlari shu joyga qo'yiladi (faqat slaydlar bo'lsa, bitta marta).`;

const SLIDES = `
Slayd turlari (matn qisqa — ekranga sig'sin):
{"type":"cover","kicker":"≤20 belgi","title":"≤60 belgi","accent":"≤24 belgi"}
{"type":"point","title":"≤40 belgi","text":"≤160 belgi"}  — raqam avtomatik qo'yiladi
{"type":"list","title":"≤36 belgi","items":["≤50 belgi", "... 3–5 ta"]}
{"type":"stat","num":"≤4 belgi","label":"≤20 belgi","text":"≤140 belgi"} — faqat haqiqiy raqam
{"type":"quote","text":"≤90 belgi","by":"≤30 belgi"}
{"type":"cta","text":"≤50 belgi","sub":"≤40 belgi","keyword":"BITTA SO'Z"}`;

const MODES = {
  maqola: `Format: MAQOLA — chuqur, foydali, o'qishga qulay. 2500–6000 belgi.
Tuzilma: <h1> sarlavha → qisqa kirish (og'riq) → 3–5 ta <h2> bo'lim → kamida 2 xil format: ro'yxat, checklist,
jadval (masalan "oldin/keyin" yoki "xato/to'g'ri"), <aside> iqtibos, <details> (qo'shimcha misol yoki shablon).
Oxirida xulosa va bitta CTA. slides: [] yoki faqat 1 ta "cover" slayd (muqova, <slides/> <h1> dan keyin).`,
  karusel: `Format: KARUSEL — 5–8 ta slayd, asosiy mazmun slaydlarda. Matn qismi 500–1500 belgi.
Tuzilma: <h1> → <slides/> → qisqa izoh (slaydlarni to'ldiradi, takrorlamaydi) → CTA.
Slaydlar: 1-si "cover", oxirgisi "cta", o'rtasida point/list/stat/quote aralash.`
};

export async function writeArticle(plan, copy, feedback = '') {
  const mode = MODES[plan.format] || MODES.maqola;
  const data = await askJSON({
    maxTokens: 8000,
    system: `Sen Telegram uchun kreativ muharrirsan. ${brand()}\n${TAGS}\n${SLIDES}${ctaRule(plan.cta_kod, plan.cta_havola, plan.cta_matn)}${plan.cta_kod ? ` Karuselning "cta" slaydida keyword = "${plan.cta_kod}".` : ''}${examples(plan.title, 2)}`,
    prompt: `Reja:\n${JSON.stringify(plan, null, 1)}\n\nQisqa post (asos):\n${copy.post_html}
${feedback ? `\nRahbarning izohi (qat'iy amal qil): "${feedback}"\n` : ''}
${mode}
Qoidalar: o'zbek tili (lotin), qisqa abzaslar, suv yo'q, yolg'on raqam yo'q. Emoji me'yorida.
JSON: {"article_html":"...","slides":[...]}`
  });
  if (!data.article_html) throw new Error('Maqola matni qaytmadi');
  const slides = Array.isArray(data.slides) ? data.slides : [];
  if (plan.cta_kod) slides.filter(x => x?.type === 'cta').forEach(x => { x.keyword = plan.cta_kod; });
  return { article_html: data.article_html, slides };
}
