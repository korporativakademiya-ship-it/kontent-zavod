import { store } from './store.js';
import { askJSON } from './llm.js';
import { kotibimEnabled, attributeLeads } from './leads.js';

// Haftalik hisobot: har post — reaksiyalar, lidlar (Kotibim CRM), sotuvlar. Oxirida qisqa xulosa.

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const reactions = (d) => Object.values(d.reactions || {}).reduce((a, b) => a + b, 0);
const money = (n) => n ? `${Math.round(n).toLocaleString('ru-RU')} so'm` : '';

export async function buildReport(days = 7, { insight = true } = {}) {
  const since = Date.now() - days * 864e5;
  let leads = { byDraft: new Map(), total: 0, unmatched: 0 }, leadErr = '';
  if (kotibimEnabled()) {
    try { leads = await attributeLeads(days); } catch (e) { leadErr = e.message; }
  }
  const inWindow = store.byStatus('published').filter(d => new Date(d.publishedAt).getTime() >= since);
  const withLeads = [...leads.byDraft.keys()].map(id => store.get(id)).filter(Boolean);
  const posts = [...new Map([...inWindow, ...withLeads].map(d => [d.id, d])).values()].map(d => {
    const ls = leads.byDraft.get(d.id) || [];
    return {
      d, react: reactions(d), leads: ls.length, lid: ls.filter(l => l.lid).length,
      sold: ls.filter(l => l.sotildi).length, summa: ls.reduce((a, l) => a + (l.sotildi ? l.summa : 0), 0)
    };
  }).sort((a, b) => b.leads - a.leads || b.react - a.react);

  if (!posts.length) return `📊 <b>Hisobot (${days} kun)</b>\nBu davrda kanalga post chiqmagan.`;

  const sum = (k) => posts.reduce((a, p) => a + p[k], 0);
  const lines = posts.map((p, i) =>
    `${i + 1}. <b>${esc(p.d.title)}</b> · ${esc(p.d.format)}${p.d.cta_kod ? ` · <code>${esc(p.d.cta_kod)}</code>` : ''}\n` +
    `   ❤️ ${p.react}${kotibimEnabled() ? ` · 💬 ${p.leads} ta yozdi · 📞 ${p.lid} lid · ✅ ${p.sold} sotuv${p.summa ? ` (${money(p.summa)})` : ''}` : ''}`);

  // Format bo'yicha o'rtacha
  const byFmt = {};
  for (const p of posts) { const f = (byFmt[p.d.format] ||= { n: 0, react: 0, leads: 0 }); f.n++; f.react += p.react; f.leads += p.leads; }
  const fmt = Object.entries(byFmt).map(([k, v]) => `${k}: ${v.n} ta, o'rtacha ❤️ ${(v.react / v.n).toFixed(1)}${kotibimEnabled() ? `, 💬 ${(v.leads / v.n).toFixed(1)}` : ''}`).join('\n');

  let text = `📊 <b>Kontent hisoboti — oxirgi ${days} kun</b>\n\n` +
    `Postlar: ${inWindow.length} · ❤️ ${sum('react')}` +
    (kotibimEnabled() ? ` · 💬 ${sum('leads')} ta yozdi · 📞 ${sum('lid')} lid · ✅ ${sum('sold')} sotuv${sum('summa') ? ` (${money(sum('summa'))})` : ''}` : '') + '\n' +
    (kotibimEnabled() && leads.total ? `CRM'ga jami ${leads.total} ta yangi mijoz yozgan, ${leads.unmatched} tasi postga bog'lanmadi (kodsiz).\n` : '') +
    `\n${lines.join('\n')}\n\n<b>Formatlar:</b>\n${fmt}`;
  if (!kotibimEnabled()) text += `\n\nℹ️ Lidlar ko'rinmayapti: KOTIBIM_URL va KONTENT_API_KALIT sozlanmagan.`;
  if (leadErr) text += `\n\n⚠️ Kotibim'dan lidlar olinmadi: ${esc(leadErr)}`;

  if (insight) {
    try {
      const r = await askJSON({
        maxTokens: 800,
        system: 'Sen kontent tahlilchisisan. Qisqa, aniq, amaliy yoz. O\'zbek tilida (lotin).',
        prompt: `Haftalik natijalar:\n${posts.map(p => `- [${p.d.format}] "${p.d.title}": reaksiya ${p.react}, yozganlar ${p.leads}, lid ${p.lid}, sotuv ${p.sold}`).join('\n')}
2–3 gapda: nima yaxshi ishladi, nima ishlamadi va keyingi hafta nima qilish kerak (mavzu/format). Raqamlarga tayan, to'qima.
JSON: {"xulosa":"..."}`
      });
      if (r.xulosa) text += `\n\n💡 <b>Xulosa:</b> ${esc(r.xulosa)}`;
    } catch { /* xulosasiz ham hisobot to'liq */ }
  }
  return text;
}
