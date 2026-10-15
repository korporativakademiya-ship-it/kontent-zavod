process.env.DATA_DIR = '/tmp/kz-test-tts-' + process.pid;
process.env.TTS_PROVIDER = 'gemini';
process.env.GEMINI_API_KEY = 'kalit';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const tts = await import('../src/tts.js');
const { mediaDuration } = await import('../src/video/ffmpeg.js');

test('Gemini TTS: eng yangi model tanlanadi, PCM javob MP3 bo\'ladi', async () => {
  assert.equal(tts.ttsEnabled(), true);
  assert.equal(tts.engYangiTts(['gemini-2.5-flash-preview-tts', 'gemini-3.0-flash-tts', 'gemini-3.0-pro', 'gemini-2.5-pro-preview-tts']), 'gemini-3.0-flash-tts');
  const pcm = Buffer.alloc(24000 * 2); // 1 soniya jimlik, 24 kHz, 16 bit
  const soralgan = [];
  const fetchFn = async (url, o = {}) => {
    soralgan.push([url, o.headers?.['x-goog-api-key'], o.body ? JSON.parse(o.body) : null]);
    if (url.includes('?pageSize')) return { ok: true, json: async () => ({ models: [{ name: 'models/gemini-2.5-flash-preview-tts' }, { name: 'models/gemini-2.0-flash' }] }) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm.toString('base64') } }] } }] }) };
  };
  const out = path.join(process.env.DATA_DIR, 'a', 'x.mp3');
  await tts.synthGemini('Salom, dunyo', out, { fetchFn });
  assert.match(soralgan[1][0], /gemini-2\.5-flash-preview-tts:generateContent$/);
  assert.equal(soralgan[1][1], 'kalit');
  assert.equal(soralgan[1][2].generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Charon');
  assert.ok(fs.existsSync(out));
  assert.ok(Math.abs(await mediaDuration(out) - 1) < 0.2);
  assert.equal(fs.existsSync(out + '.raw'), false);
});
