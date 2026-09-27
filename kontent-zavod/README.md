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

## Reels video (🎥 Video tugmasi)
Qoralamadagi **🎥 Video** tugmasi bosilganda:
1. Motion agent (`src/agents/motion.js`) post va ssenariydan sahnalar yozadi (hook, raqam, qadamlar, xulosa, CTA).
2. Sahnalar `src/video/template.html` shabloniga (HTML + GSAP) qo'yiladi.
3. Playwright shablonni kadrma-kadr suratga oladi, ffmpeg 1080×1920 MP4 ga yig'adi (~1–2 daqiqa).
4. Video tasdiqlash topigiga keladi. Tasdiqlansa, kanalga video + post matni chiqadi.

Pullik video xizmat kerak emas — faqat Claude so'rovi va server. Dizayn (ranglar, shriftlar) shablonda,
imzo `src/brand.js` dagi `VIDEO_SIGNATURE` da. Shablonni brauzerda ochsangiz, namuna video o'ynaydi.
Ovoz (dublyaj) hali yo'q — keyingi bosqich.

## Buyruqlar
Qoralama tugmalari: ✅ Tasdiqlash · ⚡ Hozir · ✏️ Tahrir · 🎬 Ssenariy · 🎥 Video · ❌ Rad

`/yangi` — hozir g'oya izlash · `/goya <mavzu>` — mavzu bo'yicha post · `/navbat` — rejalashtirilganlar · `/id`

Nisha profili: `src/brand.js` — ohang va auditoriyani shu yerda o'zgartirasiz.
