import cron from 'node-cron';
import { cfg } from './config.js';
import { bot, dailyRun, log, weeklyReport, weeklyPlanRun, salomlash, zaxira, kalendarYoz } from './bot.js';
import { kalendarEnabled, syncKalendar } from './kalendar.js';
import { publishDue } from './publisher.js';
import { apiYarat } from './api.js';
import * as reels from './agents/reels.js';

// Har kuni g'oya izlash
cron.schedule(cfg.dailyCron, dailyRun, { timezone: cfg.tz });
// Haftalik reja (standart: yakshanba 18:00) — tasdiqlangach har kuni ertalab (DAILY_CRON) rejadagi postlar yoziladi
cron.schedule(cfg.planCron, weeklyPlanRun, { timezone: cfg.tz });
// Haftalik hisobot (standart: dushanba 09:00)
cron.schedule(cfg.reportCron, () => weeklyReport(7).catch(e => log(`⚠️ Hisobot xatosi: ${e.message}`)), { timezone: cfg.tz });
// Kunlik zaxira (Toshkent 03:15) — egasiga shaxsiy chatda jim fayl
cron.schedule(process.env.BACKUP_CRON || '15 3 * * *', () => zaxira().catch(e => log(`⚠️ Zaxira yuborilmadi: ${e.message}`)), { timezone: cfg.tz });
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
cron.schedule('* * * * *', () => publishDue(bot.api, log), { timezone: cfg.tz });

// n8n doska uchun API (reels liniyasi). Railway domeni PORT ga yo'naltirilgan
apiYarat({ agentlar: reels, log: (t) => log(t).catch(() => {}) })
  .listen(Number(process.env.PORT) || 8080, () => console.log('API tayyor'));

bot.start({
  // Kanal reaksiyalari standart yangilanishlarga kirmaydi — alohida so'raladi
  allowed_updates: ['message', 'callback_query', 'message_reaction_count'],
  onStart: () => { console.log('Kontent zavod ishga tushdi'); if (!process.env.PRODUCT_TOPICS) log('🟢 Kontent zavod ishga tushdi'); salomlash().catch(e => console.error('Salom:', e.message)); } });
process.once('SIGTERM', () => bot.stop());
process.once('SIGINT', () => bot.stop());
