import { askJSON } from '../llm.js';
import { brand, examples } from '../style.js';
import { ctaRule } from '../cta.js';

const RULES = `
QOIDALAR:
- Birinchi qator — HOOK: to'xtatadigan, aniq, og'riqqa tegadigan. Klikbeyt yolg'on emas.
- Telegram post: 500–1100 belgi. Qisqa abzaslar. Emoji me'yorida (0–4 ta).
- Faqat Telegram HTML teglar: <b>, <i>, <u>, <a href="">, <blockquote>. Boshqa teg yo'q. Markdown yo'q.
- Oxirida bitta aniq CTA.
- Reels ssenariy: HOOK (0–3s), BODY (qisqa kadrlar), CTA. Har qatorda "EKRAN:" va "OVOZ:".
`;

export async function write(plan) {
  return askJSON({
    maxTokens: 3000,
    system: `Sen kuchli kopirayterisan. ${brand()}\n${RULES}${ctaRule(plan.cta_kod, plan.cta_havola, plan.cta_matn)}${examples(`${plan.title} ${plan.angle || ''} ${plan.pain || ''}`)}`,
    prompt: `Reja:\n${JSON.stringify(plan, null, 1)}

JSON: {"post_html":"Telegram post","reels_script":"30–45 soniyalik reels ssenariy"}`
  });
}

export async function revise(draft, feedback) {
  return askJSON({
    maxTokens: 3000,
    system: `Sen kuchli kopirayterisan. ${brand()}\n${RULES}${ctaRule(draft.cta_kod, draft.plan?.cta_havola, draft.plan?.cta_matn)}${examples(draft.title)}`,
    prompt: `Joriy post:\n${draft.post_html}\n\nJoriy ssenariy:\n${draft.reels_script || ''}

Rahbarning izohi: "${feedback}"
Izohga qat'iy amal qilib qayta yoz. JSON: {"post_html":"...","reels_script":"..."}`
  });
}
