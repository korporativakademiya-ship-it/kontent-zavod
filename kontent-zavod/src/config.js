import 'dotenv/config';

const req = (k) => { if (!process.env[k]) throw new Error(`.env da ${k} yo'q`); return process.env[k]; };

if ((process.env.LLM_MODE || 'api').toLowerCase() === 'max' && !process.env.CLAUDE_CODE_OAUTH_TOKEN)
  throw new Error("max rejimi uchun .env da CLAUDE_CODE_OAUTH_TOKEN kerak (claude setup-token)");

export const cfg = {
  mode: (process.env.LLM_MODE || 'api').toLowerCase(),   // api | max
  model: process.env.MODEL || 'claude-sonnet-5',          // api rejimi uchun
  maxModel: process.env.MAX_MODEL || 'sonnet',            // max rejimi uchun: sonnet | opus
  botToken: req('BOT_TOKEN'),
  admins: (process.env.ADMIN_IDS || '').split(',').map(s => Number(s.trim())).filter(Boolean),
  groupId: process.env.GROUP_ID || '',
  approvalTopic: Number(process.env.APPROVAL_TOPIC_ID) || undefined,
  logTopic: Number(process.env.LOG_TOPIC_ID) || undefined,
  channelId: process.env.CHANNEL_ID || '',
  dailyCron: process.env.DAILY_CRON || '0 8 * * *',
  dailyPosts: Number(process.env.DAILY_POSTS) || 3,
  postTimes: (process.env.POST_TIMES || '09:00,19:00').split(',').map(s => s.trim()),
  dataDir: process.env.DATA_DIR || './data',
  videoFps: Number(process.env.VIDEO_FPS) || 30,
  // Kotibim CRM bilan bog'lash (lidlarni postlarga bog'lash) va haftalik hisobot
  kotibimUrl: (process.env.KOTIBIM_URL || '').replace(/\/+$/, ''),
  kontentKey: process.env.KONTENT_API_KALIT || '',
  reportCron: process.env.REPORT_CRON || '0 9 * * 1',
  // Ovoz (TTS): azure | elevenlabs — bo'sh bo'lsa ovoz o'chiq
  tts: {
    provider: (process.env.TTS_PROVIDER || '').toLowerCase(),
    azureKey: process.env.AZURE_SPEECH_KEY || '',
    azureRegion: process.env.AZURE_SPEECH_REGION || 'westeurope',
    azureVoice: process.env.AZURE_VOICE || 'uz-UZ-SardorNeural',
    elevenKey: process.env.ELEVENLABS_API_KEY || '',
    elevenVoice: process.env.ELEVENLABS_VOICE_ID || '',
    elevenModel: process.env.ELEVENLABS_MODEL || 'eleven_v3'
  },
  tz: 'Asia/Tashkent',
  tzOffsetH: 5
};
