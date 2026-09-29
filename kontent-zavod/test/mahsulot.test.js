import test from 'node:test';
import assert from 'node:assert/strict';
process.env.PRODUCT_TOPICS = 'ka:867,qa:869,kf:871';
const { bilan, joriy, topikdan, topigi, prefiksdan, rejim, STANDART_JADVAL } = await import('../src/mahsulot.js');
const { store } = await import('../src/store.js');
const { brand } = await import('../src/style.js');
const weekly = await import('../src/weekly.js');

test('topic map and context', async () => {
  assert.equal(rejim(), true);
  assert.equal(topikdan(869), 'qa'); assert.equal(topikdan('871'), 'kf'); assert.equal(topikdan(5), null);
  assert.equal(topigi('ka'), 867);
  assert.equal(joriy(), null);
  await bilan('qa', async () => { await new Promise(r => setTimeout(r, 1)); assert.equal(joriy(), 'qa'); });
  assert.equal(prefiksdan('[kf12] Kontent reja'), 'kf');
});

test('each product sees only its own ideas and plans; brand = shared identity + product layer', async () => {
  const oldin = store.ideas().length;
  bilan('ka', () => store.addIdea('Kechasi yozgan mijozlar'));
  bilan('qa', () => store.addIdea('Yangi xodimning birinchi haftasi'));
  store.addIdea('[kf03] Kontent g‘oyasi');
  bilan('ka', () => assert.ok(store.ideas().every(i => (i.mahsulot || prefiksdan(i.text)) === 'ka')));
  bilan('qa', () => assert.ok(store.ideas().some(i => i.text.includes('birinchi haftasi'))));
  bilan('kf', () => assert.ok(store.ideas().some(i => i.text.includes('[kf03]'))));
  assert.equal(store.ideas().length, oldin + 3, 'outside topics — everything');

  bilan('qa', () => store.addPlan({ id: 'pq', status: 'draft', items: [] }));
  bilan('ka', () => assert.equal(store.plans().find(p => p.id === 'pq'), undefined));
  bilan('qa', () => assert.equal(store.plans().find(p => p.id === 'pq').mahsulot, 'qa'));

  const umumiy = brand();
  bilan('qa', () => {
    const b = brand();
    assert.ok(b.startsWith(umumiy.trimEnd().slice(0, 200)), 'shared author identity first');
    assert.match(b, /FAQAT "Qadam AI" HAQIDA/);
  });
  assert.doesNotMatch(umumiy, /FAQAT "/);
});

test('per-product schedule builds the week without collisions', () => {
  const vaqtlar = [];
  for (const m of ['ka', 'qa', 'kf']) bilan(m, () => store.setMSetting('jadval', STANDART_JADVAL[m]));
  for (const m of ['ka', 'qa', 'kf']) bilan(m, () => {
    const slots = weekly.weekSlots();
    assert.ok(slots.length >= 2);
    assert.ok(slots.every(s => s.rubric === null), 'no default rubrics in product topics');
    vaqtlar.push(...slots.map(s => `${s.date} ${s.time}`));
  });
  assert.equal(new Set(vaqtlar).size, vaqtlar.length, 'one channel — no two products at the same time');
  assert.deepEqual(weekly.parseJadval('Du 9:00, chor 19:30; Ya 10:00, xato'), [{ day: 1, time: '09:00' }, { day: 3, time: '19:30' }, { day: 0, time: '10:00' }]);
  bilan('kf', () => {
    store.setMSetting('jadval', weekly.parseJadval('Sha 12:00'));
    assert.equal(weekly.formatJadval(), 'Sha 12:00');
    assert.ok(weekly.weekSlots().every(s => s.time === '12:00'));
  });
});

test('owner choices are remembered per product and shown to agents', () => {
  bilan('qa', () => { store.addChoice({ title: 'Onboarding checklist', format: 'karusel', mahsulot: 'qa' }, true); store.addChoice({ title: 'Umumiy motivatsiya', format: 'post', mahsulot: 'qa' }, false, 'juda umumiy'); });
  bilan('qa', () => {
    const b = brand();
    assert.match(b, /Tasdiqlagan postlari[^\n]*Onboarding checklist/);
    assert.match(b, /Rad etganlari[^\n]*Umumiy motivatsiya" — juda umumiy/);
  });
  bilan('ka', () => assert.doesNotMatch(brand(), /Onboarding checklist/));
});

test('backup snapshot restores the whole brain', () => {
  const snap = JSON.parse(store.snapshot());
  const n = snap.ideas.length;
  bilan('qa', () => store.addIdea('Zaxiradan keyin qo‘shilgan'));
  assert.throws(() => store.restore({ foo: 1 }), /zaxirasi emas/);
  const r = store.restore(snap);
  assert.equal(r.ideas, n);
  assert.ok(!store.ideas().some(i => i.text.includes('Zaxiradan keyin')));
});
