import fs from 'node:fs';
import path from 'node:path';
import { geminiKalit, modellar, geminiMedia, engYangiRasm } from './gemini.js';

// AI rasm (Gemini "Nano Banana") — n8n doskadagi "matn+rasm" yo'li endi Fabrikaning o'zida.
// GEMINI_API_KEY berilsa ishlaydi; model — GEMINI_IMAGE_MODEL yoki ro'yxatdagi eng yangi rasm modeli.
export const rasmYoqilgan = () => Boolean(geminiKalit());

const KENG = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// Qaytaradi: saqlangan fayl yo'li (kengaytma mime'dan)
export async function rasmYasa(prompt, faylBoshi, { aspect = '4:5', fetchFn = fetch } = {}) {
  if (!rasmYoqilgan()) throw new Error("AI rasm uchun GEMINI_API_KEY kerak");
  const model = process.env.GEMINI_IMAGE_MODEL || engYangiRasm(await modellar(fetchFn));
  if (!model) throw new Error('Gemini rasm modeli topilmadi');
  const d = await geminiMedia(model, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } }
  }, { fetchFn, timeout: 180e3 });
  const mime = (d.mime || 'image/png').split(';')[0];
  const fayl = `${faylBoshi}.${KENG[mime] || 'png'}`;
  fs.mkdirSync(path.dirname(fayl), { recursive: true });
  fs.writeFileSync(fayl, Buffer.from(d.data, 'base64'));
  return fayl;
}
