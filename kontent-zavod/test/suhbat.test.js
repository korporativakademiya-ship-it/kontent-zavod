process.env.DATA_DIR = '/tmp/kz-test-suhbat-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
const { suhbat } = await import('../src/suhbat.js');

// Soxta agentlar: nima chaqirilganini yozib boradi
function agentlar() {
  const log = [];
  const d = { id: 'D1', format: 'post', post_html: 'Asl matn '.repeat(40), reels: null };
  return { log, d, k: {
    prodyuser: async (goya, o = {}) => { log.push(['prodyuser', goya, o.izoh || '']); return { sarlavha: 'S', taklif: 'T', kontent_turi: 'matn', mahsulot: 'ka', tuzilma: [], xavflar: [] }; },
    muallif: async () => { log.push(['muallif']); return { draft_id: 'D1', kontent_turi: 'matn', korinish: 'KOR' }; },
    tasdiq: async (b) => { log.push(['tasdiq', b.qaror || 'tasdiq', b.matn ? 'matn' : '', b.izoh || '']); return { draft_id: 'D1', korinish: 'KOR2' }; },
    tanqid: async () => { log.push(['tanqid']); return { baho: 7, kuchli: [], zaif: [], saboq: 's' }; },
    joyla: ({ vaqt, qatiy }) => { log.push(['joyla', vaqt || '']); if (vaqt === 'xyz' && qatiy) throw Object.assign(new Error('"xyz" — vaqt tushunarsiz'), { kod: 400 }); return { kanal: '@pulatovjurabek', vaqt: '01.10 19:00' }; },
    ishlabChiqarish: async () => { log.push(['ishlab']); return { tur: 'matn+rasm', rasm_prompt: 'p' }; },
    qoralama: () => d, tozaMatn: (x) => x.post_html,
    goyaTanla: ({ n }) => ({ goya: `dayjest-${n}` }),
    kunlikGoyalar: async () => ({ goyalar: [] }), dayjestMatni: () => 'DAYJEST',
    kanallar: () => [], kanalQosh: (n, iz) => [{ platforma: 'telegram', nom: n.replace('@', ''), izoh: iz }], kanalOchir: () => [],
    uslubKanaldan: async () => ({ kanal: 'pulatovjurabek', qoshildi: 12, jami: 12, guide: 'G' }),
  } };
}

test("g'oya → TZ (tugmalar) → matn bilan tuzatish → tasdiq → muallif → joylash", async () => {
  const { k, log } = agentlar();
  const C = '111';
  let r = await suhbat({ chatId: C, text: "tizim nimadan boshlanadi" }, k);
  assert.equal(r.xabarlar.at(-1).klaviatura, 'tz'); assert.match(r.xabarlar[0].matn, /💬 T/);
  r = await suhbat({ chatId: C, text: 'karusel qil' }, k);            // tugmasiz tuzatish
  assert.deepEqual(log.at(-1), ['prodyuser', 'tizim nimadan boshlanadi', 'karusel qil']);
  r = await suhbat({ chatId: C, tugma: 'tz_ok' }, k);
  assert.equal(r.xabarlar[0].klaviatura, 'matn');
  r = await suhbat({ chatId: C, text: 'qisqaroq' }, k);              // qisqa — izoh
  assert.deepEqual(log.at(-1), ['tasdiq', 'qayta', '', 'qisqaroq']);
  r = await suhbat({ chatId: C, text: 'Yangi matn '.repeat(40) }, k); // uzun — rahbar tahriri
  assert.deepEqual(log.at(-1), ['tasdiq', 'tasdiq', 'matn', '']);
  r = await suhbat({ chatId: C, tugma: 'm_ok' }, k);
  assert.equal(r.xabarlar[0].klaviatura, 'joyla'); assert.match(r.xabarlar[0].matn, /Tanqidchi: 7/);
  r = await suhbat({ chatId: C, tugma: 'j_vaqt' }, k);
  r = await suhbat({ chatId: C, text: 'xyz' }, k);
  assert.match(r.xabarlar[0].matn, /tushunarsiz/); assert.equal(r.xabarlar[0].klaviatura, 'joyla');
  r = await suhbat({ chatId: C, text: '19:00' }, k);
  assert.match(r.xabarlar[0].matn, /@pulatovjurabek kanaliga 01.10 19:00/);
  r = await suhbat({ chatId: C, tugma: 'j_ok' }, k);                 // joylandi, tugma eskirgan
  assert.match(r.xabarlar[0].matn, /eskirgan/);
});

test("matn+rasm: tasdiqdan keyin n8n ga ishlab chiqarish topshirig'i, media tayyor → tanqidchi", async () => {
  const { k } = agentlar();
  k.muallif = async () => ({ draft_id: 'D1', kontent_turi: 'matn+rasm', korinish: 'KOR' });
  const C = '222';
  await suhbat({ chatId: C, text: '3' }, k);
  await suhbat({ chatId: C, tugma: 'tz_ok' }, k);
  let r = await suhbat({ chatId: C, tugma: 'm_ok' }, k);
  assert.deepEqual(r.keyingi, { tur: 'matn+rasm', rasm_prompt: 'p', draft_id: 'D1' });
  r = await suhbat({ chatId: C, text: 'yana nimadir' }, k);           // ishlab chiqarish paytida
  assert.match(r.xabarlar[0].matn, /Hali oldingi bosqich/);
  r = await suhbat({ chatId: C, hodisa: 'media_tayyor' }, k);
  assert.equal(r.xabarlar[0].klaviatura, 'joyla');
});

test("buyruqlar: /start, kanal qo'shish, bekor, dayjest raqami, m_edit nusxa matni", async () => {
  const { k, log } = agentlar();
  const C = '333';
  assert.match((await suhbat({ chatId: C, text: '/start' }, k)).xabarlar[0].matn, /kontent bo'limingiz/);
  assert.match((await suhbat({ chatId: C, text: 'kanal: @biznes — ilmoq' }, k)).xabarlar[0].matn, /@biznes — ilmoq/);
  await suhbat({ chatId: C, text: '2' }, k);
  assert.deepEqual(log.at(-1), ['prodyuser', 'dayjest-2', '']);
  await suhbat({ chatId: C, tugma: 'tz_ok' }, k);
  const r = await suhbat({ chatId: C, tugma: 'm_edit' }, k);
  assert.equal(r.xabarlar.length, 2); assert.match(r.xabarlar[1].matn, /Asl matn/);
  assert.match((await suhbat({ chatId: C, text: 'bekor' }, k)).xabarlar[0].matn, /To'xtatildi/);
  assert.match((await suhbat({ chatId: C, tugma: 'm_ok' }, k)).xabarlar[0].matn, /eskirgan/);
  assert.match((await suhbat({ chatId: C, text: 'uslub' }, k)).xabarlar[0].matn, /12 ta post/);
});
