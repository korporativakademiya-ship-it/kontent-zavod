import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

// n8n doska uchun API: reels liniyasining agentlari (src/agents/reels.js).
// Kirish: "x-api-kalit" sarlavhasi = N8N_API_KALIT. Kalit berilmasa API o'chiq (faqat /api/health).
//
//   POST /api/reels/tz         {goya, mahsulot?}          → TZ
//   POST /api/reels/ssenariy   {tz, izoh?, asos?}         → {variantlar: [{nom, ssenariy, tanqid}], ssenariy, ...}
//   POST /api/reels/tanlov     {tz, variantlar, tanlangan, izoh?} → rahbar tanlovi xotiraga → {ssenariy}
//   POST /api/reels/storibord  {tz, ssenariy}             → {sahnalar, yakun, smm}
//   POST /api/reels/baho       {sarlavha, mahsulot, ball, sabab?}
//
// Kontent liniyasi (src/agents/kontent.js):
//   POST /api/kontent/tz        {goya, izoh?, oldingi?}   → prodyuser: taklif + TZ
//   POST /api/kontent/muallif   {tz}                      → qoralama (turiga qarab) + ko'rinish
//   POST /api/kontent/tasdiq    {draft_id, qaror: tasdiq|qayta, matn?, izoh?}
//   POST /api/kontent/ishlab-chiqarish {draft_id, variant?} → rejissyor + prompt muhandisi
//   POST /api/kontent/media     {draft_id, turi: rasm|video, b64, mime}
//   POST /api/kontent/kollaj    {draft_id}                → karusel slaydlari bitta JPG (b64)
//   POST /api/kontent/tanqid    {draft_id}                → tayyor post bahosi va saboq
//   POST /api/kontent/joyla     {draft_id, vaqt?}         → kanalga navbat
//   POST /api/goyalar/kunlik    {soni?}                   → kanallar + internet → g'oyalar
//   POST /api/goyalar/tanla     {n}
//   POST /api/kanallar          {amal: qosh|ochir|royxat, kanal?, izoh?}
//   POST /api/suhbat            {chatId, text?, tugma?, hodisa?} → rahbar bilan suhbat (src/suhbat.js)
//   GET  /api/health

const MAX_BODY = 1024 * 1024;
const MAX_MEDIA = 40 * 1024 * 1024; // rasm/video base64

function tengmi(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function jsonOqi(req, max = MAX_BODY) {
  return new Promise((res, rej) => {
    let hajm = 0, oshdi = false;
    const qism = [];
    req.on('data', c => {
      hajm += c.length;
      if (hajm > max) { oshdi = true; qism.length = 0; return; } // oxirigacha o'qib, 413 bilan javob beramiz
      if (!oshdi) qism.push(c);
    });
    req.on('end', () => {
      if (oshdi) return rej(Object.assign(new Error(`so'rov juda katta (${Math.round(hajm / 1048576)} MB)`), { kod: 413 }));
      if (!qism.length) return res({});
      try { res(JSON.parse(Buffer.concat(qism).toString('utf8'))); }
      catch { rej(Object.assign(new Error("JSON noto'g'ri"), { kod: 400 })); }
    });
    req.on('error', rej);
  });
}

const matn = (v, nom, max = 2000) => {
  if (typeof v !== 'string' || !v.trim()) throw Object.assign(new Error(`${nom} kerak`), { kod: 400 });
  return v.trim().slice(0, max);
};
const obyekt = (v, nom) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Object.assign(new Error(`${nom} obyekt bo'lishi kerak`), { kod: 400 });
  return v;
};

// agentlar — test uchun almashtiriladi; log — jarayon topigiga qisqa yozuv
export function apiYarat({ kalit = process.env.N8N_API_KALIT || '', agentlar, log = async () => {} } = {}) {
  const yollar = {
    'POST /api/reels/tz': async (b) => {
      const goya = matn(b.goya, 'goya', 1500);
      await log(`🎬 n8n: yangi reels g'oyasi — ${goya.slice(0, 80)}`);
      return agentlar.prodyuser(goya, { mahsulot: b.mahsulot });
    },
    'POST /api/reels/ssenariy': async (b) => agentlar.ssenariy(obyekt(b.tz, 'tz'), {
      izoh: typeof b.izoh === 'string' ? b.izoh.slice(0, 1000) : '',
      asos: b.asos && typeof b.asos === 'object' ? b.asos : null,
    }),
    'POST /api/reels/tanlov': async (b) => agentlar.tanlov({ ...b, tz: obyekt(b.tz, 'tz') }),
    'POST /api/reels/storibord': async (b) => agentlar.storibord(obyekt(b.tz, 'tz'), obyekt(b.ssenariy, 'ssenariy')),
    'POST /api/reels/baho': async (b) => agentlar.baho(b),

    'POST /api/kontent/tz': async (b) => {
      const goya = matn(b.goya, 'goya', 2000);
      if (!b.izoh) await log(`💡 n8n: yangi g'oya — ${goya.slice(0, 80)}`);
      return agentlar.kontent.prodyuser(goya, { izoh: typeof b.izoh === 'string' ? b.izoh.slice(0, 1500) : '',
        oldingi: b.oldingi && typeof b.oldingi === 'object' ? b.oldingi : null });
    },
    'POST /api/kontent/muallif': async (b) => agentlar.kontent.muallif(obyekt(b.tz, 'tz')),
    'POST /api/kontent/tasdiq': async (b) => agentlar.kontent.tasdiq(b),
    'POST /api/kontent/ishlab-chiqarish': async (b) => agentlar.kontent.ishlabChiqarish(b),
    'POST /api/kontent/media': async (b) => agentlar.kontent.media(b),
    'POST /api/kontent/kollaj': async (b) => agentlar.kontent.slaydKollaj(b),
    'POST /api/kontent/tanqid': async (b) => agentlar.kontent.tanqid(b),
    'POST /api/kontent/joyla': async (b) => agentlar.kontent.joyla(b),
    'POST /api/goyalar/kunlik': async (b) => agentlar.kontent.kunlikGoyalar({ soni: Math.min(10, Math.max(1, Number(b.soni) || 5)) }),
    'POST /api/goyalar/tanla': async (b) => agentlar.kontent.goyaTanla(b),
    'POST /api/suhbat': async (b) => agentlar.suhbat({ chatId: String(b.chatId || ''), text: typeof b.text === 'string' ? b.text.slice(0, 6000) : '',
      tugma: typeof b.tugma === 'string' ? b.tugma.slice(0, 40) : '', hodisa: typeof b.hodisa === 'string' ? b.hodisa : '',
      draft_id: String(b.draft_id || ''), xato: typeof b.xato === 'string' ? b.xato.slice(0, 500) : '' }),
    'POST /api/kanallar': async (b) => {
      const k = agentlar.kuzatuv;
      const list = b.amal === 'qosh' ? k.kanalQosh(matn(b.kanal, 'kanal', 200), b.izoh || '')
        : b.amal === 'ochir' ? k.kanalOchir(matn(b.kanal, 'kanal', 200)) : k.kanallar();
      return { kanallar: list };
    },
  };

  return http.createServer(async (req, res) => {
    const javob = (kod, obj) => { res.writeHead(kod, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
    const yol = `${req.method} ${req.url.split('?')[0]}`;
    if (yol === 'GET /api/health') return javob(200, { ok: true, api: Boolean(kalit) });
    const ish = yollar[yol];
    if (!ish) return javob(404, { xato: 'topilmadi' });
    if (!kalit) return javob(503, { xato: "API o'chiq: N8N_API_KALIT berilmagan" });
    if (!tengmi(req.headers['x-api-kalit'] || '', kalit)) return javob(401, { xato: "kalit noto'g'ri" });
    try {
      const natija = await ish(await jsonOqi(req, yol === 'POST /api/kontent/media' ? MAX_MEDIA : MAX_BODY));
      javob(200, natija);
    } catch (e) {
      const kod = e.kod || 500;
      if (kod === 500) console.error(`API ${yol}:`, e);
      javob(kod, { xato: e.message });
    }
  });
}
