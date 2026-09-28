import { askJSON } from '../llm.js';
import { brand } from '../style.js';

// Strateg: eng kuchli g'oyalarni tanlab, nishaga moslaydi
export async function plan(ideas, pick) {
  return askJSON({
    system: `Sen kontent strategisan. ${brand()}`,
    prompt: `G'oyalar:
${JSON.stringify(ideas, null, 1)}

Auditoriya uchun eng foydali va qiziq ${pick} tasini tanla. Har birini tizimlashtirish nishasiga moslashtir
(biznes egasi o'zini tanisin). Format tanla (mazmunga mosini; formatlar aralash bo'lsin):
- "post" — qisqa Telegram matn (bitta fikr, tez o'qiladi)
- "maqola" — Telegram maqolasi: sarlavhalar, ro'yxat, jadval, checklist (chuqur qo'llanma, taqqoslash, shablon)
- "karusel" — 5–8 slayd (bosqichlar, xatolar ro'yxati, oldin/keyin)
- "reels" — qisqa video (hook kuchli, hissiy mavzu)
JSON massiv:
[{"title":"...","angle":"qaysi burchakdan yoritamiz","pain":"qaysi og'riqqa tegadi","format":"post|maqola|karusel|reels",
"key_points":["3-5 ta asosiy fikr"],"cta_goal":"izoh|direkt|saqlash|ulashish","source_url":"..."}]`
  });
}
