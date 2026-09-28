import test from 'node:test';
import assert from 'node:assert/strict';
import { topish, royxat, royxatMatni, rejaPlan, goyaMatni } from '../src/kontentReja.js';
import { ctaRule, ensureLink } from '../src/cta.js';

test('the ready content plan has 50 posts per product with unique codes and links', () => {
  for (const p of ['ka', 'qa', 'kf']) assert.equal(royxat(p).length, 50);
  const kodlar = royxat().map(r => r.kod);
  assert.equal(new Set(kodlar).size, 150);
  const r = topish('QA07');
  assert.equal(r.mahsulot, 'Qadam AI');
  assert.match(r.havola, /start=qa07$/);
  assert.equal(topish('zz01'), null);
  assert.match(royxatMatni('kf', 2), /Kontent Fabrika \(2\/4\)/);
  assert.match(goyaMatni(r), /^\[qa07\] Qadam AI/);
});

test('a plan item becomes a copywriter brief whose CTA points to its own link', () => {
  const r = topish('ka01');
  const p = rejaPlan(r, 'karusel');
  assert.equal(p.format, 'karusel');
  assert.equal(p.cta_havola, r.havola);
  assert.match(ctaRule('', p.cta_havola, p.cta_matn), /start=ka01/);
  assert.match(ctaRule('KPI'), /Direktga <b>KPI<\/b>/);
  assert.match(ensureLink('Post matni', r.havola, 'Botga yozing'), /<a href="https:\/\/t\.me\/onlayn_yordamchim\?start=ka01">Botga yozing<\/a>$/);
  const bor = `Matn <a href="${r.havola}">x</a>`;
  assert.equal(ensureLink(bor, r.havola), bor);
});
