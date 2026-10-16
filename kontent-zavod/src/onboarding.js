import { askJSON } from './llm.js';
import { store } from './store.js';
import { STANDART_BRAND } from './brand.js';

// /sozla — yangi mijoz (yoki o'zingiz) uchun savol-javob: agentlar kim uchun, qaysi sohada, kimga va qaysi manbalardan
// yozishini so'rab oladi. Natija — "brend" va "mahsulotlar" sozlamalari, kuzatiladigan kanallar va uslub kanali.

export const SAVOLLAR = [
  { kalit: 'muallif', savol: "1/6. Ism va imzo — videolar oxirida shunday chiqadi.\nMasalan: <i>Dilnoza — Tabassum klinikasi asoschisi</i>" },
  { kalit: 'yonalish', savol: "2/6. Sohangiz va kontent nima haqida bo'ladi?\nMasalan: <i>stomatologiya klinikasi; tish salomatligi, davolash narxlari, bemor tajribasi</i>" },
  { kalit: 'auditoriya', savol: "3/6. Auditoriya kim va ularning asosiy og'riqlari nima?\nMasalan: <i>25–45 yoshli ota-onalar; tish og'rig'idan qo'rqish, narx noaniqligi, navbat</i>" },
  { kalit: 'mahsulotlar', savol: "4/6. Mahsulot yoki xizmatlaringiz — har biri yangi qatorda: <i>Nom — qisqa tavsif</i>.\nBo'lmasa: <code>yo'q</code>" },
  { kalit: 'manbalar', savol: "5/6. G'oya manbalari — kuzatiladigan Telegram kanallar va Instagram profillar (vergul bilan).\nMasalan: <i>@biznes_uz, instagram.com/klinika_x</i>. Bo'lmasa: <code>yo'q</code>" },
  { kalit: 'uslub', savol: "6/6. O'z kanalingiz (uslubni postlaringizdan o'rganaman): <i>@kanal</i>. Bo'lmasa: <code>yo'q</code>" },
];

const yoq = (t) => /^(yo'?q|yoq|-|нет|no)$/i.test(String(t).trim());

// Javobni qabul qiladi. Qaytaradi: { keyingi: savol matni } yoki { tayyor: true }
export function javobQabul(holat, matn) {
  const t = String(matn || '').trim();
  const q = SAVOLLAR[holat.qadam];
  if (!q) return { tayyor: true };
  if (!t) return { keyingi: q.savol, xato: "Javobni yozing." };
  holat.javoblar[q.kalit] = yoq(t) ? '' : t.slice(0, 1500);
  holat.qadam += 1;
  return holat.qadam >= SAVOLLAR.length ? { tayyor: true } : { keyingi: SAVOLLAR[holat.qadam].savol };
}

// "Nom — rol" → imzo
export function imzoAjrat(t = '') {
  const [nom, ...rol] = String(t).split(/\s+[—–-]\s+/);
  return { name: nom.trim().slice(0, 40) || 'Muallif', role: rol.join(' — ').trim().slice(0, 60) };
}

// Kuzatiladigan kanallar: "@a, instagram.com/b t.me/c" → ro'yxat
export const manbalarAjrat = (t = '') => String(t).split(/[,\s]+/).map(x => x.trim()).filter(x => x.length > 2);

// Mahsulot kodi: nomdan 2 harf, band bo'lsa — keyingi variant
export function kodYasa(nom, band) {
  const harflar = String(nom).toLowerCase().replace(/[^a-z]/g, '') || 'mx';
  const nomzodlar = [harflar.slice(0, 2), harflar[0] + (harflar[2] || 'x'), harflar[0] + (harflar.at(-1) || 'y')];
  for (const k of nomzodlar) if (k.length === 2 && !band.has(k)) return k;
  for (let i = 0; i < 26; i++) { const k = harflar[0] + String.fromCharCode(97 + i); if (!band.has(k)) return k; }
  return 'm' + String.fromCharCode(97 + band.size % 26);
}

// Javoblardan brend matni va mahsulot profillari (namuna — standart brend tuzilishi)
export async function brendYasa(j) {
  const r = await askJSON({
    maxTokens: 4000,
    system: `Sen kontent strategisan. Mijozning javoblaridan kontent agentlari uchun brend profili yozasan — xuddi namunadagi tuzilishda
(MUALLIF, YO'NALISH, AUDITORIYA, MISOL SOHALARI, OG'RIQLAR, OHANG, MAQSAD, MAHSULOTLAR, oxirida to'qima raqam taqiqi).
O'zbek tili (lotin). To'qima raqam, mijoz natijasi yoki narx qo'shma — faqat javoblardagi narsalar.
NAMUNA (boshqa muallif uchun):\n${STANDART_BRAND}`,
    prompt: `JAVOBLAR:\n${JSON.stringify(j, null, 1)}
Mahsulotlar bo'lsa — har biriga profil: nima, AUDITORIYA, OG'RIQLAR, MAVZULAR, CTA (namunadagi mahsulot profillari kabi, 4–6 qator).
JSON: {"brend_matn":"...","mahsulotlar":[{"nom":"...","belgi":"bitta emoji","profil":"..."}]}`,
  });
  if (!String(r.brend_matn || '').trim()) throw new Error('brend matni yozilmadi');
  const band = new Set();
  const mahsulotlar = {};
  for (const m of (Array.isArray(r.mahsulotlar) ? r.mahsulotlar : []).slice(0, 8)) {
    if (!m?.nom) continue;
    const kod = kodYasa(m.nom, band);
    band.add(kod);
    mahsulotlar[kod] = { nom: String(m.nom).slice(0, 40), belgi: String(m.belgi || '📦').slice(0, 4), profil: String(m.profil || '').slice(0, 1500) };
  }
  return { matn: String(r.brend_matn).trim(), mahsulotlar };
}

// Tasdiqlangandan keyin: sozlamalarga yoziladi. kuzatuv — { kanalQosh }, uslub — (kanal) => Promise (ixtiyoriy)
export async function saqla(j, natija, { kuzatuv, uslub } = {}) {
  const im = imzoAjrat(j.muallif);
  store.setSetting('brend', { muallif: im.name, yonalish: j.yonalish || '', matn: natija.matn, imzo: im });
  store.setSetting('mahsulotlar', Object.keys(natija.mahsulotlar).length ? natija.mahsulotlar : null);
  const qoshildi = [], xatolar = [];
  for (const m of manbalarAjrat(j.manbalar)) {
    try { kuzatuv.kanalQosh(m, 'onboarding'); qoshildi.push(m); } catch (e) { xatolar.push(`${m}: ${e.message}`); }
  }
  let uslubNatija = '';
  if (j.uslub && uslub) {
    store.setSetting('uslub_kanal', j.uslub);
    try { const u = await uslub(j.uslub); uslubNatija = `✍️ Uslub @${u.kanal} dan o'rganildi (${u.jami} ta namuna).`; }
    catch (e) { uslubNatija = `⚠️ Uslub o'rganilmadi: ${e.message}`; }
  }
  return { qoshildi, xatolar, uslubNatija };
}
