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
  const head = `<b>📝 Qoralama</b> | ${d.format} | baho: ${d.score ?? '-'}/10\n<i>${esc(d.notes)}</i>\n${d.source_url ? `Manba: ${esc(d.source_url)}\n` : ''}━━━━━━━━━━\n\n`;
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
  try { await runPipeline({ log, onDraft: sendForApproval }); }
  catch (e) { await log(`❌ Xato: ${e.message}`); }
  finally { busy = false; }
}

// Sozlash uchun: chat va topik ID'sini ko'rsatadi
bot.command('id', ctx => ctx.reply(`chat_id: ${ctx.chat.id}\ntopic_id: ${ctx.message?.message_thread_id ?? '-'}\nsizning id: ${ctx.from.id}`));

bot.command('start', ctx => ctx.reply(
  'Kontent zavod ishlayapti.\n/yangi — hozir g\'oya izlash va qoralama yozish\n/goya <mavzu> — berilgan mavzu bo\'yicha post\n' +
  '/maqola <mavzu> — Telegram maqolasi (sarlavha, ro\'yxat, jadval)\n/karusel <mavzu> — slaydli karusel\n' +
  '/navbat — rejalashtirilgan postlar\n/hisobot [kun] — natijalar (reaksiya, lid, sotuv)\n/uslub — uslubingizni o\'rgatish · /qoidalar — doimiy qoidalar\n/id — chat va topik ID'));

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
    const nd = store.update(id, { status: 'approved', scheduledAt: d.status === 'approved' ? d.scheduledAt : nextSlot() });
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
  const d = store.get(w.id);
  if (!d) return store.takeWait(replyTo);
  const opt = { message_thread_id: cfg.approvalTopic };

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
