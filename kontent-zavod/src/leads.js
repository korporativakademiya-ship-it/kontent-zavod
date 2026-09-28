import { cfg } from './config.js';
import { store } from './store.js';
import { findCode } from './cta.js';

// Kotibim CRM bilan aloqa: yangi mijozlarning birinchi xabarlaridagi CTA kodi bo'yicha
// qaysi postdan kelganini topadi va CRM'ga manba yozadi ("post: KPI")

export const kotibimEnabled = () => !!(cfg.kotibimUrl && cfg.kontentKey);

async function call(path, opts = {}) {
  const res = await fetch(cfg.kotibimUrl + path, {
    ...opts,
    headers: { 'x-kontent-kalit': cfg.kontentKey, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    signal: AbortSignal.timeout(15e3)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(`Kotibim ${res.status}: ${data.error || 'javob yo\'q'}`);
  return data;
}

const LID_BOSQICH = new Set(['lid', 'uchrashuv', 'taklif', 'sotildi']);

// days — hisobot davri. Kodlar undan uzoqroq davrdagi postlardan ham olinadi (post eski, lid yangi bo'lishi mumkin)
export async function attributeLeads(days = 7) {
  const { lidlar } = await call(`/api/kontent/lidlar?kun=${days}`);
  const posts = store.byStatus('published').filter(d => d.cta_kod && d.publishedAt);
  const codes = posts.map(d => d.cta_kod);
  const byDraft = new Map();
  let unmatched = 0;
  for (const l of lidlar) {
    const found = findCode(l.birinchi_xabarlar, codes);
    // Bir nechta kod bo'lsa — lid yozishidan oldin chiqqan eng so'nggi post
    const t = new Date(l.birinchi).getTime();
    const post = posts.filter(d => found.includes(d.cta_kod) && new Date(d.publishedAt).getTime() <= t + 60e3)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
    if (!post) { unmatched++; continue; }
    const lead = {
      raqam: l.raqam, ism: l.ism, bosqich: l.bosqich || 'yangi', summa: Number(l.summa) || 0,
      lid: l.telefon_bor || LID_BOSQICH.has(l.bosqich), sotildi: l.bosqich === 'sotildi'
    };
    if (!byDraft.has(post.id)) byDraft.set(post.id, []);
    byDraft.get(post.id).push(lead);
    if (!l.manba) await call('/api/kontent/manba', { method: 'POST', body: JSON.stringify({ raqam: l.raqam, manba: `post: ${post.cta_kod}` }) }).catch(() => {});
  }
  return { byDraft, total: lidlar.length, unmatched };
}
