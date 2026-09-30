// Instagram reels rubrikalari: har biri mahsulot, voronka bosqichi va formatga bog'langan.
// Prodyuser g'oyaga eng mosini tanlaydi; mos kelmasa — "erkin".

export const FORMATLAR = {
  motion: "Motion matn — katta matn + AI fon + diktor. Tez fikr, fakt, bitta xulosa.",
  hikoya: "Hikoya — 5–7 kadrli AI sahnalar + diktor. Keys, 'bir mijozim…', vaziyat.",
  taqqoslash: "Taqqoslash / oldin-keyin — ❌ va ✅ ketma-ket, ekran ikkiga bo'lingan hissi.",
  "chat-demo": "Chat-demo — telefon ekranida agent va mijoz yozishmasi, CRM kartasi.",
  doska: "Doska / daftar — qo'lda yozilayotgan formula, sxema, 3 qadam.",
  royxat: "Ro'yxat / top-N — raqamli kartochkalar: '3 ta xato', '5 ta belgi'.",
};

export const REELS_RUBRIKALAR = [
  { kod: 'javobsiz-mijoz', nom: 'Javobsiz qolgan mijoz', mahsulot: 'ka', voronka: 'sovuq', format: 'hikoya',
    tavsif: "Kech javob tufayli yo'qotilgan mijoz hikoyasi; og'riqni his qildirish, yechim — Kotib AI." },
  { kod: 'agent-jonli', nom: 'Agent jonli', mahsulot: 'ka', voronka: 'iliq', format: 'chat-demo',
    tavsif: "Agent mijoz bilan qanday gaplashib, lid olib, uchrashuv belgilashini ko'rsatish." },
  { kod: 'xodim-1-kun', nom: "Yangi xodimning 1-kuni", mahsulot: 'qa', voronka: 'sovuq', format: 'taqqoslash',
    tavsif: "Tizimsiz onboarding (tartibsizlik) va Qadam AI bilan (o'qish yo'li, test) — oldin/keyin." },
  { kod: 'rahbar-100-marta', nom: 'Rahbar 100 marta tushuntiradi', mahsulot: 'qa', voronka: 'sovuq', format: 'doska',
    tavsif: "Bilim bitta odam boshida; standart va kurs orqali tizimga solish." },
  { kod: 'olik-kanal', nom: "O'lik kanal", mahsulot: 'kf', voronka: 'sovuq', format: 'motion',
    tavsif: "Kontentga vaqt yo'q, kanal jim; muntazam kontent — mijoz oqimi." },
  { kod: 'bir-goya-5-kontent', nom: "Bir g'oyadan 5 kontent", mahsulot: 'kf', voronka: 'iliq', format: 'royxat',
    tavsif: "Bitta g'oya post, karusel, reels, maqolaga qanday aylanishi — Kontent Fabrika demosi." },
  { kod: 'tizimsiz-tizimli', nom: 'Tizimsiz vs tizimli', mahsulot: null, voronka: 'ekspertlik', format: 'taqqoslash',
    tavsif: "Bir vaziyat ikki biznesda: dehqoncha boshqaruv va tizimli boshqaruv." },
  { kod: 'etiroz', nom: 'Tadbirkor e\'tirozi', mahsulot: null, voronka: 'issiq', format: 'motion',
    tavsif: "'Qimmat-ku', 'bot tabiiy emas', 'xodimlarim o'rganmaydi' — e'tirozga halol javob." },
  { kod: '1-daqiqa-dars', nom: '1 daqiqalik dars', mahsulot: null, voronka: 'ekspertlik', format: 'doska',
    tavsif: "Bitta amaliy usul (KPI, SOP, javob skripti) 3 qadamda — saqlanadigan kontent." },
  { kod: 'parda-ortida', nom: 'Parda ortida', mahsulot: null, voronka: 'ishonch', format: 'hikoya',
    tavsif: "Jo'rabek mijozga tizim/agentni qanday qurayotgani — shaxsiy brend." },
];

export function rubrikaMatni() {
  return REELS_RUBRIKALAR.map(r =>
    `- ${r.kod}: "${r.nom}" — mahsulot: ${r.mahsulot || 'umumiy'}, voronka: ${r.voronka}, format: ${r.format}. ${r.tavsif}`).join('\n');
}

export function formatMatni() {
  return Object.entries(FORMATLAR).map(([k, v]) => `- ${k}: ${v}`).join('\n');
}
