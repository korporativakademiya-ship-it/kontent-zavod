import cron from 'node-cron';
import { cfg } from './config.js';
import { bot, dailyRun, rejaYetibOl, log, weeklyReport, weeklyPlanRun, salomlash, zaxira, kalendarYoz, refreshRules, RULES_BATCH } from './bot.js';
import { kalendarEnabled, syncKalendar } from './kalendar.js';
import { publishDue } from './publisher.js';
import { apiYarat } from './api.js';
import { store } from './store.js';
import { avtoEnvQolla } from './weekly.js';
import { tozala } from './tozalash.js';
import * as reels from './agents/reels.js';
import * as kontent from './agents/kontent.js';
import * as kuzatuv from './kuzatuv.js';
import { suhbat, kunlikTarqat } from './suhbat.js';
import { bilan } from './mahsulot.js';

// Har kuni g'oya izlash
// node-cron vazifaga o'z kontekstini argument qilib beradi — funksiyalar argumentsiz chaqiriladi
// (aks holda weeklyPlanRun uni mahsulotlar ro'yxati deb oladi: "mlar is not iterable" va reja tuzilmaydi)
cron.schedule(cfg.dailyCron, () => dailyRun(), { timezone: cfg.tz });
// Har soat: qoldirilgan kunlik ish va rejadagi yozilmagan yaqin postlar (qayta ishga tushish, band payt)
cron.schedule('20 * * * *', () => rejaYetibOl().catch(e => log(`⚠️ Rejadan yozishda xato: ${e.message}`)), { timezone: cfg.tz });
// Haftalik reja (standart: yakshanba 18:00) — tasdiqlangach har kuni ertalab (DAILY_CRON) rejadagi postlar yoziladi
cron.schedule(cfg.planCron, () => weeklyPlanRun().catch(e => log(`⚠️ Haftalik reja tuzilmadi: ${e.message}`)), { timezone: cfg.tz });
// Haftalik hisobot (standart: dushanba 09:00)
cron.schedule(cfg.reportCron, () => weeklyReport(7).catch(e => log(`⚠️ Hisobot xatosi: ${e.message}`)), { timezone: cfg.tz });
// Kunlik zaxira (Toshkent 03:15) — egasiga shaxsiy chatda jim fayl
// Zaxiradan oldin: eski qoralamalar va ularning fayllari tozalanadi (tozalash.js)
cron.schedule(process.env.BACKUP_CRON || '15 3 * * *', async () => {
  try { const t = tozala(); if (t.qoralama) console.log(`Tozalash: ${t.qoralama} ta eski qoralama, ${t.fayl} ta fayl`); }
  catch (e) { console.error('Tozalash:', e.message); }
  await zaxira().catch(e => log(`⚠️ Zaxira yuborilmadi: ${e.message}`));
}, { timezone: cfg.tz });
// Kotibim CRM kontent kalendari: har daqiqada sinxron; CRM'da joylangan yaqin g'oyalar darhol yoziladi
let kalendarXato = false;
if (kalendarEnabled()) cron.schedule('* * * * *', async () => {
  try {
    await syncKalendar();
    if (kalendarXato) { kalendarXato = false; log('📅 Kotibim kalendari bilan aloqa tiklandi.'); }
    await kalendarYoz();
  } catch (e) {
    console.error('Kalendar:', e.message);
    if (!kalendarXato) { kalendarXato = true; log(`⚠️ Kotibim kalendari bilan aloqa yo'q: ${e.message}`); }
  }
}, { timezone: cfg.tz });
// Har daqiqada vaqti kelgan postlarni kanalga chiqarish
// Xabar o'sha post mahsulotining xonasiga tushadi (birinchi mahsulot xonasiga emas)
cron.schedule('* * * * *', () => publishDue(bot.api, (t, d) => bilan(d?.mahsulot || null, () => log(t))), { timezone: cfg.tz });

// n8n doska uchun API (reels liniyasi). Railway domeni PORT ga yo'naltirilgan
// Rahbarning ssenariy izohlari ham tahrir izohlari kabi yig'iladi va doimiy qoidalarga aylanadi
const tanlov = (b) => {
  const r = reels.tanlov(b);
  if (r.izohlar >= RULES_BATCH) refreshRules().catch(e => log(`⚠️ Qoidalar yangilanmadi: ${e.message}`));
  return r;
};
// Suhbatdagi tuzatish va izohlar ham 5 tadan doimiy qoidalarga aylanadi
const suhbatQoida = async (b) => {
  const r = await suhbat(b, { ...kontent, ...kuzatuv });
  if (store.style().feedback.filter(f => !f.used).length >= RULES_BATCH) refreshRules().catch(e => log(`⚠️ Qoidalar yangilanmadi: ${e.message}`));
  return r;
};
const server = apiYarat({ agentlar: { ...reels, tanlov, kontent, kuzatuv, suhbat: suhbatQoida, kunlikTarqat: () => kunlikTarqat({ ...kontent, ...kuzatuv }) }, log: (t) => log(t).catch(() => {}) })
  .listen(Number(process.env.PORT) || 8080, () => console.log('API tayyor'));

// Volume ulanmagan Railway'da DATA_DIR konteyner ichida — har deployda qoralamalar, uslub va rejalar o'chadi
if (process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_VOLUME_MOUNT_PATH)
  console.error(`DIQQAT: Railway'da volume ulanmagan — ma'lumotlar (${cfg.dataDir}) har deployda o'chadi. Volume qo'shing (/data) va DATA_DIR=/data qiling.`);

// Telegram ulanishi uzilsa (masalan deploy paytida ikki nusxa: 409) — sababi logga yoziladi, jarayon to'xtaydi va Railway uni qayta ishga tushiradi
const botXato = (e) => {
  console.error('Bot to\'xtadi:', e?.description || e?.message || e);
  setTimeout(() => process.exit(1), 5000).unref();
};

bot.start({
  // Kanal reaksiyalari standart yangilanishlarga kirmaydi — alohida so'raladi
  allowed_updates: ['message', 'callback_query', 'message_reaction_count'],
  onStart: (info) => {
    console.log(`Kontent zavod ishga tushdi: @${info?.username || '?'}`);
    if (!process.env.PRODUCT_TOPICS) log('🟢 Kontent zavod ishga tushdi');
    const avto = avtoEnvQolla();
    if (avto !== null) { console.log(`Avto rejim (AVTO_REJIM): ${avto ? 'yoqildi' : "o'chirildi"}`); log(avto ? "🤖 Avto rejim yoqildi: haftalik reja o'zi tuziladi va tasdiqlanadi, postlar o'z vaqtida o'zi chiqadi. O'chirish: /avto off" : "✋ Avto rejim o'chirildi: har post tasdiqlashga keladi."); }
    salomlash().catch(e => console.error('Salom:', e.message));
    // Qayta ishga tushganda soatlik tekshiruvni kutmasdan: o'tkazib yuborilgan ish va avto reja bir daqiqadan keyin
    setTimeout(() => rejaYetibOl().catch(e => log(`⚠️ Rejadan yozishda xato: ${e.message}`)), 60e3);
  } }).catch(botXato);
// Toza to'xtash: bot va API yopiladi, cron'lar jarayonni ushlab turmaydi
const toxta = async () => {
  await bot.stop().catch(() => {});
  server.close();
  setTimeout(() => process.exit(0), 3000).unref();
};
process.once('SIGTERM', toxta);
process.once('SIGINT', toxta);
