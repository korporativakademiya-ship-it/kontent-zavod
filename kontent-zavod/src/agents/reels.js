import { askJSON } from '../llm.js';
import { brand, examples, addFeedback } from '../style.js';
import { bilan, PROFIL } from '../mahsulot.js';
import { store } from '../store.js';
import { uniqueCode } from '../cta.js';
import { performanceSummary } from '../insights.js';
import { REELS_RUBRIKALAR, FORMATLAR, rubrikaMatni, formatMatni } from '../reels/rubrikalar.js';
import { TABIIY } from '../tabiiy.js';

// Instagram reels liniyasi (n8n doskadan chaqiriladi, src/api.js):
// Prodyuser (g'oya → TZ) → Ssenariychi + Tanqidchi (≥ 8/10) → Rejissyor + SMM (storibord, rasm tavsifi, post matni).
// Hamma agent umumiy brend, uslub, qoidalar va mahsulot qatlamiga (brand()) tayanadi.

const MAHSULOTLAR = Object.keys(PROFIL);
const mKod = (m) => (MAHSULOTLAR.includes(m) ? m : null);
const MAQSADLAR = ['lid', 'ishonch', 'ekspertlik', 'obunachi'];

// Instagram'da ishlagan ilmoq turlari — prodyuser va ssenariychi uchun
const ILMOQ_TURLARI = `savol ("Mijozingiz tunda yozsa, kim javob beradi?"), og'riq ("Har kuni 3 ta mijoz yo'qotyapsiz"),
qarama-qarshilik ("Arzon xodim qimmatga tushadi"), sir/qiziqish ("Bu agentni hech kim sotmaydi, men esa…"),
holat ("Tungi 02:47. Telefon jiringladi"), raqam — faqat haqiqiy bo'lsa.`;

export async function prodyuser(goya, { mahsulot } = {}) {
  const tz = await bilan(mKod(mahsulot), () => askJSON({
    maxTokens: 3500,
    system: `Sen Instagram reels prodyuserisan. Rahbarning xom g'oyasini to'liq texnik topshiriqqa (TZ) aylantirasan:
g'oyani aniqlashtirasan, yetishmaganini o'zing to'ldirasan va uni muallifning biznes maqsadiga — uchala mahsulotni sotishga — bog'laysan.
${brand()}`,
    prompt: `G'OYA: ${goya}
${mahsulot ? `Mahsulot oldindan tanlangan: ${mahsulot}.` : "Mahsulotni g'oyaga qarab o'zing tanla (ka / qa / kf yoki umumiy)."}

REELS RUBRIKALARI (eng mosini tanla; hech biri mos kelmasa "erkin"):
${rubrikaMatni()}

FORMATLAR:
${formatMatni()}

ILMOQ TURLARI: ${ILMOQ_TURLARI}
${performanceSummary()}
Qoidalar:
- Kontent bir xil bo'lmasin: rubrika, format, ilmoq turi va tuzilma g'oyaga qarab tanlanadi va nega tanlanganini qisqa yoz.
- Vizual qism puxta bo'lsin: bitta personaj (yoshi, tashqi ko'rinishi, kiyimi) va bitta makon/palitra — har kadrda bir xil.
- Soxta raqam, mijoz natijasi yoki narx to'qima. Dalil yo'q bo'lsa — "misol" deb belgilanadi.
- Diktor ovozi har doim erkak (muallif ovozi o'rnida); ohang va sur'atni g'oyaga qarab tanla.
- "toldirilgan" — g'oyada yo'q bo'lib, sen qo'shgan narsalar (rahbar ko'rib chiqishi uchun).
- O'zbek tili (lotin).

JSON:
{"sarlavha":"ishchi nom","mahsulot":"ka|qa|kf|umumiy","rubrika":"kod yoki erkin","rubrika_nomi":"...",
"format":"${Object.keys(FORMATLAR).join('|')}","format_sababi":"1 gap",
"maqsad":"${MAQSADLAR.join('|')}","voronka":"sovuq|iliq|issiq|ekspertlik|ishonch",
"auditoriya":"kim, qaysi biznes","ogriq":"...","etiroz":"asosiy e'tiroz","asosiy_fikr":"tomoshabin eslab qoladigan 1 fikr","burchak":"qaysi tomondan yoritamiz",
"ilmoqlar":[{"turi":"...","matn":"≤ 12 so'z"},{"turi":"...","matn":"..."},{"turi":"...","matn":"..."}],"tanlangan_ilmoq":0,
"tuzilma":[{"qism":"ilmoq|og'riq|yechim|dalil|cta","soniya":3,"mazmun":"..."}],
"dalil":"nimaga tayanamiz yoki 'misol'","davomiylik":30,
"ovoz":{"jins":"erkak","ohang":"...","surat":"sekin|o'rtacha|tez"},
"vizual":{"uslub":"...","palitra":"...","yoruglik":"...","makon":"...","personaj":"yoshi, tashqi ko'rinishi, kiyimi"},
"cta":{"maqsad":"direkt|obuna|saqlash|ulashish","matn":"...","kod":"direkt bo'lsa 1 so'z, lotin katta harf"},
"taqiqlar":["..."],"toldirilgan":["..."]}`,
  }));
  tz.mahsulot = mKod(tz.mahsulot) || 'umumiy';
  if (!REELS_RUBRIKALAR.some(r => r.kod === tz.rubrika)) tz.rubrika = 'erkin';
  if (!MAQSADLAR.includes(tz.maqsad)) tz.maqsad = 'lid';
  if (!FORMATLAR[tz.format]) tz.format = 'motion';
  tz.ovoz = { ...(tz.ovoz || {}), jins: 'erkak' };
  tz.cta = tz.cta || {};
  tz.cta.kod = String(tz.cta.maqsad || '').toLowerCase() === 'direkt' ? uniqueCode(tz.cta.kod || tz.sarlavha) : '';
  tz.goya = goya;
  return tz;
}

const SSENARIY_SXEMA = `{"sarlavha":"...","sahnalar":[{"qism":"ilmoq|og'riq|yechim|dalil","ovoz":"diktor gapi — jonli og'zaki o'zbekcha, 1–2 qisqa gap, ≤ 110 belgi; raqamlar so'z bilan; inglizcha atama va qisqartma yo'q",
"ekran":"ekrandagi katta matn — 3–9 so'z, eng muhim 1–2 so'z *yulduzcha* ichida","soniya":3}],
"yakun":{"ovoz":"CTA diktor gapi","ekran":"CTA ekran matni","tugma":"≤ 24 belgi, masalan: Direct'ga KOTIB deb yozing 👇"}}`;

const MEZONLAR = `1) ilmoq birinchi 3 soniyada ushlaydimi; 2) TZ ga mosmi (rubrika, format, maqsad, asosiy fikr);
3) bitta aniq fikr, suv yo'q; 4) diktor matni og'zaki va o'qishga oson; 5) ekran matni qisqa va diktorni takrorlamaydi;
6) CTA aniq; 7) o'zbek tili sof, muallif uslubi va doimiy qoidalari buzilmagan.`;

// Qat'iy xatolar — faqat shular tuzatiladi. Uslub va ohang bo'yicha tanqidchi faqat maslahat beradi:
// qayta yozish matnni silliq, lekin jonsiz qilib qo'yadi (rahbar birinchi variantni afzal ko'rdi).
const QATIY = `soxta raqam, mijoz natijasi yoki narx va'dasi; CTA kodi yo'q yoki boshqacha; davomiylik TZ dan 30% dan ko'p farq qiladi;
raqobatchini yomonlash; ekran matni 9 so'zdan uzun.`;

async function yoz(tz, { izoh = '', asos = null } = {}) {
  return askJSON({
    maxTokens: 3500,
    system: `Sen reels ssenariychisan: diktor matni va ekrandagi matnni yozasan. Jonli, og'zaki, muallif ovozida yoz.
Reels zerikarli bo'lmasin: har 3–5 soniyada yangi fikr yoki burilish, suv va takror yo'q, jami diktor matni ≈ 2.5 so'z/soniya
(35 soniya ≈ 85 so'z). Gaplar qisqa, talaffuzi oson — ovozni AI o'qiydi.
${TABIIY} ${brand()}`,
    prompt: `TZ:\n${JSON.stringify(tz)}\n${examples(tz.asosiy_fikr || tz.sarlavha, 2)}
${asos ? `ASOS — rahbar tanlagan variant (uslub va ohangini saqla, faqat izohga ko'ra o'zgartir):\n${JSON.stringify(asos)}\n` : ''}${izoh ? `RAHBAR IZOHI (albatta bajar): ${izoh}\n` : ''}
Davomiylik ≈ ${tz.davomiylik || 30} soniya; tanlangan ilmoq: "${tz.ilmoqlar?.[tz.tanlangan_ilmoq || 0]?.matn || ''}".
${tz.cta?.kod ? `CTA: "Direct'ga ${tz.cta.kod} deb yozing" — kod so'zini o'zgartirma.` : ''}
JSON: ${SSENARIY_SXEMA}`,
  });
}

async function tanqidla(tz, s) {
  const t = await askJSON({
    maxTokens: 1200,
    system: `Sen reels tanqidchisisan (kontent bo'limi rahbari). Adolatli baholaysan, jonli uslubni jazolamaysan. ${brand()}`,
    prompt: `TZ:\n${JSON.stringify(tz)}\n\nSSENARIY:\n${JSON.stringify(s)}\n\nBaholash mezonlari: ${MEZONLAR}
QAT'IY XATOLAR (faqat shular "qatiy" ga yoziladi): ${QATIY}
JSON: {"baho":1-10,"qatiy":["bor bo'lsa — aniq qaysi joy"],"maslahat":["uslub/ohang bo'yicha tavsiya — majburiy emas"],"kuchli":"1 gap"}`,
  });
  return {
    baho: Number(t.baho) || 0,
    qatiy: Array.isArray(t.qatiy) ? t.qatiy.filter(Boolean) : [],
    maslahat: Array.isArray(t.maslahat) ? t.maslahat.filter(Boolean) : [],
    kuchli: t.kuchli || '',
  };
}

// Ssenariychi yozadi, tanqidchi baholaydi. Qat'iy xato bo'lsa — uslubni saqlab faqat o'sha joy tuzatiladi (2-variant).
// Hamma variant qaytadi, rahbar o'zi tanlaydi. izoh + asos — rahbar tanlagan variantni izohiga ko'ra qayta yozish.
export async function ssenariy(tz, { izoh = '', asos = null } = {}) {
  return bilan(mKod(tz.mahsulot), async () => {
    const variantlar = [];
    if (asos) variantlar.push({ nom: 'Oldingi tanlov', ssenariy: asos, tanqid: await tanqidla(tz, asos) });
    const s1 = await yoz(tz, { izoh, asos });
    const t1 = await tanqidla(tz, s1);
    variantlar.unshift({ nom: izoh ? 'Izoh bo\'yicha yangi' : 'Asl variant', ssenariy: s1, tanqid: t1 });
    if (t1.qatiy.length) {
      const s2 = await yoz(tz, { asos: s1, izoh: `Faqat shu qat'iy xatolarni tuzat, qolgan hamma so'z, ohang va ritmni o'zgartirma: ${t1.qatiy.join('; ')}` });
      variantlar.splice(1, 0, { nom: 'Xatolari tuzatilgan', ssenariy: s2, tanqid: await tanqidla(tz, s2) });
    }
    // Eski maydonlar (moslik uchun): birinchi variant
    return { variantlar, ssenariy: variantlar[0].ssenariy, tanqid: variantlar[0].tanqid, urinish: variantlar.length };
  });
}

// Rahbar tanlovi: tanlangan variant ijobiy, qolganlari salbiy; izoh uslub xotirasiga (doimiy qoidalar shundan chiqadi)
export function tanlov({ tz = {}, variantlar = [], tanlangan = 0, izoh = '' }) {
  const i = Number(tanlangan);
  if (!Array.isArray(variantlar) || !variantlar[i]) throw Object.assign(new Error('tanlangan variant topilmadi'), { kod: 400 });
  const m = mKod(tz.mahsulot);
  const nom = (v) => `${v.ssenariy?.sarlavha || tz.sarlavha || 'reels'} [ssenariy: ${v.nom}]`;
  variantlar.forEach((v, k) => store.addChoice({ title: nom(v), format: 'reels', mahsulot: m }, k === i,
    k === i ? '' : `rahbar "${variantlar[i].nom}" variantini afzal ko'rdi`));
  const izohlar = String(izoh).trim() ? addFeedback(String(izoh).trim(), { title: nom(variantlar[i]), format: 'reels' }) : 0;
  return { ok: true, ssenariy: variantlar[i].ssenariy, izohlar };
}

// Rejissyor + SMM: kadrma-kadr storibord (renderer formatida) va Instagram uchun matn
export async function storibord(tz, s) {
  const r = await bilan(mKod(tz.mahsulot), () => askJSON({
    maxTokens: 4500,
    system: `Sen reels rejissyori va SMM mutaxassisisan. Har kadrda nima ko'rinishini puxta rejalaysan va Instagram uchun matn yozasan. ${brand()}`,
    prompt: `TZ:\n${JSON.stringify(tz)}\n\nSSENARIY:\n${JSON.stringify(s)}

Har sahna uchun AI rasm tavsifi (rasm_prompt) yoz — INGLIZCHA, bitta paragraf:
kadrdagi asosiy ob'ekt va harakat, makon, kamera burchagi (close-up / medium / wide, eye-level / top-down),
yorug'lik, palitra; personaj bo'lsa — TZ dagi personaj tavsifini har safar AYNAN takrorla (izchillik uchun);
Markaziy Osiyo (O'zbekiston) muhiti; fotorealistik; vertikal 9:16; "no text, no letters, no logos".
Kadr diktor aytayotgan gapni ko'rsatsin, chalg'itmasin. Sahna matni va ovozini ssenariydan ol (o'zgartirma).

JSON:
{"sahnalar":[{"matn":"ekran matni (*urg'u* bilan)","izoh":"","ovoz":"diktor gapi","soniya":3,"rasm_prompt":"...","kamera":"zoom-in|zoom-out|chapga|o'ngga"}],
"yakun":{"matn":"...","tugma":"...","izoh":"","ovoz":"..."},
"smm":{"post_matni":"reels ostiga 2–4 gap, oxirida CTA","heshteglar":["#..."],"muqova_matni":"≤ 5 so'z","birinchi_izoh":"...","joylash_vaqti":"masalan 19:00 — sababi"}}`,
  }));
  const sahnalar = (r.sahnalar || []).filter(x => x && x.matn).slice(0, 10);
  if (!sahnalar.length) throw new Error("Rejissyor sahna qaytarmadi");
  // Qoralama sifatida saqlanadi: sarlavha takrorlanmasin va CTA kodi band bo'lsin (kalendarda ko'rinmaydi)
  store.addDraft({ title: s.sarlavha || tz.sarlavha, format: 'reels', status: 'reels', cta_kod: tz.cta?.kod || '',
    ...(mKod(tz.mahsulot) ? { mahsulot: tz.mahsulot } : {}), rubric: tz.rubrika, plan: tz });
  return { sahnalar, yakun: r.yakun || {}, smm: r.smm || {} };
}

// Rahbar bahosi (1–5): tanlovlar xotirasiga — keyingi TZ va ssenariylar shundan o'rganadi
export function baho({ sarlavha, format = 'reels', mahsulot, ball, sabab = '' }) {
  const n = Number(ball);
  if (!(n >= 1 && n <= 5)) throw new Error('ball 1..5 bo\'lishi kerak');
  store.addChoice({ title: `${sarlavha} [reels ${n}/5]`, format, mahsulot: mKod(mahsulot) }, n >= 4, sabab);
  return { ok: true };
}
