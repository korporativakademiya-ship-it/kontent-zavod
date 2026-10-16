process.env.DATA_DIR = '/tmp/kz-test-llm-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
const { apiParams } = await import('../src/llm.js');

test("API so'rovi: joriy model — yangi qidiruv va fallbacks, eski model — oddiy qidiruv", () => {
  const p = apiParams({ model: 'claude-opus-5-5', system: 's', prompt: 'p', search: true, maxTokens: 4000 });
  assert.equal(p.max_tokens, 16000, 'fikrlash uchun joy');
  assert.equal(p.tools[0].type, 'web_search_20260209');
  assert.deepEqual([p.betas, p.fallbacks], [['server-side-fallback-2026-07-01'], 'default']);
  const e = apiParams({ model: 'claude-haiku-4-5', system: 's', prompt: 'p', search: true, maxTokens: 30000 });
  assert.equal(e.tools[0].type, 'web_search_20250305');
  assert.equal(e.max_tokens, 30000);
  assert.equal(e.fallbacks, undefined);
  assert.equal(apiParams({ model: 'claude-sonnet-5-5', system: '', prompt: '' }).fallbacks, 'default');
});

test("vaqt chegarasi: qotib qolgan Claude chaqiruvi bekor qilinadi, bot 'band' holatda qolib ketmaydi", async () => {
  const { askMax, vaqtBilan } = await import('../src/llm.js');
  let berilgan;
  const qotgan = ({ options }) => { berilgan = options.abortController; return { async *[Symbol.asyncIterator]() { await new Promise(() => {}); } }; };
  const boshi = Date.now();
  await assert.rejects(askMax({ system: 's', prompt: 'p' }, { queryFn: qotgan, ms: 50 }), /javob bermadi — so'rov bekor qilindi/);
  assert.ok(Date.now() - boshi < 2000);
  assert.equal(berilgan.signal.aborted, true, 'Agent SDK jarayoni ham to\'xtatiladi');

  const tayyor = () => (async function* () { yield { type: 'assistant' }; yield { type: 'result', subtype: 'success', is_error: false, result: 'salom' }; })();
  assert.equal(await askMax({ system: 's', prompt: 'p' }, { queryFn: tayyor, ms: 1000 }), 'salom');
  assert.equal(await vaqtBilan(async () => 7, 1000, 'x'), 7);
});
