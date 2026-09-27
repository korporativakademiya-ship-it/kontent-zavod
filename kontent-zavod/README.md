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
Volume qo'shing (`/data`) va `DATA_DIR=/data` qiling — qoralamalar o'chib ketmaydi.

## Buyruqlar
`/yangi` — hozir g'oya izlash · `/goya <mavzu>` — mavzu bo'yicha post · `/navbat` — rejalashtirilganlar · `/id`

Nisha profili: `src/brand.js` — ohang va auditoriyani shu yerda o'zgartirasiz.
