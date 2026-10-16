// /sozla: 6 ta savol → agent brend profilini tuzadi → saqlanganda brend, mahsulotlar, kanallar va uslub sozlanadi
import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';

const server = http.createServer((req, res) => {
  let b = ''; req.on('data', c => { b += c; });
  req.on('end', () => {
    const javob = { brend_matn: "MUALLIF: Dilnoza — Tabassum klinikasi asoschisi.\nAUDITORIYA: ota-onalar.", mahsulotlar: [
      { nom: 'Tish oqartirish', belgi: '🦷', profil: 'Oqartirish xizmati' }, { nom: 'Tozalash', belgi: '✨', profil: 'Professional tozalash' }] };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: JSON.stringify(javob) }] }));
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
test.after(() => server.close());
Object.assign(process.env, { DATA_DIR: '/tmp/kz-test-onb-' + process.pid, LLM_MODE: 'api', ANTHROPIC_API_KEY: 't', ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}` });
const o = await import('../src/onboarding.js');
const { store } = await import('../src/store.js');
const { PROFIL } = await import('../src/mahsulot.js');
const { muallif, imzo } = await import('../src/brand.js');

test("savol-javob: 6 qadam, 'yo'q' bo'sh javob, bo'sh xabar qayta so'raladi", () => {
  const h = { qadam: 0, javoblar: {} };
  assert.match(o.javobQabul(h, '').xato, /Javobni yozing/);
  assert.equal(h.qadam, 0);
  const javoblar = ['Dilnoza — Tabassum klinikasi asoschisi', 'stomatologiya', 'ota-onalar; qo\'rquv', 'Tish oqartirish — oq tabassum\nTozalash — gigiyena', '@stom_uz, instagram.com/klinika_x', "yo'q"];
  let r;
  for (const j of javoblar) r = o.javobQabul(h, j);
  assert.deepEqual(r, { tayyor: true });
  assert.equal(h.javoblar.uslub, '');
  assert.deepEqual(o.imzoAjrat(h.javoblar.muallif), { name: 'Dilnoza', role: 'Tabassum klinikasi asoschisi' });
  assert.deepEqual(o.manbalarAjrat(h.javoblar.manbalar), ['@stom_uz', 'instagram.com/klinika_x']);
  assert.equal(o.kodYasa('Tish oqartirish', new Set()), 'ti');
  assert.equal(o.kodYasa('Tizim', new Set(['ti'])), 'tz');
});

test('brend tuziladi va saqlanadi: mahsulotlar, imzo, kuzatuv kanallari', async () => {
  const j = { muallif: 'Dilnoza — Tabassum klinikasi asoschisi', yonalish: 'stomatologiya', auditoriya: 'ota-onalar', mahsulotlar: 'Tish oqartirish', manbalar: '@stom_uz ??? ', uslub: '' };
  const n = await o.brendYasa(j);
  assert.deepEqual(Object.keys(n.mahsulotlar), ['ti', 'to']);
  const qoshilgan = [];
  const r = await o.saqla(j, n, { kuzatuv: { kanalQosh: (k) => { if (k === '???') throw new Error('tushunarsiz'); qoshilgan.push(k); } } });
  assert.deepEqual(qoshilgan, ['@stom_uz']);
  assert.equal(r.xatolar.length, 1);
  assert.deepEqual(Object.keys(PROFIL), ['ti', 'to']);
  assert.equal(muallif(), 'Dilnoza');
  assert.equal(imzo().role, 'Tabassum klinikasi asoschisi');
  assert.match(store.setting('brend').matn, /^MUALLIF: Dilnoza/);
});
