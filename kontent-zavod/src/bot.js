import { Bot, InlineKeyboard } from 'grammy';
import { cfg } from './config.js';
import { store } from './store.js';
import { runPipeline } from './pipeline.js';
import { revise } from './agents/copywriter.js';
import { nextSlot, fmtTime, sendSafe, publish } from './publisher.js';

export const bot = new Bot(cfg.botToken);
const editWait = new Map(); // bot so'rov xabari id → draft id
let busy = false;

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isAdmin = (ctx) => cfg.admins.includes(ctx.from?.id);
const kb = (id) => new InlineKeyboard()
  .text('✅ Tasdiqlash', `ok:${id}`).text('⚡ Hozir', `now:${id}`).row()
  .text('✏️ Tahrir', `edit:${id}`).text('🎬 Ssenariy', `scr:${id}`).text('❌ Rad', `no:${id}`);

export const log = (text) => !cfg.groupId ? Promise.resolve() :
  bot.api.sendMessage(cfg.groupId, text, { message_thread_id: cfg.logTopic }).catch(() => {});

export async function sendForApproval(d) {
  const head = `<b>📝 Qoralama</b> | ${d.format} | baho: ${d.score ?? '-'}/10\n<i>${esc(d.notes)}</i>\n${d.source_url ? `Manba: ${esc(d.source_url)}\n` : ''}━━━━━━━━━━\n\n`;
  await sendSafe(bot.api, cfg.groupId, head + d.post_html, { message_thread_id: cfg.approvalTopic, reply_markup: kb(d.id) });
}

async function startRun(ctx, topic) {
  if (busy) return ctx.reply('⏳ Hozir ishlayapman, tugashini kuting.');
  busy = true;
  await ctx.reply('🚀 Boshladim. Jarayonni log topigida kuzating.');
  runPipeline({ topic, count: topic ? 1 : cfg.dailyPosts, log, onDraft: sendForApproval })
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
  'Kontent zavod ishlayapti.\n/yangi — hozir g\'oya izlash va qoralama yozish\n/goya <mavzu> — berilgan mavzu bo\'yicha post\n/navbat — rejalashtirilgan postlar\n/id — chat va topik ID'));

bot.command('yangi', ctx => isAdmin(ctx) && startRun(ctx, null));
bot.command('goya', ctx => {
  if (!isAdmin(ctx)) return;
  const topic = ctx.match?.trim();
  if (!topic) return ctx.reply('Mavzuni yozing: /goya xodimlar kechikishi');
  startRun(ctx, topic);
});

bot.command('navbat', ctx => {
  const q = store.byStatus('approved').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  ctx.reply(q.length ? q.map(d => `🕒 ${fmtTime(d.scheduledAt)} — ${d.title}`).join('\n') : 'Navbat bo\'sh.');
});

// Tugmalar
bot.callbackQuery(/^(ok|now|edit|scr|no):(.+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCallbackQuery({ text: 'Faqat rahbar tasdiqlaydi' });
  const [, act, id] = ctx.match;
  const d = store.get(id);
  if (!d) return ctx.answerCallbackQuery({ text: 'Qoralama topilmadi' });
  const mark = (t) => ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard().text(t, 'noop') }).catch(() => {});

  if (act === 'ok') {
    const at = nextSlot();
    store.update(id, { status: 'approved', scheduledAt: at });
    await mark(`✅ ${fmtTime(at)} da chiqadi`);
    return ctx.answerCallbackQuery({ text: `Rejalashtirildi: ${fmtTime(at)}` });
  }
  if (act === 'now') {
    await publish(bot.api, d);
    await mark('📢 Chiqdi');
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
    const nd = store.addDraft({ ...d, id: undefined, status: 'pending', post_html: r.post_html, reels_script: r.reels_script || d.reels_script, notes: `Tahrir: ${ctx.message.text}`, score: d.score });
    await sendForApproval(nd);
  } catch (e) { await ctx.reply(`⚠️ Xato: ${e.message}`); }
});

bot.catch(err => console.error('Bot xatosi:', err.error?.message || err));
