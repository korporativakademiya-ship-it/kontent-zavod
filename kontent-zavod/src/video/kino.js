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

// Prodyuser TZ si yo'q qoralama (qo'lda yozilgan, eski yoki TZ xato bergan) — TZ post matnidan tuziladi,
// shunda ssenariy va kino video har qanday postga ishlaydi
const matnOl = (h = '') => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
export function tzQoralamadan(d) {
  if (d.tz) return d.tz;
  const matn = matnOl(d.post_html || d.article_html);
  return { sarlavha: d.title, mahsulot: d.mahsulot, ilmoq: d.title, asosiy_fikr: matn.slice(0, 400), taklif: '', tuzilma: [],
    ...(d.cta_kod ? { cta: { maqsad: 'direkt', kod: d.cta_kod } } : {}) };
}

// izoh — rahbar 🎥 bosganda yozgan tavsif ("doska uslubida, 40 soniya, 3 ta qadam"): ssenariy shunga qayta yoziladi.
// bosqich — rahbarga jarayon (ssenariy → rejissyor → yig'ish): video bir necha daqiqa oladi, jim turmasin
export async function kinoVideo(d, { fetchFn = fetch, izoh = '', bosqich = async () => {} } = {}) {
  const tz = tzQoralamadan(d);
  const rt = reelsTz({ ...tz, davomiylik: soniyaIzohdan(izoh) || Number(tz.davomiylik) || 35 });
  // Ssenariy: rahbar tanlagan variant bo'lsa — o'sha, aks holda ssenariychi yozadi; tavsif berilsa — shunga qayta yoziladi
  let ss = d.reels?.variantlar?.[d.reels?.tanlangan || 0]?.ssenariy || d.reels?.ssenariy;
  if (!ss || izoh) {
    await bosqich("✍️ Ssenariy yozilmoqda (diktor matni va ekran yozuvlari)...");
    const r = await reels.ssenariy(rt, izoh ? { izoh, asos: ss || null } : {});
    ss = r.ssenariy;
    store.update(d.id, { reels: r });
  }
  await bosqich("🎬 Rejissyor sahnalarni tuzmoqda (shablon, kadrlar)...");
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
  await bosqich(`🎞 Video yig'ilmoqda: ${sahnalar.length} ta sahna (≈1–2 daqiqa)...`);
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
// Tayyor video Telegram chegarasiga (50 MB) sig'diriladi. bosqich — jarayon holati (rahbarga ko'rinadi)
export async function videoYasa(d, { log = async () => {}, izoh = '', bosqich = async () => {} } = {}) {
  const v = await videoTanla(d, { log, izoh: String(izoh || '').trim().slice(0, 600), bosqich });
  await bosqich('📦 Video tayyorlanmoqda (Telegram uchun)...');
  await telegramgaSigdir(v.file);
  return v;
}

async function videoTanla(d, { log, izoh, bosqich }) {
  const avatarSorandi = /avatar/i.test(izoh);
  if (avatarSorandi && !heygenYoqilgan()) await log("⚠️ Avatar video sozlanmagan (HEYGEN_API_KEY, HEYGEN_AVATAR_ID) — shablon video yasayman");
  if ((avatarSorandi || (process.env.VIDEO_TURI === 'avatar' && !izoh)) && heygenYoqilgan()) {
    try { return await heygenVideo(d); }
    catch (e) { await log(`⚠️ Avatar video chiqmadi (${d.title}): ${e.message} — boshqa usul bilan yasayman`); }
  }
  if (kinoYoqilgan()) {
    try { return await kinoVideo(d, { izoh, bosqich }); }
    catch (e) { await log(`⚠️ Kino video chiqmadi (${d.title}): ${e.message} — oddiy shablon bilan yasayman`); }
  }
  await bosqich('🎞 Video chizilmoqda (≈1–3 daqiqa)...');
  return makeVideo(store.get(d.id) || d, { izoh });
}
