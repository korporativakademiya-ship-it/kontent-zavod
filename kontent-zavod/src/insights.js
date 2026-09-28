import { store } from './store.js';

// Rejalashtiruvchi va strateg uchun: o'tgan postlar natijasi (reaksiyalar) va rahbarning g'oyalari

const reactions = (d) => Object.values(d.reactions || {}).reduce((a, b) => a + b, 0);
const MIN_POSTS = 5;

// Oxirgi 60 kundagi kuzatilgan postlar (kanal ID'si saqlanganlari) bo'yicha xulosa. Ma'lumot kam bo'lsa — bo'sh
export function performanceSummary(days = 60) {
  const since = Date.now() - days * 864e5;
  const posts = store.byStatus('published')
    .filter(d => d.channel_msg_ids?.length && new Date(d.publishedAt).getTime() >= since)
    .map(d => ({ d, r: reactions(d) }));
  if (posts.length < MIN_POSTS) return '';
  const avg = (key) => {
    const g = {};
    for (const p of posts) { const k = p.d[key] || (key === 'rubric' ? 'erkin' : '?'); (g[k] ||= []).push(p.r); }
    return Object.entries(g).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length, v.length])
      .sort((a, b) => b[1] - a[1]).map(([k, a, n]) => `${k} ${a.toFixed(1)} (${n} ta)`).join(', ');
  };
  const sorted = [...posts].sort((a, b) => b.r - a.r);
  const line = (p) => `"${p.d.title}" (${p.d.format}${p.d.rubric ? `, ${p.d.rubric}` : ''}) — ${p.r}`;
  return `\nO'TGAN NATIJALAR (oxirgi ${days} kun, ${posts.length} ta post, o'rtacha reaksiya):
- Formatlar: ${avg('format')}
- Rubrikalar: ${avg('rubric')}
- Eng yaxshilari: ${sorted.slice(0, 5).map(line).join('; ')}
- Eng sustlari: ${sorted.slice(-3).map(line).join('; ')}
Shunga tayan: yaxshi ishlagan mavzu, og'riq va formatlarni ko'proq, sustlarini kamroq yoki boshqa burchakdan ber.
Lekin bir xillikka tushma — yangi mavzularni ham sina.\n`;
}

// Rahbarning ishlatilmagan g'oyalari — reja va strategiyada birinchi navbatda
export function ideaBank(limit = 15) {
  const list = store.ideas().filter(i => !i.used).slice(-limit);
  if (!list.length) return '';
  return `\nRAHBARNING O'Z G'OYALARI (BIRINCHI NAVBATDA ishlat, har biri bitta postga; ishlatganingda "idea_id" ni yoz):
${list.map(i => `- [${i.id}] ${i.text}`).join('\n')}\n`;
}
