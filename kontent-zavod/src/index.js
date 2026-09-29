import cron from 'node-cron';
import { cfg } from './config.js';
import { bot, dailyRun, log, weeklyReport, weeklyPlanRun, salomlash } from './bot.js';
import { publishDue } from './publisher.js';

// Har kuni g'oya izlash
cron.schedule(cfg.dailyCron, dailyRun, { timezone: cfg.tz });
// Haftalik reja (standart: yakshanba 18:00) — tasdiqlangach har kuni ertalab (DAILY_CRON) rejadagi postlar yoziladi
cron.schedule(cfg.planCron, weeklyPlanRun, { timezone: cfg.tz });
// Haftalik hisobot (standart: dushanba 09:00)
cron.schedule(cfg.reportCron, () => weeklyReport(7).catch(e => log(`⚠️ Hisobot xatosi: ${e.message}`)), { timezone: cfg.tz });
// Har daqiqada vaqti kelgan postlarni kanalga chiqarish
cron.schedule('* * * * *', () => publishDue(bot.api, log), { timezone: cfg.tz });

bot.start({
  // Kanal reaksiyalari standart yangilanishlarga kirmaydi — alohida so'raladi
  allowed_updates: ['message', 'callback_query', 'message_reaction_count'],
  onStart: () => { console.log('Kontent zavod ishga tushdi'); if (!process.env.PRODUCT_TOPICS) log('🟢 Kontent zavod ishga tushdi'); salomlash().catch(e => console.error('Salom:', e.message)); } });
process.once('SIGTERM', () => bot.stop());
process.once('SIGINT', () => bot.stop());
