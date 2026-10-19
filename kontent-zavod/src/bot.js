import fs from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { cfg } from './config.js';
import { store } from './store.js';
import { runPipeline, renderDraftSlides, produceDraft } from './pipeline.js';
import { revise } from './agents/copywriter.js';
import { writeArticle } from './agents/article.js';
import { isRich, sendRich, approvalPrefix } from './rich.js';
import { nextSlot, nextSlots, fmtTime, parseTime, vaqtgaOxshaydi, publish, videoniChiqar, sendMediaPost, sendSafe, imagePaths, AllaqachonChiqqan } from './publisher.js';
import { videoYasa, tzQoralamadan } from './video/kino.js';
import { heygenYoqilgan } from './video/heygen.js';
import * as reels from './agents/reels.js';
import { ttsEnabled, TTS_SETUP, synth, speechText, toVoiceNote } from './tts.js';
import { addSample, addFeedback } from './style.js';
import { ensureCode, ensureLink } from './cta.js';
import { topish, royxat, royxatMatni, rejaPlan, goyaMatni, MAHSULOTLAR } from './kontentReja.js';
import { buildReport } from './report.js';
import * as weekly from './weekly.js';
import { analyzeStyle, distillRules } from './agents/stylist.js';
import { bilan, joriy, rejim, kodlar, topigi, topikdan, PROFIL } from './mahsulot.js';
import { rasmYoqilgan, rasmYasa } from './rasm.js';
import { muqovaYasa } from './muqova.js';
import { rasmPrompti, uslubKanaldan, reelsTz } from './agents/kontent.js';
import * as onboarding from './onboarding.js';
import { kanalQosh } from './kuzatuv.js';

// TELEGRAM_API_ROOT — ixtiyoriy (lokal Bot API server yoki sinov uchun)
const API_ROOT = process.env.TELEGRAM_API_ROOT || 'https://api.telegram.org';
export const bot = new Bot(cfg.botToken, { client: { apiRoot: API_ROOT } });
let busy = false;
let videoBusy = false; // render og'ir (Chromium + ffmpeg) — bir vaqtda bittadan

// ---------- Mahsulot topiklari (ofis guruhi) ----------
// Xabar qaysi mahsulot topigida bo'lsa — butun ishlov o'sha mahsulot "miyasi" bilan bajariladi.
bot.use((ctx, next) => {
  const thr = ctx.msg?.message_thread_id ?? ctx.callbackQuery?.message?.message_thread_id;
  let m = topikdan(thr);
  const id = (ctx.callbackQuery?.data || '').split(':')[1];
  if (!m && id) m = store.get(id)?.mahsulot || store.allPlans().find(p => p.id === id)?.mahsulot || null;
  return bilan(m, next);
});
// Shaxsiy chatda guruh topiklari yo'q — topik raqami bilan yuborilsa Telegram rad etadi
export const shaxsiyTopiksiz = (payload) => {
  if (payload?.message_thread_id === undefined || !(Number(payload.chat_id) > 0)) return payload;
  const { message_thread_id, ...qolgan } = payload;
  return qolgan;
};
// Guruhga ketayotgan xabar topiksiz bo'lsa — joriy mahsulot topigiga (ctx.reply ham shu yerga tushadi)
bot.api.config.use((prev, method, payload, signal) => {
  if (payload && rejim() && joriy() && String(payload.chat_id) === String(cfg.groupId) && payload.message_thread_id === undefined && /^(send|copy)/.test(method))
    payload = { ...payload, message_thread_id: topigi(joriy()) };
  return prev(method, shaxsiyTopiksiz(payload), signal);
});
// Tasdiqlash va jarayon joyi: mahsulot rejimida — mahsulotning o'z topigi (alohida chat yo'q)
const tema = (m = joriy()) => (rejim() ? topigi(m) ?? topigi(kodlar()[0]) : cfg.approvalTopic);

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isAdmin = (ctx) => cfg.admins.includes(ctx.from?.id);
// Rahbar ro'yxatida (ADMIN_IDS) bo'lmagan odam shaxsiy chatda buyruq yozsa — jim qolinmaydi: ID raqami aytiladi
bot.use(async (ctx, next) => {
  const t = ctx.message?.text || '';
  if (ctx.chat?.type !== 'private' || !t.startsWith('/') || /^\/(start|id)(@\w+)?(\s|$)/.test(t) || isAdmin(ctx)) return next();
  console.log(`Ruxsatsiz buyruq: ${ctx.from?.id} ${t.split(/\s/)[0]}`);
  return ctx.reply(`⛔ Bu buyruq faqat rahbar uchun. Sizning Telegram ID: ${ctx.from?.id}\n` +
    "Siz rahbar bo'lsangiz, bot egasi shu raqamni ADMIN_IDS sozlamasiga qo'shishi kerak (bir nechta bo'lsa vergul bilan).");
});
// 🎙 Ovoz — faqat ovoz provayderi (TTS_PROVIDER) sozlangan bo'lsa: aks holda tugma bosilganda faqat xato chiqardi
const kb = (id) => {
  const k = new InlineKeyboard()
    .text('✅ Tasdiqlash', `ok:${id}`).text('🕒 Vaqt belgilash', `time:${id}`).row()
    .text('⚡ Hozir', `now:${id}`).text('✏️ Tahrir', `edit:${id}`).text('🎬 Ssenariy', `scr:${id}`).row()
    .text('🖼 Rasm', `img:${id}`).text('🎥 Video', `vid:${id}`);
  if (ttsEnabled()) k.text('🎙 Ovoz', `aud:${id}`);
  return k.row().text('❌ Rad', `no:${id}`);
};
// Rejalashtirilgan qoralama tugmalari: holat + vaqtni o'zgartirish
const schedKb = (d) => new InlineKeyboard()
  .text(`✅ ${fmtTime(d.scheduledAt)} da chiqadi`, 'noop').row()
  .text('🕒 Vaqtni o\'zgartirish', `time:${d.id}`).text('⚡ Hozir', `now:${d.id}`).row()
  .text('↩️ Navbatdan olish', `unq:${d.id}`);
const TIME_HELP = 'Masalan: <code>18:30</code>, <code>soat 7</code>, <code>kechqurun 8</code>, <code>ertaga 9</code>, <code>juma 10:00</code>, ' +
  '<code>20-oktabr 18:00</code>, <code>1 soatdan keyin</code> (Toshkent vaqti)';

// Xabar qaysi topikda (forum mavzusi): oddiy guruh va shaxsiy chatda — null
const topikIchida = (msg) => (msg?.is_topic_message ? msg.message_thread_id ?? null : null);

// Rahbardan javob so'raydi — javob kelganda message:text/photo handleri ishlaydi. Reply shart emas: guruhda Telegram
// reply oynasini o'zi ochmaydi, shuning uchun shu chat/topikdagi keyingi xabari ham javob hisoblanadi (store.ochiqWait).
// tugmalar — tez tanlov (masalan bo'sh vaqtlar); berilmasa — reply oynasi taklif qilinadi
async function ask(ctx, text, wait, tugmalar = null) {
  const thr = tema();
  const m = await ctx.reply(text, { parse_mode: 'HTML', message_thread_id: thr, reply_markup: tugmalar || { force_reply: true } });
  const shaxsiy = ctx.chat?.type === 'private';
  store.setWait(m.message_id, { ...wait, chat: m.chat?.id ?? ctx.chat?.id, thr: shaxsiy ? null : (topikIchida(m) ?? thr ?? null), kim: ctx.from?.id });
}

// Rahbar xabari qaysi savolga javob: reply qilingan savol yoki shu chat/topikdagi so'nggi ochiq savol.
// Qaytaradi: [kalit, reply orqalimi]
function javobKaliti(ctx) {
  const r = ctx.message?.reply_to_message;
  const w = r && store.peekWait(r.message_id);
  if (w && (w.chat == null || String(w.chat) === String(ctx.chat.id))) return [r.message_id, true];
  // Boshqa odamning xabariga reply — bu javob emas (topik ildizi va botning xabari bundan mustasno)
  if (r && r.message_id !== ctx.message.message_thread_id && !r.from?.is_bot) return [null, false];
  const thr = ctx.chat.type === 'private' ? null : topikIchida(ctx.message);
  return [store.ochiqWait({ chat: ctx.chat.id, thr, kim: ctx.from?.id }), false];
}

// Jarayon: mahsulot rejimida har mahsulot uchun bitta yangilanib boradigan xabar (topik chalkashmasin);
// xato va ogohlantirishlar — alohida xabar.
const jarayon = new Map();
export const log = async (text) => {
  // Jarayon Railway loglarida ham ko'rinsin (guruhga yetib bormasa ham nima bo'lgani bilinadi)
  console.log(`[${joriy() || 'umumiy'}] ${String(text).replace(/\s+/g, ' ').slice(0, 300)}`);
  if (!cfg.groupId) return;
  if (!rejim()) return bot.api.sendMessage(cfg.groupId, text, { message_thread_id: cfg.logTopic }).catch(() => {});
  const m = joriy() || kodlar()[0];
  const muhim = /^(⚠️|❌)/.test(text);
  const h = jarayon.get(m);
  if (!muhim && h && Date.now() - h.at < 15 * 60e3) {
    h.lines = [...h.lines, text].slice(-8); h.at = Date.now();
    return bot.api.editMessageText(cfg.groupId, h.id, `⚙️ Jarayon\n${h.lines.join('\n')}`).catch(() => {});
  }
  const r = await bot.api.sendMessage(cfg.groupId, muhim ? text : `⚙️ Jarayon\n${text}`, { message_thread_id: tema(m), disable_notification: !muhim }).catch(() => null);
  if (r && !muhim) jarayon.set(m, { id: r.message_id, lines: [text], at: Date.now() });
};

// Qoralama qayerda ko'rinadi: shaxsiy chatdan boshlangan bo'lsa — o'sha chatda, aks holda guruhdagi mahsulot xonasida
const joyi = (d) => (d.chat ? [d.chat, {}] : [cfg.groupId, { message_thread_id: tema(d.mahsulot || joriy()) }]);

export async function sendForApproval(d) {
  const [chatId, joy] = joyi(d);
  const extra = { ...joy, reply_markup: kb(d.id) };
  if (d.status === 'approved') extra.reply_markup = schedKb(d);
  if (isRich(d)) {
    const { fallback } = await sendRich(bot.api, chatId, d, extra, { prefix: approvalPrefix(d) });
    if (fallback) await log(`⚠️ "${d.title}" maqola formatida ko'rsatilmadi, oddiy ko'rinishda yuborildi: ${fallback}`);
    return;
  }
  const head = `<b>📝 Qoralama</b>${PROFIL[d.mahsulot] ? ` · ${PROFIL[d.mahsulot].belgi} ${PROFIL[d.mahsulot].nom}` : ''} | ${d.format} | baho: ${d.score ?? '-'}/10\n${d.plannedAt ? `🗓 Reja: ${fmtTime(d.plannedAt)}${d.rubric ? ` · ${esc(d.rubric)}` : ''}\n` : ''}<i>${esc(d.notes)}</i>\n${d.source_url ? `Manba: ${esc(d.source_url)}\n` : ''}━━━━━━━━━━\n\n`;
  await sendMediaPost(bot.api, chatId, { ...d, post_html: head + d.post_html }, extra);
}

// Post kanalga chiqib bo'lgan bo'lsa — video alohida post bo'lib chiqadi (o'sha postga javob sifatida)
const videoKb = (id) => new InlineKeyboard().text('📢 Videoni kanalga chiqarish', `vpub:${id}`).row().text('🔄 Boshqa video', `vid:${id}`);

// Qoralama uchun reels video yasaydi va tasdiqlash topigiga yuboradi. izoh — rahbar tavsifi (qanday video bo'lsin)
async function videoRun(d, { izoh = '' } = {}) {
  const [chatId, joy] = joyi(d);
  const reply = (t) => bot.api.sendMessage(chatId, t, joy).catch(() => {});
  videoBusy = true;
  try {
    // Video 3–6 daqiqa oladi (ssenariy, rejissyor, yig'ish) — bitta xabar bosqichma-bosqich yangilanadi, rahbar jim kutmaydi
    const bosh = `🎥 "${d.title}" — video yasalmoqda (3–6 daqiqa)${izoh ? `\nTavsifingiz: ${izoh.slice(0, 200)}` : ''}`;
    const holat = await bot.api.sendMessage(chatId, `${bosh}\n⏳ Boshlandi...`, joy).catch(() => null);
    const bosqich = async (t) => { if (holat) await bot.api.editMessageText(chatId, holat.message_id, `${bosh}\n${t}`).catch(() => {}); };
    const v = await videoYasa(d, { log: reply, izoh, bosqich });
    await bosqich('✅ Tayyor — video pastda.');
    const nd = store.update(d.id, { video_path: v.file, video_duration: v.duration, motion: v.data, video_izoh: izoh || null, video_msg_id: null });
    const chiqqan = nd.status === 'published';
    const cap = `<b>🎥 Video</b> | ${esc(d.title)} | ${Math.round(v.duration)} s${v.voiced ? ' | 🎙 dublyaj' : ''}\n<i>${
      chiqqan ? "Post kanalda bor — video alohida post bo'lib chiqadi." : isRich(d) ? 'Tasdiqlansa, video maqola ichida chiqadi.' : 'Tasdiqlansa, kanalga shu video post matni bilan chiqadi.'}</i>`;
    await bot.api.sendVideo(chatId, new InputFile(v.file), {
      caption: cap, parse_mode: 'HTML', supports_streaming: true, width: 1080, height: 1920,
      duration: Math.round(v.duration), ...joy, reply_markup: chiqqan ? videoKb(nd.id) : nd.status === 'approved' ? schedKb(nd) : kb(nd.id)
    });
  } catch (e) {
    await reply(`⚠️ Video yasalmadi (${d.title}): ${e.message}`);
  } finally { videoBusy = false; }
}

// Postning audio varianti (ovozli xabar) — tasdiqlansa post bilan birga chiqadi
async function audioRun(d) {
  const [chatId, joy] = joyi(d);
  const reply = (t) => bot.api.sendMessage(chatId, t, joy).catch(() => {});
  try {
    await reply(`🎙 "${d.title}" — ovoz yozilmoqda...`);
    const dir = path.join(cfg.dataDir, 'audio');
    const mp3 = path.join(dir, `${d.id}.mp3`), ogg = path.join(dir, `${d.id}.ogg`);
    await synth(speechText(d.post_html), mp3);
    const dur = await toVoiceNote(mp3, ogg);
    const nd = store.update(d.id, { audio_path: ogg, audio_duration: dur });
    await bot.api.sendVoice(chatId, new InputFile(ogg), {
      caption: `🎙 Audio variant | ${esc(d.title)} | ${Math.round(dur)} s\n<i>Tasdiqlansa, post bilan birga chiqadi.</i>`,
      parse_mode: 'HTML', duration: Math.round(dur), ...joy, reply_markup: nd.status === 'approved' ? schedKb(nd) : kb(nd.id)
    });
  } catch (e) {
    await reply(`⚠️ Ovoz yozilmadi (${d.title}): ${e.message}`);
  }
}

// Mahsulot rejimida buyruq mahsulot xonasidan tashqarida (shaxsiy chat, guruhning umumiy qismi) yozilsa — mahsulot tugma bilan tanlanadi
const tanlovlar = new Map();
const mahsulotKb = (key) => {
  const k = new InlineKeyboard();
  for (const m of kodlar()) k.text(`${PROFIL[m].belgi} ${PROFIL[m].nom}`, `tanla:${m}:${key}`).row();
  return k;
};

async function startRun(ctx, topic, format = null) {
  if (rejim() && !joriy()) {
    const key = Date.now().toString(36);
    tanlovlar.set(key, { topic, format });
    if (tanlovlar.size > 50) tanlovlar.delete(tanlovlar.keys().next().value);
    return ctx.reply('Qaysi mahsulot uchun?', { reply_markup: mahsulotKb(key) });
  }
  if (busy) return ctx.reply('⏳ Hozir ishlayapman, tugashini kuting.');
  busy = true;
  // Shaxsiy chatdan boshlansa — qoralama shu chatga keladi (guruhda bo'lmasangiz ham ko'rasiz)
  const chat = ctx.chat?.type === 'private' ? ctx.chat.id : null;
  const m = joriy();
  await ctx.reply(chat ? `🚀 Boshladim${m ? ` (${PROFIL[m].belgi} ${PROFIL[m].nom})` : ''}. 3–5 daqiqada qoralama shu yerga keladi.`
    : rejim() ? '🚀 Boshladim. Jarayon va qoralama shu yerda chiqadi.' : '🚀 Boshladim. Jarayonni log topigida kuzating.');
  runPipeline({ topic, format, count: topic ? 1 : cfg.dailyPosts, log, onDraft: (d) => sendForApproval(chat ? store.update(d.id, { chat }) : d) })
    .catch(e => { log(`❌ Xato: ${e.message}`); if (chat) bot.api.sendMessage(chat, `❌ Xato: ${e.message}`).catch(() => {}); })
    .finally(() => { busy = false; });
}

bot.callbackQuery(/^tanla:([a-z]{2}):(\w+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCallbackQuery({ text: 'Faqat rahbar' });
  const [, m, key] = ctx.match;
  const t = tanlovlar.get(key);
  if (!t || !PROFIL[m]) return ctx.answerCallbackQuery({ text: "Bu so'rov eskirgan — buyruqni qayta yozing", show_alert: true });
  tanlovlar.delete(key);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`${PROFIL[m].belgi} ${PROFIL[m].nom} tanlandi.`).catch(() => {});
  return bilan(m, () => startRun(ctx, t.topic, t.format));
});

// Mavzusiz /goya, /maqola, /karusel — mavzu reply bilan so'raladi
const mavzuSora = (ctx, format, misol) => ask(ctx, `Qaysi mavzuda? Shu yerga yozing.\nMasalan: <i>${misol}</i>`, { kind: 'mavzu', format });

// Kunlik ish bot band paytiga to'g'ri kelsa — tashlab ketilmaydi, soatlik tekshiruv (rejaYetibOl) bo'shaganda bajaradi
let kunlikKutyapti = false;
export async function dailyRun() {
  if (busy) { kunlikKutyapti = true; return; }
  kunlikKutyapti = false;
  busy = true;
  try {
    // Mahsulot rejimi: har mahsulot o'z tasdiqlangan rejasidan yozadi (reja yo'q bo'lsa — kutadi)
    if (rejim()) {
      for (const m of kodlar()) await bilan(m, async () => {
        if (!weekly.currentPlan()) return;
        try {
          const n = await weekly.produceDue({ log, onDraft: sendForApproval });
          if (n) await log(`🗓 Rejadan ${n} ta post yozildi.`);
        } catch (e) { await log(`❌ Xato: ${e.message}`); }
      });
      return;
    }
    // Tasdiqlangan haftalik reja bo'lsa — rejadagi yaqin postlar yoziladi, aks holda erkin izlanish
    if (weekly.currentPlan()) {
      const n = await weekly.produceDue({ log, onDraft: sendForApproval });
      if (n) await log(`🗓 Rejadan ${n} ta post yozildi.`);
    } else await runPipeline({ log, onDraft: sendForApproval });
  }
  catch (e) { await log(`❌ Xato: ${e.message}`); }
  finally { busy = false; }
}

// Har soat: kunlik ish qoldirilgan bo'lsa — bajariladi; aks holda tasdiqlangan rejadagi yaqin 36 soatlik,
// hali yozilmagan bandlar yoziladi (bot qayta ishga tushgan yoki kunlik ish o'tib ketgan bo'lsa ham postlar chiqadi)
export async function rejaYetibOl() {
  if (busy) return;
  if (kunlikKutyapti) return dailyRun();
  busy = true;
  try {
    for (const m of rejim() ? kodlar() : [null]) await bilan(m, async () => {
      // Avto rejimda tasdiqlangan reja yo'q: tasdiq kutayotgan reja hali amalda bo'lsa — o'zi tasdiqlanadi,
      // bo'lmasa (yakshanba bot o'chiq bo'lgan yoki eski reja tugagan) — yangisi tuziladi (6 soatda bir urinish)
      if (!weekly.currentPlan() && weekly.autoMode()) {
        const kutilgan = weekly.lastDraftPlan();
        const bugun = new Date(Date.now() + cfg.tzOffsetH * 3600e3).toISOString().slice(0, 10);
        if (kutilgan && kutilgan.to >= bugun) {
          weekly.approve(kutilgan.id);
          await log(`🤖 Avto rejim: tasdiq kutayotgan reja (${kutilgan.from} – ${kutilgan.to}) o'zi tasdiqlandi.`);
        } else {
          const kalit = `avto_reja_urinish:${m || 'umumiy'}`;
          if (Date.now() - store.setting(kalit, 0) < 6 * 3600e3) return;
          store.setSetting(kalit, Date.now());
          try { await rejaTuz(); } catch (e) { await log(`⚠️ Avto reja tuzilmadi: ${e.message}`); }
          return;
        }
      }
      if (!weekly.currentPlan()) return;
      const n = await weekly.produceDue({ log, onDraft: sendForApproval });
      if (n) await log(`🗓 Rejadan ${n} ta post yozildi.`);
    });
  } catch (e) { await log(`⚠️ Rejadan yozishda xato: ${e.message}`); }
  finally { busy = false; }
}

// ---------- Tayyor kontent reja (Kotib AI, Qadam AI, Kontent Fabrika) ----------
// /rejalar [ka|qa|kf] [sahifa] — ro'yxat · /reja_post qa07 [format] — shu banddan qoralama
// /reja_bankka [ka|qa|kf] — g'oyalar bankiga yuklash (haftalik reja ulardan oladi)
bot.command('rejalar', ctx => {
  if (!isAdmin(ctx)) return;
  const [a, b] = (ctx.match || '').trim().split(/\s+/);
  const prefiks = MAHSULOTLAR[a?.toLowerCase()] ? a.toLowerCase() : (joriy() || '');
  const sahifa = Number(MAHSULOTLAR[a?.toLowerCase()] ? b : a) || 1;
  return ctx.reply(royxatMatni(prefiks, sahifa), { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
});

bot.command('reja_post', async ctx => {
  if (!isAdmin(ctx)) return;
  const [kod, fmt] = (ctx.match || '').trim().split(/\s+/);
  const r = topish(kod);
  if (!r) return ctx.reply("Kodni yozing: /reja_post qa07 (ro'yxat: /rejalar qa). Format ixtiyoriy: post, karusel, maqola, reels.");
  const format = ['post', 'karusel', 'maqola', 'reels'].includes(fmt?.toLowerCase()) ? fmt.toLowerCase() : null;
  if (busy) return ctx.reply('⏳ Hozir ishlayapman, tugashini kuting.');
  busy = true;
  await ctx.reply(`🚀 ${r.kod} · ${r.mahsulot}: "${r.sarlavha}" — yozishni boshladim.${rejim() ? '' : ' Jarayon log topigida.'}`);
  // Reja kodi qaysi mahsulotniki bo'lsa — o'sha mahsulot miyasi va topigi
  bilan(rejim() ? r.kod.slice(0, 2) : joriy(), () => produceDraft(rejaPlan(r, format), { log })
    .then(d => sendForApproval(d))
    .catch(e => log(`❌ ${r.kod}: ${e.message}`)))
    .finally(() => { busy = false; });
});

bot.command('reja_bankka', ctx => {
  if (!isAdmin(ctx)) return;
  const a = (ctx.match || '').trim().toLowerCase();
  const bor = new Set(store.ideas().map(i => (/^\[([a-z]{2}\d{2})\]/.exec(i.text) || [])[1]).filter(Boolean));
  let n = 0;
  for (const r of royxat(MAHSULOTLAR[a] ? a : (joriy() || ''))) {
    if (bor.has(r.kod)) continue;
    store.addIdea(goyaMatni(r));
    n++;
  }
  const qoldi = store.ideas().filter(i => !i.used).length;
  return ctx.reply(`💡 G'oyalar bankiga ${n} ta reja qo'shildi (bankda ${qoldi} ta). Haftalik reja ulardan birinchi navbatda oladi. /goyalar`);
});

// Sozlash uchun: chat va topik ID'sini ko'rsatadi
bot.command('id', ctx => (rejim() && ctx.chat.type !== 'private') ? undefined : ctx.reply(`chat_id: ${ctx.chat.id}\ntopic_id: ${ctx.message?.message_thread_id ?? '-'}\nsizning id: ${ctx.from.id}`));

// /kanal — postlar qaysi kanalga chiqadi va bot u yerda post yoza oladimi
bot.command('kanal', async ctx => {
  if (!isAdmin(ctx)) return;
  if (!cfg.channelId) return ctx.reply("Kanal sozlanmagan: Railway → kontent-bot → Variables → CHANNEL_ID ga kanal manzilini yozing (masalan, @kanal_nomi).");
  const ch = await bot.api.getChat(cfg.channelId).catch(e => ({ xato: e.description || e.message }));
  if (ch.xato) return ctx.reply(`⚠️ CHANNEL_ID dagi kanalni bot topa olmadi: ${ch.xato}\nBot kanalga admin qilib qo'shilganini va manzil to'g'riligini tekshiring.`);
  const a = await bot.api.getChatMember(ch.id, bot.botInfo.id).catch(() => null);
  const holat = a?.status === 'administrator' ? (a.can_post_messages === false ? "⚠️ admin, lekin post yozish huquqi yo'q — postlar chiqmaydi" : '✅ admin, post yoza oladi')
    : "❌ admin emas — postlar chiqmaydi";
  return ctx.reply(`📢 Postlar shu kanalga chiqadi:\n${ch.title || ''}${ch.username ? ` (@${ch.username})` : ''}\n` +
    `${ch.username ? `https://t.me/${ch.username}` : "Yopiq kanal — ochiq havolasi yo'q"}\nID: ${ch.id}\nBot: ${holat}`);
});

bot.command('start', ctx => ctx.reply(
  'Kontent zavod ishlayapti.\n/yangi — hozir g\'oya izlash va qoralama yozish\n/goya <mavzu> — berilgan mavzu bo\'yicha post\n' +
  '/maqola <mavzu> — Telegram maqolasi (sarlavha, ro\'yxat, jadval)\n/karusel <mavzu> — slaydli karusel\n' +
  '/rejalar [ka|qa|kf] — tayyor kontent reja (150 ta) · /reja_post qa07 — shu bo\'yicha post · /reja_bankka — g\'oyalar bankiga\n' +
  (rejim() ? "Mahsulot rejimi: har mahsulot o'z xonasida — reja, qoralama, jarayon shu yerda. /jadval — chiqish kunlari\n" : '') +
  '/sozla — soha, auditoriya, mahsulotlar va manbalarni sozlash\n/reja — haftalik reja · /reja_yangi · /rubrikalar · /avto\n\"g\'oya: ...\" — g\'oyalar bankiga · /goyalar\n/navbat — rejalashtirilgan postlar\n/hisobot [kun] — natijalar (reaksiyalar, formatlar)\n/uslub — uslubingizni o\'rgatish · /qoidalar — doimiy qoidalar\n/kanal — postlar qaysi kanalga chiqadi\n/id — chat va topik ID'));

bot.command('yangi', ctx => isAdmin(ctx) && startRun(ctx, null));
bot.command('goya', ctx => {
  if (!isAdmin(ctx)) return;
  const topic = ctx.match?.trim();
  if (!topic) return mavzuSora(ctx, null, 'xodimlar kechikishi');
  startRun(ctx, topic);
});

for (const [cmd, format, example] of [['maqola', 'maqola', 'xodimni ishga olish tartibi'], ['karusel', 'karusel', 'rahbarning 5 ta xatosi']]) {
  bot.command(cmd, ctx => {
    if (!isAdmin(ctx)) return;
    const topic = ctx.match?.trim();
    if (!topic) return mavzuSora(ctx, format, example);
    startRun(ctx, topic, format);
  });
}

// ---------- /sozla: soha, auditoriya, mahsulotlar, g'oya manbalari va uslubni so'rab olish ----------
// Javoblar reply orqali; oxirida agent brend profilini tuzadi, rahbar ✅ bosgach sozlamalarga yoziladi
const sozlaSora = (ctx, matn) => ctx.reply(matn, { parse_mode: 'HTML', ...(ctx.msg?.message_thread_id ? { message_thread_id: ctx.msg.message_thread_id } : {}),
  reply_markup: { force_reply: true } }).then(m => store.setWait(m.message_id, { kind: 'sozla', chat: m.chat?.id ?? ctx.chat?.id,
    thr: ctx.chat?.type === 'private' ? null : (topikIchida(m) ?? topikIchida(ctx.msg)), kim: ctx.from?.id }));

bot.command('sozla', async ctx => {
  if (!isAdmin(ctx)) return;
  store.setSetting('sozla', { qadam: 0, javoblar: {} });
  await sozlaSora(ctx, `⚙️ <b>Sozlash</b> — agentlar kim uchun va nima haqida yozishini aniqlaymiz (6 ta savol). Har savolga shu yerga javob yozing.\n\n${onboarding.SAVOLLAR[0].savol}`);
});

async function sozlaJavob(ctx) {
  const holat = store.setting('sozla', null);
  if (!holat) return ctx.reply("Sozlash boshlanmagan: /sozla");
  const r = onboarding.javobQabul(holat, ctx.message.text);
  store.setSetting('sozla', holat);
  if (r.keyingi) return sozlaSora(ctx, r.xato ? `${r.xato}\n\n${r.keyingi}` : r.keyingi);
  await ctx.reply('⏳ Javoblaringizdan brend profili tuzilyapti (1–2 daqiqa)...');
  try {
    const n = await onboarding.brendYasa(holat.javoblar);
    store.setSetting('sozla_natija', n);
    const mlar = Object.entries(n.mahsulotlar).map(([k, m]) => `${m.belgi} ${esc(m.nom)} <code>${k}</code>`).join('\n') || "yo'q (umumiy kontent)";
    await sendLong(ctx.chat.id, `🧾 <b>Brend profili</b>\n\n${esc(n.matn)}\n\n<b>Mahsulotlar:</b>\n${mlar}`, ctx.msg?.message_thread_id ? { message_thread_id: ctx.msg.message_thread_id } : {});
    await ctx.reply('Shu profil bilan ishlaymizmi? Agentlar endi shunga qarab yozadi.', {
      ...(ctx.msg?.message_thread_id ? { message_thread_id: ctx.msg.message_thread_id } : {}),
      reply_markup: new InlineKeyboard().text('✅ Saqlash', 'sozla:ok').text('❌ Bekor', 'sozla:no') });
  } catch (e) { await ctx.reply(`⚠️ Profil tuzilmadi: ${e.message}. /sozla bilan qayta urinib ko'ring.`); }
}

bot.callbackQuery(/^sozla:(ok|no)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCallbackQuery({ text: 'Faqat rahbar' });
  const holat = store.setting('sozla', null), n = store.setting('sozla_natija', null);
  await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard().text(ctx.match[1] === 'ok' ? '✅ Saqlandi' : '❌ Bekor qilindi', 'noop') }).catch(() => {});
  await ctx.answerCallbackQuery();
  store.setSetting('sozla', null); store.setSetting('sozla_natija', null);
  if (ctx.match[1] !== 'ok' || !holat || !n) return;
  const r = await onboarding.saqla(holat.javoblar, n, { kuzatuv: { kanalQosh }, uslub: (kanal) => uslubKanaldan({ kanal }) });
  await ctx.reply(`✅ Sozlandi. Agentlar endi yangi brend bilan yozadi.` +
    (r.qoshildi.length ? `\n👀 Kuzatuvga qo'shildi: ${r.qoshildi.join(', ')}` : '') +
    (r.xatolar.length ? `\n⚠️ Qo'shilmadi: ${r.xatolar.join('; ')}` : '') + (r.uslubNatija ? `\n${r.uslubNatija}` : '') +
    `\nKeyingi qadam: /reja_yangi${rejim() ? ' (mahsulot topiklari PRODUCT_TOPICS da yangi kodlar bilan bo\'lishi kerak; har mahsulot xonasida /jadval — chiqish kunlari)' : ''} yoki /avto on.`);
});

// ---------- Uslub: namuna postlar va doimiy qoidalar ----------
export const RULES_BATCH = 5; // shuncha yangi tahrir izohi yig'ilsa — qoidalar avtomatik yangilanadi
let rulesBusy = false;

export async function refreshRules() {
  if (rulesBusy) return null;
  const st = store.style();
  const fresh = st.feedback.filter(f => !f.used);
  if (!fresh.length) return null;
  rulesBusy = true;
  try {
    const { rules, added } = await distillRules(st.rules, fresh);
    store.saveStyle({ rules, feedback: st.feedback.map(f => ({ ...f, used: true })) });
    return { rules, added };
  } finally { rulesBusy = false; }
}

bot.command('uslub', ctx => {
  if (!isAdmin(ctx)) return;
  const st = store.style();
  ctx.reply(
    `✍️ Uslub xotirasi\nNamuna postlar: ${st.samples.length} ta · Qoidalar: ${st.rules.length} ta\n\n` +
    (st.guide ? `Hozirgi uslub tavsifi:\n${st.guide}\n\n` : "Uslub tavsifi hali yo'q.\n\n") +
    `Qanday o'rgatasiz:\n1) Eng yaxshi 15–30 ta postingizni botga SHAXSIY CHATDA forward qiling (kanaldan yoki istalgan joydan).\n` +
    `2) /uslub_yangila — bot ulardan uslubingizni o'rganadi.\n\n` +
    `/qoidalar — tahrirlaringizdan yig'ilgan qoidalar · /uslub_tozala — namunalar va tavsifni o'chirish`);
});

bot.command('uslub_yangila', async ctx => {
  if (!isAdmin(ctx)) return;
  const st = store.style();
  if (st.samples.length < 5) return ctx.reply(`Kamida 5 ta namuna kerak (hozir ${st.samples.length} ta). Postlaringizni botga shaxsiy chatda forward qiling.`);
  await ctx.reply(`🔍 ${st.samples.length} ta postdan uslubingizni o'rganyapman...`);
  try {
    const guide = await analyzeStyle(st.samples.slice(-30));
    store.saveStyle({ guide });
    await ctx.reply(`✅ Uslub saqlandi. Endi hamma agentlar shunga qarab yozadi:\n\n${guide}`.slice(0, 4000));
  } catch (e) { await ctx.reply(`⚠️ Xato: ${e.message}`); }
});

bot.command('uslub_tozala', ctx => {
  if (!isAdmin(ctx)) return;
  store.saveStyle({ samples: [], guide: '' });
  ctx.reply("🗑 Namunalar va uslub tavsifi o'chirildi. Qoidalar saqlanib qoldi (/qoidalar).");
});

bot.command('qoidalar', ctx => {
  if (!isAdmin(ctx)) return;
  const st = store.style();
  const wait = st.feedback.filter(f => !f.used).length;
  ctx.reply((st.rules.length ? `📏 Doimiy qoidalar:\n${st.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}` : "📏 Doimiy qoidalar hali yo'q.") +
    `\n\nTahrir (✏️) izohlaringizdan avtomatik yig'iladi: har ${RULES_BATCH} ta izohda yangilanadi (hozir navbatda: ${wait}).\n` +
    `/qoidalar_yangila — hozir yangilash · /qoidalar_ochir 3 — 3-qoidani o'chirish`);
});

bot.command('qoidalar_yangila', async ctx => {
  if (!isAdmin(ctx)) return;
  try {
    const r = await refreshRules();
    if (!r) return ctx.reply("Yangi tahrir izohi yo'q.");
    await ctx.reply(`✅ Qoidalar yangilandi (${r.rules.length} ta).${r.added.length ? `\nYangi:\n• ${r.added.join('\n• ')}` : ''}`);
  } catch (e) { await ctx.reply(`⚠️ Xato: ${e.message}`); }
});

bot.command('qoidalar_ochir', ctx => {
  if (!isAdmin(ctx)) return;
  const n = Number(ctx.match?.trim());
  const rules = [...store.style().rules];
  if (!n || n < 1 || n > rules.length) return ctx.reply(`Raqamni yozing: /qoidalar_ochir 1 … ${rules.length || 1}`);
  const [gone] = rules.splice(n - 1, 1);
  store.saveStyle({ rules });
  ctx.reply(`🗑 O'chirildi: ${gone}`);
});

// ---------- Haftalik reja va rubrikalar ----------
const planKb = (id) => new InlineKeyboard()
  .text('✅ Rejani tasdiqlash', `pok:${id}`).row()
  .text('✏️ O\'zgartirish', `pedit:${id}`).text('🔄 Qayta tuzish', `pnew:${id}`);

async function sendPlan(p, chatId = cfg.groupId, extra = { message_thread_id: tema(p.mahsulot || joriy()) }) {
  await sendLong(chatId, weekly.formatPlan(p), extra);
  if (p.status !== 'approved') await sendSafe(bot.api, chatId, `Rejani ko'rib chiqing. Tasdiqlasangiz, har post chiqishidan ~1 kun oldin yoziladi${weekly.autoMode() ? ' va o\'zi chiqadi (avto rejim)' : ' va tasdiqlashga keladi'}.`, { ...extra, reply_markup: planKb(p.id) });
}

// Mahsulot rejimida: topikdan chaqirilsa — shu mahsulot, jadval bo'yicha (cron) — hammasi
// Avto rejimda reja tasdiq kutmaydi: o'zi tasdiqlanadi, yaqin postlar darhol yoziladi va o'z vaqtida chiqadi.
// Rahbar xohlasa ✏️ bilan o'zgartiradi yoki /avto off qiladi.
const avtoRejaKb = (id) => new InlineKeyboard().text('✏️ O\'zgartirish', `pedit:${id}`).text('🔄 Qayta tuzish', `pnew:${id}`);
async function rejaTuz() {
  const p = await weekly.buildPlan(log);
  console.log(`[${joriy() || 'umumiy'}] 🗓 Reja tuzildi: ${p.items?.length || 0} ta post (${p.from} – ${p.to})${weekly.autoMode() ? ', avto tasdiqlandi' : ', tasdiq kutadi'}`);
  if (!weekly.autoMode()) return sendPlan(p);
  weekly.approve(p.id);
  const extra = { message_thread_id: tema(p.mahsulot || joriy()) };
  await sendLong(cfg.groupId, weekly.formatPlan(p), extra);
  await sendSafe(bot.api, cfg.groupId, "🤖 Avto rejim: reja o'zi tasdiqlandi — postlar chiqishidan ~1 kun oldin yoziladi va o'z vaqtida kanalga chiqadi.", { ...extra, reply_markup: avtoRejaKb(p.id) });
  const n = await weekly.produceDue({ log, onDraft: sendForApproval });
  if (n) await log(`🗓 Rejadan ${n} ta post yozildi.`);
}

export async function weeklyPlanRun(mlar = rejim() ? (joriy() ? [joriy()] : kodlar()) : [null]) {
  if (busy) return log('⏳ Haftalik reja keyinroq: hozir boshqa ish bajarilyapti. /reja_yangi bilan qayta urinib ko\'ring.');
  busy = true;
  try {
    for (const m of mlar) await bilan(m, async () => {
      try { await rejaTuz(); }
      catch (e) { await log(`⚠️ Haftalik reja tuzilmadi: ${e.message}`); }
    });
  } finally { busy = false; }
}

// CRM kalendaridan joylangan, yaqin 36 soatda chiqadigan g'oyalar — darhol yoziladi (har mahsulot o'z xonasida)
export async function kalendarYoz() {
  if (busy || !weekly.hasDueManual()) return;
  busy = true;
  try {
    for (const m of rejim() ? kodlar() : [null]) await bilan(m, async () => {
      const n = await weekly.produceDue({ log, onDraft: sendForApproval, faqat: p => p.qolda });
      if (n) await log(`📅 Kalendardan ${n} ta post yozildi.`);
    });
  } catch (e) { await log(`⚠️ Kalendar bandi yozilmadi: ${e.message}`); }
  finally { busy = false; }
}

async function producePlanned() {
  if (busy) return;
  busy = true;
  try {
    const n = await weekly.produceDue({ log, onDraft: sendForApproval });
    await log(n ? `🗓 Rejadan ${n} ta post yozildi.` : '🗓 Yaqin 36 soatda yoziladigan post yo\'q — keyingilari har kuni ertalab yoziladi.');
  } finally { busy = false; }
}

bot.command('reja', async ctx => {
  if (!isAdmin(ctx)) return;
  const p = weekly.lastDraftPlan() || weekly.currentPlan();
  if (rejim() && !joriy()) return ctx.reply("Rejani mahsulot xonasida so'rang.");
  if (!p) return ctx.reply(`Hali reja yo'q. Har yakshanba 18:00 da o'zi tuziladi yoki hozir: /reja_yangi${rejim() ? `\nChiqish jadvali: /jadval` : `\nRubrikalar: /rubrikalar`}`);
  await sendPlan(p, ctx.chat.id, ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {});
});

bot.command('reja_yangi', async ctx => {
  if (!isAdmin(ctx)) return;
  if (busy) return ctx.reply('⏳ Hozir ishlayapman, tugashini kuting.');
  if (rejim() && !joriy()) return ctx.reply("Rejani mahsulot xonasida so'rang: 🤖 Kotib AI, 🎓 Qadam AI yoki ✍️ Kontent Fabrika.");
  await ctx.reply('🗓 Ertadan boshlab 7 kunlik reja tuzilmoqda (1–3 daqiqa)...');
  weeklyPlanRun();
});

// Mahsulotning kanalga chiqish jadvali: /jadval — ko'rish, /jadval Du 09:00, Chor 19:00 — o'rnatish
bot.command('jadval', ctx => {
  if (!isAdmin(ctx)) return;
  if (!joriy()) return ctx.reply("Jadval har mahsulot uchun alohida — mahsulot xonasida yozing.");
  const arg = (ctx.match || '').trim();
  if (arg) {
    const j = weekly.parseJadval(arg);
    if (!j.length) return ctx.reply('Namuna: /jadval Du 09:00, Chor 09:00, Ju 19:00\nKunlar: Du Se Chor Pay Ju Sha Ya');
    store.setMSetting('jadval', j);
  }
  return ctx.reply(`🗓 ${PROFIL[joriy()].belgi} ${PROFIL[joriy()].nom} — kanalga chiqish: ${weekly.formatJadval()} (haftasiga ${weekly.jadval().length} ta).\n` +
    `O'zgartirish: /jadval Du 09:00, Chor 09:00, Ju 19:00\nKeyingi haftalik rejadan kuchga kiradi (hozir qayta tuzish: /reja_yangi).`);
});

// Birinchi ishga tushishda har mahsulot xonasiga qisqa yo'riqnoma va "Reja tuzish" tugmasi
export async function salomlash() {
  if (!rejim() || !cfg.groupId) return;
  for (const m of kodlar()) await bilan(m, async () => {
    if (store.mSetting('salom')) return;
    const r = await bot.api.sendMessage(cfg.groupId,
      `${PROFIL[m].belgi} <b>Kontent Fabrika endi shu xonada ishlaydi — faqat ${PROFIL[m].nom} uchun.</b>\n\n` +
      `• Har yakshanba 18:00 da ${PROFIL[m].nom} bo'yicha haftalik reja keladi — ✅ tasdiqlaysiz.\n` +
      `• Postlar chiqishidan bir kun oldin yoziladi va shu yerga qoralama bo'lib keladi: ✅ / ✏️ / ❌.\n` +
      `• Jarayon ham shu yerda — bitta yangilanib boradigan xabarda.\n` +
      `• <code>g'oya: ...</code> — shu mahsulot g'oyalar bankiga. /goyalar — ro'yxat.\n` +
      `• /goya mavzu — hozir post · /jadval — kanalga chiqish kunlari (${weekly.formatJadval()}) · /hisobot\n\n` +
      `Uslubingiz va qoidalaringiz uchala mahsulot uchun umumiy — kanal bitta ovozda gapiradi.`,
      { parse_mode: 'HTML', message_thread_id: tema(m), reply_markup: new InlineKeyboard().text('🗓 Birinchi haftalik rejani tuzish', `mreja:${m}`) }).catch(e => { console.error('Salom:', e.message); return null; });
    if (r) store.setMSetting('salom', true);
  });
}
bot.callbackQuery(/^mreja:(\w+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCallbackQuery({ text: 'Faqat rahbar' });
  if (busy) return ctx.answerCallbackQuery({ text: 'Hozir band, biroz kuting' });
  await ctx.answerCallbackQuery({ text: 'Reja tuzilmoqda (1–3 daqiqa)' });
  await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard().text('🗓 Reja tuzilmoqda...', 'noop') }).catch(() => {});
  return bilan(ctx.match[1], () => weeklyPlanRun([ctx.match[1]]));
});

bot.command('rubrikalar', ctx => {
  if (!isAdmin(ctx)) return;
  return ctx.reply(`🔁 <b>Rubrikalar</b> (har kunning birinchi posti):\n${weekly.formatRubrics() || "yo'q"}\n\n` +
    `Qo'shish/almashtirish: <code>/rubrika_qosh Du karusel Xato va yechim — rahbar xatosi va tuzatish</code>\n` +
    `O'chirish: <code>/rubrika_ochir 2</code> · Standartga qaytarish: <code>/rubrika_ochir hammasi</code>\n` +
    `Kunlar: Du Se Chor Pay Ju Sha Ya · Formatlar: post maqola karusel reels`, { parse_mode: 'HTML' });
});

bot.command('rubrika_qosh', ctx => {
  if (!isAdmin(ctx)) return;
  const m = (ctx.match || '').trim().match(/^(\S+)\s+(post|maqola|karusel|reels)\s+(.+?)(?:\s+[—-]\s+(.+))?$/i);
  const day = m ? weekly.DAYS.findIndex(d => d.toLowerCase() === m[1].toLowerCase()) : -1;
  if (!m || day < 0) return ctx.reply('Namuna: /rubrika_qosh Du karusel Xato va yechim — rahbar xatosi va tuzatish');
  const r = { day, format: m[2].toLowerCase(), name: m[3].trim(), desc: (m[4] || m[3]).trim() };
  store.setRubrics([...weekly.rubrics().filter(x => x.day !== day), r]);
  return ctx.reply(`✅ ${weekly.DAYS[day]}: ${r.name} (${r.format}). Keyingi rejadan kuchga kiradi.`);
});

bot.command('rubrika_ochir', ctx => {
  if (!isAdmin(ctx)) return;
  const arg = (ctx.match || '').trim().toLowerCase();
  if (arg === 'hammasi') { store.setRubrics(null); return ctx.reply('↩️ Standart rubrikalar qaytarildi. /rubrikalar'); }
  const list = weekly.sortedRubrics(), n = Number(arg);
  if (!n || n < 1 || n > list.length) return ctx.reply(`Raqamni yozing: /rubrika_ochir 1 … ${list.length}`);
  const gone = list[n - 1];
  store.setRubrics(weekly.rubrics().filter(r => r !== gone));
  return ctx.reply(`🗑 ${weekly.DAYS[gone.day]} — ${gone.name} o'chirildi. U kun erkin mavzu bo'ladi.`);
});

bot.command('avto', ctx => {
  if (!isAdmin(ctx)) return;
  const arg = (ctx.match || '').trim().toLowerCase();
  if (['on', 'yoq', 'yoqish', '1'].includes(arg)) store.setSetting('avto', true);
  else if (['off', "o'chir", 'ochir', '0'].includes(arg)) store.setSetting('avto', false);
  const on = weekly.autoMode();
  return ctx.reply(on
    ? '🤖 Avto rejim YOQILGAN: haftalik reja o\'zi tasdiqlanadi, rejadagi postlar yozilgach tasdiqlashsiz o\'z vaqtida chiqadi (topikda ko\'rinadi — vaqtini o\'zgartirish yoki navbatdan olish mumkin). Reja bo\'lmasa — o\'zi tuziladi.\nO\'chirish: /avto off'
    : '✋ Avto rejim O\'CHIQ: rejadagi har post tasdiqlashga keladi (✅ bosilsa reja vaqtida chiqadi).\nYoqish: /avto on');
});

bot.callbackQuery(/^(pok|pnew|pedit):(.+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCallbackQuery({ text: 'Faqat rahbar' });
  const [, act, id] = ctx.match;
  if (!store.plans().find(p => p.id === id)) return ctx.answerCallbackQuery({ text: 'Reja topilmadi' });
  if (act === 'pok') {
    weekly.approve(id);
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard().text('✅ Reja tasdiqlandi', 'noop') }).catch(() => {});
    await ctx.answerCallbackQuery({ text: 'Reja tasdiqlandi' });
    return producePlanned().catch(e => log(`⚠️ Rejadan yozishda xato: ${e.message}`));
  }
  if (act === 'pnew') {
    if (busy) return ctx.answerCallbackQuery({ text: 'Hozir band, biroz kuting' });
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard().text('🔄 Qayta tuzilmoqda...', 'noop') }).catch(() => {});
    await ctx.answerCallbackQuery();
    return weeklyPlanRun();
  }
  await ctx.answerCallbackQuery();
  return ask(ctx, "✏️ Rejada nimani o'zgartiramiz? Masalan: <i>chorshanbadagi keysni xodim motivatsiyasiga almashtir, reels kamroq bo'lsin</i>. Shu yerga yozing.", { kind: 'plan', id });
});

bot.command('goyalar', ctx => {
  if (!isAdmin(ctx)) return;
  const list = store.ideas().filter(i => !i.used);
  if (!list.length) return ctx.reply("💡 G'oyalar banki bo'sh.\nQo'shish: istalgan chatda yozing — g'oya: mavzu yoki fikringiz");
  return ctx.reply(`💡 G'oyalar banki (${list.length} ta, rejada birinchi navbatda):\n` +
    list.map((i, k) => `${k + 1}. ${i.text.slice(0, 150)}`).join('\n') +
    `\n\nQo'shish: g'oya: ... · O'chirish: /goya_ochir 2 · Darhol post: /goya <mavzu>`);
});

bot.command('goya_ochir', ctx => {
  if (!isAdmin(ctx)) return;
  const list = store.ideas().filter(i => !i.used), n = Number((ctx.match || '').trim());
  if (!n || n < 1 || n > list.length) return ctx.reply(`Raqamni yozing: /goya_ochir 1 … ${list.length || 1}`);
  store.removeIdea(list[n - 1].id);
  return ctx.reply(`🗑 O'chirildi: ${list[n - 1].text.slice(0, 100)}`);
});

// ---------- Hisobot va reaksiyalar ----------
// Telegram xabari 4096 belgigacha — uzun hisobot bo'limlarga bo'linib ketadi
async function sendLong(chatId, text, extra = {}) {
  const parts = [];
  let cur = '';
  for (const block of text.split('\n')) {
    if ((cur + '\n' + block).length > 3800) { parts.push(cur); cur = block; } else cur = cur ? cur + '\n' + block : block;
  }
  if (cur) parts.push(cur);
  for (const p of parts) await sendSafe(bot.api, chatId, p, extra);
}

export async function weeklyReport(days = 7) {
  if (!rejim()) return sendLong(cfg.groupId, await buildReport(days), { message_thread_id: cfg.logTopic });
  for (const m of kodlar()) await bilan(m, async () => sendLong(cfg.groupId, await buildReport(days), { message_thread_id: tema(m) }));
}

bot.command('hisobot', async ctx => {
  if (!isAdmin(ctx)) return;
  const days = Math.min(90, Math.max(1, Number(ctx.match?.trim()) || 7));
  await ctx.reply('📊 Hisobot tayyorlanmoqda...');
  try { await sendLong(ctx.chat.id, await buildReport(days), ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {}); }
  catch (e) { await ctx.reply(`⚠️ Xato: ${e.message}`); }
});

// Kanal postlaridagi reaksiyalar soni (bot kanal admini bo'lishi shart)
bot.on('message_reaction_count', ctx => {
  const r = ctx.messageReactionCount;
  const d = store.byStatus('published').find(x => x.channel_msg_ids?.includes(r.message_id) && (!x.channel_chat || x.channel_chat === r.chat.id));
  if (!d) return;
  const total = r.reactions.reduce((a, x) => a + (x.total_count || 0), 0);
  store.update(d.id, { reactions: { ...(d.reactions || {}), [r.message_id]: total } });
});

bot.command('navbat', ctx => {
  if (!isAdmin(ctx)) return;
  const q = store.byStatus('approved').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  if (!q.length) return ctx.reply('Navbat bo\'sh.');
  const k = new InlineKeyboard();
  for (const d of q) k.text(`🕒 ${fmtTime(d.scheduledAt)} — ${d.title}`.slice(0, 60), `time:${d.id}`).row();
  ctx.reply('Rejalashtirilgan postlar. Vaqtini o\'zgartirish uchun bosing:', { reply_markup: k });
});

// Tugmalar
// Qoralamaga rasm: Telegram'dan yuklab olib saqlaydi
async function saveTelegramFile(fileId, draftId) {
  const f = await bot.api.getFile(fileId);
  const res = await fetch(`${API_ROOT}/file/bot${cfg.botToken}/${f.file_path}`, { signal: AbortSignal.timeout(60e3) });
  if (!res.ok) throw new Error(`Rasm yuklanmadi (${res.status})`);
  const dir = path.join(cfg.dataDir, 'images', draftId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}${path.extname(f.file_path) || '.jpg'}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

// Kanaldagi post havolasi: ochiq kanal — t.me/<nom>/<id>, yopiq kanal — t.me/c/<id>/<id> (a'zolarga ochiladi)
let kanalMalumot = null;
async function postHavolasi(d) {
  const msgId = d?.channel_msg_ids?.[0];
  if (!msgId) return '';
  if (!kanalMalumot) kanalMalumot = await bot.api.getChat(d.channel_chat || cfg.channelId).catch(() => null);
  if (kanalMalumot?.username) return `https://t.me/${kanalMalumot.username}/${msgId}`;
  const id = String(kanalMalumot?.id || d.channel_chat || '').replace(/^-100/, '');
  return /^\d+$/.test(id) ? `https://t.me/c/${id}/${msgId}` : '';
}
const kanalNomi = () => (kanalMalumot?.title ? `"${kanalMalumot.title}"` : 'Telegram');

// Vaqt belgilash: rahbar tugmadan tanlasa yoki yozsa — post o'sha vaqtda chiqadi (tasdiqlangan hisoblanadi)
function vaqtQoy(d, at) {
  const busyAt = store.byStatus('approved').find(x => x.id !== d.id && x.scheduledAt === at);
  if (d.status !== 'approved') store.addChoice(d, true);
  store.dropWaits(d.id, 'time');
  const nd = store.update(d.id, { status: 'approved', scheduledAt: at, publish_attempts: 0 });
  return { nd, matn: `✅ "${d.title}" — ${fmtTime(at)} da chiqadi.${busyAt ? `\n⚠️ Shu vaqtda "${busyAt.title}" ham bor — ikkalasi ketma-ket chiqadi.` : ''}` };
}
const vaqtKodi = (iso) => Math.round(Date.parse(iso) / 60e3).toString(36);

// Reels ssenariysi o'qish uchun: har sahna — diktor gapi va ekrandagi yozuv
const ssenariyMatni = (s) => [
  ...(s?.sahnalar || []).map((x, i) => `${i + 1}. 🎙 ${x.ovoz || ''}${x.ekran ? `\n   📺 ${x.ekran}` : ''}`),
  ...(s?.yakun ? [`🏁 🎙 ${s.yakun.ovoz || ''}${s.yakun.ekran ? `\n   📺 ${s.yakun.ekran}` : ''}${s.yakun.tugma ? `\n   👉 ${s.yakun.tugma}` : ''}`] : []),
].join('\n');

const rasmKb = (d) => {
  const k = new InlineKeyboard().text('🎨 Muqova (o\'zing tanla)', `imuq:${d.id}`);
  if (rasmYoqilgan()) k.text('🤖 AI rasm (o\'zing tanla)', `iai:${d.id}`);
  if (imagePaths(d).length) k.row().text(`🗑 Rasmlarni olib tashlash (${imagePaths(d).length})`, `idel:${d.id}`);
  return k;
};

// Rasm: tur — 'muqova' (dizayner kartochka), 'ai' (Gemini), 'ochir'; izoh — rahbar tavsifi (qanday rasm bo'lsin)
async function rasmIsh(ctx, d, tur, izoh = '') {
  const opt = { message_thread_id: tema() };
  store.dropWaits(d.id, 'image');
  if (tur === 'ochir') {
    const nd = store.update(d.id, { image_paths: [] });
    await ctx.reply('🗑 Rasmlar olib tashlandi. Yangilangan qoralama:', opt);
    return sendForApproval(nd);
  }
  if (tur === 'ai' && rasmYoqilgan()) {
    await ctx.reply(`🎨 AI rasm chizilyapti (1–2 daqiqa)${izoh ? ' — tavsifingiz bo\'yicha' : ''}...`, opt);
    try {
      const file = await rasmYasa(await rasmPrompti(d, { izoh }), path.join(cfg.dataDir, 'images', d.id, `ai-${Date.now()}`));
      const nd = store.update(d.id, { image_paths: [...(d.image_paths || []), file] });
      await ctx.reply('🖼 AI rasm tayyor. Yangilangan qoralama:', opt);
      return sendForApproval(nd);
    } catch (e) { return ctx.reply(`⚠️ AI rasm chizilmadi: ${e.message}`, opt); }
  }
  await ctx.reply(`🎨 Dizayner kartochka chizyapti${izoh ? ' — tavsifingiz bo\'yicha' : ''}...`, opt);
  try {
    const { file } = await muqovaYasa(d, { izoh });
    const nd = store.update(d.id, { image_paths: [...(d.image_paths || []), file] });
    await ctx.reply('🖼 Muqova tayyor. Yangilangan qoralama:', opt);
    return sendForApproval(nd);
  } catch (e) { return ctx.reply(`⚠️ Muqova yasalmadi: ${e.message}`, opt); }
}

bot.callbackQuery(/^(ok|time|unq|now|edit|scr|vid|vauto|vpub|img|imuq|iai|idel|aud|no):(.+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCallbackQuery({ text: 'Faqat rahbar tasdiqlaydi' });
  const [, act, id] = ctx.match;
  const d = store.get(id);
  if (!d) return ctx.answerCallbackQuery({ text: 'Qoralama topilmadi' });
  const mark = (t) => ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard().text(t, 'noop') }).catch(() => {});
  // Xato rahbar tugmani bosgan joyda ham ko'rinsin (mahsulot rejimida log shu topikning o'ziga tushadi)
  const xatoAyt = (t) => (ctx.chat?.type === 'private' || !rejim() ? ctx.reply(t).catch(() => {}) : undefined);

  // Chiqqan postda ham ishlaydi: ssenariy, video yasash va videoni kanalga alohida chiqarish
  if (d.status === 'published' && !['scr', 'vid', 'vauto', 'vpub'].includes(act)) {
    await ctx.answerCallbackQuery({ text: 'Bu post allaqachon chiqqan' });
    const h = await postHavolasi(d);
    return ctx.reply(`📢 "${d.title}" ${d.publishedAt ? `${fmtTime(d.publishedAt)} da ` : ''}${kanalNomi()} kanaliga chiqqan.${h ? `\n${h}` : ''}`);
  }
  // ✏️ Tahrirdan keyin eski versiya xabaridagi tugmalar ishlamasin — aks holda eski matn ham kanalga chiqib ketardi
  if (d.status === 'revised' && act !== 'scr') return ctx.answerCallbackQuery({ text: "Bu eski versiya — tahrirlangan yangi qoralamadagi tugmalardan foydalaning", show_alert: true });

  // 🎥 Video: avval qanday video kerakligi so'raladi (tavsif yoki 🤖 — agentlar o'zi tanlaydi)
  if (act === 'vid') {
    if (videoBusy) return ctx.answerCallbackQuery({ text: 'Boshqa video yasalmoqda, biroz kuting' });
    await ctx.answerCallbackQuery();
    return ask(ctx, `🎥 "${esc(d.title)}" — qanday video bo'lsin?\nShu yerga yozing: uslub (doska, plakat, chat yozishma, grid kartochkalar${heygenYoqilgan() ? ', avatar' : ''}), ` +
      `uzunligi, nimani ko'rsatish, oxirida nima deyish.\n<i>Masalan: doska uslubida, 40 soniya, 3 ta xato va yechimi, oxirida Direktga yozing</i>\n` +
      `Yoki 🤖 bosing — agentlar o'zi tanlaydi.`, { kind: 'video', id, muddat: 10 * 60e3 }, new InlineKeyboard().text('🤖 O\'zing tanla', `vauto:${id}`));
  }
  if (act === 'vauto') {
    if (videoBusy) return ctx.answerCallbackQuery({ text: 'Boshqa video yasalmoqda, biroz kuting' });
    store.dropWaits(id, 'video');
    await ctx.answerCallbackQuery({ text: 'Video yasash boshlandi' });
    await mark('🎥 Video yasalmoqda...');
    videoRun(d); // fonda — bot bloklanmaydi
    return;
  }
  if (act === 'vpub') {
    await ctx.answerCallbackQuery({ text: 'Video kanalga chiqarilyapti…' });
    try {
      const m = await videoniChiqar(bot.api, d);
      await mark('📢 Video kanalga chiqdi');
      const h = await postHavolasi({ channel_msg_ids: [m?.message_id], channel_chat: m?.chat?.id });
      await log(`📢 Video kanalga chiqdi: ${d.title}${h ? ` — ${h}` : ''}`);
      return ctx.reply(`📢 Video ${kanalNomi()} kanaliga chiqdi${h ? `: ${h}` : '.'}`);
    } catch (e) {
      if (e instanceof AllaqachonChiqqan) return mark('📢 Video kanalga chiqqan');
      await log(`❌ "${d.title}" videosi kanalga chiqmadi: ${e.message}`);
      return xatoAyt(`❌ Video kanalga chiqmadi: ${e.message}`);
    }
  }
  // ⚡ Hozir va ✅ Tasdiqlash: darhol kanalga
  const chiqar = async () => {
    await ctx.answerCallbackQuery({ text: 'Kanalga chiqarilyapti…' });
    try {
      const fb = await publish(bot.api, d);
      if (d.status !== 'approved') store.addChoice(d, true);
      store.dropWaits(id);
      await mark('📢 Chiqdi');
      const h = await postHavolasi(store.get(d.id));
      await log(`📢 Kanalga chiqdi: ${d.title}${h ? ` — ${h}` : ''}`);
      if (h) await ctx.reply(`📢 ${kanalNomi()} kanaliga chiqdi: ${h}`);
      if (fb) await log(`⚠️ "${d.title}" maqola formatida chiqmadi, oddiy post bo'lib chiqdi: ${fb}`);
    } catch (e) {
      if (e instanceof AllaqachonChiqqan) return mark('📢 Chiqdi');
      await log(`❌ "${d.title}" kanalga chiqmadi: ${e.message}`);
      await xatoAyt(`❌ Kanalga chiqmadi: ${e.message}\n/kanal — bot kanalda post yoza oladimi, tekshiring.`);
    }
  };
  if (act === 'ok') {
    // Tasdiqlangan zahoti kanalga chiqadi (keyinroq kerak bo'lsa — 🕒 Vaqt belgilash).
    // Haftalik rejadan yozilgan post — reja vaqtida (kalendar buzilmasin)
    const planned = d.plannedAt && new Date(d.plannedAt).getTime() > Date.now() + 60e3 ? d.plannedAt : null;
    if (!planned && d.status !== 'approved') return chiqar();
    if (d.status !== 'approved') store.addChoice(d, true);
    const nd = store.update(id, { status: 'approved', publish_attempts: 0, scheduledAt: d.status === 'approved' ? d.scheduledAt : planned || nextSlot() });
    await ctx.editMessageReplyMarkup({ reply_markup: schedKb(nd) }).catch(() => {});
    return ctx.answerCallbackQuery({ text: `Rejalashtirildi: ${fmtTime(nd.scheduledAt)}` });
  }
  // 🕒 Vaqt belgilash: bo'sh vaqtlar tugma bo'lib chiqadi, boshqa vaqtni shu yerga yozish mumkin (reply shart emas)
  if (act === 'time') {
    await ctx.answerCallbackQuery();
    const hozir = d.status === 'approved' ? `\nHozir: <b>${fmtTime(d.scheduledAt)}</b>` : '';
    const k = new InlineKeyboard();
    for (const at of nextSlots(3)) k.text(`🕒 ${fmtTime(at)}`, `tset:${id}:${vaqtKodi(at)}`).row();
    return ask(ctx, `🕒 "${esc(d.title)}" qachon chiqsin?${hozir}\nTugmadan tanlang yoki boshqa vaqtni shu yerga yozing.\n${TIME_HELP}`, { kind: 'time', id }, k);
  }
  if (act === 'aud') {
    if (!ttsEnabled()) return ctx.answerCallbackQuery({ text: TTS_SETUP.slice(0, 190), show_alert: true });
    await ctx.answerCallbackQuery({ text: 'Ovoz yozish boshlandi' });
    audioRun(d);
    return;
  }
  if (act === 'img') {
    await ctx.answerCallbackQuery();
    const has = imagePaths(d).length;
    return ask(ctx, `🖼 "${esc(d.title)}" uchun rasm.\n• Rasm yuboring — postga qo'shaman (bir nechta bo'lsa, albom bo'ladi)\n` +
      `• Qanday rasm kerakligini yozing — shunday ${rasmYoqilgan() ? 'chizaman (AI rasm)' : 'kartochka chizaman (AI rasm uchun GEMINI_API_KEY kerak)'}. ` +
      `<i>Masalan: ${rasmYoqilgan() ? 'ofisda charchagan rahbar, kechki chiroq, iliq ranglar' : 'katta sarlavha "3 ta xato", ostida "rahbar vaqtini yeydi"'}</i>\n` +
      `• Yoki tugmani bosing — dizayner o'zi tanlaydi` + (has ? `\nHozir ${has} ta rasm bor.` : ''), { kind: 'image', id, muddat: 10 * 60e3 }, rasmKb(d));
  }
  if (act === 'imuq' || act === 'iai' || act === 'idel') {
    await ctx.answerCallbackQuery();
    await mark(act === 'idel' ? '🗑 Olib tashlanmoqda...' : '🎨 Chizilmoqda...');
    return rasmIsh(ctx, d, { imuq: 'muqova', iai: 'ai', idel: 'ochir' }[act]);
  }
  if (act === 'unq') {
    store.update(id, { status: 'pending', scheduledAt: null });
    await ctx.editMessageReplyMarkup({ reply_markup: kb(id) }).catch(() => {});
    return ctx.answerCallbackQuery({ text: 'Navbatdan olindi' });
  }
  if (act === 'now') return chiqar();
  if (act === 'no') {
    store.update(id, { status: 'rejected' });
    store.addChoice(d, false);
    store.dropWaits(id);
    await mark('❌ Rad etildi');
    await ctx.answerCallbackQuery();
    // Sabab ixtiyoriy — yozilsa, tahrir izohi kabi doimiy qoidalarga ham tushadi (10 daqiqa kutiladi)
    return ask(ctx, `❌ "${esc(d.title)}" rad etildi. Nega? Bir gap bilan yozing (ixtiyoriy) — keyingi safar shunga qarab yozaman.`, { kind: 'rad', id, muddat: 10 * 60e3 });
  }
  if (act === 'scr') {
    await ctx.answerCallbackQuery();
    const opt = { parse_mode: 'HTML', message_thread_id: tema() };
    if (d.reels_script) return ctx.reply(`🎬 <b>Reels ssenariy</b>\n\n${esc(d.reels_script)}`, opt);
    await ctx.reply('🎬 Ssenariy yozilyapti (1–2 daqiqa)...', opt);
    try {
      const tz = tzQoralamadan(d);
      const r = await reels.ssenariy(reelsTz({ ...tz, davomiylik: Number(tz.davomiylik) || 35 }));
      const nd = store.update(id, { reels: r, reels_script: ssenariyMatni(r.ssenariy) });
      return ctx.reply(`🎬 <b>Reels ssenariy</b>\n\n${esc(nd.reels_script)}\n\n<i>🎥 Video shu ssenariy bo'yicha yasaladi.</i>`, opt);
    } catch (e) { return ctx.reply(`⚠️ Ssenariy yozilmadi: ${e.message}`, opt); }
  }
  if (act === 'edit') {
    await ctx.answerCallbackQuery();
    return ask(ctx, `✏️ "${esc(d.title)}" — nima o'zgartiramiz? Shu yerga yozing.`, { kind: 'edit', id });
  }
});

// 🕒 tez tanlov: tugmadagi vaqt (daqiqa, 36-lik) — shu vaqtga rejalashtiriladi
bot.callbackQuery(/^tset:(\w+):([0-9a-z]+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCallbackQuery({ text: 'Faqat rahbar' });
  const d = store.get(ctx.match[1]);
  if (!d) return ctx.answerCallbackQuery({ text: 'Qoralama topilmadi' });
  if (d.status === 'published') return ctx.answerCallbackQuery({ text: 'Bu post allaqachon chiqqan', show_alert: true });
  if (d.status === 'revised') return ctx.answerCallbackQuery({ text: "Bu eski versiya — tahrirlangan yangi qoralamadagi tugmalardan foydalaning", show_alert: true });
  const at = new Date(parseInt(ctx.match[2], 36) * 60e3).toISOString();
  if (Date.parse(at) <= Date.now() + 60e3) return ctx.answerCallbackQuery({ text: "Bu vaqt o'tib ketdi — boshqasini tanlang yoki vaqtni yozing", show_alert: true });
  const { nd, matn } = vaqtQoy(d, at);
  await ctx.answerCallbackQuery({ text: `Rejalashtirildi: ${fmtTime(at)}` });
  await ctx.editMessageText(matn, { reply_markup: schedKb(nd) }).catch(() => ctx.reply(matn, { reply_markup: schedKb(nd) }));
});
bot.callbackQuery('noop', ctx => ctx.answerCallbackQuery());

const QISQA_YORDAM = "Tushunmadim. Asosiy buyruqlar:\n/yangi — yangi post (mahsulotni tugma bilan tanlaysiz)\n/goya — berilgan mavzuda post\n" +
  "/navbat — navbatdagi postlar\n/reja — haftalik reja\n/avto on | off — avto rejim\n/kanal — postlar qaysi kanalga chiqadi\n\"g'oya: ...\" — g'oyani bankka saqlash\nHammasi: /start";

// "g'oya: ..." — g'oyalar bankiga (istalgan chatda, rahbar yozsa). Javob kutish handleridan oldin turishi shart
const IDEA_RE = /^\s*(g['ʻ‘’`]?oya|goya|idea)\s*[:\-—]\s*/i;
bot.on('message:text', async (ctx, next) => {
  if (!IDEA_RE.test(ctx.message.text) || ctx.message.reply_to_message?.from?.is_bot || !isAdmin(ctx)) return next();
  const text = ctx.message.text.replace(IDEA_RE, '').trim();
  if (text.length < 5) return ctx.reply("G'oyani to'liqroq yozing: g'oya: xodimlar nega ishdan ketadi — 3 ta sabab");
  store.addIdea(text);
  const n = store.ideas().filter(i => !i.used).length;
  await ctx.reply(`💡 G'oya saqlandi (bankda ${n} ta). Keyingi haftalik rejada birinchi navbatda ishlatiladi. /goyalar`);
});

// Shaxsiy chatda forward qilingan postlar — uslub namunasi (javob kutish handleridan oldin turishi shart)
bot.on('message', async (ctx, next) => {
  if (ctx.chat.type !== 'private' || !ctx.message.forward_origin || !isAdmin(ctx)) return next();
  const text = ctx.message.text || ctx.message.caption || '';
  const n = addSample(text);
  if (n == null) return ctx.reply("Bu xabar juda qisqa — uslub uchun kamida 80 belgili post yuboring.");
  const st = store.style();
  const hint = st.samples.length >= 5 ? ' · /uslub_yangila — uslubni o\'rganish' : ` · yana ${5 - st.samples.length} ta kerak`;
  await ctx.reply(`✅ Namuna saqlandi (${n} ta)${hint}`);
});

// Rahbarning javoblari: vaqt, tahrir izohi, rasm va video tavsifi. Reply qilish shart emas — savol berilgan
// chat/topikdagi keyingi xabar ham javob (guruhda Telegram reply oynasini o'zi ochmaydi)
bot.on('message:text', async (ctx, next) => {
  // Buyruqlar o'z handleriga (masalan /zaxira, /tiklash shu handlerdan keyin ro'yxatdan o'tgan)
  if (ctx.message.text.startsWith('/')) return next();
  if (!isAdmin(ctx)) return;
  const [kalit, replyBilan] = javobKaliti(ctx);
  const w = kalit && store.peekWait(kalit);
  // Shaxsiy chatda tushunilmagan xabar — jim qolinmaydi
  if (!w) return ctx.chat.type === 'private' ? ctx.reply(QISQA_YORDAM) : undefined;
  const matn = ctx.message.text.trim();
  if (w.kind === 'sozla') { store.takeWait(kalit); return sozlaJavob(ctx); }
  if (w.kind === 'mavzu') { store.takeWait(kalit); return startRun(ctx, matn.slice(0, 300), w.format || null); }
  const opt = { message_thread_id: tema() };
  if (w.kind === 'plan') {
    store.takeWait(kalit);
    await ctx.reply('🔄 Rejani qayta yozyapman...', opt);
    try { return await sendPlan(await weekly.revise(w.id, matn)); }
    catch (e) { return ctx.reply(`⚠️ Xato: ${e.message}`, opt); }
  }
  const d = store.get(w.id);
  if (!d) return store.takeWait(kalit);

  if (w.kind === 'time') {
    const at = parseTime(matn);
    if (!at) {
      // Reply'siz xabarda vaqtga oid hech narsa bo'lmasa — bu boshqa gap: jim o'tkazib yuboriladi
      if (!replyBilan && !vaqtgaOxshaydi(matn)) return;
      if (/^(hozir|darhol|srazu|seychas)/i.test(matn)) return ctx.reply('Darhol chiqarish uchun qoralamadagi ⚡ Hozir tugmasini bosing.', opt);
      return ctx.reply(`"${esc(matn.slice(0, 60))}" — vaqtni tushunmadim yoki u o'tib ketgan.\n${TIME_HELP}\nYana yozing yoki yuqoridagi tugmadan tanlang.`, { ...opt, parse_mode: 'HTML' });
    }
    store.takeWait(kalit);
    if (d.status === 'published') return ctx.reply('Bu post allaqachon chiqqan.', opt);
    if (d.status === 'revised') return ctx.reply("Bu eski versiya — tahrirlangan yangi qoralamadagi 🕒 tugmasidan foydalaning.", opt);
    const { nd, matn: javob } = vaqtQoy(d, at);
    return ctx.reply(javob, { ...opt, reply_markup: schedKb(nd) });
  }
  if (w.kind === 'video') {
    store.takeWait(kalit);
    if (videoBusy) return ctx.reply('⏳ Boshqa video yasalmoqda — tugagach 🎥 ni qayta bosing.', opt);
    videoRun(d, { izoh: matn.slice(0, 600) }); // fonda — bot bloklanmaydi
    return;
  }
  if (w.kind === 'image') {
    const t = matn.toLowerCase();
    store.takeWait(kalit);
    if (/^o.?chir/.test(t)) return rasmIsh(ctx, d, 'ochir');
    if (t === 'ai') return rasmIsh(ctx, d, rasmYoqilgan() ? 'ai' : 'muqova');
    if (t === 'muqova') return rasmIsh(ctx, d, 'muqova');
    // Erkin matn — rahbar qanday rasm kerakligini tasvirladi: AI bo'lsa AI rasm, bo'lmasa dizayner kartochka
    return rasmIsh(ctx, d, rasmYoqilgan() ? 'ai' : 'muqova', matn.slice(0, 600));
  }
  if (w.kind === 'rad') {
    store.takeWait(kalit);
    const c = store.choices().filter(x => x.title === d.title && !x.ok).at(-1);
    if (c) { c.sabab = matn.slice(0, 300); store.savePlans(); }
    if (addFeedback(`Rad etildi: ${matn}`, d) >= RULES_BATCH) refreshRules().catch(() => {});
    return ctx.reply('👍 Tushundim, hisobga olaman.', opt);
  }
  if (w.kind !== 'edit') return;
  store.takeWait(kalit);
  if (d.status === 'published') return ctx.reply("Bu post allaqachon chiqqan — tahrirlab bo'lmaydi.", opt);
  // Izoh uslub xotirasiga: yetarlicha yig'ilsa — doimiy qoidalarga aylanadi (fonda)
  if (addFeedback(matn, d) >= RULES_BATCH) {
    refreshRules()
      .then(r => r && log(`📏 Qoidalar tahrirlaringizdan yangilandi (${r.rules.length} ta).${r.added.length ? `\nYangi:\n• ${r.added.join('\n• ')}` : ''}\n/qoidalar — ko'rish`))
      .catch(e => log(`⚠️ Qoidalar yangilanmadi: ${e.message}`));
  }
  const id = d.id;
  await ctx.reply('🔄 Qayta yozyapman...', opt);
  try {
    const r = await revise(d, matn);
    r.post_html = ensureLink(ensureCode(r.post_html, d.cta_kod), d.plan?.cta_havola, d.plan?.cta_matn);
    // Eski video/slaydlar/ovoz yangi matnga mos emas (rahbar qo'shgan rasmlar qoladi)
    const { video_path, video_duration, motion, slide_paths, audio_path, audio_duration, scheduledAt, ...rest } = d;
    const art = isRich(d) ? await writeArticle(d.plan || { title: d.title, format: d.format }, { post_html: r.post_html }, matn) : null;
    let nd = store.addDraft({
      ...rest, id: undefined, status: 'pending', post_html: r.post_html, reels_script: r.reels_script || d.reels_script,
      ...(art ? { article_html: art.article_html, slides: art.slides } : {}),
      notes: `Tahrir: ${matn}`, score: d.score
    });
    if (art) {
      try { nd = await renderDraftSlides(nd); }
      catch (e) { await log(`⚠️ Slaydlar chizilmadi (${d.title}): ${e.message}`); }
    }
    // Eski versiya faqat yangisi tayyor bo'lgach yopiladi — tahrir xato bersa, eski qoralama tugmalari ishlayveradi
    store.update(id, { status: 'revised' });
    await sendForApproval(nd);
  } catch (e) { await ctx.reply(`⚠️ Qayta yozilmadi: ${e.message}\nEski qoralama o'z holicha qoldi — tugmalari ishlaydi.`, opt); }
});

// Rahbar yuborgan rasm (🖼 Rasm so'roviga — reply yoki shu chat/topikka oddiy rasm)
bot.on(['message:photo', 'message:document'], async ctx => {
  if (!isAdmin(ctx)) return;
  const [kalit] = javobKaliti(ctx);
  const w = kalit && store.peekWait(kalit);
  if (!w || w.kind !== 'image') return;
  const d = store.get(w.id);
  if (!d) return store.takeWait(kalit);
  const opt = { message_thread_id: tema() };
  const doc = ctx.message.document;
  if (doc && !/^image\/(jpeg|png|webp)$/.test(doc.mime_type || '')) return ctx.reply('Faqat rasm (JPG/PNG) yuboring.', opt);
  const fileId = doc ? doc.file_id : ctx.message.photo.at(-1).file_id; // eng katta o'lcham
  try {
    const file = await saveTelegramFile(fileId, d.id);
    const nd = store.update(d.id, { image_paths: [...(d.image_paths || []), file] });
    store.takeWait(kalit);
    await ctx.reply(`🖼 Rasm qo'shildi (jami ${imagePaths(nd).length} ta). Yana qo'shish uchun 🖼 Rasm tugmasini bosing. Yangilangan qoralama:`, opt);
    await sendForApproval(nd);
  } catch (e) { await ctx.reply(`⚠️ Rasm saqlanmadi: ${e.message}`, opt); }
});

// ---------- Zaxira ----------
// Har kuni butun baza egasiga shaxsiy chatda (jim) fayl bo'lib keladi. Tiklash: faylga reply qilib /tiklash.
// Siqilgan (gzip) — Telegram'dagi 50 MB fayl chegarasiga baza katta bo'lganda ham sig'sin
const zaxiraNomi = () => `kontent-zaxira-${new Date(Date.now() + cfg.tzOffsetH * 3600e3).toISOString().slice(0, 10)}.json.gz`;
const zaxiraIzoh = (izoh = '') => `🗄 Kontent Fabrika zaxirasi${izoh}\nUslub, qoidalar, g'oyalar, rejalar, qoralamalar.\nTiklash: shu faylga reply qilib /tiklash yozing (shaxsiy chatda).`;
export async function zaxira(izoh = '') {
  const fayl = () => new InputFile(gzipSync(Buffer.from(store.snapshot())), zaxiraNomi());
  for (const id of cfg.admins.slice(0, 1)) {
    try { await bot.api.sendDocument(id, fayl(), { caption: zaxiraIzoh(izoh), disable_notification: true }); return true; }
    catch (e) {
      // Egasi botga shaxsiy chatda hali /start bosmagan — zaxira Kontent Fabrika xonasiga (jim)
      if (!cfg.groupId) throw e;
      await bot.api.sendDocument(cfg.groupId, fayl(), { caption: zaxiraIzoh(izoh) + "\n(Shaxsiy chatga yubora olmadim — botga shaxsiy chatda /start bosing.)", disable_notification: true, message_thread_id: rejim() ? topigi('kf') ?? tema() : cfg.logTopic });
      return true;
    }
  }
  return false;
}
bot.command('zaxira', async ctx => {
  if (!isAdmin(ctx)) return;
  try { await zaxira(); if (ctx.chat.type !== 'private') await ctx.reply('🗄 Zaxira yuborildi.'); }
  catch (e) { await ctx.reply(`⚠️ Zaxira yuborilmadi: ${e.message}`); }
});
bot.command('tiklash', async ctx => {
  if (!isAdmin(ctx) || ctx.chat.type !== 'private') return;
  const doc = ctx.message.reply_to_message?.document;
  if (!doc || !/\.json(\.gz)?$/i.test(doc.file_name || '')) return ctx.reply("Zaxira fayliga (kontent-zaxira-….json.gz) reply qilib /tiklash yozing.");
  try {
    const f = await bot.api.getFile(doc.file_id);
    const res = await fetch(`${API_ROOT}/file/bot${cfg.botToken}/${f.file_path}`, { signal: AbortSignal.timeout(60e3) });
    if (!res.ok) throw new Error(`fayl yuklanmadi (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    const obj = JSON.parse((/\.gz$/i.test(doc.file_name) ? gunzipSync(buf) : buf).toString('utf8'));
    await zaxira(' — tiklashdan OLDINGI holat (kerak bo\'lsa qaytarish uchun)');
    const r = store.restore(obj);
    await ctx.reply(`✅ Tiklandi: ${r.ideas} ta g'oya, ${r.plans} ta reja, ${r.drafts} ta qoralama, ${r.rules} ta qoida, ${r.samples} ta namuna post.`);
  } catch (e) { await ctx.reply(`⚠️ Tiklanmadi: ${e.message}`); }
});

// Hech bir handler olmagan buyruq (shaxsiy chatda) — jim qolinmaydi
bot.on('message:text', ctx => (ctx.chat.type === 'private' && isAdmin(ctx) ? ctx.reply(QISQA_YORDAM) : undefined));

bot.catch(err => console.error('Bot xatosi:', err.error?.message || err));
