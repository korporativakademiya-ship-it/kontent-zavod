# Kontent render va n8n kontent doskasi

Telegram'ga g'oya yozasiz → AI ssenariy yozadi → Nano Banana sahnalarga rasm chizadi → shu servis 9:16 MP4 yig'adi → video va post matni Telegram'ga keladi. Instagram'ga o'zingiz joylaysiz.

Railway loyihasi: `kontent-doska` (n8n + Postgres + `kontent-render`). n8n: https://n8n-production-fc74.up.railway.app

## Servis

| Yo'l | Nima qiladi |
|---|---|
| `POST /render` | JSON sahnalardan MP4 qaytaradi (tuzilishi — `tekshir.js`) |
| `GET /health` | `{"ok":true}` |

Tashqi domeni yo'q — faqat Railway ichki tarmog'ida: `http://kontent-render.railway.internal:8080/render`. Bir vaqtda bitta render, qolgani navbatda. 40 soniyalik video taxminan 2–3 daqiqada tayyor.

```json
{
  "sahnalar": [
    { "matn": "Tungi *02:47*. Siz uxlayapsiz.", "izoh": "Mijozingiz esa yozyapti…", "rasm": "https://… yoki data:image/png;base64,…", "soniya": 4 }
  ],
  "yakun": { "matn": "Raqobatchingizdan oldin javob bering", "tugma": "Direct'ga yozing 👇", "izoh": "" }
}
```

`*so'z*` — ajratib ko'rsatiladi. Rasm bo'lmasa — rangli fon. Chegaralar: 12 sahna, 90 soniya, rasm 8 MB.

### `POST /kino` — shablonli video (asosiy yo'l)

Bir nechta shablonni bitta videoga yig'adi: har sahnada `shablon` va `tur`. Diktor ovozi (`audio`) bo'lsa, sahna ovoz tugaguncha turadi. Fon musiqasi va effektlar (pop, whoosh, marker, klaviatura) ffmpeg bilan sintez qilinadi. `bob` maydonidan yuqorida boblar va progress chizig'i chiqadi. Chegara: 40 sahna, 300 soniya.

| Shablon | Sahna turlari | Namuna |
|---|---|---|
| `grid` — oq katak, 3D uslub | kartalar, obyekt, oqim, chat, crm, cta | `grid-namuna.json` |
| `doska` — marker bilan doska/daftar | sarlavha, hisob, oqim, taqqos, cta | `doska-namuna.json` |
| `plakat` — katta rangli yozuvlar | kinetik, raqam, grafik, royxat, test, yol, ikki, meme, audiogramma, slaydlar | `plakat-namuna.json` |
| `chat` — Telegram yozishma-hikoya | (xabarlar: matn, ovoz, rasm, buyurtma) | `chat-namuna.json` |
| `ekran` — ekran yozuvi telefon/kompyuter ramkasida | (video yoki rasm + zoomlar, bosishlar, izohlar) | `ekran-namuna.json` |

Aralash uzun video namunasi — `kino-namuna.json`. Sahnalarni Fabrika'dagi kino rejissyori (`kontent-zavod/src/agents/kino.js`) tuzadi; ekran yozuvi va karusel rasmlari faqat haqiqiy media bilan ishlaydi.

Mahalliy ishga tushirish: `npm install && HOST=0.0.0.0 PORT=8080 npm start` (ffmpeg kerak). Test: `npm test`.

## n8n doska (`n8n/kontent-doska.json`) — kontent bo'limi (suhbat)

Miya — **Kontent Fabrika** (shu repodagi `kontent-zavod/`): suhbat bosqichlari va agentlar `kontent-zavod/src/suhbat.js`, `kontent-zavod/src/agents/kontent.js`.
Doska — n8n. JSON `n8n/yasa.py` dan yasaladi — o'zgartirsangiz `python3 n8n/yasa.py`.

Ishlaydigan joy — **ofis guruhining topiklari**: har topik o'z yo'nalishi (Kotib AI / Qadam AI / Kontent Fabrika / shaxsiy brend).
Topikni bir marta bog'lash: topikda `topik: ka` (yoki `qa`, `kf`, `brend`) deb yozing; `PRODUCT_TOPICS` dagi topiklar avtomatik bog'langan.
Shaxsiy chat va topiksiz (General) xabarlar e'tiborsiz qoladi — javob doim o'sha topikka qaytadi.

Oqim: topikdagi xabar yoki tugma → Fabrika `/api/suhbat` (chatId + thread) → javob xabarlari o'sha topikka (TZ / matn / joylash tugmalari bilan).
Fabrika ishlab chiqarish topshirsa: **kino** (reels va uzun video) — har sahna uchun Gemini ovoz → renderer `/kino` → video;
**matn+rasm** — Nano Banana rasm → Fabrikaga → tanqidchi → joylash tugmalari. **09:00** — har topikka o'z g'oyalari (3 tadan).

Guruhga ulash: n8n botini guruhga qo'shing va admin qiling (yoki @BotFather → /setprivacy → Disable, keyin botni guruhdan chiqarib qayta qo'shing) —
aks holda bot oddiy xabarlarni ko'rmaydi. Eski Fabrika boti ham guruhda: xabarni "g'oya:" bilan boshlamang (u eski bankka yozadi).

n8n muhit o'zgaruvchilari (Railway): `FABRIKA_URL`, `FABRIKA_API_KALIT` (= Fabrikadagi `N8N_API_KALIT`), `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.
Credential'lar: **Telegram API** (alohida bot), **Query Auth** (Name `key`, Value — Gemini kaliti).
Ovoz: "Sahnalarni ajrat" blokidagi `OVOZ`. Chat ruxsati: "Kiruvchi" → `RUXSAT`.

`n8n/ovoz-sinov.json` — qo'lda ishga tushiriladigan sinov: Gemini TTS modellarini topadi va bitta gapni 4 ovozda Telegram'ga yuboradi.
