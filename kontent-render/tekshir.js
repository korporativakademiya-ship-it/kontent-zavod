// ============================================================
//  So'rovni tekshirish — renderga nima kelishi mumkin
//
//  {
//    "sahnalar": [{ "matn": "...", "izoh": "...", "rasm": "https://... yoki data:image/...", "audio": "data:audio/wav;base64,...", "soniya": 4 }],
//    "yakun": { "matn": "...", "tugma": "Direct'ga yozing 👇", "izoh": "...", "audio": "..." }
//  }
//  audio (diktor) bo'lsa — sahna ovoz tugaguncha turadi (server.js uzunlikni o'lchaydi).
//  matn ichidagi *so'z* — ajratib ko'rsatiladi.
// ============================================================

export const CHEGARA = {
  sahnalar: 12,
  jamiSoniya: 90,
  matn: 220,
  izoh: 260,
  rasmBayt: 8 * 1024 * 1024,
  audioBayt: 6 * 1024 * 1024,
};

const RASM = /^(https:\/\/\S+|data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+)$/i;

const AUDIO = /^data:audio\/(wav|x-wav|wave|mpeg|mp3|ogg);base64,[A-Za-z0-9+/=\s]+$/i;

function audio(v, nom) {
  if (v == null || v === "") return "";
  if (typeof v !== "string" || !AUDIO.test(v.trim())) throw new Error(`${nom}: data:audio/wav|mpeg|ogg base64 bo'lishi kerak`);
  const s = v.trim();
  if (s.length * 0.75 > CHEGARA.audioBayt) throw new Error(`${nom} 6 MB dan katta`);
  return s;
}

function satr(v, max, nom) {
  if (v == null || v === "") return "";
  if (typeof v !== "string") throw new Error(`${nom} matn bo'lishi kerak`);
  const s = v.trim();
  if (s.length > max) throw new Error(`${nom} ${max} belgidan uzun`);
  return s;
}

function rasm(v, nom) {
  if (v == null || v === "") return "";
  if (typeof v !== "string" || !RASM.test(v.trim())) throw new Error(`${nom}: https havola yoki data:image base64 bo'lishi kerak`);
  const s = v.trim();
  if (s.startsWith("data:") && s.length * 0.75 > CHEGARA.rasmBayt) throw new Error(`${nom} 8 MB dan katta`);
  return s;
}

export function tekshir(body) {
  if (!body || typeof body !== "object") throw new Error("JSON obyekt kutilgan");
  const kirgan = Array.isArray(body.sahnalar) ? body.sahnalar : [];
  if (!kirgan.length) throw new Error("sahnalar bo'sh");
  if (kirgan.length > CHEGARA.sahnalar) throw new Error(`sahnalar ${CHEGARA.sahnalar} tadan ko'p`);

  const sahnalar = kirgan.map((s, i) => {
    const nom = `sahnalar[${i}]`;
    if (!s || typeof s !== "object") throw new Error(`${nom} obyekt emas`);
    const matn = satr(s.matn, CHEGARA.matn, `${nom}.matn`);
    if (!matn) throw new Error(`${nom}.matn bo'sh`);
    const soniya = Number(s.soniya ?? 4);
    return {
      matn,
      izoh: satr(s.izoh, CHEGARA.izoh, `${nom}.izoh`),
      rasm: rasm(s.rasm, `${nom}.rasm`),
      audio: audio(s.audio, `${nom}.audio`),
      soniya: Math.min(10, Math.max(2, Number.isFinite(soniya) ? soniya : 4)),
    };
  });

  const y = body.yakun && typeof body.yakun === "object" ? body.yakun : {};
  const yakun = {
    matn: satr(y.matn, CHEGARA.matn, "yakun.matn"),
    tugma: satr(y.tugma, 60, "yakun.tugma") || "Direct'ga yozing 👇",
    izoh: satr(y.izoh, CHEGARA.izoh, "yakun.izoh"),
    audio: audio(y.audio, "yakun.audio"),
    soniya: 5,
  };

  const jami = sahnalar.reduce((a, s) => a + s.soniya, 0) + (yakun.matn ? yakun.soniya : 0);
  if (jami > CHEGARA.jamiSoniya) throw new Error(`video ${CHEGARA.jamiSoniya} soniyadan uzun`);
  return { sahnalar, yakun, jami };
}
