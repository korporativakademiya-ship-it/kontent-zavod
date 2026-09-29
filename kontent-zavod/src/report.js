import { store } from './store.js';
import { askJSON } from './llm.js';
import { joriy, PROFIL } from './mahsulot.js';

// Haftalik hisobot: har post — reaksiyalar, formatlar bo'yicha o'rtacha va qisqa xulosa

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const reactions = (d) => Object.values(d.reactions || {}).reduce((a, b) => a + b, 0);

export async function buildReport(days = 7, { insight = true } = {}) {
  const since = Date.now() - days * 864e5;
  const posts = store.byStatus('published')
    .filter(d => new Date(d.publishedAt).getTime() >= since && (!joriy() || d.mahsulot === joriy()))
    .map(d => ({ d, react: reactions(d) }))
    .sort((a, b) => b.react - a.react);

  const nom = PROFIL[joriy()] ? ` — ${PROFIL[joriy()].nom}` : '';
  if (!posts.length) return `📊 <b>Hisobot${nom} (${days} kun)</b>\nBu davrda kanalga post chiqmagan.`;

  const lines = posts.map((p, i) =>
    `${i + 1}. <b>${esc(p.d.title)}</b> · ${esc(p.d.format)}${p.d.cta_kod ? ` · <code>${esc(p.d.cta_kod)}</code>` : ''} — ❤️ ${p.react}`);

  // Format bo'yicha o'rtacha
  const byFmt = {};
  for (const p of posts) { const f = (byFmt[p.d.format] ||= { n: 0, react: 0 }); f.n++; f.react += p.react; }
  const fmt = Object.entries(byFmt).map(([k, v]) => `${k}: ${v.n} ta, o'rtacha ❤️ ${(v.react / v.n).toFixed(1)}`).join('\n');

  let text = `📊 <b>Kontent hisoboti${nom} — oxirgi ${days} kun</b>\n\n` +
    `Postlar: ${posts.length} · ❤️ ${posts.reduce((a, p) => a + p.react, 0)}\n\n${lines.join('\n')}\n\n<b>Formatlar:</b>\n${fmt}` +
    `\n\nℹ️ Kodli postlardan nechta odam yozganini direktdagi kod so'zlardan (masalan <code>KPI</code>) ko'rasiz.`;

  if (insight) {
    try {
      const r = await askJSON({
        maxTokens: 800,
        system: 'Sen kontent tahlilchisisan. Qisqa, aniq, amaliy yoz. O\'zbek tilida (lotin).',
        prompt: `Haftalik natijalar:\n${posts.map(p => `- [${p.d.format}] "${p.d.title}": reaksiya ${p.react}`).join('\n')}
2–3 gapda: nima yaxshi ishladi, nima ishlamadi va keyingi hafta nima qilish kerak (mavzu/format). Raqamlarga tayan, to'qima.
JSON: {"xulosa":"..."}`
      });
      if (r.xulosa) text += `\n\n💡 <b>Xulosa:</b> ${esc(r.xulosa)}`;
    } catch { /* xulosasiz ham hisobot to'liq */ }
  }
  return text;
}
