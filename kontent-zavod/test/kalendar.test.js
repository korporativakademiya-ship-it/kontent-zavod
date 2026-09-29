import test from 'node:test';
import assert from 'node:assert/strict';
process.env.PRODUCT_TOPICS = 'ka:867,qa:869,kf:871';
process.env.DATA_DIR = '/tmp/kz-test-kalendar'; // boshqa test fayllari bilan parallel yozmaslik uchun
const { bilan } = await import('../src/mahsulot.js');
const { store } = await import('../src/store.js');
const { snapshot, applyAction } = await import('../src/kalendar.js');
const weekly = await import('../src/weekly.js');

const H = 3600e3, iso = (h) => new Date(Date.now() + h * H).toISOString();

test('snapshot: posts by status, plan items, ideas and products', () => {
  const d = bilan('qa', () => store.addDraft({ title: 'Kal: rejadagi', format: 'post', post_html: '<b>Matn</b>' }));
  store.update(d.id, { status: 'approved', scheduledAt: iso(30) });
  bilan('ka', () => store.addIdea('Kal: g\'oya'));
  const s = snapshot();
  const it = s.items.find(x => x.id === `d:${d.id}`);
  assert.equal(it.holat, 'rejada'); assert.equal(it.mahsulot, 'qa'); assert.equal(it.matn, 'Matn');
  assert.ok(s.goyalar.some(g => g.text === "Kal: g'oya" && g.mahsulot === 'ka'));
  assert.deepEqual(Object.keys(s.mahsulotlar), ['ka', 'qa', 'kf']);
});

test('joylash: idea becomes a manual plan item; weekly plan stays untouched', () => {
  const g = bilan('kf', () => store.addIdea('Kal: joylanadigan g\'oya'));
  const r = applyAction({ tur: 'joylash', malumot: { idea_id: g.id, at: iso(20), format: 'karusel' } });
  assert.equal(r.ok, true, r.natija);
  const p = store.allPlans().find(x => x.qolda && x.items.some(i => i.idea_id === g.id));
  assert.equal(p.mahsulot, 'kf'); assert.equal(p.items[0].format, 'karusel');
  assert.equal(store.allIdeas().find(i => i.id === g.id).used, true);
  assert.equal(weekly.hasDueManual(), true);
  assert.equal(bilan('kf', () => weekly.currentPlan()), undefined); // qo'lda band haftalik reja emas
  // Qayta joylab bo'lmaydi; o'tgan vaqtga ham
  assert.equal(applyAction({ tur: 'joylash', malumot: { idea_id: g.id, at: iso(30) } }).ok, false);
});

test('kochir / olib_tashla on drafts and plan items; published posts are protected', () => {
  const d = bilan('ka', () => store.addDraft({ title: 'Kal: ko\'chiriladi', format: 'post', post_html: 'x', plannedAt: iso(40) }));
  assert.equal(applyAction({ tur: 'kochir', malumot: { ref: `d:${d.id}`, at: iso(50) } }).ok, true);
  assert.equal(store.get(d.id).plannedAt.slice(0, 16), iso(50).slice(0, 16));
  assert.equal(applyAction({ tur: 'kochir', malumot: { ref: `d:${d.id}`, at: iso(-1) } }).ok, false);
  assert.equal(applyAction({ tur: 'olib_tashla', malumot: { ref: `d:${d.id}` } }).ok, true);
  assert.equal(store.get(d.id).plannedAt, null);

  const g = bilan('qa', () => store.addIdea('Kal: rejadan olinadigan'));
  applyAction({ tur: 'joylash', malumot: { idea_id: g.id, at: iso(60) } });
  const p = store.allPlans().find(x => x.items.some(i => i.idea_id === g.id));
  const ref = `p:${p.id}:${p.items[0].id}`;
  assert.equal(applyAction({ tur: 'kochir', malumot: { ref, at: iso(70) } }).ok, true);
  assert.equal(applyAction({ tur: 'olib_tashla', malumot: { ref } }).ok, true);
  assert.equal(p.items.length, 0);
  assert.equal(store.allIdeas().find(i => i.id === g.id).used, false); // g'oya bankka qaytdi

  const pub = store.addDraft({ title: 'Kal: chiqqan', format: 'post', post_html: 'x' });
  store.update(pub.id, { status: 'published', publishedAt: iso(-2) });
  assert.equal(applyAction({ tur: 'kochir', malumot: { ref: `d:${pub.id}`, at: iso(5) } }).ok, false);
});
