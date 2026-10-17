import { AsyncLocalStorage } from 'node:async_hooks';

// Mahsulot "miyasi": ofis guruhidagi har mahsulot topigi o'z g'oyalar banki, rejasi,
// jadvali va profili bilan ishlaydi. Muallif ovozi, uslub va qoidalar — umumiy (brand.js, style.js).
// Joriy mahsulot AsyncLocalStorage orqali uzatiladi: agentlar va store o'zi biladi.

const STANDART_PROFIL = {
  ka: {
    nom: 'Kotib AI', belgi: '🤖', shior: 'Mijozlarga 24/7 javob beradi',
    rang: { fon: '#0E3B43', urgu: '#5EEAD4' }, // chuqur feruza + yalpiz: tez javob, AI
    profil: `Kotib AI — Telegram va Instagram'da mijozlarga 24/7 darhol javob beradigan AI sotuvchi-kotib.
Biznes ma'lumotidan gapiradi, ehtiyojni aniqlaydi, ism va telefonni olib egasiga "yangi lid" yuboradi, ovoz va rasmni tushunadi,
har yozishma CRM'da. Egasiga: eslatma, vazifa, kalendar, hujjat.
AUDITORIYA: mijozlari Telegram/Instagram'dan yozadigan kichik va o'rta biznes egalari (do'kon, klinika, o'quv markaz, xizmatlar).
OG'RIQLAR: kech javob tufayli mijoz raqobatchiga ketadi, kechasi va dam olish kuni xabarlar javobsiz, egasi o'zi yozishadi,
lidlar yo'qoladi, kim nima so'ragani noma'lum.
MAVZULAR: tez javob va sotuv, lid yo'qotish, AI sotuvchi qanday ishlaydi, CRM va mijoz bazasi, avtomatlashtirish, "botni sinab ko'ring".
CTA: botni o'zi sinab ko'rish yoki bepul konsultatsiya.`,
  },
  qa: {
    nom: 'Qadam AI', belgi: '🎓', shior: "Xodimlarni o'qitish platformasi",
    rang: { fon: '#2A1B5C', urgu: '#FFB547' }, // chuqur indigo + qahrabo: ta'lim, o'sish
    profil: `Qadam AI — xodimlarni o'qitish va onboarding platformasi: lavozim bo'yicha o'qish yo'li, video darslar, testlar,
rahbar paneli, sertifikat; telefondan ishlaydi; kurslarni biz tayyorlab beramiz.
AUDITORIYA: 10–100 xodimli kompaniyalar va filialli tarmoqlar rahbarlari, HR.
OG'RIQLAR: yangi xodim sekin o'rganadi, rahbar bir narsani qayta-qayta tushuntiradi, xodim almashinuvi, filiallarda standart yo'q,
bilim bir odamning boshida.
MAVZULAR: onboarding, lavozim yo'riqnomasi va standartlar (SOP), xodim o'qitish, bilimni tizimga solish, rahbar vaqti.
Boshqa kompaniya nomlari va ularning kurslarini tilga olma.
CTA: bepul diagnostika yoki demo.`,
  },
  kf: {
    nom: 'Kontent Fabrika', belgi: '✍️', shior: 'Kanal uchun AI kontent jamoasi',
    rang: { fon: '#1C1C1E', urgu: '#FF6B3D' }, // grafit + zavod olovrang: ishlab chiqarish
    profil: `Kontent Fabrika — Telegram kanal uchun kontentni AI agentlar jamoasi tayyorlaydi: tadqiqot, haftalik reja, matn,
fakt tekshiruvi; egasining uslubini o'rganadi; har post egasi tasdig'idan o'tadi; karusel va reels ham.
AUDITORIYA: ekspertlar, kouchlar, konsultantlar, o'z kanalini yuritadigan biznes egalari.
OG'RIQLAR: kontentga vaqt yo'q, kanal "o'lik", g'oya tugaydi, muntazamlik yo'q, kontentdan sotuv yo'q.
MAVZULAR: muntazam kontent, kontent-voronka va CTA, uslub, AI bilan kontent, kanal o'sishi, kontentdan mijoz.
CTA: namuna reja yoki bepul konsultatsiya.`,
  },
};

// Joriy mahsulotlar: standart — yuqoridagilar; boshqa mijoz uchun bazadagi "mahsulotlar" sozlamasi (/sozla) o'rnini bosadi.
// Obyekt joyida yangilanadi — import qilgan hamma modul yangi ro'yxatni ko'radi
export const PROFIL = { ...STANDART_PROFIL };
export function profillarniQollash(yangi) {
  const manba = yangi && typeof yangi === 'object' && Object.keys(yangi).length ? yangi : STANDART_PROFIL;
  for (const k of Object.keys(PROFIL)) delete PROFIL[k];
  for (const [k, v] of Object.entries(manba)) if (/^[a-z]{2}$/.test(k) && v?.nom) PROFIL[k] = { belgi: '📦', profil: '', ...v };
}
export const mahsulotKodlari = () => Object.keys(PROFIL);

// Har mahsulotning haftalik chiqish jadvali (Toshkent vaqti; kun: 0=Ya … 6=Sha).
// Bitta kanal uchun — vaqtlar to'qnashmaydi. /jadval bilan o'zgartiriladi.
export const STANDART_JADVAL = {
  ka: [{ day: 1, time: '09:00' }, { day: 3, time: '09:00' }, { day: 5, time: '09:00' }, { day: 6, time: '19:00' }],
  qa: [{ day: 2, time: '09:00' }, { day: 4, time: '19:00' }],
  kf: [{ day: 1, time: '19:00' }, { day: 4, time: '09:00' }],
};

const als = new AsyncLocalStorage();
export const joriy = () => als.getStore()?.m || null;
export const bilan = (m, fn) => (m ? als.run({ m }, fn) : fn());

// PRODUCT_TOPICS="ka:867,qa:869,kf:871" — ofis guruhidagi mahsulot topiklari
export function topiklar(env = process.env) {
  const out = {};
  for (const q of String(env.PRODUCT_TOPICS || '').split(',')) {
    const [k, v] = q.split(':').map(s => s.trim());
    if (PROFIL[k] && Number(v)) out[k] = Number(v);
  }
  return out;
}
export const rejim = () => Object.keys(topiklar()).length > 0;
export const kodlar = () => Object.keys(topiklar());
export const topigi = (m) => topiklar()[m];
export const topikdan = (thread) => Object.entries(topiklar()).find(([, v]) => v === Number(thread))?.[0] || null;

// G'oya/reja bandidagi "[qa07] ..." prefiksidan mahsulot
export const prefiksdan = (text = '') => {
  const m = /^\s*\[([a-z]{2})\d{2}\]/i.exec(String(text));
  const k = m?.[1]?.toLowerCase();
  return k && PROFIL[k] ? k : null;
};

// Agentlarga: umumiy brenddan keyin shu mahsulot qatlami
export function mahsulotQatlami(m = joriy()) {
  const p = PROFIL[m];
  if (!p) return '';
  return `\nBU POST FAQAT "${p.nom}" HAQIDA (kanal umumiy, lekin hozir shu mahsulot rubrikasi):
${p.profil}
Mavzu, og'riq, misol va CTA shu mahsulotga bog'lansin. Boshqa mahsulotlarni faqat o'rinli bo'lsa bir so'z bilan eslat.\n`;
}
