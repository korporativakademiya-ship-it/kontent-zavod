import fs from 'node:fs';
import path from 'node:path';
import { cfg } from '../config.js';
import { store } from '../store.js';
import { synth, ttsEnabled } from '../tts.js';
import { mediaDuration } from './ffmpeg.js';
import { makeVideo } from './make.js';
import { kinoReja } from '../agents/kino.js';
import { reelsTz } from '../agents/kontent.js';
import * as reels from '../agents/reels.js';

// Kino video (kontent-render servisi, shu repodagi kontent-render/): grid / doska / plakat / chat shablonlari,
// diktor ovozi, fon musiqasi va effektlar. Oldin bu yo'l faqat n8n doska orqali ishlardi — endi Fabrikaning o'zida.
// KONTENT_RENDER_URL — masalan http://kontent-render.railway.internal:8080 (Railway ichki tarmog'i).
export const kinoYoqilgan = () => Boolean(process.env.KONTENT_RENDER_URL);

export async function kinoVideo(d, { fetchFn = fetch } = {}) {
  if (!d.tz) throw new Error('kino uchun prodyuser TZ kerak');
  const rt = reelsTz({ ...d.tz, davomiylik: Number(d.tz.davomiylik) || 35 });
  // Ssenariy: rahbar tanlagan variant bo'lsa — o'sha, aks holda ssenariychi yozadi
  let ss = d.reels?.variantlar?.[d.reels?.tanlangan || 0]?.ssenariy || d.reels?.ssenariy;
  if (!ss) {
    const r = await reels.ssenariy(rt);
    ss = r.ssenariy;
    store.update(d.id, { reels: r });
  }
  const { sahnalar } = await kinoReja(rt, ss);
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

// Bitta kirish: kino servisi ulangan va TZ bor bo'lsa — kino, aks holda (yoki xato bo'lsa) — ichki GSAP shabloni
export async function videoYasa(d, { log = async () => {} } = {}) {
  if (kinoYoqilgan() && d.tz) {
    try { return await kinoVideo(d); }
    catch (e) { await log(`⚠️ Kino video chiqmadi (${d.title}): ${e.message} — oddiy shablon bilan yasayman`); }
  }
  return makeVideo(store.get(d.id) || d);
}
