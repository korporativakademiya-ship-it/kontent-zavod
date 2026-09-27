import fs from 'node:fs';
import path from 'node:path';
import { cfg } from './config.js';
import { ffmpeg, mediaDuration } from './video/ffmpeg.js';

// Matnni ovozga aylantirish (dublyaj). Provayder .env dan: TTS_PROVIDER=azure | elevenlabs
const t = cfg.tts;

export function ttsEnabled() {
  if (t.provider === 'azure') return !!t.azureKey;
  if (t.provider === 'elevenlabs') return !!(t.elevenKey && t.elevenVoice);
  return false;
}

export const TTS_SETUP = "Ovoz sozlanmagan. .env ga TTS_PROVIDER=azure + AZURE_SPEECH_KEY (+ AZURE_SPEECH_REGION) " +
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

// Matn → MP3 fayl; davomiylikni (soniya) qaytaradi
export async function synth(text, outFile) {
  if (!ttsEnabled()) throw new Error(TTS_SETUP);
  const clean = text.trim();
  if (!clean) throw new Error("Ovoz uchun matn bo'sh");
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
