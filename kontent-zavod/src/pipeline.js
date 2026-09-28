import path from 'node:path';
import { cfg } from './config.js';
import { store } from './store.js';
import { research } from './agents/researcher.js';
import { plan } from './agents/strategist.js';
import { write } from './agents/copywriter.js';
import { review } from './agents/director.js';
import { writeArticle } from './agents/article.js';
import { renderSlides } from './video/slides.js';
import { VIDEO_SIGNATURE } from './brand.js';
import { uniqueCode, ensureCode } from './cta.js';

export const RICH_FORMATS = ['maqola', 'karusel'];

// Maqola/karusel: slaydlarni PNG qilib chizadi va qoralamaga yozadi
export async function renderDraftSlides(draft) {
  if (!draft.slides?.length) return store.update(draft.id, { slide_paths: [] });
  const dir = path.join(cfg.dataDir, 'slides', draft.id);
  const files = await renderSlides({ signature: VIDEO_SIGNATURE, slides: draft.slides }, dir);
  return store.update(draft.id, { slide_paths: files });
}

// Bitta reja bandidan qoralama: kopirayting → tekshiruv → (maqola/karusel) → slaydlar.
// extra — qoralamaga qo'shimcha maydonlar (masalan reja vaqti)
export async function produceDraft(p, { log = async () => {}, extra = {} } = {}) {
  p.format = String(p.format || 'post').toLowerCase();
  // Direkt CTA'li postga noyob kod: kim qaysi postdan yozgani kod so'zidan bilinadi
  p.cta_kod = String(p.cta_goal || '').toLowerCase() === 'direkt' ? uniqueCode(p.cta_kod || p.title) : '';
  await log(`✍️ Kopirayter yozmoqda: ${p.title}`);
  const copy = await write(p);
  const rev = await review(p, copy);
  const post_html = ensureCode(rev.post_html || copy.post_html, p.cta_kod);
  let art = null;
  if (RICH_FORMATS.includes(p.format)) {
    await log(`📰 Maqola/karusel yozilmoqda: ${p.title}`);
    art = await writeArticle(p, { post_html });
  }
  let draft = store.addDraft({
    title: p.title, format: p.format, source_url: p.source_url || '', plan: p, cta_kod: p.cta_kod,
    post_html, reels_script: copy.reels_script || '',
    article_html: art?.article_html || '', slides: art?.slides || [],
    score: rev.score, notes: rev.notes, ...extra
  });
  if (art) {
    try { draft = await renderDraftSlides(draft); }
    catch (e) { await log(`⚠️ Slaydlar chizilmadi (${p.title}): ${e.message}`); }
  }
  return draft;
}

// Rahbar agent boshqaradigan to'liq zanjir: tadqiqot → strategiya → kopirayting → tekshiruv
export async function runPipeline({ topic = null, format = null, count = cfg.dailyPosts, log = async () => {}, onDraft }) {
  await log(`🔎 Tadqiqotchi: ${topic ? `"${topic}" bo'yicha` : 'dolzarb mavzular'} izlanmoqda...`);
  const ideas = await research({ count: Math.max(count * 3, 6), topic, used: store.usedTitles() });
  await log(`💡 ${ideas.length} ta g'oya topildi. Strateg tanlamoqda...`);

  const plans = await plan(ideas, count);
  for (const p of plans) {
    if (format) p.format = format;
    try {
      await onDraft(await produceDraft(p, { log }));
    } catch (e) {
      await log(`⚠️ "${p.title}" da xato: ${e.message}`);
    }
  }
  await log('✅ Tayyor. Qoralamalar tasdiqlashda.');
}
