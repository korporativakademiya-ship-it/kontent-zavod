process.env.DATA_DIR = '/tmp/kz-test-muqova-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
const { muqovaSlayd, muqovaYasa, ichki } = await import('../src/muqova.js');

const d = { id: 'm1', title: 'Kech javob — yo\'qotilgan sotuv', format: 'post', post_html: '<b>Mijozlarning 78%</b> birinchi javob berganni tanlaydi.' };

test("kartochka: postdagi raqam — katta raqam; o'ylab topilgan raqam rasmga chiqmaydi", () => {
  assert.deepEqual(muqovaSlayd({ type: 'stat', num: '78%', label: 'mijoz', text: 'birinchi javob berganni tanlaydi' }, d),
    { type: 'stat', num: '78%', label: 'mijoz', text: 'birinchi javob berganni tanlaydi' });
  const soxta = muqovaSlayd({ type: 'stat', num: '93%', label: 'mijoz', title: 'Tez javob' }, d);
  assert.equal(soxta.type, 'cover', 'postda 93 yo\'q');
  assert.equal(soxta.title, 'Tez javob');
  assert.equal(muqovaSlayd({ type: 'stat', num: '78 000 000', label: 'x' }, d).type, 'cover', 'bir qatorga sig\'maydigan raqam');
});

test("kartochka: iqtibos, uzun matn qisqartiriladi, yaroqsiz javob — sarlavhali muqova", () => {
  const q = muqovaSlayd({ type: 'quote', text: 'Tezlik yetarli emas — javobgarlik kerak.' }, d);
  assert.equal(q.type, 'quote');
  assert.ok(q.by, 'muallif qo\'yiladi');
  assert.ok(muqovaSlayd({ type: 'cover', title: 'x'.repeat(300) }, d).title.length <= 70);
  assert.deepEqual(muqovaSlayd(null, d), { type: 'cover', kicker: 'Rahbar uchun', title: d.title });
  assert.deepEqual(muqovaSlayd({ type: 'nimadir' }, { ...d, format: 'maqola' }), { type: 'cover', kicker: 'Maqola', title: d.title });
});

test("Claude javob bermasa ham kartochka chiziladi (sarlavha bilan)", async () => {
  ichki.matn = async () => { throw new Error('Claude 15 daqiqada javob bermadi'); };
  let berildi;
  ichki.render = async (data, dir) => { berildi = data; return [`${dir}/01.png`]; };
  const r = await muqovaYasa(d);
  assert.equal(r.slayd.title, d.title);
  assert.ok(berildi.signature.name);
  assert.match(r.file, /images\/m1\/muqova-\d+\/01\.png$/);
});
