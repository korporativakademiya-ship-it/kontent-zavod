import { askJSON } from '../llm.js';
import { brand } from '../style.js';
import { joriy, PROFIL } from '../mahsulot.js';

// Tadqiqotchi: internetdan dolzarb g'oyalar topadi
export async function research({ count = 8, topic = null, used = [] }) {
  const today = new Date().toISOString().slice(0, 10);
  return askJSON({
    search: true,
    maxTokens: 5000,
    system: `Sen kontent tadqiqotchisisan. ${brand()}`,
    prompt: `Bugun: ${today}.
${topic ? `Mavzu berilgan: "${topic}". Shu mavzu atrofida izla.` : PROFIL[joriy()] ? `"${PROFIL[joriy()].nom}" mahsulotining auditoriyasi uchun dolzarb mavzularni izla (profil yuqorida).` : `Biznes egalari uchun dolzarb mavzularni izla.`}
Manbalar: o'zbek, rus va ingliz tilidagi biznes saytlari, yangiliklar, Telegram/Instagram trendlari, keyslar, tadqiqotlar.
Qidir: ${PROFIL[joriy()] ? `faqat shu mahsulot mavzulari va auditoriyasining og'riqlariga oid yangiliklar, keyslar, tadqiqotlar, vositalar.` : `yangi AI vositalar biznes uchun, boshqaruv xatolari, xodim muammolari, O'zbekistondagi biznes yangiliklari/qonunlar, qiziq keyslar.`}
Oldin ishlatilgan (takrorlama): ${used.join(' | ') || "yo'q"}

${count} ta g'oya ber. JSON massiv:
[{"title":"qisqa nom","why_now":"nega hozir dolzarb","insight":"asosiy fakt yoki fikr","source_url":"manba yoki bo'sh"}]`
  });
}
