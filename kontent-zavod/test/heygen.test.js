process.env.DATA_DIR = '/tmp/kz-test-heygen-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { heygenVideo, diktorMatni, heygenYoqilgan } = await import('../src/video/heygen.js');
const { ffmpegPath } = await import('../src/video/ffmpeg.js');

test('HeyGen: ssenariy ovozi avatarga yuboriladi, tayyor bo\'lguncha kutiladi, MP4 saqlanadi', async () => {
  const env = { HEYGEN_API_KEY: 'k', HEYGEN_AVATAR_ID: 'av1', HEYGEN_VOICE_ID: 'v1' };
  assert.equal(heygenYoqilgan(env), true);
  assert.equal(heygenYoqilgan({ HEYGEN_API_KEY: 'k' }), false);
  const d = { id: 'h1', title: 'Kech javob', post_html: '<b>Post</b>', reels: { ssenariy: { sahnalar: [{ ovoz: 'Tungi ikki qirq yetti.' }, { ovoz: 'Mijoz yozdi.' }], yakun: { ovoz: 'Direktga yozing.' } } } };
  assert.equal(diktorMatni(d), 'Tungi ikki qirq yetti. Mijoz yozdi. Direktga yozing.');
  assert.equal(diktorMatni({ post_html: '<p>Salom 👋 dunyo</p>' }), 'Salom dunyo');
  fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
  const mp4 = `${process.env.DATA_DIR}/n.mp4`;
  execFileSync(await ffmpegPath(), ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=108x192:d=1', '-pix_fmt', 'yuv420p', mp4]);
  let generate = null, holatSoni = 0;
  const fetchFn = async (url, o = {}) => {
    if (url.endsWith('/v2/video/generate')) { generate = { body: JSON.parse(o.body), kalit: o.headers['X-Api-Key'] }; return { ok: true, json: async () => ({ error: null, data: { video_id: 'vid9' } }) }; }
    if (url.includes('video_status.get?video_id=vid9')) { holatSoni++; return { ok: true, json: async () => ({ data: holatSoni < 2 ? { status: 'processing' } : { status: 'completed', video_url: 'https://cdn.test/v.mp4' } }) }; }
    if (url === 'https://cdn.test/v.mp4') return { ok: true, arrayBuffer: async () => fs.readFileSync(mp4) };
    throw new Error('kutilmagan: ' + url);
  };
  const v = await heygenVideo(d, { fetchFn, env, oraliq: 1 });
  assert.equal(generate.kalit, 'k');
  assert.deepEqual(generate.body.video_inputs[0].character, { type: 'avatar', avatar_id: 'av1', avatar_style: 'normal' });
  assert.equal(generate.body.video_inputs[0].voice.input_text, 'Tungi ikki qirq yetti. Mijoz yozdi. Direktga yozing.');
  assert.deepEqual(generate.body.dimension, { width: 1080, height: 1920 });
  assert.equal(holatSoni, 2);
  assert.ok(fs.existsSync(v.file));
  // Xato holat
  await assert.rejects(heygenVideo(d, { env, oraliq: 1, fetchFn: async (url) => url.endsWith('/generate')
    ? { ok: true, json: async () => ({ data: { video_id: 'x' } }) } : { ok: true, json: async () => ({ data: { status: 'failed', error: { message: 'avatar topilmadi' } } }) } }), /avatar topilmadi/);
});
