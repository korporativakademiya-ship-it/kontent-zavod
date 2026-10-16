process.env.DATA_DIR = '/tmp/kz-test-barqarorlik-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const { store } = await import('../src/store.js');
const { ideaBank } = await import('../src/insights.js');
const { publish, AllaqachonChiqqan } = await import('../src/publisher.js');
const { tozala } = await import('../src/tozalash.js');
const kontent = await import('../src/agents/kontent.js');

test("g'oyalar banki: AI g'oyalari rahbar g'oyalarini siqib chiqarmaydi", () => {
  const rahbar = store.addIdea('Rahbarning muhim g\'oyasi');
  for (let i = 0; i < 400; i++) store.addIdea(`AI g'oya ${i}`, { manba: 'ai' });
  assert.ok(store.allIdeas().some(i => i.id === rahbar.id), "rahbar g'oyasi bankda qoladi");
  assert.ok(store.allIdeas().length <= 300);
  assert.ok(store.allIdeas().some(i => i.text === "AI g'oya 399"), "eng yangi AI g'oyasi qoladi");
  const bank = ideaBank();
  assert.match(bank, /RAHBARNING O'Z G'OYALARI[^]*Rahbarning muhim/);
  assert.match(bank, /G'OYA OVCHISI TOPGANLARI[^]*AI g'oya 399/);
  assert.doesNotMatch(bank.split("G'OYA OVCHISI")[0], /AI g'oya/, "AI g'oyasi rahbar g'oyasi deb ko'rsatilmaydi");
});

test("dayjestdan tanlangan g'oya bankda 'ishlatildi' bo'ladi", () => {
  const g = store.addIdea('Dayjest g\'oyasi', { manba: 'ai' });
  store.setSetting('kunlik_goyalar', { at: new Date().toISOString(), goyalar: [{ n: 1, goya: g.text, idea_id: g.id, tur: 'matn' }] });
  const r = kontent.goyaTanla({ n: 1 });
  assert.match(r.goya, /Dayjest g'oyasi/);
  assert.equal(store.allIdeas().find(i => i.id === g.id).used, true);
});

test('publish: ⚡ Hozir ikki marta bosilsa ham post bir marta chiqadi', async () => {
  const d = store.addDraft({ title: 'Ikki marta', format: 'post', post_html: 'salom', status: 'pending' });
  let yuborildi = 0;
  const api = { sendMessage: async () => { yuborildi++; await new Promise(r => setTimeout(r, 20)); return { message_id: 7, chat: { id: 1 } }; } };
  const natija = await Promise.allSettled([publish(api, d), publish(api, d)]);
  assert.equal(yuborildi, 1);
  assert.equal(natija.filter(x => x.status === 'rejected' && x.reason instanceof AllaqachonChiqqan).length, 1);
  await assert.rejects(publish(api, d), AllaqachonChiqqan, 'chiqqan post qayta chiqmaydi');
  assert.equal(yuborildi, 1);
});

test('tozalash: eski qoralamalar va fayllari o\'chadi, navbatdagilar va yangilari qoladi', () => {
  const eski = new Date(Date.now() - 200 * 864e5).toISOString();
  const chiqqan = store.addDraft({ title: 'Eski', format: 'post', post_html: 'x', status: 'published' });
  store.update(chiqqan.id, { publishedAt: eski });
  const dir = path.join(process.env.DATA_DIR, 'images', chiqqan.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.jpg'), 'x');
  store.update(chiqqan.id, { image_paths: [path.join(dir, 'a.jpg')] });
  const navbat = store.addDraft({ title: 'Navbatda', format: 'post', post_html: 'x', status: 'approved' });
  store.update(navbat.id, { createdAt: eski });
  const yangi = store.addDraft({ title: 'Yangi', format: 'post', post_html: 'x', status: 'published' });
  store.update(yangi.id, { publishedAt: new Date().toISOString() });

  const r = tozala();
  assert.ok(r.qoralama >= 1);
  assert.equal(store.get(chiqqan.id), undefined);
  assert.equal(fs.existsSync(dir), false);
  assert.ok(store.get(navbat.id), 'navbatdagi qoralama tegilmaydi');
  assert.ok(store.get(yangi.id));
});
