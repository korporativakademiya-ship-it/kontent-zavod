import { askJSON } from '../llm.js';
import { brand } from '../style.js';

// Kino rejissyori: tasdiqlangan ssenariyni video shablonlari sahnalariga aylantiradi (kontent-render /kino).
// Shablonlar: grid (oq katak, kartochkalar, chat va CRM), doska (marker bilan doska/daftar), plakat (katta yozuv, raqam,
// grafik, ro'yxat, test, yo'l, ikki tomon, meme, audiogramma), chat (Telegram yozishma-hikoya).
// Ekran yozuvi va karusel rasmlari haqiqiy media talab qiladi — rejissyor ularni ishlatmaydi.

export const KINO_SPEC = `SHABLONLAR VA SAHNA TURLARI (maydonlar — JSON):
grid (och kulrang katakli fon, 3D uslub, sariq urg'u):
  kartalar {kartalar:[{ikon:"instagram|telegram|whatsapp",nom:"INSTAGRAM",badge:"99+"}], silkinish:bool, soat:"23:47"} — ilova kartochkalari, xabarlar ko'pligi
  obyekt {} — sariq robot "qahramon" (yechim paydo bo'lishi)
  oqim {manbalar:["instagram","telegram","whatsapp"], markaz:"Kotib AI"} — hammasi bitta markazga oqadi
  chat {nom:"Kotib AI", xabarlar:[{kim:"mijoz|bot",matn}], toast:"✅ Yangi lid: Aziz"} — kichik chat oynasi (3–5 xabar)
  crm {lidlar:[{ism,izoh,yol:[{t:0.4,col:0},{t:1.6,col:1},{t:3,col:2}]}]} — CRM ustunlari Yangi→Suhbatda→Sotildi (3–4 lid)
  cta {tugma:"KOTIB"} — katta bosiladigan tugma
doska (qo'lda chizilgan marker; fon:"doska" yoki "daftar"):
  sarlavha {fon:"doska", qatorlar:["...","*urg'u* so'z","..."]} — 2–3 qator katta qo'lyozma, *so'z* aylanaga olinadi
  hisob {fon:"daftar", qatorlar:["Kuniga xabar: 40 ta","..."], natija:"Oyiga: 30 000 000 so'm", izoh:"qisqa xulosa"} — daftarda hisob-kitob (3–5 qator)
  oqim {fon:"doska", qadamlar:["...","...","..."], yakun:"yomon|yaxshi"} — 3–4 quti va strelka
  taqqos {fon:"daftar", chap:"Oldin", ong:"Keyin", qatorlar:[["yomon","yaxshi"],...]} — 2–4 qator
  cta {fon:"doska", soz:"KOTIB", matn:"Direct'ga yozing"}
plakat (to'liq rangli fon: rang "sariq|qora|oq"):
  kinetik {matn:"katta so'zlar, *urg'u*", emoji:"🤯"} — ilmoq, qoida, xulosa (≤ 10 so'z)
  raqam {qiymat:78, belgi:"%", matn:"...", manba:"faqat haqiqiy manba bo'lsa"} — bitta katta raqam
  grafik {sarlavha, birlik:"%", ustunlar:[{nom,qiymat}]} — 3–5 ustun
  royxat {sarlavha, bandlar:["...","..."]} — top-ro'yxat 3–5 band
  test {savol, variantlar:["A","B","C"], cta:"👇 Javobingizni izohda yozing"} — tomoshabinga savol (izoh yig'adi)
  yol {sarlavha, bosqichlar:[{vaqt:"1-kun",matn}]} — 3–4 bosqich
  ikki {chap:{sarlavha,emoji,bandlar:[...]}, ong:{sarlavha,emoji,bandlar:[...]}} — yomon va yaxshi yonma-yon (3 banddan)
  meme {yuqori:{yorliq:"Kutilgan",emoji,matn}, pastki:{yorliq:"Haqiqat",emoji,matn}} — hazil, tanish holat
  audiogramma {muallif:"Jo'rabek Pulatov", matn:"iqtibos"} — muallifning kuchli fikri
chat (butun ekran Telegram yozishmasi; ketma-ket chat sahnalari BITTA suhbatni davom ettiradi):
  yozishma {ism:"Aziz", soat:"23:47", sana:"Bugun", xabarlar:[{kim:"mijoz|bot",matn} | {kim:"mijoz",tur:"ovoz",davom:"0:09"} |
            {kim:"bot",tur:"buyurtma",buyurtma:{sarlavha:"Buyurtma #1024",qatorlar:[["Xizmat","..."],["Narx","..."]],holat:"✅ Qabul qilindi"}}]} — 2–4 xabar sahnaga`;

const TURLAR = {
  grid: ['kartalar', 'obyekt', 'oqim', 'chat', 'crm', 'cta'],
  doska: ['sarlavha', 'hisob', 'oqim', 'taqqos', 'cta'],
  plakat: ['kinetik', 'raqam', 'grafik', 'royxat', 'test', 'yol', 'ikki', 'meme', 'audiogramma'],
  chat: ['yozishma'],
};
// Bu maydonlarsiz sahna chizilmaydi — bo'lmasa plakat/kinetik ga aylantiriladi
const KERAK = {
  'grid.kartalar': ['kartalar'], 'grid.chat': ['xabarlar'], 'grid.crm': ['lidlar'],
  'doska.sarlavha': ['qatorlar'], 'doska.hisob': ['qatorlar', 'natija'], 'doska.oqim': ['qadamlar'], 'doska.taqqos': ['qatorlar'],
  'plakat.kinetik': ['matn'], 'plakat.raqam': ['qiymat'], 'plakat.grafik': ['ustunlar'], 'plakat.royxat': ['bandlar'],
  'plakat.test': ['savol', 'variantlar'], 'plakat.yol': ['bosqichlar'], 'plakat.ikki': ['chap', 'ong'], 'plakat.meme': ['yuqori', 'pastki'],
  'plakat.audiogramma': ['matn'], 'chat.yozishma': ['xabarlar'],
};
// LLM media havolasi bermasin (rasm/video — faqat rahbar yuborgani)
const MEDIA = new Set(['audio', 'video', 'rasm', 'rasmlar', 'kadrlar', 'avatar']);

// Chuqur tozalash: satrlar va massivlar qisqartiriladi, media maydonlari olib tashlanadi
function toza(v, chuqur = 0) {
  if (chuqur > 5) return undefined;
  if (typeof v === 'string') return v.trim().slice(0, 220);
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.slice(0, 8).map(x => toza(x, chuqur + 1)).filter(x => x !== undefined && x !== '');
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) { if (MEDIA.has(k)) continue; const y = toza(x, chuqur + 1); if (y !== undefined) o[k] = y; }
    return o;
  }
  return undefined;
}

const bor = (x) => (Array.isArray(x) ? x.length > 0 : x !== undefined && x !== null && x !== '');

export function kinoTozala(r) {
  const kirgan = Array.isArray(r?.sahnalar) ? r.sahnalar : [];
  const sahnalar = [];
  for (const x0 of kirgan.slice(0, 36)) {
    if (!x0 || typeof x0 !== 'object') continue;
    let x = toza(x0);
    if (!TURLAR[x.shablon] || !TURLAR[x.shablon].includes(x.tur)) x = { ...x, shablon: 'plakat', tur: 'kinetik', matn: x.matn || x.subtitr || x.ovoz || '' };
    if (!(KERAK[`${x.shablon}.${x.tur}`] || []).every(k => bor(x[k]))) x = { ...x, shablon: 'plakat', tur: 'kinetik', matn: x.subtitr || x.ovoz || '' };
    if (x.shablon === 'plakat' && x.tur === 'kinetik' && !bor(x.matn)) continue;
    const cap = { 'doska.sarlavha': ['qatorlar', 3], 'doska.hisob': ['qatorlar', 5], 'doska.oqim': ['qadamlar', 4], 'plakat.royxat': ['bandlar', 5],
      'plakat.test': ['variantlar', 4], 'plakat.yol': ['bosqichlar', 4], 'plakat.grafik': ['ustunlar', 5], 'grid.chat': ['xabarlar', 5], 'chat.yozishma': ['xabarlar', 4], 'grid.kartalar': ['kartalar', 3] }[`${x.shablon}.${x.tur}`];
    if (cap && Array.isArray(x[cap[0]])) x[cap[0]] = x[cap[0]].slice(0, cap[1]);
    if (x.shablon === 'doska') x.fon = x.fon === 'daftar' || ['hisob', 'taqqos'].includes(x.tur) && x.fon !== 'doska' ? 'daftar' : 'doska';
    if (x.shablon === 'grid' && x.tur === 'crm') x.lidlar = x.lidlar.slice(0, 4).map((l, i) => ({ ism: String(l.ism || `Mijoz ${i + 1}`).slice(0, 14), izoh: String(l.izoh || '').slice(0, 16),
      yol: (Array.isArray(l.yol) && l.yol.length ? l.yol : [{ t: .4 + i * .2, col: 0 }]).slice(0, 3)
        .map(q => ({ t: Math.max(.2, Math.min(8, Number(q.t) || .4)), col: Math.max(0, Math.min(2, Math.round(Number(q.col) || 0))) }))
        .sort((a, b) => a.t - b.t) }));
    if (x.shablon === 'grid' && x.tur === 'kartalar') x.kartalar = x.kartalar.filter(k => k && typeof k === 'object').map(k => ({ ...k, ikon: ['instagram', 'telegram', 'whatsapp'].includes(k.ikon) ? k.ikon : 'telegram' }));
    if (x.shablon === 'plakat' && x.tur === 'raqam') x.qiymat = Number(String(x.qiymat).replace(/[^\d.]/g, '')) || 0;
    if (x.shablon === 'plakat' && x.tur === 'grafik') x.ustunlar = x.ustunlar.filter(u => u && typeof u === 'object').map(u => ({ nom: String(u.nom || '').slice(0, 20), qiymat: Number(u.qiymat) || 0 }));
    if (x.shablon === 'plakat' && x.tur === 'test') delete x.javob; // javobni izohda so'raymiz
    if (x.shablon === 'doska' && x.tur === 'taqqos') x.qatorlar = x.qatorlar.filter(q => Array.isArray(q) && q.length >= 2).slice(0, 4);
    if (x.shablon === 'doska' && x.tur === 'taqqos' && !x.qatorlar.length) continue;
    x.ovoz = String(x.ovoz || '').slice(0, 400);
    x.rejissura = String(x.rejissura || '').slice(0, 160);
    x.subtitr = String(x.subtitr || '').slice(0, 110);
    x.bob = String(x.bob || '').slice(0, 24);
    x.soniya = Math.min(12, Math.max(2, Number(x.soniya) || 4));
    sahnalar.push(x);
  }
  // Ketma-ket chat sahnalari bitta suhbat: ism va soat birinchisidan
  let oldin = null;
  for (const s of sahnalar) {
    if (s.shablon === 'chat') { if (oldin) { s.ism = oldin.ism; s.soat = oldin.soat; } else { s.ism = String(s.ism || 'Mijoz').slice(0, 20); oldin = s; } }
    else oldin = null;
  }
  if (sahnalar.length < 3) throw new Error('Kino rejissyori yetarli sahna qaytarmadi');
  return sahnalar;
}

// tz — reels TZ (davomiylik bilan), ssenariy — rahbar tasdiqlagan variant
export async function kinoReja(tz, ssenariy) {
  const soniya = Number(tz.davomiylik) || 35, uzun = soniya > 50;
  const r = await askJSON({
    maxTokens: uzun ? 9000 : 6000,
    system: `Sen video rejissyorisan. Tasdiqlangan ssenariyni tayyor video shablonlaridagi sahnalarga aylantirasan: har sahnada ekranda nima ko'rinishini
shablon va sahna turini tanlab, maydonlarini to'ldirasan. Maqsad — diqqatni ushlab turadigan, tez, tushunarli va sotadigan video.
${KINO_SPEC}
QOIDALAR:
- Birinchi sahna — ilmoq (1,5–3 soniya): kinetik, kartalar, meme yoki raqam. Oxirgi sahna — CTA (grid.cta, doska.cta yoki sariq kinetik).
- Formatlarni ARALASHTIR: kamida 2–3 xil shablon; bir xil sahna turi ketma-ket 2 martadan ko'p emas. ${uzun ? "Uzun video: 3–5 bob (bob maydoni: 'Muammo', 'Hisob', 'Yechim', 'Natija', 'Xulosa' kabi), har 5–8 soniyada vizual o'zgarish, o'rtasida 1 ta test yoki meme (tomoshabinni uyg'otish)." : 'Reels: 6–10 sahna, bob shart emas.'}
- Har sahnada "ovoz" — diktor aytadigan gap: ssenariydagi diktor matnidan ol, ma'nosini o'zgartirma; o'zbekcha og'zaki, raqamlar so'z bilan, inglizcha qisqartma yo'q; sahnaga 1–2 qisqa gap.
- "rejissura" — ovoz uchun inglizcha qisqa ko'rsatma (sur'at, hissiyot, urg'u).
- "subtitr" — ekran pastidagi yozuv: ssenariydagi "ekran" matnini tartib bo'yicha AYNAN ol (rahbar tasdiqlagan, *urg'u* bilan saqla); kinetik va audiogramma sahnasida o'sha matn "matn" maydoniga o'tadi, subtitr bo'sh.
- Misollardagi nomlar (Kotib AI, Aziz, instagram…) — faqat namuna: topik yo'nalishi va TZ ga mosini yoz; mahsulot bo'lmasa, uni tiqma.
- "soniya" — sahna ≈ ovoz uzunligi (2,5 so'z ≈ 1 soniya), 2–10.
- Soxta raqam, manba yoki mijoz natijasi to'qima; hisob-kitob "misol" bo'lsa shuni ko'rsat (masalan izoh: "misol").
- Matnlar o'zbek tilida (lotin), qisqa — shablon kichik joyga sig'dirishi kerak.
${brand()}`,
    prompt: `TZ:\n${JSON.stringify(tz)}\n\nSSENARIY:\n${JSON.stringify(ssenariy)}\n
Taxminiy davomiylik: ${soniya} soniya.${tz.cta?.kod ? ` CTA kodi: ${tz.cta.kod}.` : ''}
JSON: {"sahnalar":[{"shablon":"...","tur":"...", ...maydonlar, "ovoz":"...","rejissura":"...","subtitr":"...","bob":"...","soniya":4}],
"smm":{"post_matni":"video ostiga 2–4 gap, oxirida CTA","heshteglar":["#..."],"muqova_matni":"≤ 5 so'z"}}`,
  });
  return { sahnalar: kinoTozala(r), smm: r.smm || {} };
}
