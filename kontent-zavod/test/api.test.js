// Boshqa test fayllari bilan parallel ishlaydi — baza fayli to'qnashmasin
process.env.DATA_DIR = '/tmp/kz-test-api';
import test from 'node:test';
import assert from 'node:assert/strict';
const { apiYarat } = await import('../src/api.js');
const { baho } = await import('../src/agents/reels.js');
const { store } = await import('../src/store.js');
const { uniqueCode } = await import('../src/cta.js');
const { REELS_RUBRIKALAR, FORMATLAR } = await import('../src/reels/rubrikalar.js');

async function server(opts) {
  const s = apiYarat(opts);
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${s.address().port}`;
  const soro = (yol, body, kalit) => fetch(url + yol, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(kalit ? { 'x-api-kalit': kalit } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) }).then(async r => ({ kod: r.status, j: await r.json() }));
  return { s, soro };
}

const agentlar = {
  prodyuser: async (goya, o) => ({ goya, mahsulot: o.mahsulot || 'ka' }),
  ssenariy: async (tz, o) => ({ ssenariy: { sarlavha: tz.goya }, tanqid: { baho: 9 }, izoh: o.izoh }),
  storibord: async () => ({ sahnalar: [{ matn: 'a' }], yakun: {}, smm: {} }),
  baho: async (b) => ({ ok: true, b }),
};

test('API: kalitsiz yopiq, noto\'g\'ri kalit rad, to\'g\'ri kalit bilan agentlar chaqiriladi', async () => {
  const yopiq = await server({ kalit: '', agentlar });
  assert.deepEqual((await yopiq.soro('/api/health')).j, { ok: true, api: false });
  assert.equal((await yopiq.soro('/api/reels/tz', { goya: 'x' }, 'k')).kod, 503);
  yopiq.s.close();

  const { s, soro } = await server({ kalit: 'maxfiy-kalit', agentlar });
  assert.equal((await soro('/api/reels/tz', { goya: 'x' })).kod, 401);
  assert.equal((await soro('/api/reels/tz', { goya: 'x' }, 'boshqa')).kod, 401);
  assert.equal((await soro('/api/reels/tz', {}, 'maxfiy-kalit')).kod, 400);
  assert.equal((await soro('/api/nomalum', {}, 'maxfiy-kalit')).kod, 404);
  const tz = await soro('/api/reels/tz', { goya: " arzon xodim ", mahsulot: 'qa' }, 'maxfiy-kalit');
  assert.deepEqual(tz, { kod: 200, j: { goya: 'arzon xodim', mahsulot: 'qa' } });
  const ss = await soro('/api/reels/ssenariy', { tz: tz.j, izoh: 'qisqaroq' }, 'maxfiy-kalit');
  assert.equal(ss.j.izoh, 'qisqaroq');
  assert.equal((await soro('/api/reels/storibord', { tz: tz.j }, 'maxfiy-kalit')).kod, 400);
  assert.equal((await soro('/api/reels/storibord', { tz: tz.j, ssenariy: ss.j.ssenariy }, 'maxfiy-kalit')).j.sahnalar.length, 1);
  s.close();
});

test('API: agent xatosi 500 bo\'lib qaytadi, server yiqilmaydi', async () => {
  const { s, soro } = await server({ kalit: 'k', agentlar: { ...agentlar, prodyuser: async () => { throw new Error('Max limiti tugadi'); } } });
  const r = await soro('/api/reels/tz', { goya: 'x' }, 'k');
  assert.equal(r.kod, 500);
  assert.equal(r.j.xato, 'Max limiti tugadi');
  assert.equal((await soro('/api/health')).kod, 200);
  s.close();
});

test('reels bahosi tanlovlar xotirasiga yoziladi; 4–5 ijobiy', () => {
  const oldin = store.choices().length;
  baho({ sarlavha: 'Tungi 02:47', mahsulot: 'ka', ball: 5 });
  baho({ sarlavha: 'Arzon xodim', mahsulot: 'boshqa', ball: 2, sabab: 'ilmoq sust' });
  const c = store.choices().slice(-2);
  assert.equal(store.choices().length, oldin + 2);
  assert.deepEqual(c.map(x => [x.ok, x.mahsulot, x.format]), [[true, 'ka', 'reels'], [false, null, 'reels']]);
  assert.equal(c[1].sabab, 'ilmoq sust');
  assert.throws(() => baho({ sarlavha: 'x', ball: 7 }), /1\.\.5/);
});

test("reels qoralamasining CTA kodi band hisoblanadi", () => {
  const kod = 'RK' + Date.now().toString(36).toUpperCase().slice(-6);
  assert.equal(uniqueCode(kod), kod);
  store.addDraft({ title: 'Reels sinov', format: 'reels', status: 'reels', cta_kod: kod });
  assert.equal(uniqueCode(kod), kod + '2');
});

test('rubrikalar: kodlar noyob, formatlar ro\'yxatda', () => {
  const kodlar = REELS_RUBRIKALAR.map(r => r.kod);
  assert.equal(new Set(kodlar).size, kodlar.length);
  for (const r of REELS_RUBRIKALAR) assert.ok(FORMATLAR[r.format], r.kod);
});
