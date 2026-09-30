process.env.DATA_DIR = '/tmp/kz-test-kino-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
const { kinoTozala } = await import('../src/agents/kino.js');

test('kinoTozala: noma\'lum tur va yetishmagan maydon kinetikka aylanadi, media olib tashlanadi, chat bitta suhbat', () => {
  const s = kinoTozala({ sahnalar: [
    { shablon: 'plakat', tur: 'kinetik', matn: 'Kuniga *200 ta* xabar', ovoz: 'Kuniga ikki yuzta xabar', soniya: 99 },
    { shablon: 'grid', tur: 'uchar', subtitr: 'Nimadir' },                      // noma'lum tur
    { shablon: 'doska', tur: 'hisob', qatorlar: ['a'], subtitr: 'natija yo\'q' },  // natija yo'q
    { shablon: 'doska', tur: 'taqqos', qatorlar: [['a', 'b'], 'buzuq'] },
    { shablon: 'chat', tur: 'yozishma', ism: 'Aziz', soat: '23:47', xabarlar: [{ kim: 'mijoz', matn: 'Salom' }], rasm: 'https://x.y/z.png' },
    { shablon: 'chat', tur: 'yozishma', ism: 'Boshqa', xabarlar: [{ kim: 'bot', matn: 'Va alaykum' }] },
    { shablon: 'grid', tur: 'crm', lidlar: [{ ism: 'Aziz', yol: [{ t: 3, col: 7 }, { t: 'x', col: 0 }] }] },
    { shablon: 'plakat', tur: 'raqam', qiymat: '78%', matn: 'x' },
  ] });
  assert.equal(s[0].soniya, 12);
  assert.deepEqual([s[1].shablon, s[1].tur, s[1].matn], ['plakat', 'kinetik', 'Nimadir']);
  assert.deepEqual([s[2].shablon, s[2].tur], ['plakat', 'kinetik']);
  assert.deepEqual([s[3].fon, s[3].qatorlar.length], ['daftar', 1]);
  assert.equal(s[4].rasm, undefined);
  assert.equal(s[5].ism, 'Aziz'); assert.equal(s[5].soat, '23:47');
  assert.deepEqual(s[6].lidlar[0].yol, [{ t: .4, col: 0 }, { t: 3, col: 2 }]);
  assert.equal(s[7].qiymat, 78);
});

test('kinoTozala: sahna kam bo\'lsa xato', () => {
  assert.throws(() => kinoTozala({ sahnalar: [{ shablon: 'plakat', tur: 'kinetik', matn: 'a' }] }), /yetarli sahna/);
  assert.throws(() => kinoTozala(null), /yetarli sahna/);
});
