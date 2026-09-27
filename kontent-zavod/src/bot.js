import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { cfg } from './config.js';
import { store } from './store.js';
import { runPipeline, renderDraftSlides } from './pipeline.js';
import { revise } from './agents/copywriter.js';
import { writeArticle } from './agents/article.js';
import { isRich, sendRich, approvalPrefix } from './rich.js';
import { nextSlot, fmtTime, sendSafe, publish } from './publisher.js';
import { makeVideo } from './video/make.js';

export const bot = new Bot(cfg.botToken);
const editWait = new Map(); // bot so'rov xabari id → draft id
let busy = false;
let videoBusy = false; // render og'ir (Chromium + ffmpeg) — bir vaqtda bittadan

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isAdmin = (ctx) => cfg.admins.includes(ctx.from?.id);
const kb = (id) => new InlineKeyboard()
  .text('✅ Tasdiqlash', `ok:${id}`).text('⚡ Hozir', `now:${id}`).row()
  .text('✏️ Tahrir', `edit:${id}`).text('🎬 Ssenariy', `scr:${id}`).row()
  .text('🎥 Video', `vid:${id}`).text('❌ Rad', `no:${id}`);

export const log = (text) => !cfg.groupId ? Promise.resolve() :
  bot.api.sendMessage(cfg.groupId, text, { message_thread_id: cfg.logTopic }).catch(() => {});

export async function sendForApproval(d) {
  const extra = { message_thread_id: cfg.approvalTopic, reply_markup: kb(d.id) };
  if (isRich(d)) {
    const { fallback } = await sendRich(bot.api, cfg.groupId, d, extra, { prefix: approvalPrefix(d) });
    if (fallback) await log(`⚠️ "${d.title}" maqola formatida ko'rsatilmadi, oddiy ko'rinishda yuborildi: ${fallback}`);
    return;
  }
  const head = `<b>📝 Qoralama</b> | ${d.format} | baho: ${d.score ?? '-'}/10\n<i>${esc(d.notes)}</i>\n${d.source_url ? `Manba: ${esc(d.source_url)}\n` : ''}━━━━━━━━━━\n\n`;
  await sendSafe(bot.api, cfg.groupId, head + d.post_html, { message_thread_id: cfg.approvalTopic, reply_markup: kb(d.id) });
}

// Qoralama uchun reels video yasaydi va tasdiqlash topigiga yuboradi
async function videoRun(d) {
  const reply = (t) => bot.api.sendMessage(cfg.groupId, t, { message_thread_id: cfg.approvalTopic }).catch(() => {});
  videoBusy = true;
  try {
    await reply(`🎥 "${d.title}" — video yasalmoqda (1–3 daqiqa)...`);
    const v = await makeVideo(d);
    const nd = store.update(d.id, { video_path: v.file, video_duration: v.duration, motion: v.data });
    const cap = `<b>🎥 Video</b> | ${esc(d.title)} | ${Math.round(v.duration)} s\n<i>${isRich(d) ? 'Tasdiqlansa, video maqola ichida chiqadi.' : 'Tasdiqlansa, kanalga shu video post matni bilan chiqadi.'}</i>`;
    await bot.api.sendVideo(cfg.groupId, new InputFile(v.file), {
      caption: cap, parse_mode: 'HTML', supports_streaming: true, width: 1080, height: 1920,
      duration: Math.round(v.duration), message_thread_id: cfg.approvalTopic, reply_markup: kb(nd.id)
    });
  } catch (e) {
    await reply(`⚠️ Video yasalmadi (${d.title}): ${e.message}`);
  } finally { videoBusy = false; }
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
  '/navbat — rejalashtirilgan postlar\n/id — chat va topik ID'));

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

bot.command('navbat', ctx => {
  const q = store.byStatus('approved').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  ctx.reply(q.length ? q.map(d => `🕒 ${fmtTime(d.scheduledAt)} — ${d.title}`).join('\n') : 'Navbat bo\'sh.');
});

// Tugmalar
bot.callbackQuery(/^(ok|now|edit|scr|vid|no):(.+)$/, async ctx => {
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
    const at = nextSlot();
    store.update(id, { status: 'approved', scheduledAt: at });
    await mark(`✅ ${fmtTime(at)} da chiqadi`);
    return ctx.answerCallbackQuery({ text: `Rejalashtirildi: ${fmtTime(at)}` });
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
    const m = await ctx.reply(`✏️ "${d.title}" — nima o'zgartiramiz? Shu xabarga javob (reply) qilib yozing.`,
      { message_thread_id: cfg.approvalTopic, reply_markup: { force_reply: true, selective: true } });
    editWait.set(m.message_id, id);
  }
});
bot.callbackQuery('noop', ctx => ctx.answerCallbackQuery());

// Tahrir izohini qabul qilish
bot.on('message:text', async ctx => {
  const replyTo = ctx.message.reply_to_message?.message_id;
  if (!replyTo || !editWait.has(replyTo) || !isAdmin(ctx)) return;
  const id = editWait.get(replyTo); editWait.delete(replyTo);
  const d = store.get(id);
  await ctx.reply('🔄 Qayta yozyapman...', { message_thread_id: cfg.approvalTopic });
  try {
    const r = await revise(d, ctx.message.text);
    store.update(id, { status: 'revised' });
    const { video_path, video_duration, motion, slide_paths, ...rest } = d; // eski video/slaydlar yangi matnga mos emas
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

bot.catch(err => console.error('Bot xatosi:', err.error?.message || err));
