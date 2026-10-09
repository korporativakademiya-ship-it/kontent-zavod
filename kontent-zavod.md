# Kontent zavod — loyiha pasporti

> Tuzilgan sana: 2026-10-09. Manba: repo kodi, README, git tarixi (40 commit, 15 PR), Railway holati va loglari.
> "?" — aniq bilinmagan joy.
> Eslatma: bu fayl bulutdagi sessiyada tuzildi, `E:\Desktop\Ijod\Loyihalar\_Produktlar\` papkasiga bevosita yozib bo'lmadi —
> fayl repo ildizida (`kontent-zavod.md`); uni o'sha papkaga qo'lda ko'chiring.

## 1. Nomi
- **Asosiy nom:** Kontent zavod (`kontent-zavod`, package.json v0.1.0, README'da "Kontent zavod (MVP)").
- **Boshqa nomlar:** **Kontent Fabrika** (shu tizimning sotiladigan mahsulot nomi — `src/brand.js`, `src/mahsulot.js`);
  Railway servisi — `kontent-bot`; n8n tomoni — `kontent-doska`. Git branch nomlarida — "kontent bo'limi".
- **Bir jumlada:** AI agentlar jamoasi (tadqiqotchi → strateg/prodyuser → kopirayter → fakt tekshiruvchi → tanqidchi) Telegram kanal
  uchun post, maqola, karusel va reels tayyorlaydi, egasi Telegram'da tasdiqlaydi va bot kanalga o'zi joylaydi —
  O'zbekistondagi ekspert va biznes egalari uchun (hozir — Joʻrabekning o'z kanali uchun).

## 2. Qaysi muammoni hal qiladi
- **Kimning og'rig'i:** o'z Telegram kanalini yuritadigan ekspert, konsultant, biznes egasi (birinchi navbatda — muallifning o'zi).
- **Og'riq:** kontentga vaqt yo'q, kanal "o'lik", g'oya tugaydi, muntazamlik yo'q, kontentdan sotuv yo'q (`src/mahsulot.js`, `kf` profili).
- Ichki vazifa: muallifning 3 mahsulotini (Kotib AI, Qadam AI, Kontent Fabrika) va shaxsiy brendini ("biznesni tizimga solaman")
  bitta kanalda muntazam, uning uslubida targ'ib qilish.

## 3. Holat
- **Holat: jonli (lekin faol ishlatilishi noaniq).** Railway'da servis `live`, oxirgi deploy `SUCCESS` (2026-09-30).
- **Oxirgi kod o'zgarishi:** 2026-09-30 (PR #15 "Kino rejissyori, topiklar bo'yicha ish, kengroq brend"). Undan keyin commit yo'q.
- Butun loyiha 4 kunda yozilgan: 2026-09-27 … 2026-09-30.
- Loglarga ko'ra: n8n har kuni ~09:00 (Toshkent) `POST /api/goyalar/kunlik` chaqiradi (2026-10-08 gacha, hammasi 200).
  `/api/suhbat` (rahbar bilan suhbat orqali tasdiqlash) 30-sentabrdan keyin **bir marta ham chaqirilmagan**.
  Telegram bot orqali (grammy, polling) qancha ishlatilgani — ? (HTTP logda ko'rinmaydi).
- 2–4 oktyabrda Kotibim CRM kalendari bilan aloqa xatolari (502, timeout) bo'lgan; hozirgi holati — ?

## 4. Qayerda turibdi
- **Lokal papka:** ? (Windows'da qayerdaligi noma'lum; repo ichida kod `kontent-zavod/` papkasida).
- **GitHub:** `korporativakademiya-ship-it/kontent-zavod` (asosiy branch `main`, 15 ta PR — hammasi merge qilingan).
- **Railway:**
  - Loyiha **`kontent-zavod`** → servis **`kontent-bot`** (production, region sfo, 1 replika), Volume `kontent-data` 5 GB → `/data`.
    Root Directory `/kontent-zavod`, manba `main` branch (avto-deploy).
  - Bog'liq loyiha **`kontent-doska`** → servislar `n8n`, `kontent-render`, `Postgres` (n8n doska va video renderer;
    kodi `korporativakademiya-ship-it/kotibim` → `kontent-render/` — README bo'yicha).
- **URL:** `https://kontent-bot-production-b7b7.up.railway.app` (faqat API: `/api/health`, `/api/reels/*`, `/api/kontent/*`, `/api/suhbat` …).
- **Telegram bot nomi:** ? (token `BOT_TOKEN` da; @username kodda yo'q). Kanal — ? (`CHANNEL_ID`), uslub kanali — ? (`USLUB_KANAL`).
- **Maxfiy ma'lumotlar qayerda:** Railway → `kontent-zavod` → `kontent-bot` → Variables:
  `BOT_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `N8N_API_KALIT`, `KONTENT_API_KALIT` (Kotibim bilan umumiy), `KOTIBIM_URL`, ID'lar.
  Shablon — `kontent-zavod/.env.example`. Ma'lumotlar (qoralamalar, uslub, qoidalar, g'oyalar) — Volume `/data`;
  har kuni 03:15 da egasiga shaxsiy chatda zaxira fayl yuboriladi.

## 5. Texnologiya
- **Til:** Node.js ≥20 (ES modules), JavaScript. ~4 500 qator (src + test).
- **Baza:** yo'q — JSON fayllar `DATA_DIR` (/data) da (`src/store.js`).
- **AI:** Claude. Ikki rejim: `LLM_MODE=api` (Anthropic SDK, standart `claude-sonnet-5`, web_search tool) yoki
  `LLM_MODE=max` (Claude Agent SDK + Max obuna OAuth token, `MAX_MODEL=sonnet`). **Prodda — `max` rejim** (o'zgaruvchilar ro'yxatida
  `CLAUDE_CODE_OAUTH_TOKEN` bor, `ANTHROPIC_API_KEY` yo'q).
- **Telegram:** grammy (bot, inline tugmalar, Telegram "Статья"/rich message, topikli guruh).
- **Video:** Playwright (Chromium) + GSAP HTML shablon → kadrlar → ffmpeg-static → 1080×1920 MP4. Karusel 1080×1350.
- **Jadval:** node-cron (kunlik yozish, haftalik reja, hisobot, zaxira, har daqiqa kalendar sinxroni).
- **n8n:** `kontent-doska` dagi n8n API orqali bot "miyasi"ni chaqiradi (`x-api-kalit`). Workflow'lar kodi bu repoda yo'q.
- **Tashqi xizmatlar:** Kotibim CRM (kontent kalendari sinxroni), Telegram ochiq kanallari `t.me/s/<nom>` (raqobatchi kuzatuvi),
  TTS — Azure (uz-UZ-Sardor/Madina) yoki ElevenLabs (**prodda sozlanmagan** — `TTS_PROVIDER` yo'q).
- Docker: `mcr.microsoft.com/playwright:v1.56.1-noble` (lekin Railway sozlamasida builder `RAILPACK` ko'rinadi, `railway.json` esa
  DOCKERFILE deydi — qaysi biri ishlayotgani ?).
- Testlar: `node --test`, 33 ta test, hammasi o'tadi (2026-10-09 tekshirildi).

## 6. Imkoniyatlar
**Ishlaydi (kodda bor, test/deploy qilingan):**
- To'liq agent liniyasi: tadqiqotchi, strateg, kopirayter, rahbar tekshiruvi, fakt tekshiruvchi (internet), tanqidchi.
- Formatlar: post, Telegram maqola (rich), karusel (slaydlar + kollaj preview), reels video (HTML+GSAP → MP4), "kino" shablonlari
  (doska, plakat, chat, grid), ovozli variant (TTS sozlansa).
- Tasdiqlash tugmalari: ✅ / 🕒 vaqt / ⚡ hozir / ✏️ tahrir / 🎬 ssenariy / 🖼 rasm / 🎥 video / 🎙 ovoz / ❌; navbat, vaqtni o'zgartirish.
- Mahsulot rejimi: ofis guruhida har mahsulot (ka/qa/kf) o'z topigi, g'oyalar banki, jadvali bilan.
- Haftalik reja va rubrikalar, `/avto on` avtomatik chiqarish.
- Uslubni o'rganish: forward qilingan postlardan va o'z kanalidan; tahrirlardan doimiy qoidalar.
- CTA kod so'zlari, kanal reaksiyalari, haftalik hisobot, natijadan o'rganish (≥5 post).
- n8n uchun REST API (reels va kontent liniyalari, g'oya ovchisi, suhbat).
- Kotibim CRM kalendari bilan ikki tomonlama sinxron. Kunlik zaxira va tiklash.

**Chala yoki buzuq / noaniq:**
- Instagram kuzatuvi — faqat ro'yxatda saqlanadi, o'qilmaydi (Meta Business Discovery ulanmagan).
- Instagram'ga chiqarish — yo'q (reels storibord/SMM matn beradi, joylashni n8n/render qiladi — ishlashi ?).
- Ko'rishlar soni Bot API'da yo'q — hisobot faqat reaksiyalar bo'yicha.
- TTS prodda o'chiq → video dublyajsiz, 🎙 Ovoz ishlamaydi.
- Kotibim kalendari bilan aloqa uzilishlari (2–4 okt) — sabab Kotibim tomonida (502/timeout); hozir — ?
- `/api/suhbat` (n8n orqali rahbar suhbati) deploydan keyin ishlatilmagan — amalda sinalmagan bo'lishi mumkin.
- Max obuna tokeni bilan ishlash — Anthropic shartlari bo'yicha mijozga xizmat sifatida sotishga mos emas (pastga qarang).
- Bir vaqtda ikki interfeys (Telegram bot va n8n doska) — qaysi biri asosiy ekanligi aniq emas: ?

## 7. Kim ishlatyapti
- **O'zim** (Joʻrabek, o'z kanali va 3 mahsulot uchun). Mijoz — yo'q (kodda/hujjatda biror mijoz nomi yo'q).
- Real foydalanish darajasi — ?: n8n har kuni g'oya so'raydi, lekin rahbar suhbati/tasdiq API chaqiruvlari loglarda yo'q.

## 8. Boshqa loyihalar bilan bog'liqligi
- **Kotibim (Kotib AI)** — `korporativakademiya-ship-it/kotibim`: CRM'dagi «Kontent kalendar» sahifasi shu bot bilan sinxron;
  n8n workflow va `kontent-render` video renderer o'sha repoda. CTA kod so'zlari lidni Kotibim CRM'da postga bog'lash uchun
  (lid integratsiyasi bir marta qo'shilib, keyin olib tashlangan — commit 22ee5a3).
- **kontent-doska** (Railway) — n8n + renderer + Postgres; bu botni "miya" sifatida chaqiradi.
- **Qadam AI**, **Kotib AI** — kontent mavzusi sifatida (mahsulot profillari `src/mahsulot.js`).
- **instagram-agent** (Railway, 2026-10-07 yaratilgan) — nomiga ko'ra Instagram tomoni bo'lishi mumkin; bog'liqligi — ?
- Takrorlanuvchi kod/g'oya: Claude `llm.js` (api|max rejim), JSON store, grammy bot karkasi — boshqa botlarda ham bo'lishi mumkin — ?
- Qayerdan ko'chirilgan: birinchi commit "Add files via upload" (2026-09-27) — 14 fayllik MVP qo'lda yuklangan; manbasi — ?

## 9. Pul
- **To'lov olinganmi:** yo'q (mijoz yo'q) — ma'lum emas, ehtimol yo'q: ?
- **Server xarajati:** Railway `kontent-bot` (1 GB+ RAM video uchun, 5 GB volume) + `kontent-doska` (n8n, Postgres, renderer).
  Aniq summa — ? (Railway billing ko'rilmadi). AI — Claude Max obuna (oylik obuna, alohida token xarajati yo'q).
- **Sotish mumkinmi:** ha, "Kontent Fabrika" nomi bilan xizmat sifatida rejalangan (brand.js'da mahsulot sifatida yozilgan).
  Lekin hozir **bir mijozga (o'zingizga) qattiq bog'langan**: brend matni, imzo "Joʻrabek", 3 mahsulot profili kodda.
  Sotish uchun: API kalitga (`LLM_MODE=api`) o'tish va multi-tenant qilish kerak.

## 10. "Upakovka"gacha qolgan qadamlar
1. **Asosiy interfeysni tanlash:** Telegram bot *yoki* n8n doska — bittasini asosiy qilib, ikkinchisini soddalashtirish/o'chirish.
2. **Haqiqiy ishlatish sinovi:** 2 hafta o'z kanalida har kuni ishlatib, tasdiq foizi, tahrirlar soni va reaksiyalarni yozib borish
   (hozir loglarda faol foydalanish ko'rinmaydi).
3. **Mijozga moslash (multi-tenant):** brend, imzo, mahsulot profillari va rubrikalarni koddan sozlamaga (har mijoz uchun profil) chiqarish.
4. **API rejimiga o'tish** (`ANTHROPIC_API_KEY`), har mijoz bo'yicha token xarajatini hisoblash → narx belgilash.
5. **Kotibim bog'liqligini ixtiyoriy qilish va aloqa barqarorligini tuzatish** (502/timeout'lar).
6. **TTS ni yoqish** (Azure o'zbekcha ovoz) — video va ovoz formatlari to'liq ishlashi uchun.
7. **Sotuv paketi:** 1 sahifalik taklif, namuna haftalik reja va 3–5 ta tayyor post/karusel/reels namunasi, onboarding yo'riqnomasi.

## 11. Xulosa
**Davom ettirish** — o'z kanali uchun ichki vosita sifatida, keyin "Kontent Fabrika" xizmatiga aylantirish.
Kod yetuk (keng funksiya, 33 test, prodda jonli), lekin 4 kunda tez yozilgan va real foydalanish isboti yo'q.
`kontent-doska` (n8n + renderer) bilan bitta mahsulotga **birlashtirish** kerak — hozir bitta tizim ikki Railway loyiha va ikki repoga
(`kontent-zavod` + `kotibim/kontent-render`) bo'lingan.
