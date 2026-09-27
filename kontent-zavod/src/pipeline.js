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

export const RICH_FORMATS = ['maqola', 'karusel'];

// Maqola/karusel: slaydlarni PNG qilib chizadi va qoralamaga yozadi
export async function renderDraftSlides(draft) {
  if (!draft.slides?.length) return store.update(draft.id, { slide_paths: [] });
  const dir = path.join(cfg.dataDir, 'slides', draft.id);
  const files = await renderSlides({ signature: VIDEO_SIGNATURE, slides: draft.slides }, dir);
  return store.update(draft.id, { slide_paths: files });
}

// Rahbar agent boshqaradigan to'liq zanjir: tadqiqot → strategiya → kopirayting → tekshiruv
export async function runPipeline({ topic = null, format = null, count = cfg.dailyPosts, log = async () => {}, onDraft }) {
  await log(`🔎 Tadqiqotchi: ${topic ? `"${topic}" bo'yicha` : 'dolzarb mavzular'} izlanmoqda...`);
  const ideas = await research({ count: Math.max(count * 3, 6), topic, used: store.usedTitles() });
  await log(`💡 ${ideas.length} ta g'oya topildi. Strateg tanlamoqda...`);

  const plans = await plan(ideas, count);
  for (const p of plans) {
    p.format = format || String(p.format || 'post').toLowerCase();
    try {
      await log(`✍️ Kopirayter yozmoqda: ${p.title}`);
      const copy = await write(p);
      const rev = await review(p, copy);
      const post_html = rev.post_html || copy.post_html;
      let art = null;
      if (RICH_FORMATS.includes(p.format)) {
        await log(`📰 Maqola/karusel yozilmoqda: ${p.title}`);
        art = await writeArticle(p, { post_html });
      }
      let draft = store.addDraft({
        title: p.title, format: p.format, source_url: p.source_url || '', plan: p,
        post_html, reels_script: copy.reels_script || '',
        article_html: art?.article_html || '', slides: art?.slides || [],
        score: rev.score, notes: rev.notes
      });
      if (art) {
        try { draft = await renderDraftSlides(draft); }
        catch (e) { await log(`⚠️ Slaydlar chizilmadi (${p.title}): ${e.message}`); }
      }
      await onDraft(draft);
    } catch (e) {
      await log(`⚠️ "${p.title}" da xato: ${e.message}`);
    }
  }
  await log('✅ Tayyor. Qoralamalar tasdiqlashda.');
}
