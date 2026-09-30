process.env.DATA_DIR = '/tmp/kz-test-publisher-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
const { store } = await import('../src/store.js');
const { publishDue } = await import('../src/publisher.js');

test('publishDue: parallel chaqiruv ikki marta joylamaydi; xato 3 marta — failed, xabar 2 ta', async () => {
  const d = store.addDraft({ title: 'P1', format: 'post', post_html: 'salom', status: 'approved', scheduledAt: new Date(Date.now() - 1000).toISOString() });
  let yuborildi = 0;
  const api = { sendMessage: async () => { yuborildi++; await new Promise(r => setTimeout(r, 20)); return { message_id: 1, chat: { id: 1 } }; } };
  const xabarlar = [];
  await Promise.all([publishDue(api, async (m) => xabarlar.push(m)), publishDue(api, async (m) => xabarlar.push(m))]);
  assert.equal(yuborildi, 1);
  assert.equal(store.get(d.id).status, 'published');

  const x = store.addDraft({ title: 'P2', format: 'post', post_html: 'salom', status: 'approved', scheduledAt: new Date(Date.now() - 1000).toISOString() });
  const yomon = { sendMessage: async () => { throw new Error('chat not found'); } };
  const bildirish = [];
  for (let i = 0; i < 5; i++) await publishDue(yomon, async (m) => bildirish.push(m));
  assert.equal(store.get(x.id).status, 'failed');
  assert.equal(store.get(x.id).publish_attempts, 3);
  assert.equal(bildirish.length, 2);
  assert.match(bildirish[1], /3 marta urinildi/);
});
