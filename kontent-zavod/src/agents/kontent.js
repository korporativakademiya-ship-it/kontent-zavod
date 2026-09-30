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
import { kuzatuvXulosasi } from '../kuzatuv.js';
import { REELS_RUBRIKALAR } from '../reels/rubrikalar.js';
import * as reels from './reels.js';

// Kontent liniyasi (n8n doska, src/api.js):
// G'oya ovchisi (kanallar + internet → kunlik 5 g'oya) → Prodyuser (taklif + TZ + tanqidiy fikrlash) → rahbar ✅/✏️ →
// Muallif (turiga qarab: matn, matn+rasm, karusel, maqola, reels) → rahbar ✅/✏️ (tahriri uslubga yoziladi) →
// ishlab chiqarish → Tanqidchi (faqat tayyor postni baholaydi, saboq yozadi) → kanalga joylash.

export const TURLAR = {
  matn: { format: 'post', nom: 'Matn (post)' },
  'matn+rasm': { format: 'post', nom: 'Matn + rasm' },
  karusel: { format: 'karusel', nom: 'Karusel (slaydlar)' },
  maqola: { format: 'maqola', nom: 'Maqola (Telegram)' },
  reels: { format: 'reels', nom: 'Reels (AI video)' },
};
const MAHSULOTLAR = Object.keys(PROFIL);
const mKod = (m) => (MAHSULOTLAR.includes(m) ? m : null);
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
"davomiylik":"reels bo'lsa 30–40 (soniya), aks holda 0"}`;

// Prodyuser: g'oyani rahbarga moslab "o'raydi" — taklif + TZ. izoh + oldingi — rahbar tuzatishi bilan qayta
export async function prodyuser(goya, { izoh = '', oldingi = null } = {}) {
  const tz = await askJSON({
    maxTokens: 4000,
    system: `Sen kontent prodyuserisan. Rahbarning g'oyasini uning biznes maqsadiga moslab o'raysan va texnik topshiriq (TZ) yozasan.
Maqsad — uchala mahsulotni (Kotib AI, Qadam AI, Kontent Fabrika) va Jo'rabekning shaxsiy brendini sotish; kontent faqat bitta mahsulot haqida bo'lib qolmasin.
Kontent turini g'oyaga qarab tanla: hamma narsa video emas. Matn — tez fikr; matn+rasm — hissiy yoki vaziyatli fikr;
karusel — qadamlar, ro'yxat, taqqoslash (saqlanadigan); maqola — chuqur qo'llanma; reels — hikoya, e'tiroz, demo.
TANQIDIY FIKRLASH: taklif berishdan oldin o'zingdan so'ra — bu g'oyaning zaif joyi nima, auditoriya nimaga ishonmaydi,
oldin shunaqasi bo'lganmi, soxta va'da yo'qmi. Topganingni "xavflar" ga yoz va TZ da yop.
${brand()}${saboqlar()}`,
    prompt: `G'OYA: ${goya}
${oldingi ? `\nOLDINGI TZ (rahbar ko'rib chiqdi):\n${JSON.stringify(oldingi)}\n` : ''}${izoh ? `RAHBAR TUZATISHI (albatta bajar, qolganini saqla): ${izoh}\n` : ''}
RUBRIKALAR:\n${rubrikaRoyxati()}
${muvozanat()}${performanceSummary()}
Soxta raqam, mijoz natijasi yoki narx to'qima. O'zbek tili (lotin).
JSON: ${TZ_SXEMA}`,
  });
  if (!TURLAR[tz.kontent_turi]) tz.kontent_turi = 'matn';
  tz.mahsulot = mKod(tz.mahsulot) || 'umumiy';
  tz.cta = tz.cta || {};
  const direkt = String(tz.cta.maqsad || '').toLowerCase() === 'direkt';
  tz.cta.kod = direkt ? (oldingi?.cta?.kod || uniqueCode(tz.cta.kod || tz.sarlavha)) : '';
  if (tz.kontent_turi === 'reels') tz.davomiylik = Math.min(40, Math.max(25, Number(tz.davomiylik) || 35));
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

// Rahbarga ko'rinish (Telegram uchun oddiy matn)
export function korinish(d) {
  const toza = (h = '') => String(h).replace(/<br\s*\/?>|<\/(p|li|h\d|blockquote|div|tr)>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim();
  const slaydlar = (d.slides || []).map((s, i) => `${i + 1}) ${[s.kicker, s.title, s.text, s.accent, s.num, s.label, ...(s.items || [])].filter(Boolean).join(' · ')}`).join('\n');
  const ss = d.reels?.ssenariy;
  const reelsMatn = ss ? (ss.sahnalar || []).map((x, i) => `${i + 1}) 🎙 ${x.ovoz}\n   🖥 ${x.ekran}`).join('\n') + `\n📣 🎙 ${ss.yakun?.ovoz || ''}\n   🖥 ${ss.yakun?.ekran || ''}` : '';
  return [
    `✍️ ${TURLAR[d.kontent_turi]?.nom || d.format}: ${d.title}`,
    toza(d.post_html),
    d.article_html && d.format !== 'post' ? `━━━ Maqola/karusel matni:\n${toza(d.article_html).slice(0, 1500)}` : '',
    slaydlar ? `━━━ Slaydlar:\n${slaydlar}` : '',
    reelsMatn ? `━━━ Reels ssenariy:\n${reelsMatn}` : '',
    d.notes ? `ℹ️ ${d.notes}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 3900);
}

// Muallif: TZ bo'yicha yozadi (rahbar tekshiruvidan qayta yozish yo'q — faqat fakt tekshiruvi)
export async function muallif(tz) {
  if (!tz || !TURLAR[tz.kontent_turi]) throw xato('tz.kontent_turi kerak');
  return bilan(mKod(tz.mahsulot), async () => {
    const p = rejaga(tz);
    const copy = await write({ ...p, saboqlar: saboqlar() });
    let post_html = ensureCode(copy.post_html, p.cta_kod), art = null, reelsNatija = null;
    if (p.format === 'maqola' || p.format === 'karusel') art = await writeArticle(p, { post_html });
    if (tz.kontent_turi === 'reels') reelsNatija = await reels.ssenariy(reelsTz(tz));
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
export async function tasdiq({ draft_id, qaror = 'tasdiq', matn = '', izoh = '' }) {
  const d = store.get(String(draft_id || ''));
  if (!d) throw xato('qoralama topilmadi', 404);
  return bilan(mKod(d.mahsulot), async () => {
    if (qaror === 'qayta') {
      if (!String(izoh).trim()) throw xato('qayta yozish uchun izoh kerak');
      addFeedback(String(izoh).trim(), d);
      if (d.kontent_turi === 'reels' && d.reels) {
        const r = await reels.ssenariy(reelsTz(d.tz), { izoh, asos: d.reels.ssenariy });
        const x = store.update(d.id, { reels: r });
        return { draft_id: d.id, korinish: korinish(x), qayta: true, reels: r };
      }
      if (d.format === 'maqola' || d.format === 'karusel') {
        const art = await writeArticle(d.plan, { post_html: d.post_html }, izoh);
        let x = store.update(d.id, { article_html: art.article_html, slides: art.slides });
        if (art.slides?.length) x = await renderDraftSlides(x).catch(() => x);
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
      const x = store.update(d.id, { [maydon]: maydon === 'article_html' ? `<p>${html.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br/>')}</p>` : html, tahrirlangan: true });
      if (maydon === 'article_html' && x.slides?.length) await renderDraftSlides(x).catch(() => {});
      return { draft_id: d.id, korinish: korinish(store.get(d.id)), tahrirlangan: true };
    }
    if (d.format === 'post') addSample(d.post_html.replace(/<[^>]+>/g, ''));
    store.addChoice(d, true);
    return { draft_id: d.id, korinish: korinish(d) };
  });
}

// n8n yasagan rasm yoki video qoralamaga biriktiriladi
export function media({ draft_id, turi = 'rasm', b64, mime = 'image/png' }) {
  const d = store.get(String(draft_id || ''));
  if (!d) throw xato('qoralama topilmadi', 404);
  if (typeof b64 !== 'string' || b64.length < 100) throw xato('b64 fayl kerak');
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4' }[mime];
  if (!ext) throw xato(`mime qo'llanmaydi: ${mime}`);
  const fayl = path.join(rasmPath(d.id), `${turi}-${Date.now()}.${ext}`);
  fs.writeFileSync(fayl, Buffer.from(b64, 'base64'));
  const x = turi === 'video' ? store.update(d.id, { video_path: fayl }) : store.update(d.id, { image_paths: [...(d.image_paths || []), fayl].slice(-10) });
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
export function joyla({ draft_id, vaqt = '' }) {
  const d = store.get(String(draft_id || ''));
  if (!d) throw xato('qoralama topilmadi', 404);
  if (d.status === 'published') throw xato('post allaqachon chiqqan');
  const at = (vaqt && parseTime(vaqt)) || nextSlot();
  store.update(d.id, { status: 'approved', scheduledAt: at });
  return { ok: true, vaqt: fmtTime(at), kanal: cfg.channelId };
}

// G'oya ovchisi: kuzatilayotgan kanallar + internet → kunlik g'oyalar (g'oyalar bankiga ham yoziladi)
export async function kunlikGoyalar({ soni = 5, fetchFn } = {}) {
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
${ideaBank(8)}${muvozanat()}
Aynan ${soni} ta g'oya tanla: mahsulotlar va kontent turlari aralash bo'lsin (hammasi video emas), takrorlanmasin.
JSON: {"goyalar":[{"goya":"1–2 gap — nima haqida va qaysi burchakdan","nega":"nega hozir / nega kuchli","manba":"kanal @nom, havola yoki 'internet'","mahsulot":"ka|qa|kf|umumiy","tur":"${Object.keys(TURLAR).join('|')}"}]}`,
  });
  const goyalar = (r.goyalar || []).filter(g => g && g.goya).slice(0, soni).map((g, i) => ({ n: i + 1, ...g }));
  for (const g of goyalar) bilan(mKod(g.mahsulot), () => store.addIdea(g.goya));
  store.setSetting('kunlik_goyalar', { at: new Date().toISOString(), goyalar });
  return { goyalar, kanallar_xatosi: kuzatuv.xatolar };
}

export function goyaTanla({ n }) {
  const k = store.setting('kunlik_goyalar', null);
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
export async function ishlabChiqarish({ draft_id, variant = 0 }) {
  const d = store.get(String(draft_id || ''));
  if (!d) throw xato('qoralama topilmadi', 404);
  return bilan(mKod(d.mahsulot), async () => {
    if (d.kontent_turi === 'reels') {
      const v = d.reels?.variantlar?.[Number(variant)] || d.reels?.variantlar?.[0];
      if (!v) throw xato('reels ssenariysi yo\'q');
      const rt = reelsTz(d.tz);
      const sb = await reels.storibord(rt, v.ssenariy);
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
