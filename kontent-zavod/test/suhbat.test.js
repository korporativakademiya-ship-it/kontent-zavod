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
    joyla: ({ vaqt, qatiy }) => { log.push(['joyla', vaqt || '']); if (vaqt === 'xyz' && qatiy) throw Object.assign(new Error('"xyz" — vaqt tushunarsiz'), { kod: 400, vaqtXato: true }); return { kanal: '@pulatovjurabek', vaqt: '01.10 19:00' }; },
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
  r = await suhbat({ chatId: C, text: 'Uzun izoh '.repeat(40) }, k);  // tugmasiz uzun xabar ham — izoh (matn o'rnini bosmaydi)
  assert.deepEqual(log.at(-1), ['tasdiq', 'qayta', '', ('Uzun izoh '.repeat(40)).trim()]);
  await suhbat({ chatId: C, tugma: 'm_edit' }, k);
  r = await suhbat({ chatId: C, text: 'Yangi matn '.repeat(40) }, k); // ✏️ dan keyin — rahbar tahriri
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
  r = await suhbat({ chatId: C, hodisa: 'media_tayyor', draft_id: 'BOSHQA' }, k); // boshqa qoralama — e'tiborsiz
  assert.equal(r.xabarlar.length, 0);
  r = await suhbat({ chatId: C, hodisa: 'media_tayyor', draft_id: 'D1' }, k);
  assert.equal(r.xabarlar[0].klaviatura, 'joyla');
  r = await suhbat({ chatId: C, hodisa: 'media_tayyor', draft_id: 'D1' }, k);    // takroriy — e'tiborsiz
  assert.equal(r.xabarlar.length, 0);
});

test("ishlab chiqarish xatosi va javobsiz qolishi — chat qotib qolmaydi; tanqidchi xatosi joylashni to'smaydi", async () => {
  const { k, log } = agentlar();
  k.muallif = async () => ({ draft_id: 'D1', kontent_turi: 'matn+rasm', korinish: 'KOR' });
  const C = '444';
  await suhbat({ chatId: C, text: "g'oya" }, k);
  await suhbat({ chatId: C, tugma: 'tz_ok' }, k);
  await suhbat({ chatId: C, tugma: 'm_ok' }, k);
  let r = await suhbat({ chatId: C, hodisa: 'media_xato', draft_id: 'D1', xato: 'render 400' }, k);
  assert.match(r.xabarlar[0].matn, /render 400/); assert.equal(r.xabarlar[0].klaviatura, 'matn');
  await suhbat({ chatId: C, tugma: 'm_ok' }, k);                     // qayta urinish
  const { store } = await import('../src/store.js');
  store.setSetting(`suhbat:${C}`, { ...store.setting(`suhbat:${C}`), band: Date.now() - 26 * 60e3 }); // 25 daqiqadan oshdi
  r = await suhbat({ chatId: C, text: 'yangi fikr' }, k);
  assert.match(r.xabarlar[0].matn, /javobi kelmadi/); assert.equal(r.xabarlar[0].klaviatura, 'matn');
  k.tanqid = async () => { throw new Error('Max limiti tugadi'); };
  await suhbat({ chatId: C, tugma: 'm_ok' }, k);
  r = await suhbat({ chatId: C, hodisa: 'media_tayyor', draft_id: 'D1' }, k);
  assert.match(r.xabarlar[0].matn, /tanqidchi ishlamadi: Max limiti/); assert.equal(r.xabarlar[0].klaviatura, 'joyla');
  assert.ok(!log.some(x => x[0] === 'prodyuser' && x[1] === 'yangi fikr'), "ishlab paytidagi xabar yangi g'oya bo'lib ketmadi");
});

test('reels: tanlangan variant qayta yozishga asos bo\'ladi, keyin 1-variantga qaytadi; "0" variant emas', async () => {
  const { k, log, d } = agentlar();
  d.reels = { variantlar: [{}, {}] };
  k.muallif = async () => ({ draft_id: 'D1', kontent_turi: 'reels', korinish: 'KOR' });
  const tasdiqlar = [];
  k.tasdiq = async (b) => { tasdiqlar.push(b); return { draft_id: 'D1', korinish: 'KOR2' }; };
  const C = '555';
  await suhbat({ chatId: C, text: "g'oya" }, k);
  await suhbat({ chatId: C, tugma: 'tz_ok' }, k);
  assert.match((await suhbat({ chatId: C, text: '2' }, k)).xabarlar[0].matn, /2-variant tanlandi/);
  await suhbat({ chatId: C, text: 'jonliroq' }, k);
  assert.deepEqual([tasdiqlar.at(-1).qaror, tasdiqlar.at(-1).variant], ['qayta', 1]);
  const n = tasdiqlar.length;
  assert.match((await suhbat({ chatId: C, text: '0' }, k)).xabarlar[0].matn, /boshqa post ustida/); // 0 — variant ham, izoh ham emas
  assert.equal(tasdiqlar.length, n);
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

test("bekor uzoq ish paytida: kechikkan natija eski holatni tiklamaydi", async () => {
  const { k } = agentlar();
  const C = '666';
  let qoyib;
  k.prodyuser = () => new Promise(res => { qoyib = res; });
  const kutish = suhbat({ chatId: C, text: "sekin g'oya" }, k);
  await new Promise(r => setImmediate(r));
  assert.match((await suhbat({ chatId: C, text: 'bekor' }, k)).xabarlar[0].matn, /To'xtatildi/);
  qoyib({ sarlavha: 'S', taklif: 'T', kontent_turi: 'matn', tuzilma: [], xavflar: [] });
  assert.equal((await kutish).xabarlar.length, 0);
  const { store } = await import('../src/store.js');
  assert.equal(store.setting(`suhbat:${C}`).bosqich, 'bosh');
});

test("post o'rtasida raqam, uzun matn tahriri, topilmagan g'oya, begona hodisa, chiqib bo'lgan post", async () => {
  const { k, log, d } = agentlar();
  const C = '777';
  k.goyaTanla = ({ n }) => { throw Object.assign(new Error(`${n}-g'oya topilmadi`), { kod: 404 }); };
  assert.match((await suhbat({ chatId: C, text: '9' }, k)).xabarlar[0].matn, /⚠️ 9-g'oya topilmadi/);
  await suhbat({ chatId: C, text: "g'oya" }, k);
  const n = log.length;
  assert.match((await suhbat({ chatId: C, text: '3' }, k)).xabarlar[0].matn, /boshqa post ustida/);
  assert.equal(log.length, n);
  assert.equal((await suhbat({ chatId: C, hodisa: 'boshqa' }, k)).xabarlar.length, 0);
  await suhbat({ chatId: C, tugma: 'tz_ok' }, k);
  d.post_html = 'x'.repeat(5000);
  let r = await suhbat({ chatId: C, tugma: 'm_edit' }, k);
  assert.match(r.xabarlar[0].matn, /juda uzun/); assert.equal(r.xabarlar.length, 1);
  await suhbat({ chatId: C, tugma: 'm_ok' }, k);
  k.joyla = () => { throw Object.assign(new Error('post allaqachon chiqqan'), { kod: 400 }); };
  r = await suhbat({ chatId: C, tugma: 'j_ok' }, k);
  assert.match(r.xabarlar[0].matn, /allaqachon chiqqan/);
  const { store } = await import('../src/store.js');
  assert.equal(store.setting(`suhbat:${C}`).bosqich, 'bosh');
});
