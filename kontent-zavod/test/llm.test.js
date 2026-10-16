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
