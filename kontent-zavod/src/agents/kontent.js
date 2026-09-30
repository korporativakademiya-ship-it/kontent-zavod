import fs from 'node:fs';
import path from 'node:path';
import { askJSON } from '../llm.js';
import { brand, examples, addSample, addFeedback } from '../style.js';
import { bilan, PROFIL } from '../mahsulot.js';
import { store } from '../store.js';
import { cfg } from '../config.js';
import { uniqueCode, ensureCode } from '../cta.js';
import { write, revise } from './copywriter.js';
import { writeArticle } from './article.js';
import { factCheck, applyFixes, factSummary } from './factcheck.js';
import { research } from './researcher.js';
import { renderDraftSlides } from '../pipeline.js';
import { rubrics } from '../weekly.js';
import { nextSlot, parseTime, fmtTime } from '../publisher.js';
import { performanceSummary, ideaBank } from '../insights.js';
import { kuzatuvXulosasi, normKanal } from '../kuzatuv.js';
import { REELS_RUBRIKALAR } from '../reels/rubrikalar.js';
import * as reels from './reels.js';
import { kinoReja } from './kino.js';

// Kontent liniyasi (n8n doska, src/api.js):
// G'oya ovchisi (kanallar + internet → kunlik 5 g'oya) → Prodyuser (taklif + TZ + tanqidiy fikrlash) → rahbar ✅/✏️ →
// Muallif (turiga qarab: matn, matn+rasm, karusel, maqola, reels) → rahbar ✅/✏️ (tahriri uslubga yoziladi) →
// ishlab chiqarish → Tanqidchi (faqat tayyor postni baholaydi, saboq yozadi) → kanalga joylash.

export const TURLAR = {
  matn: { format: 'post', nom: 'Matn (post)' },
  'matn+rasm': { format: 'post', nom: 'Matn + rasm' },
  karusel: { format: 'karusel', nom: 'Karusel (slaydlar)' },
  maqola: { format: 'maqola', nom: 'Maqola (Telegram)' },
  reels: { format: 'reels', nom: 'Reels (30–40 soniya)' },
  video: { format: 'reels', nom: 'Uzun video (1–3 daqiqa)' },
};
const VIDEOLI = ['reels', 'video'];
export const videomi = (t) => VIDEOLI.includes(t);
const MAHSULOTLAR = Object.keys(PROFIL);
const mKod = (m) => (MAHSULOTLAR.includes(m) ? m : null);
// Topik yo'nalishi: ka | qa | kf — mahsulot; umumiy — shaxsiy brend (tizimlashtirish, boshqaruv, tajriba)
export const YONALISHLAR = { ...Object.fromEntries(Object.entries(PROFIL).map(([k, v]) => [k, v.nom])), umumiy: 'Shaxsiy brend' };
const yonalishQatlami = (y) => !y ? '' : y === 'umumiy'
  ? `\nBU TOPIK: SHAXSIY BREND — Jo'rabekning yo'nalishi (tizimlashtirish, boshqaruv, xodimlar, AI, o'z tajribasi). Mahsulotni reklama qilma; mos kelsa, oxirida bir gap bilan eslatish mumkin.\n`
  : `\nBU TOPIK: ${PROFIL[y]?.nom} — g'oya va kontent shu mahsulot auditoriyasi va mavzulari uchun (profil yuqorida). Har postda sotma: ko'p post foydali fikr, mahsulot — tabiiy yechim sifatida.\n`;
const xato = (msg, kod = 400) => Object.assign(new Error(msg), { kod });

// Tanqidchining oxirgi saboqlari — prodyuser va muallif shularni hisobga oladi
export function saboqlar(n = 8) {
  const s = store.setting('saboqlar', []).slice(-n);
  return s.length ? `\nTANQIDCHI SABOQLARI (oldingi tayyor postlardan — takrorlama):\n${s.map(x => `- ${x.saboq}`).join('\n')}\n` : '';
}

// Uchala mahsulot va shaxsiy brend orasida muvozanat: oxirgi 10 ta kontent qaysi mahsulotga bo'lgan
function muvozanat() {
  const oxirgi = store.allDrafts().slice(-10).map(d => d.mahsulot || 'umumiy');
  if (!oxirgi.length) return '';
  const hisob = {};
  for (const m of oxirgi) hisob[m] = (hisob[m] || 0) + 1;
  return `\nOXIRGI 10 TA KONTENT MAHSULOTLAR BO'YICHA: ${Object.entries(hisob).map(([k, v]) => `${PROFIL[k]?.nom || k}: ${v}`).join(', ')}.
Kam yoritilgan mahsulot yoki shaxsiy brendga ustunlik ber (g'oya mos kelsa).\n`;
}

const rubrikaRoyxati = () => [
  ...rubrics().map(r => `- "${r.name}" (${r.format}): ${r.desc}`),
  ...REELS_RUBRIKALAR.map(r => `- "${r.nom}" (reels, ${r.format}): ${r.tavsif}`),
].join('\n');

const TZ_SXEMA = `{"sarlavha":"ishchi nom",
"taklif":"2–3 gap, rahbarga: 'Bu g'oyani men … deb tasavvur qilaman, … formatida qilishni taklif qilaman, chunki …'",
"strategiya":"bu kontent nimaga xizmat qiladi va voronkaning qaysi bosqichi (sovuq/iliq/issiq)",
"mahsulot":"ka|qa|kf|umumiy","auditoriya":"kim, qaysi biznes, qanday holatda","kontent_turi":"${Object.keys(TURLAR).join('|')}",
"rubrika":"rubrika nomi yoki 'erkin'","format":"ichki format: hikoya / ro'yxat / taqqoslash / qo'llanma / keys / savol-javob ...",
"ilmoq":"birinchi qator yoki birinchi 3 soniya — aynan matni","ilmoq_variantlari":["yana 2 ta muqobil"],
"tuzilma":["1-qism: ...","2-qism: ..."],"asosiy_fikr":"o'quvchi eslab qoladigan 1 fikr",
"dalil":"nimaga tayanamiz; haqiqiy dalil bo'lmasa 'misol' deb belgila","cta":{"maqsad":"direkt|obuna|saqlash|izoh","matn":"...","kod":"direkt bo'lsa 1 so'z, lotin katta harf"},
"taqiqlar":["..."],"xavflar":["tanqidiy fikrlash: zaif joy, auditoriya shubhasi, takror bo'lish xavfi — va uni qanday yopdik"],
"vizual":{"uslub":"...","palitra":"...","yoruglik":"...","makon":"...","personaj":"reels/rasm bo'lsa: yoshi, tashqi ko'rinishi, kiyimi — har kadrda bir xil"},
"rasm_tavsif":"kontent_turi matn+rasm bo'lsa: rasm uchun INGLIZCHA tavsif (fotorealistik, Markaziy Osiyo muhiti, rasm ichida yozuv yo'q); aks holda bo'sh",
"davomiylik":"reels bo'lsa 30–40, video bo'lsa 60–180 (soniya), aks holda 0"}`;

// Prodyuser: g'oyani rahbarga moslab "o'raydi" — taklif + TZ. izoh + oldingi — rahbar tuzatishi bilan qayta
export async function prodyuser(goya, { izoh = '', oldingi = null, mahsulot } = {}) {
  const tz = await bilan(mKod(mahsulot), () => askJSON({
    maxTokens: 4000,
    system: `Sen kontent prodyuserisan. Rahbarning g'oyasini uning biznes maqsadiga moslab o'raysan va texnik topshiriq (TZ) yozasan.
Maqsad — Jo'rabekning yo'nalishi (biznesni tizimlashtirish, boshqaruv, AI) bo'yicha ekspertlik va ishonch, shaxsiy brend; mahsulotlar
(Kotib AI, Qadam AI, Kontent Fabrika) — faqat mavzuga tabiiy mos kelsa. Hamma kontent mahsulot reklamasi bo'lmasin.
Kontent turini g'oyaga qarab tanla: hamma narsa video emas. Matn — tez fikr; matn+rasm — hissiy yoki vaziyatli fikr;
karusel — qadamlar, ro'yxat, taqqoslash (saqlanadigan); maqola — chuqur qo'llanma; reels — hikoya, e'tiroz, demo (30–40 s);
video — 1–3 daqiqalik tushuntiruvchi video (hisob-kitob, bosqichma-bosqich yechim, keys) Telegram kanal va YouTube uchun.
TANQIDIY FIKRLASH: taklif berishdan oldin o'zingdan so'ra — bu g'oyaning zaif joyi nima, auditoriya nimaga ishonmaydi,
oldin shunaqasi bo'lganmi, soxta va'da yo'qmi. Topganingni "xavflar" ga yoz va TZ da yop.
${brand()}${saboqlar()}`,
    prompt: `G'OYA: ${goya}
${yonalishQatlami(mahsulot)}${oldingi ? `\nOLDINGI TZ (rahbar ko'rib chiqdi):\n${JSON.stringify(oldingi)}\n` : ''}${izoh ? `RAHBAR TUZATISHI (albatta bajar, qolganini saqla): ${izoh}\n` : ''}
RUBRIKALAR:\n${rubrikaRoyxati()}
${muvozanat()}${performanceSummary()}
Soxta raqam, mijoz natijasi yoki narx to'qima. O'zbek tili (lotin).
JSON: ${TZ_SXEMA}`,
  }));
  if (!TURLAR[tz.kontent_turi]) tz.kontent_turi = 'matn';
  tz.mahsulot = mahsulot ? (mKod(mahsulot) || 'umumiy') : (mKod(tz.mahsulot) || 'umumiy');
  tz.cta = tz.cta || {};
  const direkt = String(tz.cta.maqsad || '').toLowerCase() === 'direkt';
  tz.cta.kod = direkt ? (oldingi?.cta?.kod || uniqueCode(tz.cta.kod || tz.sarlavha)) : '';
  if (tz.kontent_turi === 'reels') tz.davomiylik = Math.min(40, Math.max(25, Number(tz.davomiylik) || 35));
  if (tz.kontent_turi === 'video') tz.davomiylik = Math.min(180, Math.max(60, Number(tz.davomiylik) || 90));
  tz.goya = goya;
  if (izoh) addFeedback(`TZ tuzatishi: ${izoh}`, { title: tz.sarlavha, format: tz.kontent_turi });
  return tz;
}

// TZ → Fabrika rejasi (kopirayter va maqola muallifi shu tuzilmani kutadi)
function rejaga(tz) {
  return {
    title: tz.sarlavha, angle: tz.taklif, pain: tz.auditoriya, format: TURLAR[tz.kontent_turi].format,
    key_points: [tz.asosiy_fikr, ...(tz.tuzilma || [])].filter(Boolean),
    hook: tz.ilmoq, rubrika: tz.rubrika, ichki_format: tz.format, dalil: tz.dalil, taqiqlar: tz.taqiqlar,
    cta_goal: tz.cta?.maqsad || '', cta_kod: tz.cta?.kod || '', cta_matn: tz.cta?.matn || '',
  };
}

// Reels TZ (reels.js ssenariy/storibord kutgan shakl)
function reelsTz(tz) {
  return {
    sarlavha: tz.sarlavha, mahsulot: tz.mahsulot, rubrika: tz.rubrika, format: 'motion', maqsad: 'lid',
    auditoriya: tz.auditoriya, asosiy_fikr: tz.asosiy_fikr, burchak: tz.taklif, dalil: tz.dalil,
    ilmoqlar: [{ turi: 'asosiy', matn: tz.ilmoq }, ...(tz.ilmoq_variantlari || []).map(m => ({ turi: 'muqobil', matn: m }))], tanlangan_ilmoq: 0,
    tuzilma: (tz.tuzilma || []).map(q => ({ qism: 'qism', soniya: 5, mazmun: q })), davomiylik: tz.davomiylik || 35,
    ovoz: { jins: 'erkak', ohang: 'jonli, ishonchli, tez sur\'at', surat: 'tez' },
    vizual: tz.vizual || {}, cta: tz.cta || {}, taqiqlar: tz.taqiqlar,
  };
}

function rasmPath(id) {
  const dir = path.join(cfg.dataDir, 'n8n', id);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const matnRejimi = (d) => (d.format === 'maqola' || d.format === 'karusel') ? d.article_html : d.post_html;

const toza = (h = '') => String(h).replace(/<br\s*\/?>|<\/(p|li|h\d|blockquote|div|tr)>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/\n{3,}/g, '\n\n').trim();

export const qoralama = (id) => store.get(String(id || ''));
// Rahbar nusxa olib tuzatadigan asosiy matn
export const tozaMatn = (d) => (!d ? '' : toza((d.format === 'maqola' || d.format === 'karusel') ? d.article_html : d.post_html));

// Rahbarga ko'rinish (Telegram uchun oddiy matn): qism nomlari aniq — nima qayerga chiqishi ko'rinsin
export function korinish(d, variant = 0) {
  const turi = d.kontent_turi;
  const tugmalar = `✅ tasdiqlash · ✏️ o'zim tuzataman · 🔄 izoh bilan qayta`;
  if (videomi(turi)) {
    const vlar = d.reels?.variantlar || [];
    const k = Math.min(Math.max(0, Number(variant) || 0), Math.max(0, vlar.length - 1));
    const ss = vlar[k]?.ssenariy || {};
    const sah = ss.sahnalar || [];
    const y = ss.yakun || {};
    return [
      `${turi === 'video' ? '🎞 Video' : '🎬 Reels'}: ${d.title}${vlar.length > 1 ? `  (${k + 1}/${vlar.length}-variant, ⭐ ${vlar[k]?.tanqid?.baho ?? '?'}/10)` : ''}`,
      `━━ 1. SSENARIY — diktor o'qiydi\n${sah.map((x, i) => `${i + 1}. ${x.ovoz}`).join('\n')}${y.ovoz ? `\n${sah.length + 1}. ${y.ovoz}` : ''}`,
      `━━ 2. SUBTITR — videoda yoziladi\n${sah.map((x, i) => `${i + 1}. ${String(x.ekran || '').replace(/\*/g, '')}`).join('\n')}${y.ekran ? `\n${sah.length + 1}. ${String(y.ekran).replace(/\*/g, '')}` : ''}${y.tugma ? `\n🔘 ${y.tugma}` : ''}`,
      `━━ 3. OPISANIYE — video ostidagi matn\n${toza(d.post_html)}`,
      vlar.length > 1 ? `🔢 Boshqa variant: raqamini yozing (1–${vlar.length}).` : '',
      tugmalar,
    ].filter(Boolean).join('\n\n').slice(0, 4000);
  }
  const slaydlar = (d.slides || []).map((s, i) => `${i + 1}) ${[s.kicker, s.title, s.text, s.accent, s.num, s.label, ...(s.items || [])].filter(Boolean).join(' · ')}`).join('\n');
  const postNomi = turi === 'karusel' ? '📝 QISQA POST' : '📝 POST (kanalga chiqadi)';
  return [
    `✍️ ${TURLAR[turi]?.nom || d.format}: ${d.title}`,
    `${postNomi}:\n${toza(d.post_html)}`,
    d.article_html && d.format !== 'post' ? `📰 ${turi === 'karusel' ? 'KARUSEL MATNI' : 'MAQOLA'}:\n${toza(d.article_html).slice(0, 1200)}` : '',
    slaydlar ? `🎠 SLAYDLAR:\n${slaydlar}` : '',
    d.notes ? `ℹ️ ${String(d.notes).slice(0, 300)}` : '',
    tugmalar,
  ].filter(Boolean).join('\n\n').slice(0, 4000);
}

// Muallif: TZ bo'yicha yozadi (rahbar tekshiruvidan qayta yozish yo'q — faqat fakt tekshiruvi)
export async function muallif(tz) {
  if (!tz || !TURLAR[tz.kontent_turi]) throw xato('tz.kontent_turi kerak');
  return bilan(mKod(tz.mahsulot), async () => {
    const p = rejaga(tz);
    const copy = await write({ ...p, saboqlar: saboqlar() });
    let post_html = ensureCode(copy.post_html, p.cta_kod), art = null, reelsNatija = null;
    if (p.format === 'maqola' || p.format === 'karusel') art = await writeArticle(p, { post_html });
    if (videomi(tz.kontent_turi)) reelsNatija = await reels.ssenariy(reelsTz(tz));
    let texts = { post_html, article_html: art?.article_html || '' }, notes = '';
    if (cfg.factCheck) {
      try {
        const fc = await factCheck({ title: p.title, ...texts });
        const fixed = fc.replacements.filter(r => texts.post_html.includes(r.find) || texts.article_html.includes(r.find)).length;
        texts = { post_html: applyFixes(texts.post_html, fc.replacements).html, article_html: applyFixes(texts.article_html, fc.replacements).html };
        notes = factSummary(fc, fixed);
      } catch (e) { notes = `🔎 Fakt tekshiruvi bajarilmadi: ${e.message}`; }
    }
    let d = store.addDraft({
      title: p.title, format: p.format, kontent_turi: tz.kontent_turi, status: 'n8n', plan: p, tz, cta_kod: p.cta_kod,
      rubric: tz.rubrika, ...(mKod(tz.mahsulot) ? { mahsulot: tz.mahsulot } : {}),
      post_html: texts.post_html, ai_post_html: texts.post_html, article_html: texts.article_html, slides: art?.slides || [],
      reels_script: copy.reels_script || '', reels: reelsNatija, notes,
    });
    if (art?.slides?.length) {
      try { d = await renderDraftSlides(d); } catch (e) { d = store.update(d.id, { notes: `${notes}\n⚠️ Slaydlar chizilmadi: ${e.message}` }); }
    }
    return { draft_id: d.id, kontent_turi: tz.kontent_turi, korinish: korinish(d), reels: reelsNatija };
  });
}

// Rahbar qarori: tasdiq / o'zi tuzatgan matn / izoh bilan qayta yozish. Tahrir uslub xotirasiga yoziladi.
export async function tasdiq({ draft_id, qaror = 'tasdiq', matn = '', izoh = '', variant = 0 }) {
  qaror = String(qaror || 'tasdiq');
  const d = store.get(String(draft_id || ''));
  if (!d) throw xato('qoralama topilmadi', 404);
  return bilan(mKod(d.mahsulot), async () => {
    if (qaror === 'qayta' && !String(izoh).trim() && String(matn).trim()) qaror = 'tasdiq'; // matnni o'zi tuzatgan
    if (qaror === 'qayta') {
      if (!String(izoh).trim()) throw xato('qayta yozish uchun izoh kerak');
      addFeedback(String(izoh).trim(), d);
      if (videomi(d.kontent_turi) && d.reels) {
        const asos = d.reels.variantlar?.[Number(variant) || 0]?.ssenariy || d.reels.ssenariy;
        const r = await reels.ssenariy(reelsTz(d.tz), { izoh, asos });
        const x = store.update(d.id, { reels: r });
        return { draft_id: d.id, korinish: korinish(x), qayta: true, reels: r };
      }
      if (d.format === 'maqola' || d.format === 'karusel') {
        const art = await writeArticle(d.plan, { post_html: d.post_html }, izoh);
        let x = store.update(d.id, { article_html: art.article_html, slides: art.slides });
        // Eski slayd rasmlari yangi matnga mos emas: qayta chiziladi, chizilmasa — olib tashlanadi
        if (art.slides?.length) x = await renderDraftSlides(x).catch(e => store.update(d.id, { slide_paths: [], notes: `${d.notes || ''}\n⚠️ Slaydlar chizilmadi: ${e.message}`.trim() }));
        else x = store.update(d.id, { slide_paths: [] });
        return { draft_id: d.id, korinish: korinish(x), qayta: true };
      }
      const r = await revise(d, izoh);
      const x = store.update(d.id, { post_html: ensureCode(r.post_html, d.cta_kod), reels_script: r.reels_script || d.reels_script });
      return { draft_id: d.id, korinish: korinish(x), qayta: true };
    }
    const yangi = String(matn).trim();
    if (yangi) {
      // Rahbar o'zi tuzatdi: yakuniy matn — namuna; farqi — uslub izohi (5 tadan doimiy qoidalar chiqadi)
      const maydon = (d.format === 'maqola' || d.format === 'karusel') ? 'article_html' : 'post_html';
      const eski = String(d[maydon] || '').replace(/<[^>]+>/g, '').slice(0, 700);
      addFeedback(`Rahbar AI matnini o'zi tahrirladi. AI yozgani: «${eski}» → rahbar varianti: «${yangi.slice(0, 700)}». Farqidan uslubni o'rgan.`, d);
      addSample(yangi);
      const html = yangi.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const qiymat = maydon === 'article_html' ? `<p>${html.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br/>')}</p>` : ensureCode(html, d.cta_kod);
      const eslatma = d.slides?.length ? "\n⚠️ Slaydlar oldingicha qoldi — ularni o'zgartirish uchun 🔄 izoh bilan qayta yozdiring." : '';
      store.update(d.id, { [maydon]: qiymat, tahrirlangan: true, notes: `${d.notes || ''}${eslatma}`.trim() });
      return { draft_id: d.id, korinish: korinish(store.get(d.id)), tahrirlangan: true };
    }
    // AI matni rahbar namunasi emas — namuna faqat rahbar o'zi tuzatgan matndan olinadi
    if (!d.tasdiqlangan) { store.addChoice(d, true); store.update(d.id, { tasdiqlangan: true }); }
    return { draft_id: d.id, korinish: korinish(d) };
  });
}

// n8n yasagan rasm yoki video qoralamaga biriktiriladi
export function media({ draft_id, turi = 'rasm', b64, mime = 'image/png' }) {
  const d = store.get(String(draft_id || ''));
  if (!d) throw xato('qoralama topilmadi', 404);
  if (turi !== 'rasm' && turi !== 'video') throw xato("turi: rasm yoki video");
  if (typeof b64 !== 'string' || b64.length < 100) throw xato('b64 fayl kerak');
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4' }[mime];
  if (!ext) throw xato(`mime qo'llanmaydi: ${mime}`);
  const fayl = path.join(rasmPath(d.id), `${turi}-${Date.now()}.${ext}`);
  fs.writeFileSync(fayl, Buffer.from(b64, 'base64'));
  // n8n qoralamasida qayta urinish eski rasmni almashtiradi (dublikat bo'lmasin)
  const rasmlar = d.status === 'n8n' ? [fayl] : [...(d.image_paths || []), fayl].slice(-10);
  const x = turi === 'video' ? store.update(d.id, { video_path: fayl }) : store.update(d.id, { image_paths: rasmlar });
  return { ok: true, draft_id: x.id, rasmlar: (x.image_paths || []).length, video: Boolean(x.video_path) };
}

// Tanqidchi: faqat tayyor postni baholaydi (o'zgartirmaydi), saboqni xotiraga yozadi
export async function tanqid({ draft_id }) {
  const d = store.get(String(draft_id || ''));
  if (!d) throw xato('qoralama topilmadi', 404);
  const t = await bilan(mKod(d.mahsulot), () => askJSON({
    maxTokens: 1500,
    system: `Sen kontent bo'limi tanqidchisisan. Tayyor postni natija nuqtai nazaridan baholaysan: to'xtatadimi, ishontiradimi, harakatga undaydimi.
Postni O'ZGARTIRMAYSAN — faqat baho, kuchli/zaif tomonlar va keyingi kontentlar uchun bitta aniq saboq. ${brand()}`,
    prompt: `TZ:\n${JSON.stringify(d.tz || d.plan)}\n\nTAYYOR POST (${TURLAR[d.kontent_turi]?.nom || d.format}; rasm: ${(d.image_paths || []).length} ta; video: ${d.video_path ? 'bor' : "yo'q"}; slayd: ${(d.slides || []).length} ta; rahbar tahrirlagan: ${d.tahrirlangan ? 'ha' : "yo'q"}):
${String(d.post_html || '').slice(0, 2500)}\n${d.article_html ? String(d.article_html).slice(0, 2500) : ''}
${d.reels?.ssenariy ? `REELS SSENARIY: ${JSON.stringify(d.reels.ssenariy).slice(0, 2500)}` : ''}
JSON: {"baho":1-10,"kuchli":["..."],"zaif":["..."],"saboq":"keyingi kontentlar uchun 1 ta aniq, takrorlanadigan qoida","kutilgan_natija":"qisqa bashorat"}`,
  }));
  const saboq = String(t.saboq || '').trim();
  if (saboq) store.setSetting('saboqlar', [...store.setting('saboqlar', []), { saboq: saboq.slice(0, 300), title: d.title, at: new Date().toISOString() }].slice(-30));
  store.update(d.id, { tanqid: t });
  return { baho: Number(t.baho) || 0, kuchli: t.kuchli || [], zaif: t.zaif || [], saboq, kutilgan_natija: t.kutilgan_natija || '' };
}

// Kanalga joylash: Fabrika nashriyotchisi belgilangan vaqtda chiqaradi
export function joyla({ draft_id, vaqt = '', qatiy = false }) {
  const d = store.get(String(draft_id || ''));
  if (!d) throw xato('qoralama topilmadi', 404);
  if (d.status === 'published') throw xato('post allaqachon chiqqan');
  if (!['n8n', 'pending', 'approved', 'failed'].includes(d.status)) throw xato(`bu qoralamani joylab bo'lmaydi (holati: ${d.status})`);
  const tanlangan = vaqt ? parseTime(vaqt) : null;
  if (tanlangan && store.byStatus('approved').some(x => x.id !== d.id && x.scheduledAt === tanlangan))
    throw Object.assign(xato(`${fmtTime(tanlangan)} da boshqa post turibdi — boshqa vaqt yozing`), { vaqtXato: true });
  if (vaqt && !tanlangan && qatiy) throw Object.assign(xato(`"${vaqt}" — vaqt tushunarsiz yoki o'tib ketgan`), { vaqtXato: true });
  const at = tanlangan || nextSlot();
  store.update(d.id, { status: 'approved', scheduledAt: at, publish_attempts: 0 });
  return { ok: true, vaqt: fmtTime(at), kanal: cfg.channelId };
}

// G'oya ovchisi: kuzatilayotgan kanallar + internet → kunlik g'oyalar (g'oyalar bankiga ham yoziladi)
const dayjestKalit = (m) => (m ? `kunlik_goyalar:${m}` : 'kunlik_goyalar');
export async function kunlikGoyalar({ soni = 5, fetchFn, mahsulot } = {}) {
  return bilan(mKod(mahsulot), () => kunlikGoyalarIchki({ soni, fetchFn, mahsulot }));
}
async function kunlikGoyalarIchki({ soni, fetchFn, mahsulot }) {
  const [kuzatuv, internet] = await Promise.all([
    kuzatuvXulosasi({ fetchFn }).catch(e => ({ natija: [], xatolar: [e.message] })),
    research({ count: 8, used: store.usedTitles() }).catch(() => []),
  ]);
  const r = await askJSON({
    maxTokens: 3500,
    system: `Sen g'oya ovchisisan. Kuzatilayotgan kanallar va internetdan kelgan xomashyodan rahbar uchun eng kuchli kontent g'oyalarini tanlaysan.
Boshqalarni ko'chirmaysan — ilhom olib, o'z auditoriyamizga va mahsulotlarimizga moslaysan. ${brand()}${saboqlar()}`,
    prompt: `KANALLAR (oxirgi kunlardagi eng ko'p ko'rilgan postlar):\n${JSON.stringify(kuzatuv.natija).slice(0, 9000)}
\nINTERNET:\n${JSON.stringify(internet).slice(0, 5000)}
${ideaBank(8)}${mahsulot ? yonalishQatlami(mahsulot) : muvozanat()}
Aynan ${soni} ta g'oya tanla: ${mahsulot ? 'hammasi shu topik uchun' : "mahsulotlar va shaxsiy brend aralash"}; kontent turlari aralash (hammasi video emas), takrorlanmasin.
JSON: {"goyalar":[{"goya":"1–2 gap — nima haqida va qaysi burchakdan","nega":"nega hozir / nega kuchli","manba":"kanal @nom, havola yoki 'internet'","mahsulot":"ka|qa|kf|umumiy","tur":"${Object.keys(TURLAR).join('|')}"}]}`,
  });
  const royxat = Array.isArray(r) ? r : Array.isArray(r?.goyalar) ? r.goyalar : [];
  const goyalar = royxat.filter(g => g && typeof g.goya === 'string' && g.goya.trim()).slice(0, soni)
    .map((g, i) => ({ ...g, ...(mahsulot ? { mahsulot } : {}), n: i + 1 }));
  // Bo'sh natija kechagi dayjestni o'chirib yubormasin (raqam bilan tanlash ishlashda davom etadi)
  if (!goyalar.length) return { goyalar, kanallar_xatosi: kuzatuv.xatolar };
  for (const g of goyalar) bilan(mKod(g.mahsulot), () => store.addIdea(g.goya));
  store.setSetting(dayjestKalit(mahsulot), { at: new Date().toISOString(), goyalar });
  return { goyalar, kanallar_xatosi: kuzatuv.xatolar, mahsulot: mahsulot || '' };
}

export function goyaTanla({ n, mahsulot }) {
  const k = store.setting(dayjestKalit(mahsulot), null);
  const g = k?.goyalar?.find(x => x.n === Number(n));
  if (!g) throw xato(`${n}-g'oya topilmadi (oxirgi dayjestda ${k?.goyalar?.length || 0} ta)`, 404);
  return { goya: `${g.goya}${g.tur ? ` (taklif: ${TURLAR[g.tur]?.nom || g.tur})` : ''}`, manba: g.manba || '' };
}

// ---------- Prompt muhandisi ----------
// Rejissyor NIMA ko'rinishini aytadi, prompt muhandisi esa uni generatorlar tushunadigan tilga o'giradi:
// rasm (Nano Banana), ovoz (TTS — o'zbekcha talaffuz va sur'at), video (AI video modeli ulanganda).
const PROMPT_SKILL = `RASM PROMPTI (Nano Banana / Gemini image) — bitta ingliz paragrafi, shu tartibda:
1) asosiy ob'ekt va harakat (kim, nima qilyapti, yuz ifodasi); 2) makon va detallar (O'zbekiston/Markaziy Osiyo, real biznes muhiti);
3) kompozitsiya va kamera: shot turi (close-up / medium / wide), burchak (eye-level / low / top-down), obyektiv (35mm / 50mm / 85mm), vertikal 9:16, bosh qismi yuqori uchdan birda;
4) yorug'lik (soft window light / warm evening / cool office) va palitra — butun video uchun BITTA; 5) uslub: photorealistic, cinematic, natural skin, shallow depth of field;
6) IZCHILLIK LANGARI: personaj tavsifini (yoshi, soch, kiyim, rang) har kadrda AYNAN bir xil so'zlar bilan takrorla;
7) oxirida: "no text, no letters, no captions, no logos, no watermarks". Ekrandagi yozuvni biz o'zimiz qo'yamiz.
OVOZ MATNI (TTS) — o'zbek tilida, og'zaki: gap ≤ 12 so'z; raqamlar so'z bilan ("uch ming", "yigirma foiz"); qisqartma va inglizcha atama yo'q
(CRM → "mijozlar bazasi", AI → "sun'iy intellekt" yoki "ey-ay"); qavs, tire, ro'yxat yo'q; har sahna ovozi ekrandagi vaqtga sig'sin (≈ 2.5 so'z/soniya).
OVOZ REJISSURASI — ingliz tilida qisqa ko'rsatma: sur'at (brisk, energetic), hissiyot, urg'u qayerda, pauza faqat sahna oxirida.
VIDEO PROMPTI (keyinchalik AI video uchun) — ingliz tilida: boshlang'ich kadr + harakat (subject motion) + kamera harakati (slow push-in / pan / handheld) + davomiyligi.`;

export async function promptMuhandis(tz, sahnalar, yakun = {}) {
  const r = await askJSON({
    maxTokens: 5000,
    system: `Sen prompt muhandisisan: rasm, ovoz va video generatorlari uchun eng sifatli promptlarni yozasan.\n${PROMPT_SKILL}`,
    prompt: `TZ vizuali va personaj: ${JSON.stringify({ vizual: tz.vizual, personaj: tz.vizual?.personaj, rasm_tavsif: tz.rasm_tavsif, auditoriya: tz.auditoriya })}
SAHNALAR (rejissyordan): ${JSON.stringify(sahnalar)}
YAKUN (CTA): ${JSON.stringify(yakun)}
Har sahna uchun va yakun uchun yoz. Ovoz matni ma'nosini o'zgartirma — faqat talaffuz va og'zaki shaklga moslab qisqart.
JSON: {"personaj_langari":"ingliz tilida bitta jumla","sahnalar":[{"rasm_prompt":"...","ovoz_matn":"...","ovoz_rejissura":"...","video_prompt":"..."}],
"yakun":{"rasm_prompt":"...","ovoz_matn":"...","ovoz_rejissura":"..."}}`,
  });
  const ps = Array.isArray(r.sahnalar) ? r.sahnalar : [];
  return {
    personaj: r.personaj_langari || '',
    sahnalar: sahnalar.map((s, i) => ({ ...s, rasm_prompt: ps[i]?.rasm_prompt || s.rasm_prompt, ovoz: ps[i]?.ovoz_matn || s.ovoz,
      ovoz_rejissura: ps[i]?.ovoz_rejissura || '', video_prompt: ps[i]?.video_prompt || '' })),
    yakun: { ...yakun, rasm_prompt: r.yakun?.rasm_prompt || '', ovoz: r.yakun?.ovoz_matn || yakun.ovoz, ovoz_rejissura: r.yakun?.ovoz_rejissura || '' },
  };
}

// Ishlab chiqarish rejasi: reels — rejissyor + prompt muhandisi; matn+rasm — bitta rasm prompti
// kino — n8n doskasi /kino shablonlarini biladi (eski doskaga eski slayd-shou yo'li qoladi)
export async function ishlabChiqarish({ draft_id, variant = 0, kino = false }) {
  const d = store.get(String(draft_id || ''));
  if (!d) throw xato('qoralama topilmadi', 404);
  return bilan(mKod(d.mahsulot), async () => {
    if (videomi(d.kontent_turi)) {
      const v = d.reels?.variantlar?.[Number(variant)] || d.reels?.variantlar?.[0];
      if (!v) throw xato('reels ssenariysi yo\'q');
      const rt = reelsTz(d.tz);
      // Asosiy yo'l: kino rejissyori (grid / doska / plakat / chat shablonlari). Ishlamasa — eski AI rasm slayd-shou
      if (kino && process.env.KINO !== '0') {
        try {
          const k = await kinoReja(rt, v.ssenariy);
          store.update(d.id, { reels: { ...d.reels, tanlangan: Number(variant) || 0, kino: k.sahnalar } });
          return { tur: 'kino', sahnalar: k.sahnalar, smm: k.smm };
        } catch (e) { console.error('kino rejissyori:', e.message); }
      }
      const sb = await reels.storibord(rt, v.ssenariy, { saqla: false });
      const pm = await promptMuhandis(rt, sb.sahnalar, sb.yakun);
      store.update(d.id, { reels: { ...d.reels, tanlangan: Number(variant) || 0 } });
      return { tur: 'reels', sahnalar: pm.sahnalar, yakun: pm.yakun, personaj: pm.personaj, smm: sb.smm };
    }
    if (d.kontent_turi === 'matn+rasm') {
      const pm = await promptMuhandis({ ...d.tz, vizual: { personaj: '' } }, [{ matn: d.title, ovoz: '', rasm_prompt: d.tz?.rasm_tavsif || d.title }]);
      return { tur: 'matn+rasm', rasm_prompt: pm.sahnalar[0].rasm_prompt.replace('vertical 9:16', 'square 1:1 or 4:5') };
    }
    return { tur: d.kontent_turi };
  });
}

export function dayjestMatni(r) {
  const TUR = { matn: '📝', 'matn+rasm': '🖼', karusel: '🎠', maqola: '📰', reels: '🎬', video: '🎞' };
  const xato = (r.kanallar_xatosi || []).length ? `\n\n⚠️ O'qilmagan kanallar: ${r.kanallar_xatosi.join('; ').slice(0, 300)}` : '';
  if (!(r.goyalar || []).length) return `😕 Bugun yangi g'oya topa olmadim — keyinroq "goyalar" deb yozing yoki o'z g'oyangizni yozing.${xato}`;
  const qator = r.goyalar.map(x => `${x.n}) ${TUR[x.tur] || '•'} ${x.goya}${x.nega ? `\n   💡 ${String(x.nega).slice(0, 140)}` : ''}`).join('\n\n');
  const nom = r.mahsulot ? `${YONALISHLAR[r.mahsulot] || ''} — ` : '';
  return `☀️ ${nom}bugungi ${r.goyalar.length} ta g'oya:\n\n${qator}\n\n👉 Raqamini yozing yoki o'z g'oyangizni yozing.${xato}`.slice(0, 4000);
}

// Uslubni rahbarning o'z kanalidan o'rganish: postlar namuna bo'ladi, uslubshunos tavsif yozadi
export async function uslubKanaldan({ kanal = process.env.USLUB_KANAL || '', fetchFn } = {}) {
  const nk = normKanal(kanal);
  if (!nk || nk.platforma !== 'telegram') throw xato("uslub uchun Telegram kanal nomi kerak (Railway'da USLUB_KANAL=pulatovjurabek)");
  kanal = nk.nom;
  const { kanalOqi } = await import('../kuzatuv.js');
  const { analyzeStyle } = await import('./stylist.js');
  // Bot o'zi joylagan (AI yozgan) postlar rahbar uslubi emas — ular o'tkazib yuboriladi
  const imzo = (t) => String(t).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80).toLowerCase();
  const botniki = new Set(store.byStatus('published').filter(x => !x.tahrirlangan).map(x => imzo(x.post_html)).filter(Boolean));
  const postlar = (await kanalOqi(kanal, { fetchFn })).filter(p => p.matn.length >= 150 && !botniki.has(imzo(p.matn)));
  let qoshildi = 0;
  for (const p of postlar) {
    const bor = new Set(store.style().samples.map(x => x.text));
    const t = String(p.matn).trim();
    if (bor.has(t) || bor.has(t.slice(0, 2500))) continue;
    if (addSample(t)) qoshildi++;
  }
  const st = store.style();
  if (st.samples.length < 5) throw xato(`@${kanal} dan yetarli post topilmadi (${st.samples.length} ta namuna)`);
  const guide = await analyzeStyle(st.samples.slice(-30));
  store.saveStyle({ guide });
  return { kanal, qoshildi, jami: st.samples.length, guide };
}

// Karusel slaydlarini bitta rasmga yig'ish (rahbar joylashdan oldin ko'rsin)
export async function slaydKollaj({ draft_id }) {
  const d = store.get(String(draft_id || ''));
  if (!d) throw xato('qoralama topilmadi', 404);
  const fayllar = (d.slide_paths || []).filter(f => fs.existsSync(f));
  if (!fayllar.length) throw xato("slaydlar yo'q", 404);
  const { ffmpeg } = await import('../video/ffmpeg.js');
  const papka = path.dirname(fayllar[0]);
  const chiqish = path.join(rasmPath(d.id), `kollaj-${fayllar.length}.jpg`);
  const ustun = Math.min(4, fayllar.length), qator = Math.ceil(fayllar.length / ustun);
  await ffmpeg(['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(papka, '%02d.png'),
    '-vf', `scale=432:540,tile=${ustun}x${qator}:padding=12:margin=12:color=white`, '-frames:v', '1', '-q:v', '3', chiqish]);
  return { b64: fs.readFileSync(chiqish).toString('base64'), mime: 'image/jpeg', soni: fayllar.length };
}
