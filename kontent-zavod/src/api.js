import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

// n8n doska uchun API: reels liniyasining agentlari (src/agents/reels.js).
// Kirish: "x-api-kalit" sarlavhasi = N8N_API_KALIT. Kalit berilmasa API o'chiq (faqat /api/health).
//
//   POST /api/reels/tz         {goya, mahsulot?}          → TZ
//   POST /api/reels/ssenariy   {tz, izoh?}                → {ssenariy, tanqid, urinish}
//   POST /api/reels/storibord  {tz, ssenariy}             → {sahnalar, yakun, smm}
//   POST /api/reels/baho       {sarlavha, mahsulot, ball, sabab?}
//   GET  /api/health

const MAX_BODY = 1024 * 1024;

function tengmi(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function jsonOqi(req) {
  return new Promise((res, rej) => {
    let hajm = 0;
    const qism = [];
    req.on('data', c => {
      hajm += c.length;
      if (hajm > MAX_BODY) { rej(Object.assign(new Error("so'rov juda katta"), { kod: 413 })); req.destroy(); return; }
      qism.push(c);
    });
    req.on('end', () => {
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
    'POST /api/reels/ssenariy': async (b) => agentlar.ssenariy(obyekt(b.tz, 'tz'), { izoh: typeof b.izoh === 'string' ? b.izoh.slice(0, 1000) : '' }),
    'POST /api/reels/storibord': async (b) => agentlar.storibord(obyekt(b.tz, 'tz'), obyekt(b.ssenariy, 'ssenariy')),
    'POST /api/reels/baho': async (b) => agentlar.baho(b),
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
      const natija = await ish(await jsonOqi(req));
      javob(200, natija);
    } catch (e) {
      const kod = e.kod || 500;
      if (kod === 500) console.error(`API ${yol}:`, e);
      javob(kod, { xato: e.message });
    }
  });
}
