import fs from 'node:fs';
import path from 'node:path';
import { cfg } from './config.js';
import { ffmpeg, mediaDuration } from './video/ffmpeg.js';

// Matnni ovozga aylantirish (dublyaj). Provayder .env dan: TTS_PROVIDER=azure | elevenlabs
const t = cfg.tts;

export function ttsEnabled() {
  if (t.provider === 'azure') return !!t.azureKey;
  if (t.provider === 'elevenlabs') return !!(t.elevenKey && t.elevenVoice);
  if (t.provider === 'gemini') return !!t.geminiKey;
  return false;
}

export const TTS_SETUP = "Ovoz sozlanmagan. .env ga TTS_PROVIDER=gemini + GEMINI_API_KEY, TTS_PROVIDER=azure + AZURE_SPEECH_KEY " +
  "yoki TTS_PROVIDER=elevenlabs + ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID qo'shing.";

const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// HTML postni o'qiladigan oddiy matnga aylantiradi (teglar, emoji, havolalarsiz)
export function speechText(html = '') {
  return String(html)
    .replace(/<br\s*\/?>|<\/(p|li|h\d|blockquote|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim()
    .slice(0, 2500);
}

async function synthAzure(text) {
  const res = await fetch(`https://${t.azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': t.azureKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
      'User-Agent': 'kontent-zavod'
    },
    body: `<speak version="1.0" xml:lang="uz-UZ"><voice name="${xml(t.azureVoice)}">${xml(text)}</voice></speak>`
  });
  if (!res.ok) throw new Error(`Azure TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

async function synthEleven(text) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(t.elevenVoice)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': t.elevenKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: t.elevenModel })
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
// Model nomi berilmasa — Google ro'yxatidan eng yangi TTS modeli olinadi (nomlar eskirsa ham ishlaydi)
let geminiModel = t.geminiModel;
export function engYangiTts(nomlar) {
  const ver = (n) => parseFloat((n.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1]);
  return nomlar.filter(n => /tts/i.test(n)).sort((a, b) => ver(b) - ver(a) || (/flash/.test(b) - /flash/.test(a)))[0] || '';
}
async function geminiTtsModel(fetchFn) {
  if (geminiModel) return geminiModel;
  const res = await fetchFn(`${GEMINI}?pageSize=1000`, { headers: { 'x-goog-api-key': t.geminiKey } });
  if (!res.ok) throw new Error(`Gemini modellar ro'yxati ${res.status}`);
  geminiModel = engYangiTts(((await res.json()).models || []).map(m => m.name.replace('models/', '')));
  if (!geminiModel) throw new Error('Gemini TTS modeli topilmadi');
  return geminiModel;
}

// Gemini PCM (audio/L16, 24 kHz) qaytaradi — ffmpeg bilan MP3 ga o'giriladi
export async function synthGemini(text, outFile, { fetchFn = fetch } = {}) {
  const model = await geminiTtsModel(fetchFn);
  const res = await fetchFn(`${GEMINI}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': t.geminiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Brisk, confident male narrator, natural Uzbek pronunciation, no long pauses: ${text}` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: t.geminiVoice } } } }
    }),
    signal: AbortSignal.timeout(120e3)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini TTS ${res.status}: ${String(data?.error?.message || '').slice(0, 200)}`);
  const part = (data?.candidates?.[0]?.content?.parts || []).find(p => p.inlineData || p.inline_data);
  const d = part && (part.inlineData || part.inline_data);
  if (!d?.data) throw new Error('Gemini TTS ovoz qaytarmadi');
  const mime = d.mimeType || d.mime_type || 'audio/L16;rate=24000';
  const raw = outFile + '.raw';
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(raw, Buffer.from(d.data, 'base64'));
  try {
    const pcm = /L16|pcm/i.test(mime);
    const rate = (/rate=(\d+)/.exec(mime) || [0, '24000'])[1];
    await ffmpeg(['-y', ...(pcm ? ['-f', 's16le', '-ar', rate, '-ac', '1'] : []), '-i', raw, '-c:a', 'libmp3lame', '-b:a', '128k', outFile]);
  } finally { fs.rmSync(raw, { force: true }); }
}

// Matn → MP3 fayl; davomiylikni (soniya) qaytaradi
export async function synth(text, outFile) {
  if (!ttsEnabled()) throw new Error(TTS_SETUP);
  const clean = text.trim();
  if (!clean) throw new Error("Ovoz uchun matn bo'sh");
  if (t.provider === 'gemini') {
    await synthGemini(clean, outFile);
    return mediaDuration(outFile);
  }
  const buf = t.provider === 'azure' ? await synthAzure(clean) : await synthEleven(clean);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return mediaDuration(outFile);
}

// Telegram ovozli xabari uchun OGG/Opus
export async function toVoiceNote(mp3, ogg) {
  await ffmpeg(['-y', '-i', mp3, '-c:a', 'libopus', '-b:a', '48k', '-ac', '1', ogg]);
  return mediaDuration(ogg);
}
