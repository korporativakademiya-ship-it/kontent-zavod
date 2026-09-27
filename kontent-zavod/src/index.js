import cron from 'node-cron';
import { cfg } from './config.js';
import { bot, dailyRun, log } from './bot.js';
import { publishDue } from './publisher.js';

// Har kuni g'oya izlash
cron.schedule(cfg.dailyCron, dailyRun, { timezone: cfg.tz });
// Har daqiqada vaqti kelgan postlarni kanalga chiqarish
cron.schedule('* * * * *', () => publishDue(bot.api, log), { timezone: cfg.tz });

bot.start({ onStart: () => { console.log('Kontent zavod ishga tushdi'); log('🟢 Kontent zavod ishga tushdi'); } });
process.once('SIGTERM', () => bot.stop());
process.once('SIGINT', () => bot.stop());
