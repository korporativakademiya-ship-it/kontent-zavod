import { askJSON } from '../llm.js';
import { VIDEO_SIGNATURE } from '../brand.js';
import { brand } from '../style.js';

// Motion-dizayner: ssenariyni reels shablonining sahnalariga aylantiradi (src/video/template.html)
const SCHEMA = `
Sahna turlari (ketma-ketlik: hook → number (ixtiyoriy) → steps → statement (ixtiyoriy) → cta):
{"type":"hook","top":"savol yoki holat, ≤60 belgi","accent":"zarbali 2–3 so'z, ≤22 belgi","stamp":"muhr so'zi, ≤12 belgi yoki bo'sh"}
{"type":"number","text":"kirish gapi, ≤70 belgi","num":"katta raqam, ≤3 belgi","label":"raqam nimaligi, 1–2 so'z"}
{"type":"steps","items":[{"title":"≤28 belgi","desc":"≤80 belgi","result":"≤28 belgi"}],"highlight":0 dan boshlangan indeks yoki null,"flag":"ajratilgan qadam ustidagi yozuv, ≤24 belgi"}
{"type":"statement","small":"≤20 belgi","big":"asosiy xulosa, ≤60 belgi","accent":"big ichidagi aynan bir bo'lak"}
{"type":"cta","text":"savol yoki chaqiriq, ≤50 belgi","sub":"≤30 belgi","keyword":"direkt kalit so'z, BITTA SO'Z, katta harf"}
`;

export async function storyboard(draft) {
  const data = await askJSON({
    maxTokens: 2500,
    system: `Sen reels uchun motion-dizaynersan. Matnli animatsiya (kinetik tipografiya) sahnalarini yozasan. ${brand()}`,
    prompt: `Post:\n${draft.post_html}\n\nReels ssenariy:\n${draft.reels_script || "yo'q"}

Shu mazmunni 25–45 soniyalik videoga aylantir. ${SCHEMA}
Dublyaj: har sahnaga (steps da esa har bir qadamga, items ichida) "voice" maydoni qo'sh — diktor aytadigan jonli gap,
1–2 qisqa gap (≤160 belgi), ekrandagi matnni so'zma-so'z takrorlamaydi, balki tushuntiradi. steps sahnasining o'ziga voice kerak emas.
Qoidalar: steps da 3–8 ta qadam. Belgi chegaralariga qat'iy amal qil — ekranga sig'ishi shart.
Faqat oddiy matn (HTML yo'q). O'zbek tili (lotin). Yolg'on raqam yo'q — num postdagi raqamlardan yoki qadamlar sonidan olinadi.
JSON: {"scenes":[...]}`
  });
  const scenes = (data.scenes || []).filter(s => s && typeof s.type === 'string');
  if (!scenes.length) throw new Error("Motion agent sahna qaytarmadi");
  return { signature: VIDEO_SIGNATURE, scenes };
}
