// Reja bandidan qoralama: prodyuser TZ → kopirayter → rahbar tekshiruvi → rassom (AI rasm).
// Claude — soxta lokal server (ANTHROPIC_BASE_URL), Gemini — soxta fetch.
import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const chaqiruvlar = [];
const javob = (system) => {
  if (/kontent prodyuserisan/.test(system)) return { sarlavha: 'Kech javob', taklif: "Bu g'oyani hikoya qilib beraman", strategiya: 'iliq', mahsulot: 'ka',
    auditoriya: "do'kon egalari", kontent_turi: 'matn+rasm', rubrika: 'erkin', format: 'hikoya', ilmoq: 'Tungi 02:47. Mijoz yozdi.',
    ilmoq_variantlari: [], tuzilma: ['holat', 'yechim'], asosiy_fikr: 'tez javob — sotuv', dalil: 'misol', cta: { maqsad: 'izoh', matn: 'Fikringiz?' },
    taqiqlar: ['soxta raqam'], xavflar: [], vizual: {}, rasm_tavsif: 'Shop owner at night looking at phone', davomiylik: 0 };
  if (/kuchli kopirayterisan/.test(system)) return { post_html: '<b>Tungi 02:47.</b> Mijoz yozdi, javob yo\'q.', reels_script: '' };
  if (/kontent bo'limi rahbarisan/.test(system)) return { score: 8, notes: 'hook kuchaytirildi', post_html: '<b>Tungi 02:47.</b> Mijoz yozdi — javob kelmadi.' };
  if (/prompt muhandisisan/.test(system)) return { rasm_prompt: 'A shop owner at night, phone glowing, no text' };
  return {};
};
const server = http.createServer((req, res) => {
  let b = '';
  req.on('data', c => { b += c; });
  req.on('end', () => {
    const body = JSON.parse(b || '{}');
    const system = typeof body.system === 'string' ? body.system : JSON.stringify(body.system || '');
    chaqiruvlar.push({ system, prompt: JSON.stringify(body.messages) });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'x', stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: JSON.stringify(javob(system)) }] }));
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
test.after(() => server.close());
Object.assign(process.env, {
  DATA_DIR: '/tmp/kz-test-pipeline-' + process.pid, LLM_MODE: 'api', ANTHROPIC_API_KEY: 'test', ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`,
  FACT_CHECK: '0', GEMINI_API_KEY: 'g', GEMINI_IMAGE_MODEL: 'gemini-test-image',
});
const asl = globalThis.fetch;
let geminiSorov = null;
globalThis.fetch = async (url, o) => {
  if (String(url).includes('generativelanguage')) {
    geminiSorov = JSON.parse(o.body);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from('png').toString('base64') } }] } }] }) };
  }
  return asl(url, o);
};
const { produceDraft } = await import('../src/pipeline.js');

test("reja bandi: prodyuser TZ yozadi, kopirayter TZ bilan yozadi, rasm so'ralgani uchun AI rasm chiziladi", async () => {
  const log = [];
  const d = await produceDraft({ title: 'Kechasi yozgan mijoz', angle: 'kech javob — yo\'qotilgan sotuv', format: 'post', cta_goal: 'izoh' }, { log: async (t) => log.push(t) });
  const tartib = chaqiruvlar.map(c => /prodyuserisan/.test(c.system) ? 'prodyuser' : /kopirayterisan/.test(c.system) ? 'kopirayter'
    : /rahbarisan/.test(c.system) ? 'rahbar' : /prompt muhandisisan/.test(c.system) ? 'prompt' : '?');
  assert.deepEqual(tartib, ['prodyuser', 'kopirayter', 'rahbar', 'prompt']);
  assert.match(chaqiruvlar[0].prompt, /Format: post \(o'zgartirma\)/);
  assert.match(chaqiruvlar[1].prompt, /Tungi 02:47\. Mijoz yozdi/, 'kopirayter TZ ilmog\'ini oladi');
  assert.equal(d.format, 'post', 'format rejadagicha qoladi');
  assert.equal(d.tz.kontent_turi, 'matn+rasm');
  assert.match(d.notes, /🎬 Prodyuser: Bu g'oyani hikoya qilib beraman/);
  assert.equal(d.image_paths.length, 1);
  assert.ok(fs.existsSync(d.image_paths[0]));
  assert.equal(geminiSorov.contents[0].parts[0].text, 'A shop owner at night, phone glowing, no text');
  assert.ok(log.some(t => /🎨 Rasm chizilmoqda/.test(t)));
  assert.match(d.notes, /^🏭 Ishladi: 🎬 Prodyuser \(TZ\) → ✍️ Kopirayter → 🧐 Rahbar tekshiruvi \(8\/10\) → 🎨 Rassom \(AI rasm\)/);
});

test('PRODYUSER=0 — prodyuser chaqirilmaydi, reja bo\'yicha yoziladi', async () => {
  process.env.PRODYUSER = '0';
  chaqiruvlar.length = 0;
  const d = await produceDraft({ title: 'Oddiy post', format: 'post' });
  assert.ok(!chaqiruvlar.some(c => /prodyuserisan/.test(c.system)));
  assert.equal(d.tz, undefined);
  assert.deepEqual(d.image_paths || [], []);
  delete process.env.PRODYUSER;
});
