import fs from 'node:fs';
import path from 'node:path';
import { cfg } from '../config.js';
import { store } from '../store.js';
import { synth, ttsEnabled } from '../tts.js';
import { mediaDuration, telegramgaSigdir } from './ffmpeg.js';
import { makeVideo } from './make.js';
import { heygenVideo, heygenYoqilgan } from './heygen.js';
import { kinoReja } from '../agents/kino.js';
import { reelsTz } from '../agents/kontent.js';
import * as reels from '../agents/reels.js';

// Kino video (kontent-render servisi, shu repodagi kontent-render/): grid / doska / plakat / chat shablonlari,
// diktor ovozi, fon musiqasi va effektlar. Oldin bu yo'l faqat n8n doska orqali ishlardi — endi Fabrikaning o'zida.
// KONTENT_RENDER_URL — masalan http://kontent-render.railway.internal:8080 (Railway ichki tarmog'i).
export const kinoYoqilgan = () => Boolean(process.env.KONTENT_RENDER_URL);

// Rahbar tavsifidagi uzunlik: "40 soniya", "1 daqiqa", "1.5 minut" → soniya (10–300, render chegarasi)
export function soniyaIzohdan(izoh = '') {
  const t = String(izoh).toLowerCase();
  const d = t.match(/(\d{1,2}(?:[.,]\d)?)\s*(?:daqiqa\w*|minut\w*|min\b)/);
  const s = t.match(/(\d{1,3})\s*(?:soniya\w*|sekund\w*|sek\b|s\b)/);
  const n = d ? Number(d[1].replace(',', '.')) * 60 : s ? Number(s[1]) : 0;
  return n ? Math.max(10, Math.min(300, Math.round(n))) : 0;
}

// izoh — rahbar 🎥 bosganda yozgan tavsif ("doska uslubida, 40 soniya, 3 ta qadam"): ssenariy shunga qayta yoziladi
export async function kinoVideo(d, { fetchFn = fetch, izoh = '' } = {}) {
  if (!d.tz) throw new Error('kino uchun prodyuser TZ kerak');
  const rt = reelsTz({ ...d.tz, davomiylik: soniyaIzohdan(izoh) || Number(d.tz.davomiylik) || 35 });
  // Ssenariy: rahbar tanlagan variant bo'lsa — o'sha, aks holda ssenariychi yozadi; tavsif berilsa — shunga qayta yoziladi
  let ss = d.reels?.variantlar?.[d.reels?.tanlangan || 0]?.ssenariy || d.reels?.ssenariy;
  if (!ss || izoh) {
    const r = await reels.ssenariy(rt, izoh ? { izoh, asos: ss || null } : {});
    ss = r.ssenariy;
    store.update(d.id, { reels: r });
  }
  const { sahnalar } = await kinoReja(rt, ss, { izoh });
  const dir = path.join(cfg.dataDir, 'videos', d.id);
  fs.mkdirSync(dir, { recursive: true });
  const tayyor = [];
  for (const [i, s] of sahnalar.entries()) {
    const { ovoz, rejissura, ...sahna } = s;
    if (ovoz && ttsEnabled()) {
      try {
        const f = path.join(dir, `kino${i}.mp3`);
        await synth(ovoz, f);
        sahna.audio = `data:audio/mpeg;base64,${fs.readFileSync(f).toString('base64')}`;
      } catch (e) { console.error(`kino ovoz ${i}:`, e.message); } // sahna ovozsiz qoladi
    }
    tayyor.push(sahna);
  }
  const url = process.env.KONTENT_RENDER_URL.replace(/\/+$/, '') + '/kino';
  const res = await fetchFn(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nik: process.env.KINO_NIK || '', musiqa: true, effektlar: true, sahnalar: tayyor }),
    signal: AbortSignal.timeout(30 * 60e3)
  });
  if (!res.ok) throw new Error(`kontent-render ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const file = path.join(cfg.dataDir, 'videos', `${d.id}.mp4`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return { file, duration: await mediaDuration(file), data: { kino: tayyor.map(({ audio, ...x }) => x) }, voiced: tayyor.some(x => x.audio) };
}

// Bitta kirish. VIDEO_TURI=avatar (HeyGen sozlangan) — avatar; aks holda kino servisi ulangan va TZ bor bo'lsa — kino;
// qolgan hollarda (yoki xato bo'lsa) — ichki GSAP shabloni
// izoh — rahbar tavsifi: avatar so'ralsa (HeyGen sozlangan bo'lsa) — avatar, aks holda tavsif rejissyor va ssenariychiga beriladi.
// Tayyor video Telegram chegarasiga (50 MB) sig'diriladi.
export async function videoYasa(d, { log = async () => {}, izoh = '' } = {}) {
  const v = await videoTanla(d, { log, izoh: String(izoh || '').trim().slice(0, 600) });
  await telegramgaSigdir(v.file);
  return v;
}

async function videoTanla(d, { log, izoh }) {
  const avatarSorandi = /avatar/i.test(izoh);
  if (avatarSorandi && !heygenYoqilgan()) await log("⚠️ Avatar video sozlanmagan (HEYGEN_API_KEY, HEYGEN_AVATAR_ID) — shablon video yasayman");
  if ((avatarSorandi || (process.env.VIDEO_TURI === 'avatar' && !izoh)) && heygenYoqilgan()) {
    try { return await heygenVideo(d); }
    catch (e) { await log(`⚠️ Avatar video chiqmadi (${d.title}): ${e.message} — boshqa usul bilan yasayman`); }
  }
  if (kinoYoqilgan() && d.tz) {
    try { return await kinoVideo(d, { izoh }); }
    catch (e) { await log(`⚠️ Kino video chiqmadi (${d.title}): ${e.message} — oddiy shablon bilan yasayman`); }
  }
  return makeVideo(store.get(d.id) || d, { izoh });
}
