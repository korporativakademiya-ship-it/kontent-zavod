# Kontent zavod (MVP)

Tadqiqot → strategiya → kopirayting → rahbar tekshiruvi → Telegram'da tasdiqlash → kanalga avtomatik post.

## Ishga tushirish
1. @BotFather'dan bot oching, tokenni oling.
2. Botni virtual ofis guruhiga (topiklar yoqilgan) va kanalga **admin** qilib qo'shing.
3. Guruhda "Tasdiqlash" va "Jarayon" topiklarini oching, har birida `/id` yozing — ID'larni oling.
4. `.env.example` → `.env` qilib to'ldiring.
5. `npm install` → `npm start`

## Max obuna bilan ishlatish
Kompyuteringizda (Claude Code o'rnatilgan): `claude setup-token` → chiqqan tokenni `.env` dagi
`CLAUDE_CODE_OAUTH_TOKEN` ga qo'ying, `LLM_MODE=max`. API'ga o'tish: `LLM_MODE=api` + `ANTHROPIC_API_KEY`.

## Railway
GitHub'ga yuklang → Railway'da New Project → repo'ni tanlang → Variables'ga `.env` qiymatlarini kiriting.
Settings → Root Directory: `kontent-zavod` (loyiha shu papkada). Railway `Dockerfile` ni o'zi topadi —
unda video uchun Chromium tayyor o'rnatilgan.
Volume qo'shing (`/data`) va `DATA_DIR=/data` qiling — qoralamalar va videolar o'chib ketmaydi.
Video render uchun kamida ~1 GB xotira kerak.

## Sifat: fakt tekshiruvi, g'oyalar banki, natijadan o'rganish
- **Fakt tekshiruvchi** — har postdagi raqam, foiz, tadqiqot va qonun da'volarini internetdan tekshiradi;
  noto'g'ri yoki manbasizini tuzatadi/yumshatadi. Qoralamada: `🔎 Fakt: 3 ta tasdiqlandi · 1 ta tuzatildi`
  yoki `⚠️ qo'lda tekshiring`. O'chirish: `FACT_CHECK=0`.
- **G'oyalar banki** — istalgan chatda `g'oya: ...` deb yozing; reja va strategiya ularni birinchi navbatda
  ishlatadi (rejada 💡 belgisi). `/goyalar`, `/goya_ochir N`.
- **Natijadan o'rganish** — kamida 5 ta kuzatilgan postdan keyin rejalashtiruvchi va strateg oxirgi 60 kunlik
  natijani ko'radi (format va rubrika bo'yicha o'rtacha reaksiya, eng yaxshi/sust postlar) va rejani shunga moslaydi.

## Haftalik reja va rubrikalar
- **Rubrikalar** — hafta kunlariga bog'langan doimiy ruknlar (standart: Du xato va yechim, Se qo'llanma,
  Chor keys, Pay AI vosita, Ju shablon, Sha savol-javob). Har kunning birinchi posti rubrika bo'ladi.
  `/rubrikalar`, `/rubrika_qosh Du karusel Nom — tavsif`, `/rubrika_ochir N` (`hammasi` — standartga qaytarish).
- **Reja** — har yakshanba 18:00 (`PLAN_CRON`) bot ertadan boshlab 7 kunlik reja yuboradi: kun, vaqt
  (`POST_TIMES`), rubrika, format, mavzu. ✅ Tasdiqlash · ✏️ O'zgartirish (izoh bilan) · 🔄 Qayta tuzish.
  Qo'lda: `/reja_yangi`, ko'rish: `/reja`. Reja kunlari: `PLAN_DAYS`.
- Tasdiqlangan rejadagi postlar chiqishidan ~1 kun oldin (har kuni `DAILY_CRON` da) yoziladi va reja
  vaqtiga qo'yiladi; ✅ bosilsa aynan shu vaqtda chiqadi. Reja bo'lmasa bot avvalgidek erkin g'oya izlaydi.
- **`/avto on`** — rejadagi postlar tasdiqlashsiz o'z vaqtida chiqadi (topikda ko'rinadi, vaqtini
  o'zgartirish yoki navbatdan olish mumkin). `/avto off` — har postni o'zingiz tasdiqlaysiz.

## Natijalar: CTA kodlari va haftalik hisobot
- Strateg postlarning kamida yarmiga **direkt CTA** qo'yadi va har biriga noyob kod so'z beriladi:
  "Direktga <b>KPI</b> deb yozing". Kod post, maqola, karusel va videoda bir xil — direktga kim qaysi
  postdan yozganini kod so'zidan bilasiz.
- Kanal reaksiyalari yig'iladi (bot kanal admini bo'lishi kerak).
- **Haftalik hisobot** (dushanba 09:00, `REPORT_CRON`) va `/hisobot [kun]`: har post reaksiyalari,
  formatlar bo'yicha o'rtacha va qisqa xulosa. Ko'rishlar soni Bot API'da yo'q.

## Uslubingizni o'rgatish
- **Namuna postlar:** eng yaxshi 15–30 ta postingizni botga **shaxsiy chatda forward** qiling, keyin
  `/uslub_yangila` — bot uslubingizni (ohang, hook, gap uzunligi, sevimli iboralar, CTA) tavsiflab saqlaydi.
  Kopirayter har safar mavzuga eng yaqin 3 ta namunangizni ham ko'radi.
- **Tahrirlardan o'rganish:** ✏️ Tahrir izohlaringiz yig'iladi; har 5 tasidan umumiy **doimiy qoidalar**
  chiqariladi (bir martalik tuzatishlar emas). Rahbar agent qoidalar buzilmaganini tekshiradi.
- Buyruqlar: `/uslub`, `/uslub_yangila`, `/uslub_tozala`, `/qoidalar`, `/qoidalar_yangila`, `/qoidalar_ochir N`.

## Maqola va karusel (Telegram "Статья")
Strateg har g'oyaga format tanlaydi: `post`, `maqola`, `karusel` yoki `reels`.
- **maqola** — Telegram maqolasi (Bot API rich message): sarlavhalar, ro'yxat, checklist, jadval,
  iqtibos, yig'iladigan bloklar. Muallif agent: `src/agents/article.js`.
- **karusel** — brend uslubidagi 1080×1350 slaydlar (`src/video/carousel.html`), maqola ichida slideshow bo'lib chiqadi.
- Qoralama tasdiqlash topigiga ham xuddi kanaldagidek maqola ko'rinishida keladi.
- Telegram maqolani rad etsa, bot oddiy formatga o'tadi (slaydlar albom + qisqa post) va logga sababini yozadi.
- Qoralamaga video yasalsa, u ham maqola ichiga qo'shiladi.

## Vaqt belgilash
- **✅ Tasdiqlash** — keyingi bo'sh vaqtga (`POST_TIMES`) avtomatik qo'yadi.
- **🕒 Vaqt belgilash / 🕒 Vaqtni o'zgartirish** — vaqtni o'zingiz yozasiz (reply): `18:30`, `ertaga 09:00`,
  `indinga 10:00`, `28.09 19:00` (Toshkent vaqti). **↩️ Navbatdan olish** — rejadan chiqaradi.
- `/navbat` — rejalashtirilganlar ro'yxati; bosib vaqtini o'zgartirasiz.

## Rasm (🖼 Rasm tugmasi)
- O'z rasmingizni yuboring (so'rovga reply) — postga qo'shiladi; bir nechta bo'lsa albom bo'ladi.
- `muqova` deb yozsangiz — brend uslubida muqova yasaladi. `o'chir` — rasmlarni olib tashlaydi.
- Maqolada rasmlar sarlavhadan keyin (bir nechta bo'lsa — kollaj) chiqadi.

## Ovoz (🎙 Ovoz va video dublyaj)
`.env` da `TTS_PROVIDER` sozlansa:
- **🎥 Video** avtomatik dublyaj bilan chiqadi: motion agent har sahnaga diktor matnini yozadi, sahnalar
  ovoz uzunligiga moslanadi.
- **🎙 Ovoz** — postning audio varianti (ovozli xabar). Tasdiqlansa post bilan birga chiqadi (maqolada — ichida).
- Provayderlar: **Azure** (tayyor o'zbekcha ovozlar `uz-UZ-SardorNeural`, `uz-UZ-MadinaNeural`) yoki
  **ElevenLabs** (o'z ovozingizni klonlab, `ELEVENLABS_VOICE_ID` ga qo'yasiz).

## Reels video (🎥 Video tugmasi)
Qoralamadagi **🎥 Video** tugmasi bosilganda:
1. Motion agent (`src/agents/motion.js`) post va ssenariydan sahnalar yozadi (hook, raqam, qadamlar, xulosa, CTA).
2. Sahnalar `src/video/template.html` shabloniga (HTML + GSAP) qo'yiladi.
3. Playwright shablonni kadrma-kadr suratga oladi, ffmpeg 1080×1920 MP4 ga yig'adi (~1–2 daqiqa).
4. Video tasdiqlash topigiga keladi. Tasdiqlansa, kanalga video + post matni chiqadi.

Pullik video xizmat kerak emas — faqat Claude so'rovi va server. Dizayn (ranglar, shriftlar) shablonda,
imzo `src/brand.js` dagi `VIDEO_SIGNATURE` da. Shablonni brauzerda ochsangiz, namuna video o'ynaydi.
Ovoz sozlangan bo'lsa, video dublyaj bilan chiqadi (yuqoriga qarang).

## Buyruqlar
Qoralama tugmalari: ✅ Tasdiqlash · 🕒 Vaqt belgilash · ⚡ Hozir · ✏️ Tahrir · 🎬 Ssenariy · 🖼 Rasm · 🎥 Video · 🎙 Ovoz · ❌ Rad

`/yangi` — hozir g'oya izlash · `/goya <mavzu>` — mavzu bo'yicha post · `/maqola <mavzu>` · `/karusel <mavzu>` · `/navbat` — rejalashtirilganlar · `/id`

Nisha profili: `src/brand.js` — ohang va auditoriyani shu yerda o'zgartirasiz.
