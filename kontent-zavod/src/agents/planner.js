import { askJSON } from '../llm.js';
import { brand } from '../style.js';
import { performanceSummary, ideaBank } from '../insights.js';

// Rejalashtiruvchi: haftalik slotlarga (kun, vaqt, rubrika) g'oyalarni taqsimlaydi
const ITEM = `{"slot":0,"idea_id":"rahbar g'oyasi bo'lsa uning id si, aks holda bo'sh","title":"qisqa nom","angle":"qaysi burchakdan (≤90 belgi)","pain":"qaysi og'riq","format":"post|maqola|karusel|reels",
"key_points":["3-5 ta fikr"],"cta_goal":"izoh|direkt|saqlash|ulashish","cta_kod":"direkt bo'lsa — 1 so'z, lotin katta harf","source_url":"..."}`;

const slotText = (slots) => slots.map((s, i) =>
  `${i}. ${s.dayName} ${s.date} ${s.time}${s.rubric ? ` — RUBRIKA "${s.rubric.name}" (format: ${s.rubric.format}; ${s.rubric.desc})` : ' — erkin (mavzu va formatni o\'zing tanla)'}`).join('\n');

const RULES = `Qoidalar:
- Har slotga bitta post. Rubrikali slotda rubrika mavzusi va formatiga amal qil.
- Hafta bir xil bo'lmasin: mavzular, og'riqlar va formatlar aralash; ketma-ket ikki kun bir xil mavzu yo'q.
- Kamida yarmida cta_goal "direkt".
- Oldin ishlatilgan mavzularni takrorlama.`;

export async function planWeek(slots, ideas, used = []) {
  const items = await askJSON({
    maxTokens: 6000,
    system: `Sen kontent-rejalashtiruvchisan: kanal uchun haftalik reja tuzasan. ${brand()}`,
    prompt: `Slotlar:\n${slotText(slots)}\n${ideaBank()}${performanceSummary()}\nG'oyalar (internetdan topilgan):\n${JSON.stringify(ideas, null, 1)}
Oldin ishlatilgan (takrorlama): ${used.join(' | ') || "yo'q"}

${RULES}
JSON massiv, har slotga bittadan: [${ITEM}]`
  });
  return Array.isArray(items) ? items : [];
}

export async function revisePlan(slots, items, feedback) {
  const out = await askJSON({
    maxTokens: 6000,
    system: `Sen kontent-rejalashtiruvchisan. ${brand()}`,
    prompt: `Slotlar:\n${slotText(slots)}\n\nHozirgi reja:\n${JSON.stringify(items, null, 1)}

Rahbarning izohi: "${feedback}"
Izohga qat'iy amal qilib rejani qayta yoz. Izoh tegmagan bandlarni o'zgartirma.
${RULES}
JSON massiv, har slotga bittadan: [${ITEM}]`
  });
  return Array.isArray(out) ? out : [];
}
