import { store } from './store.js';
import { TURLAR } from './agents/kontent.js';

// Rahbar bilan Telegram suhbati (n8n bot orqali): har chatning bosqichi eslab qolinadi,
// tasdiqlash — xabardagi tugmalar, tuzatish — oddiy xabar. Forma yo'q.
//
// Bosqichlar: bosh → tz (TZ tasdiqda) → matn (matn tasdiqda) → [ishlab chiqarish] → joyla → bosh
// Kutilayotgan matn: tz_tuzatish, matn_tahrir, matn_izoh, joyla_vaqt.
// Javob: { xabarlar: [{ matn, klaviatura: null|'tz'|'matn'|'joyla' }], keyingi: null|{ tur, draft_id, ... } }

const BAND_MS = 10 * 60e3;
const kalit = (chatId) => `suhbat:${chatId}`;
const holat = (chatId) => store.setting(kalit(chatId), { bosqich: 'bosh' });
const saqla = (chatId, h) => store.setSetting(kalit(chatId), { ...h, at: Date.now() });

const YORDAM = `Salom! Men kontent bo'limingizman.

• G'oya yozing — prodyuser TZ tayyorlaydi
• goyalar — hozir 5 ta g'oya · 1–5 — dayjestdan tanlash
• kanal: @nom — nima uchun · kanallar · kanal o'chir: @nom
• uslub — @kanalingizdagi postlardan uslubingizni qayta o'rganish
• bekor — joriy ishni to'xtatish

Tasdiqlash — xabar ostidagi tugmalar bilan, tuzatish — oddiy xabar bilan.`;

const q = (v) => (Array.isArray(v) ? v.filter(Boolean).join('; ') : v || '—');
const ro = (v) => (Array.isArray(v) ? v.filter(Boolean).map(x => `  • ${x}`).join('\n') : `  ${v || '—'}`);

export function tzMatni(t) {
  return `💬 ${t.taklif}

📋 ${t.sarlavha}
🎯 Strategiya: ${q(t.strategiya)}
📦 Mahsulot: ${t.mahsulot}
👥 Auditoriya: ${q(t.auditoriya)}
🧩 Kontent turi: ${TURLAR[t.kontent_turi]?.nom || t.kontent_turi}
🗂 Rubrika: ${q(t.rubrika)} · Format: ${q(t.format)}
🪝 Ilmoq: ${q(t.ilmoq)}${(t.ilmoq_variantlari || []).length ? `\n   muqobil: ${q(t.ilmoq_variantlari)}` : ''}
🧱 Tuzilma:
${ro(t.tuzilma)}
💡 Asosiy fikr: ${q(t.asosiy_fikr)}
📎 Dalil: ${q(t.dalil)}
📣 CTA: ${q(t.cta?.matn)}${t.cta?.kod ? ` (kod: ${t.cta.kod})` : ''}
🚫 Taqiqlar: ${q(t.taqiqlar)}
⚠️ Xavflar:
${ro(t.xavflar)}

✅ — tasdiqlash · ✏️ — tuzatish (yoki shunchaki tuzatishingizni yozing)`.slice(0, 4000);
}

const tanqidMatni = (t) => `🧐 Tanqidchi: ${t.baho}/10
✅ Kuchli: ${q(t.kuchli)}
⚠️ Zaif: ${q(t.zaif)}
📚 Saboq: ${t.saboq || '—'}
🔮 Kutilgan natija: ${t.kutilgan_natija || '—'}

📢 Kanalga joylaymi?`;

const xab = (matn, klaviatura = null) => ({ matn: String(matn).slice(0, 4000), klaviatura });

// k — agentlar (kontent.js va kuzatuv.js funksiyalari); test uchun almashtiriladi
export async function suhbat({ chatId, text = '', tugma = '', hodisa = '' }, k) {
  if (!chatId) throw Object.assign(new Error('chatId kerak'), { kod: 400 });
  const t = String(text || '').trim();
  const kichik = t.toLowerCase().replace(/[ʻ‘’`]/g, "'");
  let h = holat(chatId);

  // Buyruqlar — istalgan bosqichda
  if (kichik === '/start' || kichik === 'yordam') return { xabarlar: [xab(YORDAM)] };
  if (kichik === 'bekor' || tugma === 'stop') {
    saqla(chatId, { bosqich: 'bosh' });
    return { xabarlar: [xab("🛑 To'xtatildi. Yangi g'oya yozing yoki \"goyalar\".")] };
  }
  if (/^kanallar$/.test(kichik) || /^kanal( o'?chir| ochir)?\s*:/.test(kichik)) {
    let list;
    if (/^kanallar$/.test(kichik)) list = k.kanallar();
    else if (/^kanal (o'?chir|ochir)\s*:/.test(kichik)) list = k.kanalOchir(t.split(':').slice(1).join(':').trim());
    else {
      const [nom, ...iz] = t.split(':').slice(1).join(':').split(/\s[—-]\s/);
      list = k.kanalQosh(nom.trim(), iz.join(' — ').trim());
    }
    return { xabarlar: [xab(`👀 Kuzatiladigan kanallar (${list.length}):\n${list.map((x, i) => `${i + 1}) ${x.platforma === 'instagram' ? '📸' : '✈️'} @${x.nom}${x.izoh ? ` — ${x.izoh}` : ''}`).join('\n') || "hali yo'q"}\n\nQo'shish: kanal: @nom — nima uchun\nO'chirish: kanal o'chir: @nom`)] };
  }
  if (kichik === 'uslub') {
    const r = await k.uslubKanaldan({});
    return { xabarlar: [xab(`✍️ @${r.kanal} dan ${r.qoshildi} ta post o'rganildi (jami namunalar: ${r.jami}).\n\n${r.guide}`)] };
  }
  if (/^(g'?oyalar|goyalar)$/.test(kichik)) {
    const r = await k.kunlikGoyalar({ soni: 5 });
    return { xabarlar: [xab(k.dayjestMatni(r))] };
  }

  if (h.band && Date.now() - h.band < BAND_MS && !hodisa) return { xabarlar: [xab('⏳ Hali oldingi bosqich ustida ishlayapman, biroz kuting.')] };
  const band = async (fn) => {
    saqla(chatId, { ...h, band: Date.now() });
    try { return await fn(); } catch (e) { saqla(chatId, { ...h, band: 0 }); throw e; }
  };

  // Ishlab chiqarish tugadi (n8n: rasm/video tayyor) → tanqidchi → joylash savoli
  if (hodisa === 'media_tayyor' || hodisa === 'tanqid') {
    if (!h.draft_id) return { xabarlar: [] };
    const tq = await band(() => k.tanqid({ draft_id: h.draft_id }));
    saqla(chatId, { ...h, bosqich: 'joyla', band: 0 });
    return { xabarlar: [xab(tanqidMatni(tq), 'joyla')] };
  }

  const tzYubor = async (tz) => {
    saqla(chatId, { ...h, bosqich: 'tz', tz, band: 0 });
    return { xabarlar: [xab(tzMatni(tz), 'tz')] };
  };
  const matnYubor = async (r, qo = {}) => {
    saqla(chatId, { ...h, ...qo, bosqich: 'matn', draft_id: r.draft_id, kontent_turi: r.kontent_turi || h.kontent_turi, band: 0 });
    return { xabarlar: [xab(r.korinish, 'matn')] };
  };

  // Tugmalar
  if (tugma) {
    const [bosqich] = tugma.split('_');
    const kutilgan = { tz: ['tz', 'tz_tuzatish'], m: ['matn', 'matn_tahrir', 'matn_izoh'], j: ['joyla', 'joyla_vaqt'] }[bosqich] || [];
    if (!kutilgan.includes(h.bosqich)) return { xabarlar: [xab('Bu tugma eskirgan — oxirgi xabardagi tugmalardan foydalaning.')] };

    if (tugma === 'tz_ok') {
      const r = await band(() => k.muallif(h.tz));
      return matnYubor(r, { variant: 0 });
    }
    if (tugma === 'tz_edit') { saqla(chatId, { ...h, bosqich: 'tz_tuzatish' }); return { xabarlar: [xab("✏️ Nimani o'zgartiray? Oddiy xabar bilan yozing.")] }; }
    if (tugma === 'm_edit') {
      saqla(chatId, { ...h, bosqich: 'matn_tahrir' });
      const d = k.qoralama(h.draft_id);
      return { xabarlar: [xab("✏️ Matnni nusxa oling, tuzating va to'liq holda yuboring:"), xab(k.tozaMatn(d))] };
    }
    if (tugma === 'm_izoh') { saqla(chatId, { ...h, bosqich: 'matn_izoh' }); return { xabarlar: [xab('🔄 Izohingizni yozing — shunga qarab qayta yozaman.')] }; }
    if (tugma === 'm_ok') {
      await band(() => k.tasdiq({ draft_id: h.draft_id }));
      if (h.kontent_turi === 'reels' || h.kontent_turi === 'matn+rasm') {
        const ic = await band(() => k.ishlabChiqarish({ draft_id: h.draft_id, variant: h.variant || 0 }));
        saqla(chatId, { ...h, bosqich: 'ishlab', band: Date.now() });
        return { xabarlar: [xab(h.kontent_turi === 'reels' ? '🏭 Matn tasdiqlandi. Rejissyor va prompt muhandisi tayyor — rasm, ovoz va video yasalyapti (3–5 daqiqa)…' : '🏭 Matn tasdiqlandi. Rasm chizilyapti…')],
          keyingi: { ...ic, draft_id: h.draft_id } };
      }
      const tq = await band(() => k.tanqid({ draft_id: h.draft_id }));
      saqla(chatId, { ...h, bosqich: 'joyla', band: 0 });
      return { xabarlar: [xab(tanqidMatni(tq), 'joyla')] };
    }
    if (tugma === 'j_ok') {
      const r = k.joyla({ draft_id: h.draft_id });
      saqla(chatId, { bosqich: 'bosh' });
      return { xabarlar: [xab(`📅 Tayyor! ${r.kanal} kanaliga ${r.vaqt} da chiqadi.`)] };
    }
    if (tugma === 'j_vaqt') { saqla(chatId, { ...h, bosqich: 'joyla_vaqt' }); return { xabarlar: [xab("🕒 Qachon? Masalan: 19:00, ertaga 09:00, 03.10 18:30")] }; }
    if (tugma === 'j_no') { saqla(chatId, { bosqich: 'bosh' }); return { xabarlar: [xab('🗂 Joylanmadi, post Fabrikada saqlanib qoldi.')] }; }
    return { xabarlar: [xab("Noma'lum tugma.")] };
  }

  if (!t) return { xabarlar: [] };

  // Kutilayotgan matnlar
  if (h.bosqich === 'tz' || h.bosqich === 'tz_tuzatish') {
    const tz = await band(() => k.prodyuser(h.goya, { izoh: t, oldingi: h.tz }));
    return tzYubor(tz);
  }
  if (h.bosqich === 'matn' || h.bosqich === 'matn_tahrir' || h.bosqich === 'matn_izoh') {
    const d = k.qoralama(h.draft_id);
    if (h.bosqich === 'matn' && /^\d$/.test(t) && d?.reels?.variantlar?.length > 1) {
      const v = Math.min(d.reels.variantlar.length, Number(t)) - 1;
      saqla(chatId, { ...h, variant: v });
      return { xabarlar: [xab(`🎬 ${v + 1}-variant tanlandi.`, 'matn')] };
    }
    // Tugmasiz yozilgan matn: uzun bo'lsa — rahbar tuzatgan matn, qisqa bo'lsa — izoh
    const asl = k.tozaMatn(d).length;
    const tahrir = h.bosqich === 'matn_tahrir' || (h.bosqich === 'matn' && t.length >= Math.max(200, asl * 0.5));
    const r = await band(() => k.tasdiq(tahrir ? { draft_id: h.draft_id, matn: t } : { draft_id: h.draft_id, qaror: 'qayta', izoh: t }));
    return matnYubor({ ...r, kontent_turi: h.kontent_turi });
  }
  if (h.bosqich === 'joyla' || h.bosqich === 'joyla_vaqt') {
    let r;
    try { r = k.joyla({ draft_id: h.draft_id, vaqt: t, qatiy: true }); }
    catch (e) { if (e.kod === 400) return { xabarlar: [xab(`🕒 ${e.message}. Masalan: 19:00, ertaga 09:00, 03.10 18:30`, 'joyla')] }; throw e; }
    saqla(chatId, { bosqich: 'bosh' });
    return { xabarlar: [xab(`📅 Tayyor! ${r.kanal} kanaliga ${r.vaqt} da chiqadi.`)] };
  }

  // Yangi g'oya: dayjest raqami yoki matn
  let goya = t;
  if (/^\d{1,2}$/.test(t)) goya = k.goyaTanla({ n: Number(t) }).goya;
  h = { bosqich: 'bosh', goya };
  const tz = await band(() => k.prodyuser(goya));
  return tzYubor(tz);
}
