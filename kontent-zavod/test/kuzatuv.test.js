process.env.DATA_DIR = '/tmp/kz-test-kuzatuv';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const k = await import('../src/kuzatuv.js');
const html = fs.readFileSync(new URL('./fixtures/tme.html', import.meta.url), 'utf8');

test("t.me/s sahifasidan postlar: matn, ko'rish, sana, havola; matnsiz post tashlanadi", () => {
  const p = k.postlarniAjrat(html);
  assert.equal(p.length, 2);
  assert.equal(p[0].matn, "Xodim o'zboshimcha ishlasa — aybdor kim?\n\n3 ta sabab & yechim. batafsil");
  assert.deepEqual([p[0].korish, p[1].korish], [12400, 870]);
  assert.equal(p[1].matn, "KPI qo'yishning oddiy usuli 📊");
  assert.equal(p[0].havola, 'https://t.me/biznes/101');
  assert.equal(p[1].vaqt, '2026-09-30T06:30:00+00:00');
});

test('kanal nomlari: @, havola, instagram; noto\'g\'risi rad', () => {
  assert.deepEqual(k.normKanal('@Biznes_Kanal'), { platforma: 'telegram', nom: 'biznes_kanal' });
  assert.deepEqual(k.normKanal('https://t.me/s/abc_def/12'), { platforma: 'telegram', nom: 'abc_def' });
  assert.deepEqual(k.normKanal('https://www.instagram.com/jurabek.p/'), { platforma: 'instagram', nom: 'jurabek.p' });
  assert.equal(k.normKanal('x y'), null);
});

test("kanallar ro'yxati: qo'shish, takror qo'shilmaydi, o'chirish", () => {
  for (const x of k.kanallar()) k.kanalOchir('@' + x.nom);
  k.kanalQosh('@biznes', 'ilmoqlari kuchli');
  k.kanalQosh('t.me/biznes', 'yangilandi');
  k.kanalQosh('@tizim_uz');
  assert.deepEqual(k.kanallar().map(x => [x.nom, x.izoh]), [['biznes', 'yangilandi'], ['tizim_uz', '']]);
  k.kanalOchir('@biznes');
  assert.deepEqual(k.kanallar().map(x => x.nom), ['tizim_uz']);
  assert.throws(() => k.kanalQosh('??'), /tushunarsiz/);
});

test('kuzatuv xulosasi: eng ko\'p ko\'rilganlari, xato bo\'lsa qolganlari davom etadi', async () => {
  for (const x of k.kanallar()) k.kanalOchir('@' + x.nom);
  k.kanalQosh('@biznes'); k.kanalQosh('@yopiq_kanal'); k.kanalQosh('instagram.com/ig_akk');
  const fetchFn = async (url) => url.includes('yopiq') ? { ok: false, status: 404 } : { ok: true, text: async () => html };
  const r = await k.kuzatuvXulosasi({ kunlar: 3650, harKanaldan: 1, fetchFn });
  assert.equal(r.natija.length, 1);
  assert.equal(r.natija[0].postlar[0].korish, 12400);
  assert.match(r.xatolar[0], /yopiq_kanal: t\.me\/s\/yopiq_kanal: 404/);
});
