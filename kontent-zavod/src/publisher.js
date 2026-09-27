import fs from 'node:fs';
import { InputFile } from 'grammy';
import { cfg } from './config.js';
import { store } from './store.js';

const H = 3600e3;

// Keyingi bo'sh vaqt (Toshkent vaqti bo'yicha POST_TIMES dan)
export function nextSlot() {
  const taken = new Set(store.byStatus('approved').map(d => d.scheduledAt));
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

// Video + matn. Telegram izohi (caption) 1024 belgigacha — sig'sa bitta xabar, sig'masa video, keyin post
export async function sendVideoPost(api, chatId, draft, extra = {}) {
  const video = { supports_streaming: true, width: 1080, height: 1920, duration: Math.round(draft.video_duration || 0) || undefined };
  const text = cleanHtml(draft.post_html);
  if (text.replace(/<[^>]+>/g, '').length <= 1024) {
    try {
      return await api.sendVideo(chatId, new InputFile(draft.video_path), { ...video, caption: text, parse_mode: 'HTML', ...extra });
    } catch { /* HTML xatosi bo'lsa pastdagi yo'l bilan */ }
  }
  await api.sendVideo(chatId, new InputFile(draft.video_path), { ...video, ...extra });
  return sendSafe(api, chatId, draft.post_html, extra);
}

export const hasVideo = (d) => !!d.video_path && fs.existsSync(d.video_path);

export async function publish(api, draft) {
  if (hasVideo(draft)) await sendVideoPost(api, cfg.channelId, draft);
  else await sendSafe(api, cfg.channelId, draft.post_html);
  store.update(draft.id, { status: 'published', publishedAt: new Date().toISOString() });
}

export async function publishDue(api, notify) {
  const due = store.byStatus('approved').filter(d => new Date(d.scheduledAt).getTime() <= Date.now());
  for (const d of due) {
    try { await publish(api, d); await notify(`📢 Kanalga chiqdi: ${d.title}`); }
    catch (e) { await notify(`⚠️ Chiqmadi (${d.title}): ${e.message}`); }
  }
}
