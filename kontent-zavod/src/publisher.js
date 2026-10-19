import fs from 'node:fs';
import { InputFile } from 'grammy';
import { cfg } from './config.js';
import { store } from './store.js';
import { isRich, sendRich } from './rich.js';

const H = 3600e3;

// Keyingi bo'sh vaqt (Toshkent vaqti bo'yicha POST_TIMES dan)
export const nextSlot = () => nextSlots(1)[0];

// Keyingi n ta bo'sh vaqt — 🕒 Vaqt belgilash tugmalari uchun
export function nextSlots(n = 3) {
  const taken = new Set(store.byStatus('approved').map(d => d.scheduledAt));
  // Tasdiqlangan haftalik rejadagi hali yozilmagan postlar vaqti ham band
  for (const p of store.allPlans().filter(x => x.status === 'approved')) for (const it of p.items) if (!it.draftId) taken.add(it.at);
  // Rejadan yozilgan, lekin hali tasdiqlanmagan qoralamalarning reja vaqti ham band
  for (const d of store.byStatus('pending')) if (d.plannedAt) taken.add(d.plannedAt);
  const nowT = new Date(Date.now() + cfg.tzOffsetH * H);
  const out = [];
  for (let day = 0; day < 30 && out.length < n; day++) {
    for (const t of cfg.postTimes) {
      const [h, m] = t.split(':').map(Number);
      const utc = Date.UTC(nowT.getUTCFullYear(), nowT.getUTCMonth(), nowT.getUTCDate() + day, h - cfg.tzOffsetH, m);
      const iso = new Date(utc).toISOString();
      if (utc > Date.now() + 60e3 && !taken.has(iso) && out.length < n) out.push(iso);
    }
  }
  return out.length ? out : [new Date(Date.now() + H).toISOString()];
}

// Kirill (o'zbek va rus) → lotin: "ертага соат 9" → "ertaga soat 9", "завтра в 10" → "zavtra v 10"
const KIRILL = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: "'", ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: "o'", қ: 'q', ғ: "g'", ҳ: 'h' };
const lotin = (s) => s.replace(/[а-яёўқғҳ]/g, c => KIRILL[c] ?? c);

const HAFTA = [['yakshanba', 0], ['dushanba', 1], ['seshanba', 2], ['chorshanba', 3], ['payshanba', 4], ['juma', 5], ['shanba', 6],
  ['voskresen', 0], ['ponedel', 1], ['vtornik', 2], ['sred', 3], ['chetverg', 4], ['pyatnits', 5], ['subbot', 6]];
const OYLAR = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'];
// To'liq oy nomlari (o'zbek va ruscha qo'shimchalar bilan) — "mayli" kabi so'zlar oy deb olinmasin
const OY_RE = "(yanvar[a-z']*|fevral[a-z']*|mart[a-z']*|aprel[a-z']*|may(?:a|ning|da|ga)?|iyun[a-z']*|iyul[a-z']*|avgust[a-z']*|sent?yabr[a-z']*|sentabr[a-z']*|okt?yabr[a-z']*|oktabr[a-z']*|noyabr[a-z']*|dekabr[a-z']*)(?![a-z])";
const oyRaqami = (w) => OYLAR.findIndex(o => w.startsWith(o));
const SOZ = (w) => new RegExp(`(^|[^a-z'])${w}`);
// Matnda vaqtga oid so'z bormi (reply'siz javobda boshqa gapni vaqt deb olmaslik uchun)
export const vaqtgaOxshaydi = (text) => /\d/.test(text) || /(bugun|ertaga|indinga|shanba|juma|soat|daqiqa|minut|kechqurun|ertalab|zavtra|segodnya|poslezavtra|cherez)/
  .test(lotin(String(text).toLowerCase()));

// Rahbar yozgan vaqtni ISO ga aylantiradi (Toshkent vaqti). Tushunmasa yoki o'tib ketgan bo'lsa — null.
// Qabul qiladi: "18:30", "18.30", "18 30", "soat 7", "7 da", "kechqurun 7", "ertaga 9", "ertaga soat 9:30 da",
// "indinga 10:00", "dushanba 10:00", "juma kuni", "28.09 18:30", "28.09.2026 18:30", "20-oktabr 10:00", "oktabr 20 soat 9",
// "30 daqiqadan keyin", "1 soatdan keyin", "yarim soatdan keyin", kirillcha ("ертага соат 9") va ruscha ("завтра в 10").
// Faqat kun yozilsa ("ertaga", "dushanba") — o'sha kunning birinchi chiqish vaqti (POST_TIMES).
export function parseTime(text, now = Date.now()) {
  let s = ` ${lotin(String(text).toLowerCase()).replace(/[‘’ʻʼ`´]/g, "'").replace(/\s+/g, ' ').trim()} `;
  if (!s.trim()) return null;
  const tz = cfg.tzOffsetH;
  const local = new Date(now + tz * H);

  // 1) Nisbiy vaqt: "30 daqiqadan keyin", "1 soatdan so'ng", "yarim soatdan keyin", "cherez 2 chasa"
  const nis = s.match(/(cherez\s+)?(\d+(?:[.,]5)?|yarim|bir|ikki|uch)\s*(daqiqa|minut|min|soat|chas)[a-z']*\s*(dan\s*)?(keyin|so'?ng)?/);
  if (nis && (nis[1] || nis[5])) {
    const n = { yarim: 0.5, bir: 1, ikki: 2, uch: 3 }[nis[2]] ?? Number(nis[2].replace(',', '.'));
    const ms = n * (/^(soat|chas)/.test(nis[3]) ? H : 60e3);
    return ms >= 60e3 && ms <= 30 * 24 * H ? new Date(Math.ceil((now + ms) / 60e3) * 60e3).toISOString() : null;
  }

  // 2) Sana: oy nomi bilan ("20-oktabr", "20 oktyabrya", "oktabr 20")
  let sana = null;
  const kes = (m) => { s = s.replace(m[0], ' '); };
  let m = s.match(new RegExp(`(\\d{1,2})\\s*-?\\s*${OY_RE}`)) || s.match(new RegExp(`${OY_RE}\\s*(\\d{1,2})(?![:.\\d])`));
  if (m) {
    const [kun, oy] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
    sana = { d: Number(kun), mo: oyRaqami(oy) };
    kes(m);
  }
  // 3) Soat ikki nuqta bilan — eng ishonchli: "18:30"
  let h = null, mi = 0;
  m = s.match(/(\d{1,2})\s*:\s*(\d{2})(?!\d)/);
  if (m) { h = Number(m[1]); mi = Number(m[2]); kes(m); }
  // 4) Raqamli sana: "28.09.2026", "28.09", "28/09"; soat hali topilmagan bo'lsa yagona "18.30" — bu soat
  m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m && !sana) { sana = { d: Number(m[1]), mo: Number(m[2]) - 1, y: Number(m[3].length === 2 ? '20' + m[3] : m[3]) }; kes(m); }
  const juftlar = [...s.matchAll(/(\d{1,2})[./-](\d{1,2})(?!\d)/g)];
  const soatSozi = /soat\s*\d|\d\s*(da|ga|lar|chi)\b|\bv\s*\d/.test(s);
  if (juftlar.length && !sana && (h !== null || juftlar.length > 1 || soatSozi)) {
    sana = { d: Number(juftlar[0][1]), mo: Number(juftlar[0][2]) - 1 };
    kes(juftlar[0]);
    juftlar.shift();
  }
  if (h === null && juftlar.length) { h = Number(juftlar[0][1]); mi = Number(juftlar[0][2]); kes(juftlar[0]); }
  // 5) "18 30" — ikki son bo'sh joy bilan
  if (h === null && (m = s.match(/(?:^|[^\d])(\d{1,2}) (\d{2})(?!\d)/)) && Number(m[2]) < 60) { h = Number(m[1]); mi = Number(m[2]); kes(m); }
  // 6) Faqat soat: "soat 7", "7 da", "7 yarim", "v 10", yoki matndagi yagona son
  let faqatSoat = false;
  if (h === null) {
    faqatSoat = true;
    m = s.match(/soat\s*(\d{1,2})/) || s.match(/(?:^|[^\d])(\d{1,2})\s*(?:da|ga|lar|larda|chi)\b/) || s.match(/\bv\s*(\d{1,2})\b/);
    const sonlar = s.match(/\d+/g) || [];
    if (!m && sonlar.length === 1 && sonlar[0].length <= 2) m = [sonlar[0], sonlar[0]];
    if (m) { h = Number(m[1]); mi = /yarim/.test(s) ? 30 : 0; }
  }
  // Kun qismi: "kechqurun 7" → 19:00, "tushdan keyin 3" → 15:00
  const kunQismi = /(kechqurun|kechki|kech\b|oqshom|tushdan keyin|vecher|dnya|pm\b|ertalab|tong|utra|am\b)/.test(s);
  if (h !== null && h < 12 && /(kechqurun|kechki|kech\b|oqshom|tushdan keyin|vecher|dnya|pm\b)/.test(s)) h += 12;
  if (h === 12 && /(ertalab|tong|utra|am\b)/.test(s)) h = 0;

  // 7) Kun: bugun / ertaga / indinga / hafta kuni
  let siljish = null, haftaKuni = null;
  if (/(^|[^a-z])(bugun|segodnya)/.test(s)) siljish = 0;
  if (/(^|[^a-z])(ertaga|zavtra)/.test(s)) siljish = 1;
  if (/(^|[^a-z])(indinga|poslezavtra)/.test(s)) siljish = 2;
  for (const [w, n] of HAFTA) if (SOZ(w).test(s)) { haftaKuni = n; break; }
  const kunBor = sana || siljish !== null || haftaKuni !== null;
  if (h === null && !kunBor) return null;
  // "soat 3", "7 da" (daqiqasiz, ertalab/kechqurun aytilmagan): 1–5 — kunduzi (15:00); 6–9 — kun aytilmagan bo'lsa
  // eng yaqin kelgusi (tushdan keyin "soat 7" — bugun 19:00, ertalab "soat 9" — bugun 09:00)
  if (faqatSoat && h !== null && !kunQismi && h >= 1 && h <= 5) h += 12;
  const yaqiniTanlansin = faqatSoat && h !== null && !kunQismi && !kunBor && h >= 6 && h <= 9;

  let y = local.getUTCFullYear(), mo = local.getUTCMonth(), d = local.getUTCDate();
  if (sana) {
    if (sana.mo < 0 || sana.mo > 11 || sana.d < 1 || sana.d > 31) return null;
    ({ d, mo } = sana); if (sana.y) y = sana.y;
  } else if (siljish !== null) d += siljish;
  else if (haftaKuni !== null) d += (haftaKuni - local.getUTCDay() + 7) % 7;

  if (yaqiniTanlansin) {
    const nomzod = [h, h + 12].map(hh => { const u = Date.UTC(y, mo, d, hh - tz, mi); return u > now ? u : u + 24 * H; });
    return new Date(Math.min(...nomzod)).toISOString();
  }
  // Soat yozilmagan — o'sha kunning birinchi kelgusi chiqish vaqti (POST_TIMES)
  const vaqtlar = h === null ? cfg.postTimes.map(t => t.split(':').map(Number)) : [[h, mi]];
  for (const [hh, mm] of vaqtlar) {
    if (!(hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59)) return null;
    let utc = Date.UTC(y, mo, d, hh - tz, mm);
    // 31.02 kabi yo'q sana — rad
    if (sana && new Date(utc + tz * H).getUTCDate() !== sana.d) return null;
    if (sana && !sana.y && utc < now - 60e3) utc = Date.UTC(y + 1, mo, d, hh - tz, mm); // yil yozilmagan va o'tgan — keyingi yil
    if (!kunBor && utc <= now) utc += 24 * H;             // faqat soat yozilgan va bugun o'tgan — ertaga
    if (haftaKuni !== null && !sana && siljish === null && utc <= now) utc += 7 * 24 * H; // shu hafta kuni o'tgan — keyingi hafta
    if (utc > now) return new Date(utc).toISOString();
  }
  return null;
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

// Media (video, rasmlar, audio) + matn. Izoh (caption) 1024 belgigacha — sig'sa bitta xabar, sig'masa media, keyin matn.
// qism — kanalga chiqarishda: media alohida chiqib, matn xato bersa, qayta urinishda media takror yuborilmasin
//   { mediaBor: avval chiqqan media xabarlari, onMedia(xabarlar) — media chiqqanda chaqiriladi }
export async function sendMediaPost(api, chatId, draft, extra = {}, qism = {}) {
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
    const oneMsg = fits && (n === 1 || !reply_markup) && !qism.mediaBor;
    if (oneMsg) {
      try { msg = await sendMedia(text); } catch { /* HTML xatosi — media va matn alohida */ }
    }
    if (!msg) {
      let media = qism.mediaBor;
      if (!media) { media = await sendMedia(null); await qism.onMedia?.(media); }
      msg = [media, await sendSafe(api, chatId, draft.post_html, extra)].flat();
    }
  } else {
    msg = await sendSafe(api, chatId, draft.post_html, extra);
  }
  // Ovoz — qo'shimcha: u chiqmasa ham post chiqqan hisoblanadi (aks holda qayta urinishda butun post takrorlanardi)
  if (hasAudio(draft)) await api.sendVoice(chatId, new InputFile(draft.audio_path), { ...base, duration: Math.round(draft.audio_duration || 0) || undefined })
    .catch(e => console.error(`Ovoz yuborilmadi (${draft.title}):`, e.message));
  return msg;
}

export const imagePaths = (d) => (d.image_paths || []).filter(p => fs.existsSync(p));
export const hasAudio = (d) => !!d.audio_path && fs.existsSync(d.audio_path);
export const hasVideo = (d) => !!d.video_path && fs.existsSync(d.video_path);

// Hozir kanalga ketayotgan qoralamalar: ⚡ Hozir ikki marta bosilsa yoki shu payt navbatdagi chiqaruvchi ham
// ishlab qolsa — post ikki marta chiqmasin
const chiqyapti = new Set();
export class AllaqachonChiqqan extends Error {}

// Qaytaradi: rich format rad etilib oddiy formatda chiqqan bo'lsa — sababi (aks holda undefined)
export async function publish(api, draft) {
  const joriy = store.get(draft.id) || draft;
  if (joriy.status === 'published' || chiqyapti.has(draft.id)) throw new AllaqachonChiqqan('bu post allaqachon chiqqan yoki hozir chiqyapti');
  chiqyapti.add(draft.id);
  try { return await publishIchki(api, joriy); } finally { chiqyapti.delete(draft.id); }
}

// Telegram qaytargan rich xabarda video bloki bormi (ovozsiz MP4 ni Telegram animatsiya qilib saqlashi mumkin)
export function richdaVideo(v, chuqur = 0) {
  if (!v || typeof v !== 'object' || chuqur > 12) return false;
  if (['video', 'animation'].some(k => v[k] && typeof v[k] === 'object' && v[k].file_id)) return true;
  return Object.values(v).some(x => richdaVideo(x, chuqur + 1));
}

const videoKanalda = new Set();
// Videoni kanalga alohida post qilib chiqaradi (post allaqachon chiqqan bo'lsa — o'sha postga javob bo'lib)
export async function videoniChiqar(api, draft) {
  const d = store.get(draft.id) || draft;
  if (!hasVideo(d)) throw new Error("video fayli topilmadi — 🎥 Video bilan qayta yasang");
  if (d.video_msg_id || videoKanalda.has(d.id)) throw new AllaqachonChiqqan('video allaqachon kanalga chiqqan');
  videoKanalda.add(d.id);
  try {
    const javob = d.channel_msg_ids?.[0] ? { reply_parameters: { message_id: d.channel_msg_ids[0], allow_sending_without_reply: true } } : {};
    const izoh = `<b>${String(d.title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</b>${d.cta_kod ? `\n\n👉 Direktga <b>${d.cta_kod}</b> deb yozing` : ''}`;
    const msg = await api.sendVideo(cfg.channelId, new InputFile(d.video_path), {
      caption: izoh, parse_mode: 'HTML', supports_streaming: true, width: 1080, height: 1920,
      duration: Math.round(d.video_duration || 0) || undefined, ...javob
    });
    store.update(d.id, { video_msg_id: msg?.message_id, channel_chat: d.channel_chat || msg?.chat?.id });
    return msg;
  } finally { videoKanalda.delete(d.id); }
}

async function publishIchki(api, draft) {
  let fallback, msg;
  if (isRich(draft)) {
    ({ fallback, msg } = await sendRich(api, cfg.channelId, draft));
    // Telegram maqolani qabul qilib, videoni tashlab yuborgan bo'lsa — video maqoladan keyin alohida chiqadi
    if (!fallback && hasVideo(draft) && msg?.rich_message && !richdaVideo(msg.rich_message)) {
      const v = await api.sendVideo(cfg.channelId, new InputFile(draft.video_path), {
        supports_streaming: true, width: 1080, height: 1920, duration: Math.round(draft.video_duration || 0) || undefined
      }).catch(e => { console.error(`Maqola videosi chiqmadi (${draft.title}):`, e.message); return null; });
      if (v) store.update(draft.id, { video_msg_id: v.message_id });
    }
  } else if (hasVideo(draft) || imagePaths(draft).length || hasAudio(draft)) msg = await sendMediaPost(api, cfg.channelId, draft, {}, {
    mediaBor: draft.qisman_media, onMedia: (m) => store.update(draft.id, { qisman_media: [m].flat().map(x => ({ message_id: x?.message_id, chat: x?.chat })) })
  });
  else msg = await sendSafe(api, cfg.channelId, draft.post_html);
  // Kanaldagi xabar ID'lari — reaksiyalarni postga bog'lash uchun
  const channel_msg_ids = [msg].flat().map(m => m?.message_id).filter(Boolean);
  store.update(draft.id, { status: 'published', publishedAt: new Date().toISOString(), channel_msg_ids, channel_chat: msg ? [msg].flat()[0]?.chat?.id : undefined });
  return fallback;
}

// Bir vaqtda ikki marta ishlamasin (oldingi chaqiruv hali tugamagan bo'lsa — o'tkazib yuboriladi);
// xato bergan post har daqiqada qayta urinib, xabar bilan to'ldirmasin — MAX_URINISH dan keyin "failed"
const MAX_URINISH = 3;
// Vaqti ko'p o'tib ketgan post (bot uzoq o'chiq turgan) qayta yoqilganda birdan chiqib ketmasin — navbatdan olinadi
const ESKI_MS = (Number(process.env.ESKI_SOAT) || 6) * H;
let ishlayapti = false;
export async function publishDue(api, notify) {
  if (ishlayapti) return;
  ishlayapti = true;
  try {
    const due = store.byStatus('approved').filter(d => new Date(d.scheduledAt).getTime() <= Date.now());
    for (const d of due) {
      if (Date.now() - new Date(d.scheduledAt).getTime() > ESKI_MS) {
        store.update(d.id, { status: 'pending', scheduledAt: null, eskirgan: d.scheduledAt });
        await notify(`⏸ "${d.title}" ${fmtTime(d.scheduledAt)} da chiqishi kerak edi, vaqti ancha o'tib ketgan — navbatdan olindi. Kerak bo'lsa qayta tasdiqlang.`, d).catch(() => {});
        continue;
      }
      try {
        const fb = await publish(api, d);
        await notify(`📢 Kanalga chiqdi: ${d.title}${fb ? `\n⚠️ Maqola formati o'tmadi, oddiy post bo'lib chiqdi: ${fb}` : ''}`, d).catch(() => {});
      } catch (e) {
        if (e instanceof AllaqachonChiqqan) continue;
        const urinish = (d.publish_attempts || 0) + 1;
        const oxirgi = urinish >= MAX_URINISH;
        store.update(d.id, { publish_attempts: urinish, ...(oxirgi ? { status: 'failed', publish_error: String(e.message).slice(0, 300) } : {}) });
        if (urinish === 1 || oxirgi) await notify(oxirgi ? `❌ Chiqmadi (${d.title}), ${urinish} marta urinildi: ${e.message}` : `⚠️ Chiqmadi (${d.title}): ${e.message} — yana urinaman`, d).catch(() => {});
      }
    }
  } finally { ishlayapti = false; }
}
