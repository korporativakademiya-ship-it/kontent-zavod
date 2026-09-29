import { createHash } from 'node:crypto';
import { cfg } from './config.js';
import { store } from './store.js';
import { PROFIL, rejim, kodlar, bilan, prefiksdan } from './mahsulot.js';
import { DAYS, autoMode } from './weekly.js';

// Kotibim CRM'dagi "Kontent kalendar" bilan sinxron.
// Har daqiqada: kalendar holatini (postlar, reja bandlari, g'oyalar) yuboradi, CRM'da navbatga
// qo'yilgan amallarni (joylash, ko'chirish, olib tashlash) oladi, bajaradi va natijasini keyingi safar qaytaradi.
// Faqat kontent yuboriladi — mijoz ma'lumoti yo'q.

const H = 3600e3;
export const kalendarEnabled = () => !!(cfg.kotibimUrl && cfg.kontentKey);

const plain = (html = '') => String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
const reactions = (d) => Object.values(d.reactions || {}).reduce((a, b) => a + b, 0);
const mOf = (x) => x.mahsulot || prefiksdan(x.text || x.title || '') || null;

// Toshkent sanasi va vaqti
function tashParts(iso) {
  const t = new Date(new Date(iso).getTime() + cfg.tzOffsetH * H);
  return { date: t.toISOString().slice(0, 10), time: t.toISOString().slice(11, 16), dow: t.getUTCDay() };
}

export function snapshot(now = Date.now()) {
  const since = new Date(now - 60 * 864e5).toISOString(), nowIso = new Date(now).toISOString();
  const items = [];
  for (const d of store.allDrafts()) {
    const [holat, at] = d.status === 'published' ? ['chiqdi', d.publishedAt]
      : d.status === 'approved' ? ['rejada', d.scheduledAt]
      : d.status === 'pending' && d.plannedAt ? ['kutilmoqda', d.plannedAt] : [];
    if (!holat || !at || at < since) continue;
    items.push({
      id: `d:${d.id}`, holat, at, title: d.title, format: d.format, mahsulot: d.mahsulot || null, rubric: d.rubric || '',
      cta: d.cta_kod || d.plan?.cta_havola || '', matn: plain(d.post_html).slice(0, 700),
      ...(holat === 'chiqdi' ? { reaksiya: reactions(d) } : {})
    });
  }
  // Rejadagi hali yozilmagan bandlar; tasdiqlanmagan reja — "taklif"
  for (const p of store.allPlans()) {
    if (p.status !== 'approved' && p.status !== 'draft') continue;
    for (const it of p.items || []) {
      if (it.draftId || !it.at || it.at <= nowIso) continue;
      items.push({
        id: `p:${p.id}:${it.id}`, holat: p.status === 'approved' ? 'reja' : 'taklif', at: it.at, title: it.title, format: it.format,
        mahsulot: p.mahsulot || null, rubric: it.rubric || '', izoh: it.angle || '', qolda: !!p.qolda
      });
    }
  }
  const goyalar = store.allIdeas().filter(i => !i.used).map(i => ({ id: i.id, text: i.text, mahsulot: mOf(i), at: i.at }));
  const mahsulotlar = rejim() ? Object.fromEntries(kodlar().map(k => [k, { nom: PROFIL[k].nom, belgi: PROFIL[k].belgi }])) : {};
  return { versiya: 1, items, goyalar, mahsulotlar, vaqtlar: cfg.postTimes, avto: autoMode() };
}

function findPlanItem(planId, itemId) {
  const p = store.allPlans().find(x => x.id === planId);
  return { p, it: p?.items?.find(i => i.id === itemId) };
}

// Bitta CRM amali → { ok, natija }
export function applyAction(a, now = Date.now()) {
  const m = a.malumot || {};
  const future = (at) => at && !Number.isNaN(new Date(at).getTime()) && new Date(at).getTime() > now + 60e3;
  if (a.tur === 'joylash') {
    const idea = store.allIdeas().find(i => i.id === String(m.idea_id));
    if (!idea) return { ok: false, natija: "G'oya topilmadi (o'chirilgan bo'lishi mumkin)" };
    if (idea.used) return { ok: false, natija: "G'oya allaqachon ishlatilgan" };
    if (!future(m.at)) return { ok: false, natija: "Vaqt o'tib ketgan" };
    const mahsulot = (m.mahsulot && PROFIL[m.mahsulot] ? m.mahsulot : null) || mOf(idea);
    if (rejim() && !mahsulot) return { ok: false, natija: 'Mahsulot tanlanmagan' };
    const { date, time, dow } = tashParts(m.at);
    const item = {
      slot: 0, id: `q-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, date, time, dayName: DAYS[dow], rubric: '',
      format: ['post', 'maqola', 'karusel', 'reels'].includes(m.format) ? m.format : 'post',
      title: idea.text.split('\n')[0].slice(0, 140), angle: idea.text, key_points: [], cta_goal: 'direkt', idea_id: idea.id,
      at: new Date(m.at).toISOString(), draftId: null
    };
    bilan(mahsulot, () => store.addPlan({
      id: `q${Date.now().toString(36)}`, status: 'approved', qolda: true, createdAt: new Date(now).toISOString(), from: date, to: date, slots: [], items: [item]
    }));
    store.markIdeas([idea.id]);
    return { ok: true, natija: `Joylandi: ${date} ${time}` };
  }
  const ref = String(m.ref || '');
  if (a.tur === 'kochir' && !future(m.at)) return { ok: false, natija: "Vaqt o'tib ketgan" };
  const at = m.at ? new Date(m.at).toISOString() : null;
  if (ref.startsWith('d:')) {
    const d = store.get(ref.slice(2));
    if (!d) return { ok: false, natija: 'Post topilmadi' };
    if (d.status === 'published') return { ok: false, natija: 'Post allaqachon chiqqan' };
    const planItem = store.allPlans().flatMap(p => p.items || []).find(i => i.draftId === d.id);
    if (a.tur === 'kochir') {
      store.update(d.id, d.status === 'approved' ? { scheduledAt: at, ...(d.plannedAt ? { plannedAt: at } : {}) } : { plannedAt: at });
      if (planItem) { Object.assign(planItem, { at, ...tashParts(at) }); store.savePlans(); }
      return { ok: true, natija: `Ko'chirildi: ${tashParts(at).date} ${tashParts(at).time}` };
    }
    if (a.tur === 'olib_tashla') {
      store.update(d.id, { status: d.status === 'approved' ? 'pending' : d.status, scheduledAt: null, plannedAt: null });
      return { ok: true, natija: 'Kalendardan olindi (qoralama tasdiqlash topigida qoladi)' };
    }
  }
  if (ref.startsWith('p:')) {
    const [, planId, itemId] = ref.split(':');
    const { p, it } = findPlanItem(planId, itemId);
    if (!it) return { ok: false, natija: 'Reja bandi topilmadi' };
    if (it.draftId) return applyAction({ ...a, malumot: { ...m, ref: `d:${it.draftId}` } }, now); // allaqachon yozilgan
    if (a.tur === 'kochir') {
      const { date, time, dow } = tashParts(at);
      Object.assign(it, { at, date, time, dayName: DAYS[dow] });
      if (p.qolda) Object.assign(p, { from: date, to: date });
      store.savePlans();
      return { ok: true, natija: `Ko'chirildi: ${date} ${time}` };
    }
    if (a.tur === 'olib_tashla') {
      p.items = p.items.filter(x => x !== it);
      store.savePlans();
      if (it.idea_id) store.allIdeas().filter(i => i.id === String(it.idea_id)).forEach(i => { i.used = false; });
      store.savePlans();
      return { ok: true, natija: "Rejadan olib tashlandi" + (it.idea_id ? " (g'oya bankka qaytdi)" : '') };
    }
  }
  return { ok: false, natija: "Noma'lum amal" };
}

// ---------- Sinxron ----------
let lastHash = '', lastFull = 0, running = false;

async function post(body) {
  const res = await fetch(`${cfg.kotibimUrl}/api/kontent/kalendar`, {
    method: 'POST',
    headers: { 'x-kontent-kalit': cfg.kontentKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20e3)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(`Kotibim ${res.status}: ${data.error || "javob yo'q"}`);
  return data;
}

// Qaytaradi: bajarilgan amallar soni (0 — o'zgarish yo'q)
export async function syncKalendar() {
  if (!kalendarEnabled() || running) return 0;
  running = true;
  try {
    let applied = 0;
    for (let round = 0; round < 2; round++) {
      const snap = snapshot();
      const hash = createHash('sha1').update(JSON.stringify(snap)).digest('hex');
      const natijalar = store.setting('kal_natijalar', []);
      const full = hash !== lastHash || Date.now() - lastFull > 10 * 60e3;
      const r = await post({ ...(full ? { holat: snap } : {}), natijalar });
      if (full) { lastHash = hash; lastFull = Date.now(); }
      if (natijalar.length) store.setSetting('kal_natijalar', store.setting('kal_natijalar', []).slice(natijalar.length));
      // Amallar bir marta bajariladi: natija yetib bormasa ham qayta bajarilmaydi, faqat natija qayta yuboriladi
      const done = store.setting('kal_bajarilgan', {});
      const fresh = [];
      for (const a of r.amallar || []) {
        const res = done[a.id] || applyAction(a);
        if (!done[a.id]) applied++;
        done[a.id] = res;
        fresh.push({ id: a.id, ...res });
      }
      if (!fresh.length) break;
      const keep = Object.fromEntries(Object.entries(done).sort((x, y) => Number(y[0]) - Number(x[0])).slice(0, 300));
      store.setSetting('kal_bajarilgan', keep);
      store.setSetting('kal_natijalar', [...store.setting('kal_natijalar', []), ...fresh]);
      // Ikkinchi aylanish: yangi holat va natijalar darhol yetib borsin
    }
    return applied;
  } finally { running = false; }
}
