import path from 'node:path';
import { cfg } from './config.js';
import { store } from './store.js';
import { research } from './agents/researcher.js';
import { plan } from './agents/strategist.js';
import { write } from './agents/copywriter.js';
import { review } from './agents/director.js';
import { writeArticle } from './agents/article.js';
import { renderSlides } from './video/slides.js';
import { videoYasa } from './video/kino.js';
import { prodyuser, rasmPrompti } from './agents/kontent.js';
import { rasmYoqilgan, rasmYasa } from './rasm.js';
import { muqovaYasa } from './muqova.js';
import { joriy } from './mahsulot.js';
import { imzo } from './brand.js';
import { uniqueCode, ensureCode, ensureLink } from './cta.js';
import { topish } from './kontentReja.js';
import { factCheck, applyFixes, factSummary } from './agents/factcheck.js';

export const RICH_FORMATS = ['maqola', 'karusel'];

// Maqola/karusel: slaydlarni PNG qilib chizadi va qoralamaga yozadi
export async function renderDraftSlides(draft) {
  if (!draft.slides?.length) return store.update(draft.id, { slide_paths: [] });
  const dir = path.join(cfg.dataDir, 'slides', draft.id);
  const files = await renderSlides({ signature: imzo(), slides: draft.slides }, dir);
  return store.update(draft.id, { slide_paths: files });
}

// Bitta reja bandidan qoralama: prodyuser TZ → kopirayting → tekshiruv → (maqola/karusel) → slaydlar → (rasm / video).
// extra — qoralamaga qo'shimcha maydonlar (masalan reja vaqti)
export async function produceDraft(p, { log = async () => {}, extra = {} } = {}) {
  p.format = String(p.format || 'post').toLowerCase();
  // Prodyuser: reja bandini TZ ga aylantiradi (ilmoq, tuzilma, dalil, taqiqlar, rasm kerakmi) va ijrochilarga beradi:
  // matn — kopirayter, rasm — rassom (Gemini), reels — video. Format va rubrika rejadagicha qoladi. O'chirish: PRODYUSER=0
  let tz = null;
  // Kim nima qildi — prodyuser yakunda rahbarga ko'rsatadi ("falon agentlar ishladi, natija — tayyor post")
  const ishlar = [];
  if (process.env.PRODYUSER !== '0' && !p.tz) {
    try {
      await log(`🎬 Prodyuser TZ yozmoqda: ${p.title}`);
      tz = await prodyuser(`${p.title}${p.angle ? ` — ${p.angle}` : ''}. Format: ${p.format} (o'zgartirma)${p.rubric ? `, rubrika: ${p.rubric}` : ''}.`,
        { mahsulot: joriy() || undefined });
      p.tz = { taklif: tz.taklif, ilmoq: tz.ilmoq, tuzilma: tz.tuzilma, asosiy_fikr: tz.asosiy_fikr, dalil: tz.dalil,
        taqiqlar: tz.taqiqlar, auditoriya: tz.auditoriya, ichki_format: tz.format };
      if (!p.hook && tz.ilmoq) p.hook = tz.ilmoq;
      ishlar.push('🎬 Prodyuser (TZ)');
    } catch (e) { await log(`⚠️ Prodyuser TZ yozmadi (${p.title}): ${e.message} — reja bo'yicha yoziladi`); }
  }
  // Tayyor rejadagi g'oya ("[qa07] ...") bo'lsa — CTA o'sha rejaning havolasiga olib boradi
  if (p.idea_id && !p.cta_havola) {
    const kod = (/^\[([a-z]{2}\d{2})\]/.exec(store.ideas().find(i => i.id === String(p.idea_id))?.text || '') || [])[1];
    const r = kod && topish(kod);
    if (r) Object.assign(p, { cta_goal: 'havola', cta_kod: '', cta_havola: r.havola, cta_matn: r.cta, reja_kod: r.kod });
  }
  // Direkt CTA'li postga noyob kod: kim qaysi postdan yozgani kod so'zidan bilinadi
  p.cta_kod = String(p.cta_goal || '').toLowerCase() === 'direkt' ? uniqueCode(p.cta_kod || p.title) : '';
  await log(`✍️ Kopirayter yozmoqda: ${p.title}`);
  const copy = await write(p);
  const rev = await review(p, copy);
  ishlar.push('✍️ Kopirayter', `🧐 Rahbar tekshiruvi (${rev.score ?? '-'}/10)`);
  const post_html = ensureLink(ensureCode(rev.post_html || copy.post_html, p.cta_kod), p.cta_havola, p.cta_matn);
  let art = null;
  if (RICH_FORMATS.includes(p.format)) {
    await log(`📰 Maqola/karusel yozilmoqda: ${p.title}`);
    art = await writeArticle(p, { post_html });
    ishlar.push(p.format === 'karusel' ? `🎠 Karusel (${art?.slides?.length || 0} slayd)` : '📰 Maqola muallifi');
  }
  // Fakt tekshiruvi: raqam va da'volar internetdan tekshiriladi, noto'g'risi tuzatiladi
  let texts = { post_html, article_html: art?.article_html || '' }, fact = '';
  if (cfg.factCheck) {
    try {
      await log(`🔎 Fakt tekshiruvchi: ${p.title}`);
      const fc = await factCheck({ title: p.title, source_url: p.source_url, ...texts });
      // Matnda aynan topilgan tuzatishlar soni (post yoki maqolada)
      const fixed = fc.replacements.filter(r => texts.post_html.includes(r.find) || texts.article_html.includes(r.find)).length;
      texts = { post_html: applyFixes(texts.post_html, fc.replacements).html, article_html: applyFixes(texts.article_html, fc.replacements).html };
      fact = factSummary(fc, fixed);
      ishlar.push(`🔎 Fakt tekshiruvchi${fixed ? ` (${fixed} ta tuzatdi)` : ''}`);
    } catch (e) { fact = `🔎 Fakt tekshiruvi bajarilmadi: ${e.message}`; }
  }
  if (p.idea_id) store.markIdeas([String(p.idea_id)]); // rahbar g'oyasi ishlatildi
  let draft = store.addDraft({
    title: p.title, format: p.format, source_url: p.source_url || '', plan: p, cta_kod: p.cta_kod,
    post_html: texts.post_html, reels_script: copy.reels_script || '',
    article_html: texts.article_html, slides: art?.slides || [],
    score: rev.score, notes: [tz?.taklif ? `🎬 Prodyuser: ${String(tz.taklif).slice(0, 200)}` : '', rev.notes, fact].filter(Boolean).join('\n'),
    ...(tz ? { tz } : {}), ...extra
  });
  if (art) {
    try { draft = await renderDraftSlides(draft); }
    catch (e) { await log(`⚠️ Slaydlar chizilmadi (${p.title}): ${e.message}`); }
  }
  // Rassom: prodyuser rasm so'ragan bo'lsa (matn+rasm). GEMINI_API_KEY bo'lsa — AI rasm; kalit yo'q yoki AI rasm
  // chizilmasa — Claude dizayner kartochkasi (kalit kerak emas). O'chirish: AVTO_RASM=0
  const rasmKerak = tz && (tz.kontent_turi === 'matn+rasm' || String(tz.rasm_tavsif || '').trim());
  if (rasmKerak && p.format === 'post' && process.env.AVTO_RASM !== '0') {
    let fayl = null;
    if (rasmYoqilgan()) {
      try {
        await log(`🎨 Rasm chizilmoqda: ${p.title}`);
        fayl = await rasmYasa(await rasmPrompti(draft), path.join(cfg.dataDir, 'images', draft.id, `ai-${Date.now()}`));
        ishlar.push('🎨 Rassom (AI rasm)');
      } catch (e) { await log(`⚠️ AI rasm chizilmadi (${p.title}): ${e.message} — dizayn kartochka yasaladi`); }
    }
    if (!fayl) {
      try {
        await log(`🎨 Dizayner kartochka yasamoqda: ${p.title}`);
        fayl = (await muqovaYasa(draft)).file;
        ishlar.push('🎨 Dizayner (kartochka)');
      } catch (e) { await log(`⚠️ Kartochka yasalmadi (${p.title}): ${e.message}`); }
    }
    if (fayl) draft = store.update(draft.id, { image_paths: [...(draft.image_paths || []), fayl] });
  }
  // Reels — video ham o'zi yasaladi (avto rejimda matn videosiz chiqib ketmasin). O'chirish: AVTO_VIDEO=0
  if (p.format === 'reels' && process.env.AVTO_VIDEO !== '0') {
    try {
      await log(`🎥 Video yasalmoqda: ${p.title}`);
      const v = await videoYasa(draft, { log });
      draft = store.update(draft.id, { video_path: v.file, video_duration: v.duration, motion: v.data });
      ishlar.push(`🎥 Video (${Math.round(v.duration)} s${v.voiced ? ', ovozli' : ''})`);
    } catch (e) { await log(`⚠️ Video yasalmadi (${p.title}): ${e.message} — post matn bo'lib qoladi, 🎥 bilan qayta urinib ko'ring`); }
  }
  return store.update(draft.id, { ishlar, notes: [`🏭 Ishladi: ${ishlar.join(' → ')}`, draft.notes].filter(Boolean).join('\n') });
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
