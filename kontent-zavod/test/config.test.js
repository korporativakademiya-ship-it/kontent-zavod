Object.assign(process.env, { BOT_TOKEN: 'test', ADMIN_IDS: '111, 222', ADMIN_IDS_QOSHIMCHA: '6720922604,222' });
import test from 'node:test';
import assert from 'node:assert/strict';
const { cfg } = await import('../src/config.js');

test("rahbarlar: ADMIN_IDS_QOSHIMCHA asosiy ro'yxatga qo'shiladi, takror bo'lmaydi", () => {
  assert.deepEqual(cfg.admins, [111, 222, 6720922604]);
});
