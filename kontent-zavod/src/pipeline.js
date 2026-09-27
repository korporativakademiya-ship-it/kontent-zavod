import { cfg } from './config.js';
import { store } from './store.js';
import { research } from './agents/researcher.js';
import { plan } from './agents/strategist.js';
import { write } from './agents/copywriter.js';
import { review } from './agents/director.js';

// Rahbar agent boshqaradigan to'liq zanjir: tadqiqot → strategiya → kopirayting → tekshiruv
export async function runPipeline({ topic = null, count = cfg.dailyPosts, log = async () => {}, onDraft }) {
  await log(`🔎 Tadqiqotchi: ${topic ? `"${topic}" bo'yicha` : 'dolzarb mavzular'} izlanmoqda...`);
  const ideas = await research({ count: Math.max(count * 3, 6), topic, used: store.usedTitles() });
  await log(`💡 ${ideas.length} ta g'oya topildi. Strateg tanlamoqda...`);

  const plans = await plan(ideas, count);
  for (const p of plans) {
    try {
      await log(`✍️ Kopirayter yozmoqda: ${p.title}`);
      const copy = await write(p);
      const rev = await review(p, copy);
      const draft = store.addDraft({
        title: p.title, format: p.format, source_url: p.source_url || '',
        post_html: rev.post_html || copy.post_html, reels_script: copy.reels_script || '',
        score: rev.score, notes: rev.notes
      });
      await onDraft(draft);
    } catch (e) {
      await log(`⚠️ "${p.title}" da xato: ${e.message}`);
    }
  }
  await log('✅ Tayyor. Qoralamalar tasdiqlashda.');
}
