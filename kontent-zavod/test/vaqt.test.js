// Rahbar yozgan vaqt: o'zbekcha (lotin, kirill), ruscha, sana, hafta kuni, nisbiy vaqt (Toshkent vaqti, POST_TIMES 09:00,19:00)
Object.assign(process.env, { DATA_DIR: '/tmp/kz-test-vaqt-' + process.pid, POST_TIMES: '09:00,19:00' });
import test from 'node:test';
import assert from 'node:assert/strict';
const { parseTime, vaqtgaOxshaydi } = await import('../src/publisher.js');

// Toshkent vaqti bo'yicha: "2026-10-19 14:00" (dushanba) → UTC
const tosh = (s) => Date.parse(s.replace(' ', 'T') + ':00+05:00');
const kut = (matn, hozir, natija) => {
  const r = parseTime(matn, tosh(hozir));
  assert.equal(r, natija === null ? null : new Date(tosh(natija)).toISOString(), `"${matn}" (${hozir} da) → ${natija}, keldi: ${r}`);
};

test('soat: ikki nuqta, nuqta, bo\'sh joy; bugun o\'tgan bo\'lsa — ertaga', () => {
  const h = '2026-10-19 14:00';
  kut('18:30', h, '2026-10-19 18:30');
  kut('18.30', h, '2026-10-19 18:30');
  kut('18 30', h, '2026-10-19 18:30');
  kut('19:00 da chiqsin', h, '2026-10-19 19:00');
  kut('10:00', h, '2026-10-20 10:00');
  kut('bugun 20:00', h, '2026-10-19 20:00');
});

test("faqat soat: 'soat 7', '7 da', 'kechqurun 8', 'soat 3' — eng tabiiy kelgusi vaqt", () => {
  kut('soat 7', '2026-10-19 14:00', '2026-10-19 19:00');
  kut('7 da', '2026-10-19 14:00', '2026-10-19 19:00');
  kut('soat 9', '2026-10-19 07:00', '2026-10-19 09:00');
  kut('soat 7', '2026-10-19 22:00', '2026-10-20 07:00');
  kut('soat 3', '2026-10-19 08:00', '2026-10-19 15:00');
  kut('kechqurun 8', '2026-10-19 08:00', '2026-10-19 20:00');
  kut('soat 7 ertalab', '2026-10-19 14:00', '2026-10-20 07:00');
  kut('7 yarim', '2026-10-19 14:00', '2026-10-19 19:30');
  kut('soat 19 da', '2026-10-19 14:00', '2026-10-19 19:00');
  kut('tushdan keyin 3', '2026-10-19 08:00', '2026-10-19 15:00');
});

test('kun: ertaga, indinga, hafta kuni; kunning o\'zi — birinchi chiqish vaqti', () => {
  const h = '2026-10-19 14:00';
  kut('ertaga 9', h, '2026-10-20 09:00');
  kut('ertaga soat 9:30 da', h, '2026-10-20 09:30');
  kut('ertaga 3 da', h, '2026-10-20 15:00');
  kut('indinga 10:00', h, '2026-10-21 10:00');
  kut('ertaga', h, '2026-10-20 09:00');
  kut('juma kuni', h, '2026-10-23 09:00');
  kut('juma 18:00', h, '2026-10-23 18:00');
  kut('dushanba 15:00', h, '2026-10-19 15:00');
  kut('dushanba 10:00', h, '2026-10-26 10:00');
  kut('yakshanba 10:00', h, '2026-10-25 10:00');
  kut('shanba 10:00', h, '2026-10-24 10:00');
});

test('sana: raqam bilan va oy nomi bilan; o\'tgan sana — keyingi yil; yo\'q sana — rad', () => {
  const h = '2026-10-19 14:00';
  kut('28.10 18:30', h, '2026-10-28 18:30');
  kut('28/10 soat 9', h, '2026-10-28 09:00');
  kut('28.09 18:30', h, '2027-09-28 18:30');
  kut('20-oktabr 10:00', h, '2026-10-20 10:00');
  kut('20 oktyabr soat 9', h, '2026-10-20 09:00');
  kut('oktabr 25 10:00', h, '2026-10-25 10:00');
  kut('5-noyabr', h, '2026-11-05 09:00');
  kut('28.09.2026 18:30', h, null);
  kut('31.02 10:00', h, null);
  kut('mayli 10 da', h, '2026-10-20 10:00');
});

test("nisbiy vaqt, kirillcha va ruscha", () => {
  const h = '2026-10-19 14:00';
  kut('30 daqiqadan keyin', h, '2026-10-19 14:30');
  kut('1 soatdan keyin', h, '2026-10-19 15:00');
  kut("yarim soatdan so'ng", h, '2026-10-19 14:30');
  kut('ертага соат 9', h, '2026-10-20 09:00');
  kut('бугун 19:30', h, '2026-10-19 19:30');
  kut('завтра в 10', h, '2026-10-20 10:00');
  kut('сегодня в 19:30', h, '2026-10-19 19:30');
  kut('через 2 часа', h, '2026-10-19 16:00');
});

test('tushunarsiz yoki noto\'g\'ri — null; vaqtga o\'xshash gapni ajratish', () => {
  const h = '2026-10-19 14:00';
  for (const t of ['rahmat', 'hozir', '25:00', '', 'ok']) kut(t, h, null);
  assert.equal(vaqtgaOxshaydi('rahmat, keyin qarayman'), false);
  assert.equal(vaqtgaOxshaydi('ertaga ertalab'), true);
  assert.equal(vaqtgaOxshaydi('ертага'), true);
});
