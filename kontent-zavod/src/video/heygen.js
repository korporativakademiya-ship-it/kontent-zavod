import fs from 'node:fs';
import path from 'node:path';
import { cfg } from '../config.js';
import { mediaDuration } from './ffmpeg.js';
import { speechText } from '../tts.js';

// HeyGen avatar video: muallifning avatari diktor matnini o'qiydi (9:16).
// HEYGEN_API_KEY + HEYGEN_AVATAR_ID + HEYGEN_VOICE_ID (HeyGen'dagi ovoz, klonlangan ovoz ham bo'ladi) berilsa va
// VIDEO_TURI=avatar bo'lsa, 🎥 Video va rejadagi reels shu orqali yasaladi.
// API: POST /v2/video/generate → video_id; holat — /v1/video_status.get (yangi /v2/videos/{id} ham qabul qilinadi).
const API = 'https://api.heygen.com';
export const heygenYoqilgan = (env = process.env) => Boolean(env.HEYGEN_API_KEY && env.HEYGEN_AVATAR_ID && env.HEYGEN_VOICE_ID);

// Diktor matni: tasdiqlangan reels ssenariysidagi ovoz qatorlari, bo'lmasa — post matni (HeyGen chegarasi 1500 belgi)
export function diktorMatni(d) {
  const ss = d.reels?.variantlar?.[d.reels?.tanlangan || 0]?.ssenariy || d.reels?.ssenariy;
  const qatorlar = [...(ss?.sahnalar || []).map(s => s.ovoz), ss?.yakun?.ovoz].filter(Boolean);
  const matn = qatorlar.length ? qatorlar.join(' ') : speechText(d.post_html || '');
  return matn.replace(/\s+/g, ' ').trim().slice(0, 1450);
}

const kut = (ms) => new Promise(r => setTimeout(r, ms));

export async function heygenVideo(d, { fetchFn = fetch, env = process.env, oraliq = 10e3, maxKutish = 25 * 60e3 } = {}) {
  if (!heygenYoqilgan(env)) throw new Error('HeyGen sozlanmagan: HEYGEN_API_KEY, HEYGEN_AVATAR_ID, HEYGEN_VOICE_ID');
  const matn = diktorMatni(d);
  if (!matn) throw new Error("avatar uchun diktor matni yo'q");
  const sarlavha = { 'X-Api-Key': env.HEYGEN_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' };
  const res = await fetchFn(`${API}/v2/video/generate`, {
    method: 'POST', headers: sarlavha, signal: AbortSignal.timeout(60e3),
    body: JSON.stringify({
      title: String(d.title || 'Kontent').slice(0, 80),
      video_inputs: [{
        character: { type: 'avatar', avatar_id: env.HEYGEN_AVATAR_ID, avatar_style: 'normal' },
        voice: { type: 'text', input_text: matn, voice_id: env.HEYGEN_VOICE_ID },
      }],
      dimension: { width: 1080, height: 1920 },
    }),
  });
  const g = await res.json().catch(() => ({}));
  const videoId = g?.data?.video_id;
  if (!res.ok || !videoId) throw new Error(`HeyGen ${res.status}: ${String(g?.error?.message || g?.message || 'video_id qaytmadi').slice(0, 200)}`);

  const boshi = Date.now();
  let url = '';
  while (Date.now() - boshi < maxKutish) {
    await kut(oraliq);
    const h = await fetchFn(`${API}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, { headers: sarlavha, signal: AbortSignal.timeout(30e3) });
    const s = (await h.json().catch(() => ({})))?.data || {};
    if (s.status === 'completed') { url = s.video_url || s.url || ''; break; }
    if (s.status === 'failed') throw new Error(`HeyGen video yasalmadi: ${JSON.stringify(s.error || s.status).slice(0, 200)}`);
  }
  if (!url) throw new Error('HeyGen video vaqtida tayyor bo\'lmadi');
  const v = await fetchFn(url, { signal: AbortSignal.timeout(5 * 60e3) });
  if (!v.ok) throw new Error(`HeyGen videosi yuklanmadi (${v.status})`);
  const file = path.join(cfg.dataDir, 'videos', `${d.id}.mp4`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await v.arrayBuffer()));
  return { file, duration: await mediaDuration(file), data: { heygen: videoId }, voiced: true };
}
