import { cfg } from './config.js';
import { store } from './store.js';
import { research } from './agents/researcher.js';
import { planWeek, revisePlan } from './agents/planner.js';
import { produceDraft } from './pipeline.js';
import { joriy, STANDART_JADVAL } from './mahsulot.js';

// Haftalik reja: rubrikalar (hafta kunlari bo'yicha) → slotlar → rahbar tasdiqlaydi →
// har post chiqishidan ~1 kun oldin yoziladi va reja vaqtiga qo'yiladi

const H = 3600e3;
export const DAYS = ['Ya', 'Du', 'Se', 'Chor', 'Pay', 'Ju', 'Sha']; // getUTCDay() tartibi
const FORMATS = ['post', 'maqola', 'karusel', 'reels'];

export const DEFAULT_RUBRICS = [
  { day: 1, name: 'Xato va yechim', format: 'karusel', desc: "rahbarlarning tipik boshqaruv xatosi va uni tuzatish qadamlari" },
  { day: 2, name: "Amaliy qo'llanma", format: 'maqola', desc: "bitta jarayonni bosqichma-bosqich tizimlashtirish" },
  { day: 3, name: 'Keys', format: 'post', desc: "real vaziyat: muammo → yechim → natija (to'qima raqam yo'q)" },
  { day: 4, name: 'AI vosita', format: 'reels', desc: "biznesga foydali AI vosita yoki avtomatlashtirish" },
  { day: 5, name: 'Shablon', format: 'maqola', desc: "checklist, jadval yoki yo'riqnoma shabloni" },
  { day: 6, name: 'Savol-javob', format: 'post', desc: "obunachilar savoliga javob yoki muhokama" }
];

// Mahsulot topigida standart rubrika yo'q (umumiy rubrikalar tizimlashtirish haqida) — /rubrika_qosh bilan qo'shiladi
export const rubrics = () => store.rubrics() || (joriy() ? [] : DEFAULT_RUBRICS);
// Mahsulotning haftalik chiqish jadvali
export const jadval = () => store.mSetting('jadval', STANDART_JADVAL[joriy()] || []);
export const autoMode = () => store.setting('avto', false);
const planDays = () => (process.env.PLAN_DAYS || '1,2,3,4,5,6').split(',').map(Number).filter(n => n >= 0 && n <= 6);

// Toshkent sanasi (YYYY-MM-DD) va hafta kuni; kunlar ertadan boshlab
function tashDay(offset) {
  const d = new Date(Date.now() + cfg.tzOffsetH * H + offset * 864e5);
  return { date: d.toISOString().slice(0, 10), dow: d.getUTCDay() };
}
export function slotISO(date, time) {
  const [y, m, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h - cfg.tzOffsetH, mi)).toISOString();
}
const short = (date) => `${date.slice(8, 10)}.${date.slice(5, 7)}`;

// Ertadan 7 kun: har reja kuni × POST_TIMES. Rubrika shu kunning birinchi slotiga
export function weekSlots() {
  if (joriy()) {
    const rs = rubrics(), slots = [], j = jadval();
    for (let i = 1; i <= 7; i++) {
      const { date, dow } = tashDay(i);
      j.filter(x => x.day === dow).sort((a, b) => a.time.localeCompare(b.time)).forEach((x, k) =>
        slots.push({ date, time: x.time, dow, dayName: DAYS[dow], rubric: k === 0 ? rs.find(r => r.day === dow) || null : null }));
    }
    return slots;
  }
  const days = planDays(), rs = rubrics(), slots = [];
  for (let i = 1; i <= 7; i++) {
    const { date, dow } = tashDay(i);
    if (!days.includes(dow)) continue;
    cfg.postTimes.forEach((time, k) => slots.push({ date, time, dow, dayName: DAYS[dow], rubric: k === 0 ? rs.find(r => r.day === dow) || null : null }));
  }
  return slots;
}

function toItems(slots, raw) {
  return slots.map((s, i) => {
    const it = raw.find(x => Number(x.slot) === i) || raw[i];
    if (!it?.title) return null;
    const format = FORMATS.includes(String(it.format).toLowerCase()) ? String(it.format).toLowerCase() : (s.rubric?.format || 'post');
    return {
      ...it, slot: i, id: `${s.date}-${s.time}`, date: s.date, time: s.time, dayName: s.dayName,
      rubric: s.rubric?.name || '', format: s.rubric ? s.rubric.format : format, at: slotISO(s.date, s.time), draftId: null
    };
  }).filter(Boolean);
}

export async function buildPlan(log = async () => {}) {
  const slots = weekSlots();
  if (!slots.length) throw new Error(joriy() ? "Chiqish jadvali bo'sh — /jadval bilan kunlarni belgilang" : "Reja kunlari yo'q (PLAN_DAYS)");
  await log(`🗓 Haftalik reja: ${slots.length} ta slot uchun g'oyalar izlanmoqda...`);
  const ideas = await research({ count: Math.min(slots.length * 2, 20), used: store.usedTitles() });
  const items = toItems(slots, await planWeek(slots, ideas, store.usedTitles()));
  if (!items.length) throw new Error('Rejalashtiruvchi bo\'sh reja qaytardi');
  return store.addPlan({ id: Date.now().toString(36), status: 'draft', createdAt: new Date().toISOString(), from: slots[0].date, to: slots.at(-1).date, slots, items });
}

export async function revise(planId, feedback) {
  const p = store.plans().find(x => x.id === planId);
  if (!p) throw new Error('Reja topilmadi');
  const items = toItems(p.slots, await revisePlan(p.slots, p.items, feedback));
  if (!items.length) throw new Error('Rejalashtiruvchi bo\'sh reja qaytardi');
  // Yozib bo'lingan bandlar saqlanadi
  p.items = items.map(it => ({ ...it, draftId: p.items.find(o => o.id === it.id)?.draftId || null }));
  store.savePlans();
  return p;
}

export function approve(planId) {
  const p = store.plans().find(x => x.id === planId);
  if (!p) throw new Error('Reja topilmadi');
  // Eski tasdiqlangan rejaning hali yozilmagan bandlari bekor
  for (const o of store.plans()) if (o !== p && o.status === 'approved') { o.items = o.items.filter(i => i.draftId || i.at < p.items[0]?.at); }
  p.status = 'approved';
  store.savePlans();
  // Rejaga kirgan rahbar g'oyalari keyingi rejalarda takrorlanmasin
  store.markIdeas(p.items.map(i => String(i.idea_id || '')).filter(Boolean));
  return p;
}

export const currentPlan = () => [...store.plans()].reverse().find(p => p.status === 'approved' && p.to >= tashDay(0).date);
export const lastDraftPlan = () => [...store.plans()].reverse().find(p => p.status === 'draft');

// Kelgusi `hours` soat ichidagi, hali yozilmagan bandlar → qoralama (reja vaqtida)
export async function produceDue({ hours = 36, log = async () => {}, onDraft }) {
  const until = new Date(Date.now() + hours * H).toISOString(), now = new Date().toISOString();
  let n = 0;
  for (const p of store.plans().filter(x => x.status === 'approved')) {
    for (const it of p.items) {
      if (it.draftId || it.at <= now || it.at > until) continue;
      try {
        const auto = autoMode();
        const d = await produceDraft({ ...it }, {
          log, extra: { plannedAt: it.at, rubric: it.rubric, planItem: it.id, ...(auto ? { status: 'approved', scheduledAt: it.at } : {}) }
        });
        it.draftId = d.id; store.savePlans(); n++;
        await onDraft(d);
      } catch (e) { await log(`⚠️ Reja bandi "${it.title}" yozilmadi: ${e.message}`); }
    }
  }
  return n;
}

// Rahbarga ko'rsatish uchun matn (HTML)
export function formatPlan(p) {
  const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let out = `🗓 <b>Haftalik reja: ${short(p.from)}–${short(p.to)}</b>${p.status === 'approved' ? ' · ✅ tasdiqlangan' : ''}\n`;
  if (p.items.some(i => i.idea_id)) out += `💡 — sizning g'oyangiz\n`;
  let day = '';
  for (const it of p.items) {
    if (it.date !== day) { day = it.date; out += `\n<b>${it.dayName} ${short(it.date)}</b>\n`; }
    out += `${it.time} · ${it.idea_id ? '💡 ' : ''}${it.rubric ? `🔁 ${esc(it.rubric)} · ` : ''}${esc(it.format)} — <b>${esc(it.title)}</b>${it.draftId ? ' ✍️' : ''}\n` +
      (it.angle ? `   <i>${esc(String(it.angle).slice(0, 90))}</i>\n` : '');
  }
  return out;
}

// "/jadval Du 09:00, Chor 19:00" → [{day, time}]
export function parseJadval(text) {
  const out = [];
  for (const q of String(text).split(/[,;\n]+/)) {
    const m = q.trim().match(/^(\S+)\s+(\d{1,2})[:.](\d{2})$/);
    if (!m) continue;
    const day = DAYS.findIndex(d => d.toLowerCase() === m[1].toLowerCase());
    const h = Number(m[2]), mi = Number(m[3]);
    if (day < 0 || h > 23 || mi > 59) continue;
    out.push({ day, time: `${String(h).padStart(2, '0')}:${m[3]}` });
  }
  return out;
}
export const formatJadval = (j = jadval()) => j.length
  ? [...j].sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7) || a.time.localeCompare(b.time)).map(x => `${DAYS[x.day]} ${x.time}`).join(', ')
  : "bo'sh";

// Dushanbadan boshlab tartiblangan (ro'yxat raqamlari shu tartibda)
export const sortedRubrics = () => rubrics().slice().sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7));

export function formatRubrics() {
  return sortedRubrics()
    .map((r, i) => `${i + 1}. ${DAYS[r.day]} — <b>${r.name}</b> (${r.format}): ${r.desc}`).join('\n');
}
