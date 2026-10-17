// Telegram interfeysi: haqiqiy grammY bot, soxta Telegram API (chaqiruvlar yozib olinadi, tarmoq yo'q)
Object.assign(process.env, { DATA_DIR: '/tmp/kz-test-bot-' + process.pid, ADMIN_IDS: '42', CHANNEL_ID: '@kanal', GROUP_ID: '-1001' });
delete process.env.PRODUCT_TOPICS;
import test from 'node:test';
import assert from 'node:assert/strict';
const { bot } = await import('../src/bot.js');
const { store } = await import('../src/store.js');

const chaqiruvlar = [];
let msgId = 100;
bot.botInfo = { id: 7, is_bot: true, first_name: 'Fabrika', username: 'fabrika_bot', can_join_groups: true, can_read_all_group_messages: true, supports_inline_queries: false };
bot.api.config.use(async (prev, method, payload) => {
  chaqiruvlar.push({ method, payload });
  await new Promise(r => setTimeout(r, 5)); // tarmoq kechikishi — parallel bosishlar uchun
  const natija = /^send/.test(method) ? { message_id: ++msgId, date: 0, chat: { id: payload.chat_id }, text: payload.text }
    : method === 'getChat' ? { id: -1001234567, type: 'channel', title: 'Biznes tizimi', username: 'biznes_tizimi' }
    : method === 'getChatMember' ? { status: 'administrator', can_post_messages: true, user: { id: 7, is_bot: true, first_name: 'Fabrika' } } : true;
  return { ok: true, result: natija };
});
const qayerga = (m) => chaqiruvlar.filter(c => c.method === m);
let upd = 1;
const kim = (id) => ({ id, is_bot: false, first_name: 'R' });
const tugma = (data, from = 42) => bot.handleUpdate({ update_id: upd++, callback_query: { id: String(upd), from: kim(from), chat_instance: 'x', data,
  message: { message_id: 5, date: 0, chat: { id: -1001, type: 'supergroup' }, text: 'qoralama' } } });
const xabar = (text, { from = 42, reply = null, chat = { id: 42, type: 'private' } } = {}) => bot.handleUpdate({ update_id: upd++, message: {
  message_id: ++msgId, date: 0, chat, from: kim(from), text,
  ...(text.startsWith('/') ? { entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] } : {}),
  ...(reply ? { reply_to_message: { message_id: reply, date: 0, chat, from: { id: 7, is_bot: true, first_name: 'Fabrika' } } } : {}) } });

test('⚡ Hozir: ikki marta tez bosilsa ham kanalga bir marta chiqadi', async () => {
  const d = store.addDraft({ title: 'Tez post', format: 'post', post_html: 'Salom kanal' });
  chaqiruvlar.length = 0;
  await Promise.all([tugma(`now:${d.id}`), tugma(`now:${d.id}`)]);
  assert.equal(qayerga('sendMessage').filter(c => c.payload.chat_id === '@kanal').length, 1);
  assert.equal(store.get(d.id).status, 'published');
  assert.ok(qayerga('sendMessage').some(c => /"Biznes tizimi" kanaliga chiqdi: https:\/\/t\.me\/biznes_tizimi\/\d+/.test(c.payload.text)), 'chiqqan post havolasi beriladi');
  chaqiruvlar.length = 0;
  await tugma(`now:${d.id}`);
  assert.equal(qayerga('sendMessage').filter(c => c.payload.chat_id === '@kanal').length, 0, 'chiqqan post qayta chiqmaydi');
  assert.match(qayerga('sendMessage').at(-1).payload.text, /"Tez post" .*"Biznes tizimi" kanaliga chiqqan\.\nhttps:\/\/t\.me\/biznes_tizimi\/\d+/, 'qachon va qayerga chiqqani aytiladi');
});

test('eski (tahrirlangan) versiya va begona odam tugmalari ishlamaydi', async () => {
  const d = store.addDraft({ title: 'Eski', format: 'post', post_html: 'x', status: 'revised' });
  chaqiruvlar.length = 0;
  await tugma(`ok:${d.id}`);
  assert.match(qayerga('answerCallbackQuery')[0].payload.text, /eski versiya/);
  assert.equal(store.get(d.id).status, 'revised');
  const y = store.addDraft({ title: 'Yangi', format: 'post', post_html: 'y' });
  await tugma(`ok:${y.id}`, 99);
  assert.match(qayerga('answerCallbackQuery').at(-1).payload.text, /Faqat rahbar/);
  assert.equal(store.get(y.id).status, 'pending');
});

test('✅ Tasdiqlash — post darhol kanalga chiqadi, haftalik rejadagisi reja vaqtida; /navbat begona odamga ko\'rinmaydi', async () => {
  const d = store.addDraft({ title: 'Darhol', format: 'post', post_html: 'z' });
  chaqiruvlar.length = 0;
  await tugma(`ok:${d.id}`);
  assert.equal(store.get(d.id).status, 'published');
  assert.equal(qayerga('sendMessage').filter(c => c.payload.chat_id === '@kanal').length, 1);
  const kelajak = new Date(Date.now() + 2 * 864e5).toISOString();
  const r = store.addDraft({ title: 'Rejadagi', format: 'post', post_html: 'r', plannedAt: kelajak });
  await tugma(`ok:${r.id}`);
  assert.equal(store.get(r.id).status, 'approved');
  assert.equal(store.get(r.id).scheduledAt, kelajak);
  chaqiruvlar.length = 0;
  await xabar('/navbat', { from: 99, chat: { id: 99, type: 'private' } });
  assert.equal(qayerga('sendMessage').length, 1);
  assert.match(qayerga('sendMessage')[0].payload.text, /faqat rahbar uchun\. Sizning Telegram ID: 99/, "begona odam jim qolmaydi — ID'si aytiladi");
  assert.doesNotMatch(qayerga('sendMessage')[0].payload.text, /Rejalashtirilgan postlar/);
  chaqiruvlar.length = 0;
  await xabar('/id', { from: 99, chat: { id: 99, type: 'private' } });
  assert.match(qayerga('sendMessage')[0].payload.text, /sizning id: 99/, '/id hammaga ishlaydi');
  chaqiruvlar.length = 0;
  await xabar('/navbat');
  assert.match(qayerga('sendMessage')[0].payload.text, /Rejalashtirilgan postlar/);
});

test("\"g'oya: ...\" bankka tushadi (rahbar g'oyasi), /sozla savollari reply bilan ketma-ket", async () => {
  await xabar("g'oya: xodimlar nega ishdan ketadi — 3 sabab");
  const g = store.allIdeas().at(-1);
  assert.equal(g.text, 'xodimlar nega ishdan ketadi — 3 sabab');
  assert.equal(g.manba, undefined);
  chaqiruvlar.length = 0;
  await xabar('/sozla');
  const s1 = qayerga('sendMessage').at(-1);
  assert.match(s1.payload.text, /1\/6/);
  assert.ok(s1.payload.reply_markup.force_reply);
  await xabar('Dilnoza — klinika asoschisi', { reply: msgId });
  const s2 = qayerga('sendMessage').at(-1);
  assert.match(s2.payload.text, /2\/6/);
  assert.equal(store.setting('sozla').javoblar.muallif, 'Dilnoza — klinika asoschisi');
});

test("avto rejim: tasdiq kutayotgan amaldagi reja o'zi tasdiqlanadi (eski reja jim to'sib qo'ymaydi)", async () => {
  const { rejaYetibOl } = await import('../src/bot.js');
  const weekly = await import('../src/weekly.js');
  store.setSetting('avto', true);
  const kun = (n) => new Date(Date.now() + 5 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
  const uzoq = new Date(Date.now() + 5 * 864e5).toISOString(); // 36 soatdan keyin — hozir yozilmaydi (LLM chaqirilmaydi)
  store.addPlan({ id: 'kutilgan1', status: 'draft', from: kun(0), to: kun(6), slots: [], items: [{ id: 'x', title: 'Band', at: uzoq, draftId: null }] });
  assert.equal(weekly.currentPlan(), undefined);
  await rejaYetibOl();
  assert.equal(store.plans().find(p => p.id === 'kutilgan1').status, 'approved');
  assert.equal(weekly.currentPlan().id, 'kutilgan1');
  store.setSetting('avto', false);
});

test("shaxsiy chat: /yangi — mahsulot tugma bilan tanlanadi, tushunilmagan xabarga yo'riqnoma, mavzusiz /goya — mavzu so'raladi", async () => {
  process.env.PRODUCT_TOPICS = 'ka:11,qa:12,kf:13';
  chaqiruvlar.length = 0;
  await xabar('/yangi');
  const s = qayerga('sendMessage').at(-1);
  assert.match(s.payload.text, /Qaysi mahsulot uchun\?/);
  const tugmalar = s.payload.reply_markup.inline_keyboard.flat();
  assert.deepEqual(tugmalar.map(b => b.text), ['🤖 Kotib AI', '🎓 Qadam AI', '✍️ Kontent Fabrika']);
  assert.match(tugmalar[0].callback_data, /^tanla:ka:\w+$/);
  await tugma('tanla:ka:yoq');
  assert.match(qayerga('answerCallbackQuery').at(-1).payload.text, /eskirgan/);

  chaqiruvlar.length = 0;
  await xabar('kotib ai');
  assert.match(qayerga('sendMessage').at(-1).payload.text, /Tushunmadim\. Asosiy buyruqlar/);

  chaqiruvlar.length = 0;
  await xabar('/goya');
  const so = qayerga('sendMessage').at(-1);
  assert.match(so.payload.text, /Qaysi mavzuda\?/);
  assert.ok(so.payload.reply_markup.force_reply);
  const { shaxsiyTopiksiz } = await import('../src/bot.js');
  assert.deepEqual(shaxsiyTopiksiz({ chat_id: 42, message_thread_id: 11, text: 'x' }), { chat_id: 42, text: 'x' }, "shaxsiy chatga guruh topik raqami ketmaydi");
  assert.deepEqual(shaxsiyTopiksiz({ chat_id: '-1001', message_thread_id: 11 }), { chat_id: '-1001', message_thread_id: 11 });
  delete process.env.PRODUCT_TOPICS;
});

test("shaxsiy chatdan boshlangan qoralama o'sha chatga keladi, guruhdagilari — mahsulot xonasiga", async () => {
  const { sendForApproval } = await import('../src/bot.js');
  process.env.PRODUCT_TOPICS = 'ka:11,qa:12,kf:13';
  chaqiruvlar.length = 0;
  await sendForApproval(store.addDraft({ title: 'Shaxsiy', format: 'post', post_html: 'a', mahsulot: 'ka', chat: 42 }));
  await sendForApproval(store.addDraft({ title: 'Guruh', format: 'post', post_html: 'b', mahsulot: 'qa' }));
  const [birinchi, ikkinchi] = qayerga('sendMessage');
  assert.equal(birinchi.payload.chat_id, 42);
  assert.equal(birinchi.payload.message_thread_id, undefined);
  assert.equal(String(ikkinchi.payload.chat_id), '-1001');
  assert.equal(ikkinchi.payload.message_thread_id, 12);
  delete process.env.PRODUCT_TOPICS;
});

test("/kanal — postlar qaysi kanalga chiqishi va bot u yerda post yoza olishi", async () => {
  chaqiruvlar.length = 0;
  await xabar('/kanal');
  const t = qayerga('sendMessage').at(-1).payload.text;
  assert.match(t, /Postlar shu kanalga chiqadi:\nBiznes tizimi \(@biznes_tizimi\)\nhttps:\/\/t\.me\/biznes_tizimi/);
  assert.match(t, /✅ admin, post yoza oladi/);
  assert.equal(qayerga('getChat')[0].payload.chat_id, '@kanal');
});
