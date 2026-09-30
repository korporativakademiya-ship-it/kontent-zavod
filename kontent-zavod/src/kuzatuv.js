import { store } from './store.js';

// Kuzatiladigan kanallar: rahbar n8n bot orqali qo'shadi ("kanal: @nom — nima uchun").
// Telegram ochiq kanallari t.me/s/<nom> sahifasidan o'qiladi (API kaliti kerak emas).
// Instagram — Meta tasdig'idan keyin (Business Discovery API); hozircha ro'yxatda saqlanadi, o'qilmaydi.

const MAX_KANAL = 30;

export function normKanal(kanal = '') {
  const s = String(kanal).trim()
    .replace(/^https?:\/\/(www\.)?/i, '')
    .replace(/^(t\.me|telegram\.me)\/(s\/)?/i, 'tg:')
    .replace(/^instagram\.com\//i, 'ig:')
    .replace(/[/?#].*$/, '');
  const m = /^(tg:|ig:)?@?([A-Za-z0-9_.]{3,40})$/.exec(s);
  if (!m) return null;
  return { platforma: m[1] === 'ig:' ? 'instagram' : 'telegram', nom: m[2].toLowerCase() };
}

export const kanallar = () => store.setting('kuzatuv_kanallar', []);

export function kanalQosh(kanal, izoh = '', platforma) {
  const k = normKanal(kanal);
  if (!k) throw Object.assign(new Error(`"${kanal}" — kanal nomi tushunarsiz (masalan @biznes_kanal)`), { kod: 400 });
  if (platforma) k.platforma = platforma === 'instagram' ? 'instagram' : 'telegram';
  const list = kanallar().filter(x => !(x.nom === k.nom && x.platforma === k.platforma));
  if (list.length >= MAX_KANAL) throw Object.assign(new Error(`ko'pi bilan ${MAX_KANAL} ta kanal`), { kod: 400 });
  list.push({ ...k, izoh: String(izoh).trim().slice(0, 200), at: new Date().toISOString() });
  store.setSetting('kuzatuv_kanallar', list);
  return list;
}

export function kanalOchir(kanal) {
  const k = normKanal(kanal);
  if (!k) throw Object.assign(new Error(`"${kanal}" — kanal nomi tushunarsiz`), { kod: 400 });
  const list = kanallar().filter(x => x.nom !== k.nom);
  store.setSetting('kuzatuv_kanallar', list);
  return list;
}

const ent = (s) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/[ \t]+/g, ' ').trim();

const soni = (s = '') => {
  const m = /([\d.]+)\s*([KM]?)/i.exec(s);
  if (!m) return 0;
  return Math.round(Number(m[1]) * ({ k: 1e3, m: 1e6 }[m[2].toLowerCase()] || 1));
};

// t.me/s sahifasidan postlar: matn, ko'rishlar, sana
export function postlarniAjrat(html) {
  const out = [];
  for (const blok of String(html).split('tgme_widget_message_wrap').slice(1)) {
    const matn = /tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/.exec(blok);
    if (!matn) continue;
    const korish = /tgme_widget_message_views">([^<]+)</.exec(blok);
    const vaqt = /<time[^>]*datetime="([^"]+)"/.exec(blok);
    const havola = /tgme_widget_message_date" href="([^"]+)"/.exec(blok);
    out.push({ matn: ent(matn[1]).slice(0, 1500), korish: soni(korish?.[1]), vaqt: vaqt?.[1] || '', havola: havola?.[1] || '' });
  }
  return out;
}

export async function kanalOqi(nom, { fetchFn = fetch } = {}) {
  const res = await fetchFn(`https://t.me/s/${encodeURIComponent(nom)}`, { headers: { 'user-agent': 'Mozilla/5.0 (kontent-zavod kuzatuv)' } });
  if (!res.ok) throw new Error(`t.me/s/${nom}: ${res.status}`);
  return postlarniAjrat(await res.text());
}

// Oxirgi kunlardagi eng ko'p ko'rilgan postlar — har kanaldan bir nechtasi
export async function kuzatuvXulosasi({ kunlar = 3, harKanaldan = 4, fetchFn } = {}) {
  const since = Date.now() - kunlar * 864e5;
  const natija = [], xatolar = [];
  for (const k of kanallar().filter(x => x.platforma === 'telegram')) {
    try {
      const postlar = (await kanalOqi(k.nom, { fetchFn }))
        .filter(p => !p.vaqt || new Date(p.vaqt).getTime() >= since)
        .sort((a, b) => b.korish - a.korish).slice(0, harKanaldan);
      natija.push({ kanal: `@${k.nom}`, izoh: k.izoh, postlar });
    } catch (e) { xatolar.push(`@${k.nom}: ${e.message}`); }
  }
  return { natija, xatolar };
}
