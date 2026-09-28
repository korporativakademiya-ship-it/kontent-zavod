import fs from 'node:fs';
import path from 'node:path';
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { cfg } from './config.js';
import { store } from './store.js';
import { runPipeline, renderDraftSlides } from './pipeline.js';
import { revise } from './agents/copywriter.js';
import { writeArticle } from './agents/article.js';
import { isRich, sendRich, approvalPrefix } from './rich.js';
import { nextSlot, fmtTime, parseTime, publish, sendMediaPost, sendSafe, imagePaths } from './publisher.js';
import { makeVideo } from './video/make.js';
import { renderSlides } from './video/slides.js';
import { VIDEO_SIGNATURE } from './brand.js';
import { ttsEnabled, TTS_SETUP, synth, speechText, toVoiceNote } from './tts.js';
import { addSample, addFeedback } from './style.js';
import { ensureCode } from './cta.js';
import { buildReport } from './report.js';
import * as weekly from './weekly.js';
import { analyzeStyle, distillRules } from './agents/stylist.js';

// TELEGRAM_API_ROOT — ixtiyoriy (lokal Bot API server yoki sinov uchun)
const API_ROOT = process.env.TELEGRAM_API_ROOT || 'https://api.telegram.org';
export const bot = new Bot(cfg.botToken, { client: { apiRoot: API_ROOT } });
let busy = false;
let videoBusy = false; // render og'ir (Chromium + ffmpeg) — bir vaqtda bittadan

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isAdmin = (ctx) => cfg.admins.includes(ctx.from?.id);
const kb = (id) => new InlineKeyboard()
  .text('✅ Tasdiqlash', `ok:${id}`).text('🕒 Vaqt belgilash', `time:${id}`).row()
  .text('⚡ Hozir', `now:${id}`).text('✏️ Tahrir', `edit:${id}`).text('🎬 Ssenariy', `scr:${id}`).row()
  .text('🖼 Rasm', `img:${id}`).text('🎥 Video', `vid:${id}`).text('🎙 Ovoz', `aud:${id}`).row()
  .text('❌ Rad', `no:${id}`);
// Rejalashtirilgan qoralama tugmalari: holat + vaqtni o'zgartirish
const schedKb = (d) => new InlineKeyboard()
  .text(`✅ ${fmtTime(d.scheduledAt)} da chiqadi`, 'noop').row()
  .text('🕒 Vaqtni o\'zgartirish', `time:${d.id}`).text('⚡ Hozir', `now:${d.id}`).row()
  .text('↩️ Navbatdan olish', `unq:${d.id}`);
const TIME_HELP = 'Masalan: <code>18:30</code>, <code>ertaga 09:00</code>, <code>indinga 10:00</code>, <code>28.09 19:00</code> (Toshkent vaqti)';

// Rahbardan javob so'raydi (reply) — javob kelganda message:text/photo handleri ishlaydi
async function ask(ctx, text, wait) {
  const m = await ctx.reply(text, { parse_mode: 'HTML', message_thread_id: cfg.approvalTopic, reply_markup: { force_reply: true, selective: true } });
  store.setWait(m.message_id, wait);
}

export const log = (text) => !cfg.groupId ? Promise.resolve() :
  bot.api.sendMessage(cfg.groupId, text, { message_thread_id: cfg.logTopic }).catch(() => {});

export async function sendForApproval(d) {
  const extra = { message_thread_id: cfg.approvalTopic, reply_markup: kb(d.id) };
  if (d.status === 'approved') extra.reply_markup = schedKb(d);
  if (isRich(d)) {
    const { fallback } = await sendRich(bot.api, cfg.groupId, d, extra, { prefix: approvalPrefix(d) });
    if (fallback) await log(`⚠️ "${d.title}" maqola formatida ko'rsatilmadi, oddiy ko'rinishda yuborildi: ${fallback}`);
    return;
  }
  const head = `<b>📝 Qoralama</b> | ${d.format} | baho: ${d.score ?? '-'}/10\n${d.plannedAt ? `🗓 Reja: ${fmtTime(d.plannedAt)}${d.rubric ? ` · ${esc(d.rubric)}` : ''}\n` : ''}<i>${esc(d.notes)}</i>\n${d.source_url ? `Manba: ${esc(d.source_url)}\n` : ''}━━━━━━━━━━\n\n`;
  await sendMediaPost(bot.api, cfg.groupId, { ...d, post_html: head + d.post_html }, extra);
}

// Qoralama uchun reels video yasaydi va tasdiqlash topigiga yuboradi
async function videoRun(d) {
  const reply = (t) => bot.api.sendMessage(cfg.groupId, t, { message_thread_id: cfg.approvalTopic }).catch(() => {});
  videoBusy = true;
  try {
    await reply(`🎥 "${d.title}" — video yasalmoqda (1–3 daqiqa)...`);
    const v = await makeVideo(d);
    const nd = store.update(d.id, { video_path: v.file, video_duration: v.duration, motion: v.data });
    const cap = `<b>🎥 Video</b> | ${esc(d.title)} | ${Math.round(v.duration)} s${v.voiced ? ' | 🎙 dublyaj' : ''}\n<i>${isRich(d) ? 'Tasdiqlansa, video maqola ichida chiqadi.' : 'Tasdiqlansa, kanalga shu video post matni bilan chiqadi.'}</i>`;
    await bot.api.sendVideo(cfg.groupId, new InputFile(v.file), {
      caption: cap, parse_mode: 'HTML', supports_streaming: true, width: 1080, height: 1920,
      duration: Math.round(v.duration), message_thread_id: cfg.approvalTopic, reply_markup: nd.status === 'approved' ? schedKb(nd) : kb(nd.id)
    });
  } catch (e) {
    await reply(`⚠️ Video yasalmadi (${d.title}): ${e.message}`);
  } finally { videoBusy = false; }
}

// Postning audio varianti (ovozli xabar) — tasdiqlansa post bilan birga chiqadi
async function audioRun(d) {
  const reply = (t) => bot.api.sendMessage(cfg.groupId, t, { message_thread_id: cfg.approvalTopic }).catch(() => {});
  try {
    await reply(`🎙 "${d.title}" — ovoz yozilmoqda...`);
    const dir = path.join(cfg.dataDir, 'audio');
    const mp3 = path.join(dir, `${d.id}.mp3`), ogg = path.join(dir, `${d.id}.ogg`);
    await synth(speechText(d.post_html), mp3);
    const dur = await toVoiceNote(mp3, ogg);
    const nd = store.update(d.id, { audio_path: ogg, audio_duration: dur });
    await bot.api.sendVoice(cfg.groupId, new InputFile(ogg), {
      caption: `🎙 Audio variant | ${esc(d.title)} | ${Math.round(dur)} s\n<i>Tasdiqlansa, post bilan birga chiqadi.</i>`,
      parse_mode: 'HTML', duration: Math.round(dur), message_thread_id: cfg.approvalTopic, reply_markup: nd.status === 'approved' ? schedKb(nd) : kb(nd.id)
    });
  } catch (e) {
    await reply(`⚠️ Ovoz yozilmadi (${d.title}): ${e.message}`);
  }
}

async function startRun(ctx, topic, format = null) {
  if (busy) return ctx.reply('⏳ Hozir ishlayapman, tugashini kuting.');
  busy = true;
  await ctx.reply('🚀 Boshladim. Jarayonni log topigida kuzating.');
  runPipeline({ topic, format, count: topic ? 1 : cfg.dailyPosts, log, onDraft: sendForApproval })
    .catch(e => log(`❌ Xato: ${e.message}`))
    .finally(() => { busy = false; });
}

export async function dailyRun() {
  if (busy) return;
  busy = true;
  try {
    // Tasdiqlangan haftalik reja bo'lsa — rejadagi yaqin postlar yoziladi, aks holda erkin izlanish
    if (weekly.currentPlan()) {
      const n = await weekly.produceDue({ log, onDraft: sendForApproval });
      if (n) await log(`🗓 Rejadan ${n} ta post yozildi.`);
    } else await runPipeline({ log, onDraft: sendForApproval });
  }
  catch (e) { await log(`❌ Xato: ${e.message}`); }
  finally { busy = false; }
}

// Sozlash uchun: chat va topik ID'sini ko'rsatadi
bot.command('id', ctx => ctx.reply(`chat_id: ${ctx.chat.id}\ntopic_id: ${ctx.message?.message_thread_id ?? '-'}\nsizning id: ${ctx.from.id}`));

bot.command('start', ctx => ctx.reply(
  'Kontent zavod ishlayapti.\n/yangi — hozir g\'oya izlash va qoralama yozish\n/goya <mavzu> — berilgan mavzu bo\'yicha post\n' +
  '/maqola <mavzu> — Telegram maqolasi (sarlavha, ro\'yxat, jadval)\n/karusel <mavzu> — slaydli karusel\n' +
  '/reja — haftalik reja · /reja_yangi · /rubrikalar · /avto\n\"g\'oya: ...\" — g\'oyalar bankiga · /goyalar\n/navbat — rejalashtirilgan postlar\n/hisobot [kun] — natijalar (reaksiyalar, formatlar)\n/uslub — uslubingizni o\'rgatish · /qoidalar — doimiy qoidalar\n/id — chat va topik ID'));

bot.command('yangi', ctx => isAdmin(ctx) && startRun(ctx, null));
bot.command('goya', ctx => {
  if (!isAdmin(ctx)) return;
  const topic = ctx.match?.trim();
  if (!topic) return ctx.reply('Mavzuni yozing: /goya xodimlar kechikishi');
  startRun(ctx, topic);
});

for (const [cmd, format, example] of [['maqola', 'maqola', 'xodimni ishga olish tartibi'], ['karusel', 'karusel', 'rahbarning 5 ta xatosi']]) {
  bot.command(cmd, ctx => {
    if (!isAdmin(ctx)) return;
    const topic = ctx.match?.trim();
    if (!topic) return ctx.reply(`Mavzuni yozing: /${cmd} ${example}`);
    startRun(ctx, topic, format);
  });
}

// ---------- Uslub: namuna postlar va doimiy qoidalar ----------
const RULES_BATCH = 5; // shuncha yangi tahrir izohi yig'ilsa — qoidalar avtomatik yangilanadi
let rulesBusy = false;

async function refreshRules() {
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

async function sendPlan(p, chatId = cfg.groupId, extra = { message_thread_id: cfg.approvalTopic }) {
  await sendLong(chatId, weekly.formatPlan(p), extra);
  if (p.status !== 'approved') await sendSafe(bot.api, chatId, `Rejani ko'rib chiqing. Tasdiqlasangiz, har post chiqishidan ~1 kun oldin yoziladi${weekly.autoMode() ? ' va o\'zi chiqadi (avto rejim)' : ' va tasdiqlashga keladi'}.`, { ...extra, reply_markup: planKb(p.id) });
}

export async function weeklyPlanRun() {
  if (busy) return log('⏳ Haftalik reja keyinroq: hozir boshqa ish bajarilyapti. /reja_yangi bilan qayta urinib ko\'ring.');
  busy = true;
  try { await sendPlan(await weekly.buildPlan(log)); }
  catch (e) { await log(`⚠️ Haftalik reja tuzilmadi: ${e.message}`); }
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
  if (!p) return ctx.reply(`Hali reja yo'q. Har yakshanba 18:00 da o'zi tuziladi yoki hozir: /reja_yangi\nRubrikalar: /rubrikalar`);
  await sendPlan(p, ctx.chat.id, ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {});
});

bot.command('reja_yangi', async ctx => {
  if (!isAdmin(ctx)) return;
  if (busy) return ctx.reply('⏳ Hozir ishlayapman, tugashini kuting.');
  await ctx.reply('🗓 Ertadan boshlab 7 kunlik reja tuzilmoqda (1–3 daqiqa)...');
  weeklyPlanRun();
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
    ? '🤖 Avto rejim YOQILGAN: rejadagi postlar yozilgach tasdiqlashsiz o\'z vaqtida chiqadi (tasdiqlash topigida ko\'rinadi — vaqtini o\'zgartirish yoki navbatdan olish mumkin).\nO\'chirish: /avto off'
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
  return ask(ctx, "✏️ Rejada nimani o'zgartiramiz? Masalan: <i>chorshanbadagi keysni xodim motivatsiyasiga almashtir, reels kamroq bo'lsin</i>. Shu xabarga reply qilib yozing.", { kind: 'plan', id });
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
  await sendLong(cfg.groupId, await buildReport(days), { message_thread_id: cfg.logTopic });
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
  const res = await fetch(`${API_ROOT}/file/bot${cfg.botToken}/${f.file_path}`);
  if (!res.ok) throw new Error(`Rasm yuklanmadi (${res.status})`);
  const dir = path.join(cfg.dataDir, 'images', draftId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}${path.extname(f.file_path) || '.jpg'}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

// Brend uslubidagi muqova (karusel shablonining "cover" slaydi)
async function makeCover(d) {
  const kicker = { maqola: 'Maqola', karusel: 'Karusel', reels: 'Video' }[d.format] || 'Rahbar uchun';
  const [file] = await renderSlides({ signature: VIDEO_SIGNATURE, slides: [{ type: 'cover', kicker, title: d.title }] },
    path.join(cfg.dataDir, 'images', d.id, `cover-${Date.now()}`));
  return file;
}

bot.callbackQuery(/^(ok|time|unq|now|edit|scr|vid|img|aud|no):(.+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCallbackQuery({ text: 'Faqat rahbar tasdiqlaydi' });
  const [, act, id] = ctx.match;
  const d = store.get(id);
  if (!d) return ctx.answerCallbackQuery({ text: 'Qoralama topilmadi' });
  const mark = (t) => ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard().text(t, 'noop') }).catch(() => {});

  if (d.status === 'published' && act !== 'scr') return ctx.answerCallbackQuery({ text: 'Bu post allaqachon chiqqan' });

  if (act === 'vid') {
    if (videoBusy) return ctx.answerCallbackQuery({ text: 'Boshqa video yasalmoqda, biroz kuting' });
    await ctx.answerCallbackQuery({ text: 'Video yasash boshlandi' });
    videoRun(d); // fonda — bot bloklanmaydi
    return;
  }
  if (act === 'ok') {
    const planned = d.plannedAt && new Date(d.plannedAt).getTime() > Date.now() + 60e3 ? d.plannedAt : null;
    const nd = store.update(id, { status: 'approved', scheduledAt: d.status === 'approved' ? d.scheduledAt : planned || nextSlot() });
    await ctx.editMessageReplyMarkup({ reply_markup: schedKb(nd) }).catch(() => {});
    return ctx.answerCallbackQuery({ text: `Rejalashtirildi: ${fmtTime(nd.scheduledAt)}` });
  }
  if (act === 'time') {
    await ctx.answerCallbackQuery();
    const now = d.status === 'approved' ? `\nHozir: <b>${fmtTime(d.scheduledAt)}</b>` : '';
    return ask(ctx, `🕒 "${esc(d.title)}" qachon chiqsin?${now}\n${TIME_HELP}\nShu xabarga javob (reply) qilib yozing.`, { kind: 'time', id });
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
    return ask(ctx, `🖼 "${esc(d.title)}" uchun rasm.\n• Rasm yuboring (shu xabarga reply qilib) — postga qo'shaman (bir nechta bo'lsa, albom bo'ladi)\n` +
      `• <code>muqova</code> deb yozing — brend uslubida muqova yasayman` + (has ? `\n• <code>o'chir</code> — ${has} ta rasmni olib tashlayman` : ''), { kind: 'image', id });
  }
  if (act === 'unq') {
    store.update(id, { status: 'pending', scheduledAt: null });
    await ctx.editMessageReplyMarkup({ reply_markup: kb(id) }).catch(() => {});
    return ctx.answerCallbackQuery({ text: 'Navbatdan olindi' });
  }
  if (act === 'now') {
    const fb = await publish(bot.api, d);
    await mark('📢 Chiqdi');
    if (fb) await log(`⚠️ "${d.title}" maqola formatida chiqmadi, oddiy post bo'lib chiqdi: ${fb}`);
    return ctx.answerCallbackQuery({ text: 'Kanalga chiqdi' });
  }
  if (act === 'no') {
    store.update(id, { status: 'rejected' });
    await mark('❌ Rad etildi');
    return ctx.answerCallbackQuery();
  }
  if (act === 'scr') {
    await ctx.answerCallbackQuery();
    return ctx.reply(`🎬 <b>Reels ssenariy</b>\n\n${esc(d.reels_script || 'Yo\'q')}`,
      { parse_mode: 'HTML', message_thread_id: cfg.approvalTopic });
  }
  if (act === 'edit') {
    await ctx.answerCallbackQuery();
    return ask(ctx, `✏️ "${esc(d.title)}" — nima o'zgartiramiz? Shu xabarga javob (reply) qilib yozing.`, { kind: 'edit', id });
  }
});
bot.callbackQuery('noop', ctx => ctx.answerCallbackQuery());

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

// Rahbarning javoblari (reply): vaqt, tahrir izohi
bot.on('message:text', async ctx => {
  const replyTo = ctx.message.reply_to_message?.message_id;
  const w = replyTo && store.peekWait(replyTo);
  if (!w || !isAdmin(ctx)) return;
  const opt = { message_thread_id: cfg.approvalTopic };
  if (w.kind === 'plan') {
    store.takeWait(replyTo);
    await ctx.reply('🔄 Rejani qayta yozyapman...', opt);
    try { return await sendPlan(await weekly.revise(w.id, ctx.message.text)); }
    catch (e) { return ctx.reply(`⚠️ Xato: ${e.message}`, opt); }
  }
  const d = store.get(w.id);
  if (!d) return store.takeWait(replyTo);

  if (w.kind === 'time') {
    const at = parseTime(ctx.message.text);
    if (!at) return ctx.reply(`Vaqtni tushunmadim yoki u o'tib ketgan. ${TIME_HELP}\nShu savolga yana javob yozing.`, { ...opt, parse_mode: 'HTML' });
    store.takeWait(replyTo);
    if (d.status === 'published') return ctx.reply('Bu post allaqachon chiqqan.', opt);
    const busyAt = store.byStatus('approved').find(x => x.id !== d.id && x.scheduledAt === at);
    const nd = store.update(d.id, { status: 'approved', scheduledAt: at });
    return ctx.reply(`✅ "${d.title}" — ${fmtTime(at)} da chiqadi.${busyAt ? `\n⚠️ Shu vaqtda "${busyAt.title}" ham bor — ikkalasi ketma-ket chiqadi.` : ''}`,
      { ...opt, reply_markup: schedKb(nd) });
  }
  if (w.kind === 'image') {
    const t = ctx.message.text.trim().toLowerCase();
    if (/^o.?chir/.test(t)) {
      store.takeWait(replyTo);
      const nd = store.update(d.id, { image_paths: [] });
      await ctx.reply('🗑 Rasmlar olib tashlandi. Yangilangan qoralama:', opt);
      return sendForApproval(nd);
    }
    if (!t.startsWith('muqova')) return ctx.reply('Rasm yuboring yoki "muqova" deb yozing.', opt);
    store.takeWait(replyTo);
    try {
      const file = await makeCover(d);
      const nd = store.update(d.id, { image_paths: [...(d.image_paths || []), file] });
      await ctx.reply('🖼 Muqova tayyor. Yangilangan qoralama:', opt);
      return sendForApproval(nd);
    } catch (e) { return ctx.reply(`⚠️ Muqova yasalmadi: ${e.message}`, opt); }
  }
  if (w.kind !== 'edit') return;
  store.takeWait(replyTo);
  // Izoh uslub xotirasiga: yetarlicha yig'ilsa — doimiy qoidalarga aylanadi (fonda)
  if (addFeedback(ctx.message.text, d) >= RULES_BATCH) {
    refreshRules()
      .then(r => r && log(`📏 Qoidalar tahrirlaringizdan yangilandi (${r.rules.length} ta).${r.added.length ? `\nYangi:\n• ${r.added.join('\n• ')}` : ''}\n/qoidalar — ko'rish`))
      .catch(e => log(`⚠️ Qoidalar yangilanmadi: ${e.message}`));
  }
  const id = d.id;
  await ctx.reply('🔄 Qayta yozyapman...', { message_thread_id: cfg.approvalTopic });
  try {
    const r = await revise(d, ctx.message.text);
    r.post_html = ensureCode(r.post_html, d.cta_kod);
    store.update(id, { status: 'revised' });
    // Eski video/slaydlar/ovoz yangi matnga mos emas (rahbar qo'shgan rasmlar qoladi)
    const { video_path, video_duration, motion, slide_paths, audio_path, audio_duration, scheduledAt, ...rest } = d;
    const art = isRich(d) ? await writeArticle(d.plan || { title: d.title, format: d.format }, { post_html: r.post_html }, ctx.message.text) : null;
    let nd = store.addDraft({
      ...rest, id: undefined, status: 'pending', post_html: r.post_html, reels_script: r.reels_script || d.reels_script,
      ...(art ? { article_html: art.article_html, slides: art.slides } : {}),
      notes: `Tahrir: ${ctx.message.text}`, score: d.score
    });
    if (art) nd = await renderDraftSlides(nd);
    await sendForApproval(nd);
  } catch (e) { await ctx.reply(`⚠️ Xato: ${e.message}`); }
});

// Rahbar yuborgan rasm (🖼 Rasm so'roviga reply)
bot.on(['message:photo', 'message:document'], async ctx => {
  const replyTo = ctx.message.reply_to_message?.message_id;
  const w = replyTo && store.peekWait(replyTo);
  if (!w || w.kind !== 'image' || !isAdmin(ctx)) return;
  const d = store.get(w.id);
  if (!d) return store.takeWait(replyTo);
  const opt = { message_thread_id: cfg.approvalTopic };
  const doc = ctx.message.document;
  if (doc && !/^image\/(jpeg|png|webp)$/.test(doc.mime_type || '')) return ctx.reply('Faqat rasm (JPG/PNG) yuboring.', opt);
  const fileId = doc ? doc.file_id : ctx.message.photo.at(-1).file_id; // eng katta o'lcham
  try {
    const file = await saveTelegramFile(fileId, d.id);
    const nd = store.update(d.id, { image_paths: [...(d.image_paths || []), file] });
    store.takeWait(replyTo);
    await ctx.reply(`🖼 Rasm qo'shildi (jami ${imagePaths(nd).length} ta). Yana qo'shish uchun 🖼 Rasm tugmasini bosing. Yangilangan qoralama:`, opt);
    await sendForApproval(nd);
  } catch (e) { await ctx.reply(`⚠️ Rasm saqlanmadi: ${e.message}`, opt); }
});

bot.catch(err => console.error('Bot xatosi:', err.error?.message || err));
