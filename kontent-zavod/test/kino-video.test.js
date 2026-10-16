// Fabrika → kontent-render /kino: kino rejissyori sahnalari renderga ketadi, MP4 qoralamaga yoziladi (n8n'siz)
import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const server = http.createServer((req, res) => {
  let b = ''; req.on('data', c => { b += c; });
  req.on('end', () => {
    const sahnalar = [
      { shablon: 'plakat', tur: 'kinetik', matn: 'Tungi *02:47*', ovoz: 'Tungi ikki qirq yetti.', subtitr: '', soniya: 3 },
      { shablon: 'doska', tur: 'sarlavha', qatorlar: ['Mijoz yozdi', '*javob yo\'q*'], ovoz: 'Mijoz yozdi.', soniya: 3 },
      { shablon: 'grid', tur: 'cta', tugma: 'KOTIB', ovoz: 'Direktga yozing.', soniya: 3 },
    ];
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: JSON.stringify({ sahnalar, smm: {} }) }] }));
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
test.after(() => server.close());
const DATA = '/tmp/kz-test-kino-' + process.pid;
Object.assign(process.env, { DATA_DIR: DATA, LLM_MODE: 'api', ANTHROPIC_API_KEY: 't', ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`,
  KONTENT_RENDER_URL: 'http://render.test:8080/' });
const { store } = await import('../src/store.js');
const { kinoVideo, kinoYoqilgan } = await import('../src/video/kino.js');
const { ffmpegPath } = await import('../src/video/ffmpeg.js');

test('kino video: sahnalar kontent-render /kino ga ketadi, MP4 saqlanadi', async () => {
  assert.equal(kinoYoqilgan(), true);
  fs.mkdirSync(DATA, { recursive: true });
  const mp4 = `${DATA}/namuna.mp4`;
  execFileSync(await ffmpegPath(), ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=108x192:d=2', '-pix_fmt', 'yuv420p', mp4]);
  const d = store.addDraft({ title: 'Kech javob', format: 'reels', post_html: 'x', tz: { sarlavha: 'Kech javob', mahsulot: 'ka', ilmoq: 'Tungi 02:47', tuzilma: [] },
    reels: { ssenariy: { sahnalar: [{ ovoz: 'Tungi ikki qirq yetti', ekran: 'Tungi *02:47*' }] } } });
  let yuborilgan = null, manzil = '';
  const fetchFn = async (url, o) => { manzil = url; yuborilgan = JSON.parse(o.body); return { ok: true, arrayBuffer: async () => fs.readFileSync(mp4) }; };
  const v = await kinoVideo(d, { fetchFn });
  assert.equal(manzil, 'http://render.test:8080/kino');
  assert.equal(yuborilgan.sahnalar.length, 3);
  assert.ok(yuborilgan.sahnalar.every(s => !('ovoz' in s) && !('rejissura' in s)), 'ovoz matni renderga ketmaydi');
  assert.equal(yuborilgan.sahnalar[0].shablon, 'plakat');
  assert.ok(fs.existsSync(v.file));
  assert.ok(Math.abs(v.duration - 2) < 0.3);
  assert.equal(v.voiced, false, 'TTS sozlanmagan — ovozsiz');
});
