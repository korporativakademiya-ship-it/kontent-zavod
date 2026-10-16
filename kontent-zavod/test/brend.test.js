process.env.DATA_DIR = '/tmp/kz-test-brend-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
const { store } = await import('../src/store.js');
const { PROFIL, prefiksdan } = await import('../src/mahsulot.js');
const { brendMatni, imzo, muallif, STANDART_BRAND } = await import('../src/brand.js');
const { brand } = await import('../src/style.js');

test('standart: muallifning brendi va 3 ta mahsulot', () => {
  assert.deepEqual(Object.keys(PROFIL), ['ka', 'qa', 'kf']);
  assert.equal(brendMatni(), STANDART_BRAND);
  assert.equal(imzo().name, 'Joʻrabek');
});

test('boshqa mijoz: brend, imzo va mahsulotlar bazadan — kod o\'zgarmaydi', () => {
  store.setSetting('brend', { muallif: 'Dilnoza', yonalish: 'stomatologiya klinikasi marketingi', matn: 'MUALLIF: Dilnoza — klinika egasi.', imzo: { name: 'Dilnoza', role: 'Tabassum klinikasi' } });
  store.setSetting('mahsulotlar', { tk: { nom: 'Tish oqartirish', belgi: '🦷', profil: 'Klinikadagi oqartirish xizmati' } });
  assert.deepEqual(Object.keys(PROFIL), ['tk']);
  assert.equal(prefiksdan('[tk03] Oqartirish haqida'), 'tk');
  assert.equal(prefiksdan('[ka01] eski'), null);
  assert.equal(muallif(), 'Dilnoza');
  assert.deepEqual(imzo(), { name: 'Dilnoza', role: 'Tabassum klinikasi' });
  assert.match(brand(), /^MUALLIF: Dilnoza/);
  assert.doesNotMatch(brand(), /Joʻrabek/);
  // Sozlama o'chirilsa — standartga qaytadi
  store.setSetting('mahsulotlar', null);
  store.setSetting('brend', null);
  assert.deepEqual(Object.keys(PROFIL), ['ka', 'qa', 'kf']);
  assert.equal(brendMatni(), STANDART_BRAND);
});
