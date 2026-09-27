import { askJSON } from '../llm.js';
import { BRAND } from '../brand.js';

// Strateg: eng kuchli g'oyalarni tanlab, nishaga moslaydi
export async function plan(ideas, pick) {
  return askJSON({
    system: `Sen kontent strategisan. ${BRAND}`,
    prompt: `G'oyalar:
${JSON.stringify(ideas, null, 1)}

Auditoriya uchun eng foydali va qiziq ${pick} tasini tanla. Har birini tizimlashtirish nishasiga moslashtir
(biznes egasi o'zini tanisin). Format tanla: "post" (Telegram matn), "reels" (qisqa video) yoki "karusel".
JSON massiv:
[{"title":"...","angle":"qaysi burchakdan yoritamiz","pain":"qaysi og'riqqa tegadi","format":"post|reels|karusel",
"key_points":["3-5 ta asosiy fikr"],"cta_goal":"izoh|direkt|saqlash|ulashish","source_url":"..."}]`
  });
}
