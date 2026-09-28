import fs from 'node:fs';
import { InputFile } from 'grammy';
import { cfg } from './config.js';
import { store } from './store.js';
import { isRich, sendRich } from './rich.js';

const H = 3600e3;

// Keyingi bo'sh vaqt (Toshkent vaqti bo'yicha POST_TIMES dan)
export function nextSlot() {
  const taken = new Set(store.byStatus('approved').map(d => d.scheduledAt));
  // Tasdiqlangan haftalik rejadagi hali yozilmagan postlar vaqti ham band
  for (const p of store.plans().filter(x => x.status === 'approved')) for (const it of p.items) if (!it.draftId) taken.add(it.at);
  const nowT = new Date(Date.now() + cfg.tzOffsetH * H);
  for (let day = 0; day < 30; day++) {
    for (const t of cfg.postTimes) {
      const [h, m] = t.split(':').map(Number);
      const utc = Date.UTC(nowT.getUTCFullYear(), nowT.getUTCMonth(), nowT.getUTCDate() + day, h - cfg.tzOffsetH, m);
      const iso = new Date(utc).toISOString();
      if (utc > Date.now() + 60e3 && !taken.has(iso)) return iso;
    }
  }
  return new Date(Date.now() + H).toISOString();
}

// Rahbar yozgan vaqtni ISO ga aylantiradi (Toshkent vaqti). Tushunmasa yoki o'tib ketgan bo'lsa — null
// Qabul qiladi: "18:30", "bugun 18:30", "ertaga 9:00", "indinga 10:00", "28.09 18:30", "28.09.2026 18:30"
export function parseTime(text, now = Date.now()) {
  const s = String(text).trim().toLowerCase().replace(/\s+/g, ' ');
  const tm = s.match(/(\d{1,2})[:.](\d{2})$/);
  if (!tm) return null;
  const h = Number(tm[1]), m = Number(tm[2]);
  if (h > 23 || m > 59) return null;
  const local = new Date(now + cfg.tzOffsetH * H);
  let y = local.getUTCFullYear(), mo = local.getUTCMonth(), d = local.getUTCDate();
  const rest = s.slice(0, tm.index).trim();
  const date = rest.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);
  let explicitDay = true;
  if (date) {
    d = Number(date[1]); mo = Number(date[2]) - 1;
    if (date[3]) y = Number(date[3].length === 2 ? '20' + date[3] : date[3]);
    if (mo > 11 || d < 1 || d > 31) return null;
  } else if (rest === 'ertaga') d += 1;
  else if (rest === 'indinga') d += 2;
  else if (rest === '' ) explicitDay = false;
  else if (rest !== 'bugun') return null;
  let utc = Date.UTC(y, mo, d, h - cfg.tzOffsetH, m);
  if (date && !date[3] && utc < now - 60e3) utc = Date.UTC(y + 1, mo, d, h - cfg.tzOffsetH, m); // yil ko'rsatilmagan va o'tgan — keyingi yil
  if (!explicitDay && utc <= now) utc += 24 * H; // faqat soat yozilgan va bugun o'tgan — ertaga
  return utc > now ? new Date(utc).toISOString() : null;
}

export function fmtTime(iso) {
  const d = new Date(new Date(iso).getTime() + cfg.tzOffsetH * H);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// Faqat Telegram ruxsat bergan teglarni qoldiradi
export function cleanHtml(s = '') {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?!b>|\/b>|i>|\/i>|u>|\/u>|s>|\/s>|a[\s>]|\/a>|blockquote>|\/blockquote>|code>|\/code>)[^>]*>/gi, '')
    .trim();
}

export async function sendSafe(api, chatId, text, extra = {}) {
  try {
    return await api.sendMessage(chatId, cleanHtml(text), { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });
  } catch {
    return api.sendMessage(chatId, cleanHtml(text).replace(/<[^>]+>/g, ''), { link_preview_options: { is_disabled: true }, ...extra });
  }
}

const plainLen = (html) => html.replace(/<[^>]+>/g, '').length;

// Har chaqiruvda yangi InputFile (qayta yuborishda ham o'qiladi)
function mediaItems(draft) {
  const items = [];
  if (hasVideo(draft)) items.push({ type: 'video', media: new InputFile(draft.video_path), supports_streaming: true, width: 1080, height: 1920, duration: Math.round(draft.video_duration || 0) || undefined });
  for (const p of imagePaths(draft)) items.push({ type: 'photo', media: new InputFile(p) });
  return items.slice(0, 10);
}

// Media (video, rasmlar, audio) + matn. Izoh (caption) 1024 belgigacha — sig'sa bitta xabar, sig'masa media, keyin matn
export async function sendMediaPost(api, chatId, draft, extra = {}) {
  const { reply_markup, ...base } = extra;
  const text = cleanHtml(draft.post_html);
  const fits = plainLen(text) <= 1024;
  const n = mediaItems(draft).length;
  let msg;
  const sendMedia = (caption) => {
    const items = mediaItems(draft);
    if (n === 1) {
      const { type, media, ...opts } = items[0];
      const cap = caption ? { caption, parse_mode: 'HTML', reply_markup } : {};
      return type === 'video' ? api.sendVideo(chatId, media, { ...opts, ...base, ...cap }) : api.sendPhoto(chatId, media, { ...opts, ...base, ...cap });
    }
    if (caption) Object.assign(items[0], { caption, parse_mode: 'HTML' });
    return api.sendMediaGroup(chatId, items, base);
  };
  if (n) {
    // Albomga tugma qo'yib bo'lmaydi: tugmali xabar kerak bo'lsa (tasdiqlash), matn alohida ketadi
    const oneMsg = fits && (n === 1 || !reply_markup);
    if (oneMsg) {
      try { msg = await sendMedia(text); } catch { /* HTML xatosi — media va matn alohida */ }
    }
    if (!msg) { await sendMedia(null); msg = await sendSafe(api, chatId, draft.post_html, extra); }
  } else {
    msg = await sendSafe(api, chatId, draft.post_html, extra);
  }
  if (hasAudio(draft)) await api.sendVoice(chatId, new InputFile(draft.audio_path), { ...base, duration: Math.round(draft.audio_duration || 0) || undefined });
  return msg;
}

export const imagePaths = (d) => (d.image_paths || []).filter(p => fs.existsSync(p));
export const hasAudio = (d) => !!d.audio_path && fs.existsSync(d.audio_path);
export const hasVideo = (d) => !!d.video_path && fs.existsSync(d.video_path);

// Qaytaradi: rich format rad etilib oddiy formatda chiqqan bo'lsa — sababi (aks holda undefined)
export async function publish(api, draft) {
  let fallback, msg;
  if (isRich(draft)) ({ fallback, msg } = await sendRich(api, cfg.channelId, draft));
  else if (hasVideo(draft) || imagePaths(draft).length || hasAudio(draft)) msg = await sendMediaPost(api, cfg.channelId, draft);
  else msg = await sendSafe(api, cfg.channelId, draft.post_html);
  // Kanaldagi xabar ID'lari — reaksiyalarni postga bog'lash uchun
  const channel_msg_ids = [msg].flat().map(m => m?.message_id).filter(Boolean);
  store.update(draft.id, { status: 'published', publishedAt: new Date().toISOString(), channel_msg_ids, channel_chat: msg ? [msg].flat()[0]?.chat?.id : undefined });
  return fallback;
}

export async function publishDue(api, notify) {
  const due = store.byStatus('approved').filter(d => new Date(d.scheduledAt).getTime() <= Date.now());
  for (const d of due) {
    try {
      const fb = await publish(api, d);
      await notify(`📢 Kanalga chiqdi: ${d.title}${fb ? `\n⚠️ Maqola formati o'tmadi, oddiy post bo'lib chiqdi: ${fb}` : ''}`);
    }
    catch (e) { await notify(`⚠️ Chiqmadi (${d.title}): ${e.message}`); }
  }
}
