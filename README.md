# Kontent Fabrika — bitta loyiha

Telegram kanal uchun kontentni AI agentlar jamoasi tayyorlaydi va **avtomatik chiqaradi**:
g'oya topish → reja → matn / karusel / maqola / video → (tasdiq yoki avto) → kanal.

Oldin ikki alohida loyiha edi — **kontent-zavod** (miya + Telegram bot) va **kontent-doska** (n8n doska + video renderer,
kodi `kotibim` reposida). Endi hammasi shu repoda:

| Papka | Nima | Railway |
|---|---|---|
| `kontent-zavod/` | Miya: agentlar, haftalik reja, avto rejim, Telegram bot, kanalga chiqarish, n8n uchun API | servis `kontent-bot` (Root Directory `/kontent-zavod`) |
| `kontent-render/` | Video yig'uvchi: kino shablonlari (grid, doska, plakat, chat, ekran) → 9:16 MP4 | servis `kontent-render` (Root Directory `/kontent-render`, faqat ichki tarmoq) |
| `kontent-render/n8n/` | n8n doska workflow'i (`yasa.py` → `kontent-doska.json`) | servis `n8n` (ixtiyoriy) |

## G'oya manbalari (g'oya ovchilari)
- **Telegram kanallar** — `kanal: @nom` bilan kuzatuvga qo'shiladi, `t.me/s/<nom>` dan eng ko'p ko'rilgan postlar o'qiladi.
- **Instagram profillar** — `IG_ACCESS_TOKEN` + `IG_USER_ID` (Meta Business Discovery) berilsa, eng faol postlar o'qiladi.
- **Internet** — tadqiqotchi agent (web qidiruv).
- **Rahbarning o'z g'oyalari** — `g'oya: ...`; banda birinchi navbatda ishlatiladi (AI topganlari alohida belgilanadi 🔭).

## Avtomatik chiqish
`/avto on` — haftalik reja o'zi tuziladi va tasdiqlanadi, postlar chiqishidan ~1 kun oldin yoziladi va o'z vaqtida kanalga chiqadi.
Soatlik tekshiruv o'tkazib yuborilgan ishlarni yetib oladi (bot qayta ishga tushsa ham). Batafsil: `kontent-zavod/README.md`.
