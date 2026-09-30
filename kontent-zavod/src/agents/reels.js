import { askJSON } from '../llm.js';
import { brand, examples } from '../style.js';
import { bilan, PROFIL } from '../mahsulot.js';
import { store } from '../store.js';
import { uniqueCode } from '../cta.js';
import { performanceSummary } from '../insights.js';
import { REELS_RUBRIKALAR, FORMATLAR, rubrikaMatni, formatMatni } from '../reels/rubrikalar.js';

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
"ovoz":{"jins":"erkak|ayol","ohang":"...","surat":"sekin|o'rtacha|tez"},
"vizual":{"uslub":"...","palitra":"...","yoruglik":"...","makon":"...","personaj":"yoshi, tashqi ko'rinishi, kiyimi"},
"cta":{"maqsad":"direkt|obuna|saqlash|ulashish","matn":"...","kod":"direkt bo'lsa 1 so'z, lotin katta harf"},
"taqiqlar":["..."],"toldirilgan":["..."]}`,
  }));
  tz.mahsulot = mKod(tz.mahsulot) || 'umumiy';
  if (!REELS_RUBRIKALAR.some(r => r.kod === tz.rubrika)) tz.rubrika = 'erkin';
  if (!MAQSADLAR.includes(tz.maqsad)) tz.maqsad = 'lid';
  if (!FORMATLAR[tz.format]) tz.format = 'motion';
  tz.cta = tz.cta || {};
  tz.cta.kod = String(tz.cta.maqsad || '').toLowerCase() === 'direkt' ? uniqueCode(tz.cta.kod || tz.sarlavha) : '';
  tz.goya = goya;
  return tz;
}

const SSENARIY_SXEMA = `{"sarlavha":"...","sahnalar":[{"qism":"ilmoq|og'riq|yechim|dalil","ovoz":"diktor gapi — og'zaki, 1–2 qisqa gap, ≤ 150 belgi",
"ekran":"ekrandagi katta matn — 3–9 so'z, eng muhim 1–2 so'z *yulduzcha* ichida","soniya":3}],
"yakun":{"ovoz":"CTA diktor gapi","ekran":"CTA ekran matni","tugma":"≤ 24 belgi, masalan: Direct'ga KOTIB deb yozing 👇"}}`;

const MEZONLAR = `1) ilmoq birinchi 3 soniyada ushlaydimi; 2) TZ ga mosmi (rubrika, format, maqsad, asosiy fikr);
3) bitta aniq fikr, suv yo'q; 4) diktor matni og'zaki va o'qishga oson (uzun gap, qavs, ro'yxat yo'q);
5) ekran matni qisqa va diktorni takrorlamaydi; 6) CTA aniq va TZ dagi kod bilan; 7) soxta raqam/natija/narx yo'q;
8) o'zbek tili sof, muallif uslubi va doimiy qoidalari buzilmagan.`;

// Ssenariychi yozadi, tanqidchi baholaydi; 8 dan past bo'lsa izoh bilan qayta yoziladi (ko'pi bilan 2 marta)
export async function ssenariy(tz, { izoh = '', urinishlar = 2 } = {}) {
  return bilan(mKod(tz.mahsulot), async () => {
    let tanqid = null, eng = null;
    for (let i = 0; i <= urinishlar; i++) {
      const s = await askJSON({
        maxTokens: 3500,
        system: `Sen reels ssenariychisan: diktor matni va ekrandagi matnni yozasan. ${brand()}`,
        prompt: `TZ:\n${JSON.stringify(tz)}\n${examples(tz.asosiy_fikr || tz.sarlavha, 2)}
${izoh ? `RAHBAR IZOHI (albatta hisobga ol): ${izoh}\n` : ''}${tanqid ? `TANQIDCHI OLDINGI VARIANTGA: ${tanqid.baho}/10. Tuzat: ${tanqid.kamchiliklar.join('; ')}\n` : ''}
Davomiylik ≈ ${tz.davomiylik || 30} soniya; tanlangan ilmoq: "${tz.ilmoqlar?.[tz.tanlangan_ilmoq || 0]?.matn || ''}".
${tz.cta?.kod ? `CTA: "Direct'ga ${tz.cta.kod} deb yozing" — kod so'zini o'zgartirma.` : ''}
JSON: ${SSENARIY_SXEMA}`,
      });
      tanqid = await askJSON({
        maxTokens: 1200,
        system: `Sen talabchan reels tanqidchisisan (kontent bo'limi rahbari). ${brand()}`,
        prompt: `TZ:\n${JSON.stringify(tz)}\n\nSSENARIY:\n${JSON.stringify(s)}\n\nMezonlar: ${MEZONLAR}
JSON: {"baho":1-10,"kamchiliklar":["aniq, tuzatsa bo'ladigan"],"kuchli":"1 gap"}`,
      });
      tanqid.baho = Number(tanqid.baho) || 0;
      tanqid.kamchiliklar = Array.isArray(tanqid.kamchiliklar) ? tanqid.kamchiliklar : [];
      if (!eng || tanqid.baho > eng.tanqid.baho) eng = { ssenariy: s, tanqid, urinish: i + 1 };
      if (tanqid.baho >= 8) break;
    }
    return eng;
  });
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
